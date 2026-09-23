export type UserRole = 'TEACHER' | 'STUDENT' | 'ADMIN';
export type AttendanceMode = 'DYNAMIC_QR' | 'CODE';
export type SessionStatus = 'ACTIVE' | 'CLOSED';
export type VerificationMethod = 'DYNAMIC_QR' | 'ATTENDANCE_CODE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  student_id?: string | null;
  password_hash?: string | null;
  created_at?: string;
}

export interface ClassItem {
  id: string;
  name: string;
  course: string;
  teacher_id: string;
  created_at?: string;
}

export interface ClassEnrollment {
  id: string;
  class_id: string;
  student_id: string;
  status: string;
  created_at?: string;
}

export interface AttendanceSession {
  id: string;
  class_id: string;
  teacher_id: string;
  mode: AttendanceMode;
  current_code?: string | null;
  session_secret: string;
  started_at: string;
  ended_at?: string | null;
  status: SessionStatus;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  marked_at: string;
  status: string;
  verification_method: VerificationMethod;
}

export interface AttendeeView {
  student_id: string;
  name: string;
  enrollment_number: string;
  verification_method: VerificationMethod;
  marked_at: string;
}

export interface TeacherSessionPayload {
  id: string;
  name: string;
  email: string;
  role: 'TEACHER';
  exp: number;
}

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIAL'
  | 'FORBIDDEN'
  | 'SESSION_CLOSED'
  | 'QR_EXPIRED'
  | 'INVALID_CODE'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_NOT_ELIGIBLE'
  | 'ALREADY_MARKED'
  | 'ACTIVE_SESSION_EXISTS'
  | 'AMBIGUOUS_CODE'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}
