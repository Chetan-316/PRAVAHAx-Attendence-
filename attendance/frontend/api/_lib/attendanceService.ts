import crypto from 'crypto';
import { db } from './db.js';
import {
  verifyPassword,
  generateStableCode,
  generateRotatingCode,
  verifyRotatingCode,
  generateDynamicQrToken,
  verifyDynamicQrToken,
  signTeacherSession
} from './crypto.js';
import {
  User,
  ClassItem,
  AttendanceSession,
  AttendeeView,
  AttendanceMode,
  ApiErrorResponse
} from './types.js';

export class AttendanceService {
  // ==========================================
  // Teacher Authentication
  // ==========================================
  static async teacherLogin(identifier: string, password: string): Promise<
    | { success: true; user: { id: string; name: string; email: string; role: 'TEACHER' }; token: string }
    | ApiErrorResponse
  > {
    const cleanId = (identifier || '').trim().toLowerCase();
    if (!cleanId || !password) {
      return { success: false, error: 'Teacher ID or Email and password are required', code: 'INVALID_CREDENTIAL' };
    }

    const user = await db.queryOne<User>(
      `SELECT id, name, email, role, password_hash FROM users WHERE (LOWER(email) = $1 OR id = $1) AND role = 'TEACHER'`,
      [cleanId]
    );

    if (!user || !user.password_hash) {
      return { success: false, error: 'Invalid teacher ID or password', code: 'UNAUTHORIZED' };
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Invalid teacher ID or password', code: 'UNAUTHORIZED' };
    }

    const token = signTeacherSession({ id: user.id, name: user.name, email: user.email });

    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: 'TEACHER' },
      token
    };
  }

  // ==========================================
  // Teacher Classes
  // ==========================================
  static async getTeacherClasses(teacherId: string): Promise<ClassItem[]> {
    return await db.query<ClassItem>(
      `SELECT id, name, course, teacher_id FROM classes WHERE teacher_id = $1 ORDER BY name ASC`,
      [teacherId]
    );
  }

  // ==========================================
  // Start Session
  // ==========================================
  static async startSession(
    teacherId: string,
    classId: string,
    mode: AttendanceMode
  ): Promise<
    | {
        success: true;
        session: Omit<AttendanceSession, 'session_secret'>;
        qr?: { token: string; secondsRemaining: number; rotationInterval: number };
        code?: string;
        codeInfo?: { code: string; secondsRemaining: number; rotationInterval: number };
      }
    | ApiErrorResponse
  > {
    // 1. Verify class ownership
    const classObj = await db.queryOne<ClassItem>(
      `SELECT id, name, course, teacher_id FROM classes WHERE id = $1 AND teacher_id = $2`,
      [classId, teacherId]
    );
    if (!classObj) {
      return { success: false, error: 'Class not found or unauthorized', code: 'FORBIDDEN' };
    }

    // 2. Enforce only one active session per class
    const existing = await db.queryOne<AttendanceSession>(
      `SELECT id, mode, current_code, status FROM attendance_sessions WHERE class_id = $1 AND status = 'ACTIVE'`,
      [classId]
    );
    if (existing) {
      return {
        success: false,
        error: 'An active attendance session is already in progress for this class. Please end it before starting a new one.',
        code: 'ACTIVE_SESSION_EXISTS'
      };
    }

    const sessionId = crypto.randomUUID();
    const sessionSecret = crypto.randomBytes(16).toString('hex');
    const startedAt = new Date().toISOString();

    let code: string | null = null;
    let codeInfo: { code: string; secondsRemaining: number; rotationInterval: number } | undefined;
    let qrInfo: { token: string; secondsRemaining: number; rotationInterval: number } | undefined;

    if (mode === 'CODE') {
      const rot = generateRotatingCode(sessionId, sessionSecret);
      code = rot.code;
      codeInfo = {
        code: rot.code,
        secondsRemaining: rot.secondsRemaining,
        rotationInterval: rot.rotationInterval
      };
    }

    // Insert session into database
    await db.execute(
      `INSERT INTO attendance_sessions (id, class_id, teacher_id, mode, current_code, session_secret, started_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, classId, teacherId, mode, code, sessionSecret, startedAt, 'ACTIVE']
    );

    // Safe session DTO — never expose session_secret to the browser
    const sessionDto = {
      id: sessionId,
      class_id: classId,
      teacher_id: teacherId,
      mode,
      current_code: code,
      started_at: startedAt,
      status: 'ACTIVE' as const
    };

    if (mode === 'DYNAMIC_QR') {
      qrInfo = generateDynamicQrToken(sessionId, sessionSecret);
    }

    return {
      success: true,
      session: sessionDto as unknown as AttendanceSession,
      qr: qrInfo,
      code: code || undefined,
      codeInfo
    };
  }

  // ==========================================
  // Active Teacher Session Recovery & Metrics
  // ==========================================
  static async getActiveTeacherSession(teacherId: string): Promise<
    | {
        active: true;
        session: Omit<AttendanceSession, 'session_secret'> & { class_name: string; course: string };
        qr?: { token: string; secondsRemaining: number; rotationInterval: number };
        current_code?: string;
        codeInfo?: { code: string; secondsRemaining: number; rotationInterval: number };
        presentCount: number;
        totalEnrolled: number;
        attendees: AttendeeView[];
      }
    | { active: false }
  > {
    // Recover active session for this teacher
    const session = await db.queryOne<any>(
      `SELECT s.id, s.class_id, s.teacher_id, s.mode, s.current_code, s.session_secret, s.started_at, s.status,
              c.name as class_name, c.course
       FROM attendance_sessions s
       JOIN classes c ON s.class_id = c.id
       WHERE s.teacher_id = $1 AND s.status = 'ACTIVE'
       LIMIT 1`,
      [teacherId]
    );

    if (!session) {
      return { active: false };
    }

    // Attendees
    const attendees = await db.query<any>(
      `SELECT r.student_id, u.name, u.student_id as enrollment_number, r.verification_method, r.marked_at
       FROM attendance_records r
       JOIN users u ON r.student_id = u.id
       WHERE r.session_id = $1
       ORDER BY r.marked_at DESC`,
      [session.id]
    );

    // Total enrolled
    const totalEnrolledRows = await db.query<any>(
      `SELECT COUNT(*) as count FROM class_enrollments WHERE class_id = $1 AND status = 'ACTIVE'`,
      [session.class_id]
    );
    const totalEnrolled = totalEnrolledRows.length > 0 ? parseInt(totalEnrolledRows[0].count, 10) || 0 : 0;

    let qrInfo: { token: string; secondsRemaining: number; rotationInterval: number } | undefined;
    let codeInfo: { code: string; secondsRemaining: number; rotationInterval: number } | undefined;
    let currentCode: string | undefined;

    if (session.mode === 'DYNAMIC_QR') {
      qrInfo = generateDynamicQrToken(session.id, session.session_secret);
    } else if (session.mode === 'CODE') {
      const rot = generateRotatingCode(session.id, session.session_secret);
      codeInfo = {
        code: rot.code,
        secondsRemaining: rot.secondsRemaining,
        rotationInterval: rot.rotationInterval
      };
      currentCode = rot.code;
    }

    // Safe session DTO — strip session_secret from browser response
    return {
      active: true,
      session: {
        id: session.id,
        class_id: session.class_id,
        teacher_id: session.teacher_id,
        mode: session.mode,
        current_code: currentCode || session.current_code,
        started_at: session.started_at,
        status: session.status,
        class_name: session.class_name,
        course: session.course
      },
      qr: qrInfo,
      current_code: currentCode || session.current_code || undefined,
      codeInfo,
      presentCount: attendees.length,
      totalEnrolled,
      attendees
    };
  }

  // ==========================================
  // Teacher-Only Dynamic QR Token Fetch
  // ==========================================
  static async getQrToken(
    teacherId: string,
    sessionId: string
  ): Promise<
    | {
        token: string;
        secondsRemaining: number;
        rotationInterval: number;
      }
    | ApiErrorResponse
  > {
    const session = await db.queryOne<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1 AND teacher_id = $2 AND status = 'ACTIVE'`,
      [sessionId, teacherId]
    );

    if (!session) {
      return { success: false, error: 'Active session not found or unauthorized', code: 'SESSION_CLOSED' };
    }

    if (session.mode !== 'DYNAMIC_QR') {
      return { success: false, error: 'Session is not in Dynamic QR mode', code: 'INVALID_CREDENTIAL' };
    }

    const qr = generateDynamicQrToken(session.id, session.session_secret);
    return {
      token: qr.token,
      secondsRemaining: qr.secondsRemaining,
      rotationInterval: qr.rotationInterval
    };
  }

  // ==========================================
  // Teacher-Only Rotating Attendance Code Fetch
  // ==========================================
  static async getRotatingCode(
    teacherId: string,
    sessionId: string
  ): Promise<
    | {
        code: string;
        secondsRemaining: number;
        rotationInterval: number;
      }
    | ApiErrorResponse
  > {
    const session = await db.queryOne<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1 AND teacher_id = $2`,
      [sessionId, teacherId]
    );

    if (!session) {
      return { success: false, error: 'Session not found or unauthorized', code: 'FORBIDDEN' };
    }

    if (session.status !== 'ACTIVE') {
      return { success: false, error: 'Attendance session has ended or is not active', code: 'SESSION_CLOSED' };
    }

    if (session.mode !== 'CODE') {
      return { success: false, error: 'Session is not in Attendance Code mode', code: 'INVALID_CREDENTIAL' };
    }

    const rot = generateRotatingCode(session.id, session.session_secret);
    return {
      code: rot.code,
      secondsRemaining: rot.secondsRemaining,
      rotationInterval: rot.rotationInterval
    };
  }

  // ==========================================
  // Regenerate Attendance Code (Deprecated/Manual fallback)
  // ==========================================
  static async regenerateCode(
    teacherId: string,
    sessionId: string
  ): Promise<{ success: true; code: string } | ApiErrorResponse> {
    const session = await db.queryOne<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1 AND teacher_id = $2 AND status = 'ACTIVE'`,
      [sessionId, teacherId]
    );

    if (!session) {
      return { success: false, error: 'Active session not found or unauthorized', code: 'SESSION_CLOSED' };
    }

    if (session.mode !== 'CODE') {
      return { success: false, error: 'Session is not in Attendance Code mode', code: 'INVALID_CREDENTIAL' };
    }

    const rot = generateRotatingCode(session.id, session.session_secret);
    await db.execute(
      `UPDATE attendance_sessions SET current_code = $1 WHERE id = $2`,
      [rot.code, sessionId]
    );

    return { success: true, code: rot.code };
  }

  // ==========================================
  // End Session
  // ==========================================
  static async endSession(
    teacherId: string,
    sessionId: string
  ): Promise<{ success: true; finalCount: number } | ApiErrorResponse> {
    const session = await db.queryOne<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1 AND teacher_id = $2`,
      [sessionId, teacherId]
    );

    if (!session) {
      return { success: false, error: 'Session not found or unauthorized', code: 'FORBIDDEN' };
    }

    const endedAt = new Date().toISOString();
    await db.execute(
      `UPDATE attendance_sessions SET status = 'CLOSED', ended_at = $1 WHERE id = $2`,
      [endedAt, sessionId]
    );

    const records = await db.query(
      `SELECT id FROM attendance_records WHERE session_id = $1`,
      [sessionId]
    );

    return { success: true, finalCount: records.length };
  }

  // ==========================================
  // Passwordless Student Attendance Submission
  // ==========================================
  static async submitAttendance(params: {
    enrollmentNumber: string;
    mode: AttendanceMode;
    qrToken?: string;
    code?: string;
  }): Promise<
    | {
        success: true;
        class_name: string;
        course: string;
        student_name: string;
        enrollment_number: string;
        /** ISO 8601 timestamp — format client-side */
        markedAt: string;
        /** Legacy locale-formatted time — kept for backward compat */
        time: string;
        verification_method: string;
      }
    | (ApiErrorResponse & {
        /** Enriched ALREADY_MARKED fields (only present when code === 'ALREADY_MARKED') */
        student_name?: string;
        enrollment_number?: string;
        class_name?: string;
        course?: string;
        markedAt?: string;
        verification_method?: string;
      })
  > {
    const cleanEnr = (params.enrollmentNumber || '').trim().toUpperCase();
    if (!cleanEnr) {
      return { success: false, error: 'Enrollment number is required', code: 'STUDENT_NOT_FOUND' };
    }

    // 1. Resolve Student by institutional Enrollment Number
    const student = await db.queryOne<User>(
      `SELECT id, name, email, role, student_id FROM users WHERE UPPER(student_id) = $1 AND role = 'STUDENT'`,
      [cleanEnr]
    );
    if (!student) {
      return {
        success: false,
        error: `Enrollment number "${cleanEnr}" is not registered in the institution system`,
        code: 'STUDENT_NOT_FOUND'
      };
    }

    // 2. Resolve Active Session
    let session: (AttendanceSession & { class_name: string; course: string }) | null = null;

    if (params.mode === 'CODE') {
      const cleanCode = (params.code || '').trim();
      if (!cleanCode) {
        return { success: false, error: 'Attendance code is required', code: 'INVALID_CODE' };
      }

      if (!/^[0-9]{6}$/.test(cleanCode)) {
        return { success: false, error: 'Invalid or inactive classroom attendance code', code: 'INVALID_CODE' };
      }

      // Query all ACTIVE sessions in CODE mode
      const activeSessions = await db.query<any>(
        `SELECT s.*, c.name as class_name, c.course
         FROM attendance_sessions s
         JOIN classes c ON s.class_id = c.id
         WHERE s.status = 'ACTIVE' AND s.mode = 'CODE'`
      );

      const nowMs = Date.now();
      const codeMatchingSessions: any[] = [];

      for (const s of activeSessions) {
        const val = verifyRotatingCode(cleanCode, s.id, s.session_secret, nowMs);
        if (val.valid) {
          codeMatchingSessions.push(s);
        }
      }

      if (codeMatchingSessions.length === 0) {
        return { success: false, error: 'Invalid or inactive classroom attendance code', code: 'INVALID_CODE' };
      }

      // Check enrollment eligibility for each matched session
      const eligibleSessions: any[] = [];
      for (const s of codeMatchingSessions) {
        const enrollment = await db.queryOne(
          `SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
          [s.class_id, student.id]
        );
        if (enrollment) {
          eligibleSessions.push(s);
        }
      }

      if (eligibleSessions.length === 0) {
        // Not enrolled in the matched session
        const firstMatch = codeMatchingSessions[0];
        return {
          success: false,
          error: `Student ${student.name} (${cleanEnr}) is not enrolled in ${firstMatch.class_name} (${firstMatch.course})`,
          code: 'STUDENT_NOT_ELIGIBLE'
        };
      }

      if (eligibleSessions.length > 1) {
        // Collision: student is enrolled in multiple active classes that derived identical code
        return {
          success: false,
          error: 'Ambiguous classroom attendance code across multiple active enrolled classes',
          code: 'AMBIGUOUS_CODE'
        };
      }

      session = eligibleSessions[0];
    } else if (params.mode === 'DYNAMIC_QR') {
      const qrToken = (params.qrToken || '').trim();
      if (!qrToken) {
        return { success: false, error: 'Dynamic QR token is required', code: 'INVALID_CREDENTIAL' };
      }

      // Extract sessionId from token: v1.{sessionId}.{window}.{sig}
      const parts = qrToken.split('.');
      if (parts.length !== 4 || parts[0] !== 'v1') {
        return { success: false, error: 'Malformed or unrecognized QR credential format', code: 'INVALID_CREDENTIAL' };
      }

      const tokenSessionId = parts[1];
      session = await db.queryOne<any>(
        `SELECT s.*, c.name as class_name, c.course
         FROM attendance_sessions s
         JOIN classes c ON s.class_id = c.id
         WHERE s.id = $1 AND s.status = 'ACTIVE' AND s.mode = 'DYNAMIC_QR'`,
        [tokenSessionId]
      );

      if (!session) {
        return { success: false, error: 'Attendance session has ended or is not active', code: 'SESSION_CLOSED' };
      }

      // Cryptographic verification with server time window
      const qrValidation = verifyDynamicQrToken(qrToken, session.session_secret);
      if (!qrValidation.valid) {
        if (qrValidation.code === 'QR_EXPIRED') {
          return {
            success: false,
            error: 'QR credential has expired. Please scan the current code on screen.',
            code: 'QR_EXPIRED'
          };
        }
        return {
          success: false,
          error: 'Invalid or forged QR credential.',
          code: 'INVALID_CREDENTIAL'
        };
      }
    } else {
      return { success: false, error: 'Unsupported attendance mode', code: 'INVALID_CREDENTIAL' };
    }

    if (!session) {
      return { success: false, error: 'Active session not found', code: 'SESSION_CLOSED' };
    }

    // 3. Verify Student Class Enrollment
    const enrollment = await db.queryOne(
      `SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
      [session.class_id, student.id]
    );
    if (!enrollment) {
      return {
        success: false,
        error: `Student ${student.name} (${cleanEnr}) is not enrolled in ${session.class_name} (${session.course})`,
        code: 'STUDENT_NOT_ELIGIBLE'
      };
    }

    // 4. Duplicate Check & Atomic Insertion
    const existingRecord = await db.queryOne<any>(
      `SELECT id, marked_at, verification_method FROM attendance_records WHERE session_id = $1 AND student_id = $2`,
      [session.id, student.id]
    );
    if (existingRecord) {
      // Return enriched ALREADY_MARKED so the frontend can display the original mark details
      return {
        success: false,
        error: `Attendance is already recorded for ${student.name} in this session`,
        code: 'ALREADY_MARKED',
        student_name: student.name,
        enrollment_number: cleanEnr,
        class_name: session.class_name,
        course: session.course,
        markedAt: existingRecord.marked_at,
        verification_method: existingRecord.verification_method
      } as any;
    }

    const recordId = crypto.randomUUID();
    const markedAt = new Date().toISOString();
    const method = params.mode === 'DYNAMIC_QR' ? 'DYNAMIC_QR' : 'ATTENDANCE_CODE';

    try {
      await db.execute(
        `INSERT INTO attendance_records (id, session_id, student_id, marked_at, status, verification_method)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [recordId, session.id, student.id, markedAt, 'PRESENT', method]
      );
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('Duplicate')) {
        // Race condition: another concurrent request won; fetch the winning record
        const raceRecord = await db.queryOne<any>(
          `SELECT id, marked_at, verification_method FROM attendance_records WHERE session_id = $1 AND student_id = $2`,
          [session.id, student.id]
        );
        return {
          success: false,
          error: `Attendance is already recorded for ${student.name} in this session`,
          code: 'ALREADY_MARKED',
          student_name: student.name,
          enrollment_number: cleanEnr,
          class_name: session.class_name,
          course: session.course,
          markedAt: raceRecord?.marked_at || markedAt,
          verification_method: raceRecord?.verification_method || method
        } as any;
      }
      throw err;
    }

    // 5. Private confirmation for student (NO class roster returned)
    return {
      success: true,
      class_name: session.class_name,
      course: session.course,
      student_name: student.name,
      enrollment_number: cleanEnr,
      // ISO timestamp — formatted client-side in the student's own locale
      markedAt,
      // Legacy field kept for backward compatibility
      time: new Date(markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      verification_method: method
    };
  }
}
