import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import apiHandler from '../../frontend/api/index';
import { AttendanceService } from '../../frontend/api/_lib/attendanceService';
import {
  CONFIG,
  hashPassword,
  verifyPassword,
  generateDynamicQrToken,
  verifyDynamicQrToken,
  generateRotatingCode,
  verifyRotatingCode,
  signTeacherSession
} from '../../frontend/api/_lib/crypto';
import { db } from '../../frontend/api/_lib/db';

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Forward all /api requests to canonical production Vercel handler
app.use('/api', async (req, res) => {
  await apiHandler(req, res);
});

export const httpServer = createServer(app);

// Export domain primitives for tests
export {
  AttendanceService,
  CONFIG,
  hashPassword,
  verifyPassword,
  generateRotatingCode,
  verifyRotatingCode,
  generateDynamicQrToken,
  verifyDynamicQrToken,
  signTeacherSession,
  db
};

export const generateQrPayload = (session: { id: string; session_secret: string }) => {
  return generateDynamicQrToken(session.id, session.session_secret);
};

export const verifyQrPayload = (token: string, sessionSecret: string) => {
  return verifyDynamicQrToken(token, sessionSecret);
};

export const generateTeacherToken = (user: { id: string; name: string; email: string }) => {
  return signTeacherSession(user);
};

// Start server only if run directly as the main application entry point
if (typeof require !== 'undefined' && require.main === module) {
  const PORT = process.env.PORT || 4001;
  httpServer.listen(PORT, () => {
    console.log(`PRAVAHAx Unified Backend running on port ${PORT}`);
  });
}
