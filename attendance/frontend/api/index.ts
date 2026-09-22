import crypto from 'crypto';

// Types
export interface ActiveSession {
  id: string;
  class_id: string;
  teacher_id: string;
  mode: 'DYNAMIC_QR' | 'CODE';
  started_at: string;
  expires_at: string;
  session_secret: string;
  currentCode: string;
  currentQrToken: string;
  qrIssuedAt: number;
  qrExpiresAt: number;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  name: string;
  enrollment_number: string;
  marked_at: string;
  status: string;
  verification_method: string;
}

// In-memory persistent state across serverless container invocations
let activeSession: ActiveSession | null = null;
const attendanceRecords: AttendanceRecord[] = [];

const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'pravahax-dynamic-qr-attendance-secret-key-2026';
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'pravahax-qr-signing-secret-key-2026';
const QR_ROTATION_INTERVAL = 4;
const QR_EXPIRATION_GRACE = 4;

// 30 Student Roster
export const STUDENT_ROSTER_LIST = [
  { enrollment: 'STU001', name: 'Rahul Patil' },
  { enrollment: 'STU002', name: 'Sneha Shah' },
  { enrollment: 'STU003', name: 'Aman Verma' },
  { enrollment: 'STU004', name: 'Priya Sharma' },
  { enrollment: 'STU005', name: 'Rohan Mehta' },
  { enrollment: 'STU006', name: 'Ananya Desai' },
  { enrollment: 'STU007', name: 'Aditya Joshi' },
  { enrollment: 'STU008', name: 'Kavya Reddy' },
  { enrollment: 'STU009', name: 'Siddharth Malhotra' },
  { enrollment: 'STU010', name: 'Riya Sen' },
  { enrollment: 'STU011', name: 'Aryan Gupta' },
  { enrollment: 'STU012', name: 'Tanvi Kulkarni' },
  { enrollment: 'STU013', name: 'Varun Nair' },
  { enrollment: 'STU014', name: 'Pooja Iyer' },
  { enrollment: 'STU015', name: 'Harsh Pandey' },
  { enrollment: 'STU016', name: 'Neha Choudhary' },
  { enrollment: 'STU017', name: 'Yash Singhania' },
  { enrollment: 'STU018', name: 'Divya Bhat' },
  { enrollment: 'STU019', name: 'Kunal Agrawal' },
  { enrollment: 'STU020', name: 'Shreya Kapoor' },
  { enrollment: 'STU021', name: 'Gaurav Mishra' },
  { enrollment: 'STU022', name: 'Meera Pillai' },
  { enrollment: 'STU023', name: 'Nikhil Saxena' },
  { enrollment: 'STU024', name: 'Isha Jain' },
  { enrollment: 'STU025', name: 'Pranav Rao' },
  { enrollment: 'STU026', name: 'Swati Tiwari' },
  { enrollment: 'STU027', name: 'Vivek Chauhan' },
  { enrollment: 'STU028', name: 'Ritu Chawla' },
  { enrollment: 'STU029', name: 'Manan Bhatt' },
  { enrollment: 'STU030', name: 'Kriti Roy' }
];

const studentRoster: Record<string, string> = {};
STUDENT_ROSTER_LIST.forEach((s, idx) => {
  studentRoster[s.enrollment] = s.name;
  studentRoster[`s${idx + 1}`] = s.name;
  // Also support STUD prefix (e.g. STUD002 -> Sneha Shah)
  const studKey = s.enrollment.replace('STU', 'STUD');
  studentRoster[studKey] = s.name;
});


