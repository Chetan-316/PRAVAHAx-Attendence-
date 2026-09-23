import crypto from 'crypto';
import { TeacherSessionPayload } from './types.js';

export const CONFIG = {
  QR_ROTATION_SECONDS: parseInt(process.env.QR_ROTATION_SECONDS || process.env.QR_ROTATION_INTERVAL_SECONDS || '5', 10),
  QR_TOLERANCE_SECONDS: parseInt(process.env.QR_TOLERANCE_SECONDS || '2', 10),
  CODE_ROTATION_SECONDS: parseInt(process.env.CODE_ROTATION_SECONDS || process.env.CODE_ROTATION_INTERVAL_SECONDS || '5', 10),
  CODE_TOLERANCE_SECONDS: parseInt(process.env.CODE_TOLERANCE_SECONDS || '2', 10),
  JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'pravahax-prod-secret-fallback-key-for-local-dev-only-316',
  QR_SIGNING_SECRET: process.env.QR_SIGNING_SECRET || 'pravahax-qr-signing-key-for-local-dev-only-316',
  CODE_SIGNING_SECRET: process.env.CODE_SIGNING_SECRET || 'pravahax-code-signing-key-for-local-dev-only-316',
  COOKIE_NAME: 'pravahax_teacher_session',
  SESSION_DURATION_SECONDS: 8 * 3600 // 8 hours
};

// ==========================================
// 1. Password Hashing (OWASP scrypt)
// ==========================================

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedKeyHex] = storedHash.split(':');
  const expectedKey = Buffer.from(expectedKeyHex, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  if (expectedKey.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(expectedKey, derivedKey);
}

// ==========================================
// 2. Deterministic 4-Second Rotating Attendance Code
// ==========================================

export function getCodeWindowNumber(timestampMs: number = Date.now()): number {
  return Math.floor(timestampMs / (CONFIG.CODE_ROTATION_SECONDS * 1000));
}

export function generateRotatingCode(
  sessionId: string,
  sessionSecret: string,
  timestampMs: number = Date.now()
): {
  code: string;
  windowNumber: number;
  secondsRemaining: number;
  rotationInterval: number;
} {
  const windowNumber = getCodeWindowNumber(timestampMs);
  const input = `v1|code|${sessionId}|${windowNumber}`;
  const key = `${CONFIG.CODE_SIGNING_SECRET}:${sessionSecret}`;
  const hash = crypto.createHmac('sha256', key).update(input).digest();

  // Dynamic truncation (RFC 4226 TOTP standard)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const num = binary % 1000000;
  const code = num.toString().padStart(6, '0');

  const windowStartMs = windowNumber * CONFIG.CODE_ROTATION_SECONDS * 1000;
  const elapsedMs = timestampMs - windowStartMs;
  const remainingMs = Math.max(0, (CONFIG.CODE_ROTATION_SECONDS * 1000) - elapsedMs);
  const secondsRemaining = parseFloat((remainingMs / 1000).toFixed(1));

  return {
    code,
    windowNumber,
    secondsRemaining,
    rotationInterval: CONFIG.CODE_ROTATION_SECONDS
  };
}

export interface CodeValidationResult {
  valid: boolean;
  code?: 'INVALID_CODE' | 'CODE_EXPIRED';
  windowNumber?: number;
}

export function verifyRotatingCode(
  submittedCode: string,
  sessionId: string,
  sessionSecret: string,
  serverTimeMs: number = Date.now()
): CodeValidationResult {
  if (!submittedCode || typeof submittedCode !== 'string') {
    return { valid: false, code: 'INVALID_CODE' };
  }

  const cleanCode = submittedCode.trim();
  if (!/^[0-9]{6}$/.test(cleanCode)) {
    return { valid: false, code: 'INVALID_CODE' };
  }

  const currentWindow = getCodeWindowNumber(serverTimeMs);
  const currentCodeObj = generateRotatingCode(sessionId, sessionSecret, serverTimeMs);

  // Check current window
  if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(currentCodeObj.code))) {
    return { valid: true, windowNumber: currentWindow };
  }

  // Check immediately previous window within tolerance
  const currentWindowStartMs = currentWindow * CONFIG.CODE_ROTATION_SECONDS * 1000;
  const msIntoCurrentWindow = serverTimeMs - currentWindowStartMs;

  if (msIntoCurrentWindow <= CONFIG.CODE_TOLERANCE_SECONDS * 1000) {
    const priorWindowMs = (currentWindow - 1) * CONFIG.CODE_ROTATION_SECONDS * 1000;
    const priorCodeObj = generateRotatingCode(sessionId, sessionSecret, priorWindowMs);
    if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(priorCodeObj.code))) {
      return { valid: true, windowNumber: currentWindow - 1 };
    }
  }

  return { valid: false, code: 'INVALID_CODE' };
}

