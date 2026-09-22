import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  // QR Rotation configuration
  QR_ROTATION_INTERVAL_SECONDS: process.env.QR_ROTATION_INTERVAL_SECONDS ? parseInt(process.env.QR_ROTATION_INTERVAL_SECONDS, 10) : 4,
  QR_EXPIRATION_GRACE_SECONDS: process.env.QR_EXPIRATION_GRACE_SECONDS ? parseInt(process.env.QR_EXPIRATION_GRACE_SECONDS, 10) : 4,

  // Code Mode configuration
  CODE_ROTATION_INTERVAL_SECONDS: 10,

  // Server & Security
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4001,
  JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'pravahax-dynamic-qr-attendance-secret-key-2026',
  AUTH_SECRET: process.env.AUTH_SECRET || process.env.JWT_SECRET || 'pravahax-auth-jwt-secret-key-2026',
  QR_SIGNING_SECRET: process.env.QR_SIGNING_SECRET || 'pravahax-qr-signing-secret-key-2026',

  // Rate Limiting settings
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_STUDENT_SUBMISSIONS: 20,

  // Client Scanner debounce (ms)
  SCANNER_DEBOUNCE_MS: 2000,
};