// Generate signed AES-256-GCM opaque QR credential
function generateQrPayload(session: { id: string; class_id: string; teacher_id: string; session_secret: string }) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + QR_ROTATION_INTERVAL + QR_EXPIRATION_GRACE;
  const nonce = crypto.randomBytes(8).toString('hex');

  const payloadObj = {
    sub: 'attendance_qr',
    sid: session.id,
    cid: session.class_id,
    tid: session.teacher_id,
    nonce,
    iat: now,
    exp
  };

  const key = crypto.createHash('sha256').update(`${QR_SIGNING_SECRET}:${session.session_secret}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payloadObj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const token = `PVX1.${iv.toString('hex')}.${encrypted.toString('hex')}.${tag.toString('hex')}`;
  return { token, iat: now, exp };
}

// Verify QR payload
function verifyQrPayload(qrToken: string, sessionSecret: string, activeSessionId: string) {
  if (qrToken.startsWith('PVX1.')) {
    const parts = qrToken.split('.');
    if (parts.length !== 4) throw new Error('Malformed QR format');
    const [, ivHex, cipherHex, tagHex] = parts;
    const key = crypto.createHash('sha256').update(`${QR_SIGNING_SECRET}:${sessionSecret}`).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      const err: any = new Error('QR code expired');
      err.name = 'TokenExpiredError';
      throw err;
    }
    if (payload.sid !== activeSessionId) {
      throw new Error('Session ID mismatch');
    }
    return payload;
  }
  throw new Error('Unsupported token format');
}

// Generate basic JWT
function signSimpleToken(payload: any) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse path
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + pathname;
  }

  // Parse body if string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  } else if (!body) {
    body = {};
  }

  // ========================================================
  // ROUTE HANDLERS
  // ========================================================

  // 1. Teacher Login
  if (pathname === '/api/teacher/login' || pathname === '/api/login') {
    const { identifier, email, password } = body;
    const userEmail = (identifier || email || 'teacher@test.com').trim();

    // Flexible login as requested: allow faculty testing seamlessly
    const token = signSimpleToken({
      id: 't1',
      name: 'Prof. Sharma',
      email: userEmail,
      role: 'TEACHER',
      exp: Math.floor(Date.now() / 1000) + 8 * 3600
    });

    return res.status(200).json({
      success: true,
      user: {
        id: 't1',
        name: 'Prof. Sharma',
        email: userEmail,
        role: 'TEACHER'
      },
      token
    });
  }

  // 2. Teacher Logout
  if (pathname === '/api/teacher/logout') {
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  // 3. Teacher Profile
  if (pathname === '/api/teacher/me') {
    return res.status(200).json({
      user: {
        id: 't1',
        name: 'Prof. Sharma',
        email: 'teacher@test.com',
        role: 'TEACHER'
      }
    });
  }

  // 4. Classes Assigned to Teacher
  if (pathname.startsWith('/api/classes')) {
    return res.status(200).json({
      classes: [
        { id: 'c1', name: 'Data Structures', course: 'CS101', teacher_id: 't1' },
        { id: 'c2', name: 'Computer Networks', course: 'CS102', teacher_id: 't1' }
      ]
    });
  }

  // 5. Start Attendance Session
  if (pathname === '/api/session/start') {
    const { class_id = 'c1', mode = 'DYNAMIC_QR' } = body;
    const sessionId = crypto.randomUUID();
    const sessionSecret = crypto.randomBytes(16).toString('hex');
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const initialCode = Math.floor(1000 + Math.random() * 9000).toString();

    const { token, iat, exp } = generateQrPayload({
      id: sessionId,
      class_id,
      teacher_id: 't1',
      session_secret: sessionSecret
    });

    activeSession = {
      id: sessionId,
      class_id,
      teacher_id: 't1',
      mode,
      started_at: startedAt,
      expires_at: expiresAt,
      session_secret: sessionSecret,
      currentCode: initialCode,
      currentQrToken: token,
      qrIssuedAt: iat,
      qrExpiresAt: exp
    };

    return res.status(200).json({
      session_id: sessionId,
      mode,
      pin: initialCode,
      qr_token: token,
      qr_expires_at: exp,
      rotation_interval: QR_ROTATION_INTERVAL
    });
  }

  // 6. Active Session Polling (Teacher Reconnect & Count)
  if (pathname === '/api/session/active') {
    if (!activeSession) {
      return res.status(200).json({ active: false });
    }

    const attendees = attendanceRecords.filter(r => r.session_id === activeSession?.id);

    return res.status(200).json({
      active: true,
      session: {
        id: activeSession.id,
        class_id: activeSession.class_id,
        teacher_id: activeSession.teacher_id,
        mode: activeSession.mode,
        started_at: activeSession.started_at,
        currentCode: activeSession.currentCode,
        currentQrToken: activeSession.currentQrToken,
        qrIntervalSeconds: QR_ROTATION_INTERVAL,
        qrExpiresAt: activeSession.qrExpiresAt,
        presentCount: attendees.length,
        attendees: attendees.map(a => ({
          student_id: a.student_id,
          name: a.name,
          enrollment_number: a.enrollment_number,
          verification_method: a.verification_method,
          marked_at: a.marked_at
        }))
      },
      logs: attendanceRecords
    });
  }

  // 6.5 Students Roster List
  if (pathname === '/api/students') {
    return res.status(200).json({ students: STUDENT_ROSTER_LIST });
  }

  // 7. On-demand Dynamic QR token rotation
  if (pathname === '/api/session/qr-token') {
    if (!activeSession || activeSession.mode !== 'DYNAMIC_QR') {
      return res.status(400).json({ error: 'No active Dynamic QR session' });
    }

    const { token, iat, exp } = generateQrPayload(activeSession);
    activeSession.currentQrToken = token;
    activeSession.qrIssuedAt = iat;
    activeSession.qrExpiresAt = exp;

    return res.status(200).json({
      token,
      issued_at: iat,
      expires_at: exp,
      rotation_interval: QR_ROTATION_INTERVAL
    });
  }

  // 8. Stop Session
  if (pathname === '/api/session/stop') {
    activeSession = null;
    return res.status(200).json({ success: true, message: 'Session closed' });
  }

  // 9. Mark Student Attendance (Passwordless)
  if (pathname === '/api/attendance/mark' || pathname === '/api/attendance/mark-qr') {
    const { enrollment_number, student_id, pin, qr_token } = body;
    let enrollment = (enrollment_number || student_id || '').trim().toUpperCase();
    if (enrollment.startsWith('STUD') && !enrollment.startsWith('STUDENT')) {
      enrollment = enrollment.replace('STUD', 'STU');
    }

    if (!enrollment) {
      return res.status(400).json({ error: 'Enrollment number is required' });
    }

    if (!activeSession) {
      return res.status(400).json({ error: 'No active attendance session is currently running' });
    }

    // Mode Validation
    let verificationMethod = 'UNKNOWN';
    if (activeSession.mode === 'DYNAMIC_QR') {
      if (!qr_token) {
        return res.status(400).json({ error: 'This session requires Dynamic QR scan. Attendance code entry is not permitted.' });
      }

      try {
        const decoded = verifyQrPayload(qr_token, activeSession.session_secret, activeSession.id);
        if (decoded.sub !== 'attendance_qr') {
          return res.status(400).json({ error: 'Invalid QR credential type' });
        }
        verificationMethod = 'DYNAMIC_QR';
      } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
          return res.status(400).json({ error: 'QR code expired. Please scan the current code on screen.' });
        }
        return res.status(400).json({ error: 'Invalid or forged QR credential.' });
      }
    } else if (activeSession.mode === 'CODE') {
      if (qr_token) {
        return res.status(400).json({ error: 'This session requires Attendance Code entry. QR scan is not permitted.' });
      }

      if (!pin || pin.toString().trim() !== activeSession.currentCode) {
        return res.status(400).json({ error: 'Invalid or expired attendance code.' });
      }
      verificationMethod = 'ATTENDANCE_CODE';
    }

    // Duplicate check
    const existing = attendanceRecords.find(r => r.session_id === activeSession?.id && (r.enrollment_number === enrollment || r.student_id === enrollment));
    if (existing) {
      return res.status(400).json({ error: 'Already marked present for this session' });
    }

    // Dynamic resolution of student name (supports anyone as requested)
    const studentName = studentRoster[enrollment] || studentRoster[`s${enrollment.replace('STU', '')}`] || `Student (${enrollment})`;

    const record: AttendanceRecord = {
      id: crypto.randomUUID(),
      session_id: activeSession.id,
      student_id: enrollment,
      name: studentName,
      enrollment_number: enrollment,
      marked_at: new Date().toISOString(),
      status: 'PRESENT',
      verification_method: verificationMethod
    };

    attendanceRecords.unshift(record);

    return res.status(200).json({
      success: true,
      message: verificationMethod === 'DYNAMIC_QR' ? 'Attendance Recorded (Dynamic QR Verified)' : 'Attendance Recorded (Code Verified)',
      class_name: 'Data Structures',
      subject: 'CS101',
      student_name: studentName,
      enrollment_number: enrollment,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      verification_method: verificationMethod,
      record
    });
  }

  // 10. Complete Audit Logs (Public & Teacher access)
  if (pathname === '/api/attendance/logs' || pathname === '/api/session/logs') {
    return res.status(200).json({ logs: attendanceRecords });
  }

  // 11. Network Scan (Local detection)
  if (pathname === '/api/network/scan') {
    if (!activeSession) return res.status(200).json({ found: false });
    return res.status(200).json({
      found: true,
      session_id: activeSession.id,
      class_name: 'Data Structures (CS101)',
      mode: activeSession.mode
    });
  }

  return res.status(404).json({ error: `Endpoint ${pathname} not found` });
}
