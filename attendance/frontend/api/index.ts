import { AttendanceService } from './_lib/attendanceService.js';
import { verifyTeacherSession, CONFIG } from './_lib/crypto.js';
import { TeacherSessionPayload, ApiErrorResponse } from './_lib/types.js';

// Helper to parse cookies from incoming headers
function parseCookies(cookieHeader: string = ''): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [name, ...val] = c.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(val.join('='));
  });
  return cookies;
}

// Helper to extract authenticated teacher
function extractTeacherAuth(req: any): TeacherSessionPayload | null {
  const cookies = parseCookies(req.headers?.cookie || '');
  const cookieToken = cookies[CONFIG.COOKIE_NAME];
  if (cookieToken) {
    const payload = verifyTeacherSession(cookieToken);
    if (payload) return payload;
  }

  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = verifyTeacherSession(token);
    if (payload) return payload;
  }

  const legacyHeader = req.headers?.['x-teacher-token'];
  if (legacyHeader && typeof legacyHeader === 'string') {
    const payload = verifyTeacherSession(legacyHeader);
    if (payload) return payload;
  }

  return null;
}

export default async function handler(req: any, res: any) {
  // 1. CORS Configuration (Credentialed)
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin === '*' ? '*' : origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-teacher-token'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Normalize pathname
  const host = req.headers?.host || 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  let pathname = url.pathname;
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + pathname;
  }

  // 3. Parse JSON body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  } else if (!body) {
    body = {};
  }

  const isProduction = process.env.NODE_ENV === 'production';

  try {
    // ==========================================
    // TEACHER AUTHENTICATION
    // ==========================================

    // POST /api/teacher/login
    if (pathname === '/api/teacher/login' || pathname === '/api/login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { identifier, email, password } = body;
      const result = await AttendanceService.teacherLogin(identifier || email, password);

      if (!result.success) {
        const err = result as import('./_lib/types').ApiErrorResponse;
        return res.status(err.code === 'UNAUTHORIZED' ? 401 : 400).json(result);
      }

      // Set secure HttpOnly cookie
      const cookieOptions = [
        `${CONFIG.COOKIE_NAME}=${result.token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${CONFIG.SESSION_DURATION_SECONDS}`
      ];
      if (isProduction) cookieOptions.push('Secure');
      res.setHeader('Set-Cookie', cookieOptions.join('; '));

      return res.status(200).json(result);
    }

    // POST /api/teacher/logout
    if (pathname === '/api/teacher/logout') {
      const cookieOptions = [
        `${CONFIG.COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
      ];
      if (isProduction) cookieOptions.push('Secure');
      res.setHeader('Set-Cookie', cookieOptions.join('; '));
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }

    // GET /api/teacher/me
    if (pathname === '/api/teacher/me') {
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      }
      return res.status(200).json({
        user: { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role }
      });
    }

    // GET /api/teacher/classes or /api/classes
    if (pathname === '/api/teacher/classes' || pathname === '/api/classes') {
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      }
      const classes = await AttendanceService.getTeacherClasses(teacher.id);
      return res.status(200).json({ classes });
    }

    // ==========================================
    // TEACHER ATTENDANCE SESSION CONTROLS
    // ==========================================

    // POST /api/session/start
    if (pathname === '/api/session/start') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }

      const class_id = body.class_id || body.classId;
      const mode = body.mode || 'DYNAMIC_QR';
      if (!class_id) {
        return res.status(400).json({ success: false, error: 'Class ID is required' });
      }

      const result = await AttendanceService.startSession(teacher.id, class_id, mode);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    }

    // GET /api/session/active or /api/teacher/session/active (Teacher-only recovery & live metrics)
    if (pathname === '/api/session/active' || pathname === '/api/teacher/session/active') {
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }

      const activeState = await AttendanceService.getActiveTeacherSession(teacher.id);
      return res.status(200).json(activeState);
    }

    // GET /api/session/qr-token or /api/session/qr (Teacher-only on-demand rotation)
    if (pathname === '/api/session/qr-token' || pathname === '/api/session/qr') {
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }
      const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('session_id') || body.sessionId || body.session_id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
      }

      const result = await AttendanceService.getQrToken(teacher.id, sessionId);
      if ('error' in result) {
        return res.status(400).json(result);
      }
      return res.status(200).json({ ...result, qrToken: (result as any).token });
    }

    // GET /api/session/code (Teacher-only on-demand rotating code fetch)
    if (pathname === '/api/session/code') {
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }
      const sessionId = url.searchParams.get('sessionId') || url.searchParams.get('session_id') || body.sessionId || body.session_id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
      }

      const result = await AttendanceService.getRotatingCode(teacher.id, sessionId);
      if ('error' in result) {
        const statusCode =
          result.code === 'FORBIDDEN' ? 403 :
          result.code === 'SESSION_CLOSED' ? 404 : 400;
        return res.status(statusCode).json(result);
      }
      return res.status(200).json(result);
    }

    // POST /api/session/regenerate-code
    if (pathname === '/api/session/regenerate-code') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }
      const sessionId = body.sessionId || body.session_id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
      }

      const result = await AttendanceService.regenerateCode(teacher.id, sessionId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    }

    // POST /api/session/stop or /api/session/end
    if (pathname === '/api/session/stop' || pathname === '/api/session/end') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const teacher = extractTeacherAuth(req);
      if (!teacher) {
        return res.status(401).json({ success: false, error: 'Teacher authentication required', code: 'UNAUTHORIZED' });
      }
      const sessionId = body.sessionId || body.session_id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
      }

      const result = await AttendanceService.endSession(teacher.id, sessionId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    }

    // ==========================================
    // PASSWORDLESS STUDENT ATTENDANCE SUBMISSION
    // ==========================================

    // POST /api/attendance/mark, /api/attendance/mark-qr, or /api/attendance/submit
    if (
      pathname === '/api/attendance/mark' ||
      pathname === '/api/attendance/mark-qr' ||
      pathname === '/api/attendance/submit'
    ) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { enrollment_number, student_id, enrollmentNumber, mode, qr_token, qrToken, pin, code } = body;

      const rawEnr = enrollmentNumber || enrollment_number || student_id;
      const rawMode = mode || (qrToken || qr_token ? 'DYNAMIC_QR' : 'CODE');
      const rawQr = qrToken || qr_token;
      const rawCode = code || pin;

      const result = await AttendanceService.submitAttendance({
        enrollmentNumber: rawEnr,
        mode: rawMode,
        qrToken: rawQr,
        code: rawCode
      });

      if (!result.success) {
        const err = result as ApiErrorResponse;
        const statusCode =
          err.code === 'STUDENT_NOT_FOUND' || err.code === 'INVALID_CODE' || err.code === 'SESSION_CLOSED'
            ? 404
            : err.code === 'STUDENT_NOT_ELIGIBLE'
            ? 403
            : err.code === 'ALREADY_MARKED'
            ? 409
            : 400;
        return res.status(statusCode).json(result);
      }

      return res.status(200).json(result);
    }

    return res.status(404).json({ success: false, error: `Endpoint ${pathname} not found` });
  } catch (err: any) {
    console.error('API Handler Exception:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
  }
}