// Retained for backward-compatibility if referenced
export function generateStableCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// ==========================================
// 3. Deterministic 4-Second Dynamic QR
// ==========================================

export function getWindowNumber(timestampMs: number = Date.now()): number {
  return Math.floor(timestampMs / (CONFIG.QR_ROTATION_SECONDS * 1000));
}

export function generateDynamicQrToken(sessionId: string, sessionSecret: string, timestampMs: number = Date.now()): {
  token: string;
  windowNumber: number;
  secondsRemaining: number;
  rotationInterval: number;
} {
  const windowNumber = getWindowNumber(timestampMs);
  const input = `v1|${sessionId}|${windowNumber}`;
  const key = `${CONFIG.QR_SIGNING_SECRET}:${sessionSecret}`;
  const signature = crypto.createHmac('sha256', key).update(input).digest('base64url');

  const token = `v1.${sessionId}.${windowNumber}.${signature}`;
  const windowStartMs = windowNumber * CONFIG.QR_ROTATION_SECONDS * 1000;
  const elapsedMs = timestampMs - windowStartMs;
  const remainingMs = Math.max(0, (CONFIG.QR_ROTATION_SECONDS * 1000) - elapsedMs);
  const secondsRemaining = parseFloat((remainingMs / 1000).toFixed(1));

  return {
    token,
    windowNumber,
    secondsRemaining,
    rotationInterval: CONFIG.QR_ROTATION_SECONDS
  };
}

export interface QrValidationResult {
  valid: boolean;
  code?: 'QR_EXPIRED' | 'INVALID_CREDENTIAL';
  sessionId?: string;
  windowNumber?: number;
}

export function verifyDynamicQrToken(
  token: string,
  sessionSecret: string,
  serverTimeMs: number = Date.now()
): QrValidationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, code: 'INVALID_CREDENTIAL' };
  }

  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return { valid: false, code: 'INVALID_CREDENTIAL' };
  }

  const [, sessionId, windowStr, signature] = parts;
  const tokenWindow = parseInt(windowStr, 10);
  if (isNaN(tokenWindow)) {
    return { valid: false, code: 'INVALID_CREDENTIAL' };
  }

  // Recalculate signature
  const input = `v1|${sessionId}|${tokenWindow}`;
  const key = `${CONFIG.QR_SIGNING_SECRET}:${sessionSecret}`;
  const expectedSignature = crypto.createHmac('sha256', key).update(input).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, code: 'INVALID_CREDENTIAL' };
  }

  // Authoritative server window comparison
  const currentWindow = getWindowNumber(serverTimeMs);
  const windowDiff = currentWindow - tokenWindow;

  if (windowDiff < 0) {
    // Client claims a token from future server time
    return { valid: false, code: 'INVALID_CREDENTIAL' };
  }

  if (windowDiff === 0) {
    // Exactly current window
    return { valid: true, sessionId, windowNumber: tokenWindow };
  }

  if (windowDiff === 1) {
    // Immediate prior window: allowed ONLY if within controlled latency tolerance
    const currentWindowStartMs = currentWindow * CONFIG.QR_ROTATION_SECONDS * 1000;
    const msIntoCurrentWindow = serverTimeMs - currentWindowStartMs;
    if (msIntoCurrentWindow <= CONFIG.QR_TOLERANCE_SECONDS * 1000) {
      return { valid: true, sessionId, windowNumber: tokenWindow };
    }
  }

  // Outside allowed window & tolerance
  return { valid: false, code: 'QR_EXPIRED' };
}

// ==========================================
// 4. Teacher Session Cookie / JWT
// ==========================================

export function signTeacherSession(user: { id: string; name: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + CONFIG.SESSION_DURATION_SECONDS;
  const payload: TeacherSessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'TEACHER',
    exp
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', CONFIG.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyTeacherSession(token: string): TeacherSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', CONFIG.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TeacherSessionPayload;
    if (payload.role !== 'TEACHER') return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
