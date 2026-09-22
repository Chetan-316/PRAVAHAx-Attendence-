import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { CONFIG } from './config';

export interface TeacherJwtPayload {
  id: string;
  name: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  teacher?: TeacherJwtPayload;
}

/**
 * Secure password hashing using Node crypto.scrypt (OWASP approved)
 */
export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
};

/**
 * Timing-safe password verification
 */
export const verifyPassword = (password: string, storedHash: string): boolean => {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
};

/**
 * Generate authenticated teacher session JWT
 */
export const generateTeacherToken = (user: { id: string; name: string; email: string; role: string }): string => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    CONFIG.AUTH_SECRET,
    { expiresIn: '8h' }
  );
};

/**
 * Middleware: Enforce authenticated teacher session on protected APIs
 */
export const requireTeacherAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-teacher-token']) {
    token = req.headers['x-teacher-token'] as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in as a teacher.' });
  }

  try {
    const decoded = jwt.verify(token, CONFIG.AUTH_SECRET) as TeacherJwtPayload;
    if (decoded.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Forbidden. Teacher authorization required.' });
    }
    req.teacher = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalid or expired. Please sign in again.' });
  }
};

/**
 * Lightweight sliding window rate limiter
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const isRateLimited = (key: string, maxAttempts: number, windowMs: number): boolean => {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= maxAttempts) {
    return true;
  }

  entry.count++;
  return false;
};
