process.env.NODE_ENV = 'test';
import http from 'http';
import jwt from 'jsonwebtoken';
import { app, httpServer, io } from '../server';
import db from '../db';
import { CONFIG } from '../config';

// Simple lightweight test runner helper
let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    totalFailed++;
  }
}

// HTTP request helper against express app
function request(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const addr = httpServer.address() as any;
    const port = addr ? addr.port : 4001;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => {
          resData += chunk;
        });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  PRAVAHAx ERP Dynamic QR & Code Attendance Test Suite');
  console.log('====================================================\n');

  // Start HTTP server on dynamic port for tests if not already listening
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
  }

  try {
    // ----------------------------------------------------
    // 1. Dynamic QR Mode Tests
    // ----------------------------------------------------
    console.log('[TEST GROUP 1: Dynamic QR Mode Full Workflow]');

    // 1.1 Start Dynamic QR Session
    const startQrRes = await request('POST', '/api/session/start', {
      class_id: 'c1',
      teacher_id: 't1',
      mode: 'DYNAMIC_QR'
    });
    assert(startQrRes.status === 200, 'Teacher starts Dynamic QR session (Status 200)');
    assert(startQrRes.body.mode === 'DYNAMIC_QR', 'Session mode is DYNAMIC_QR');
    assert(typeof startQrRes.body.qr_token === 'string', 'Dynamic QR token generated');
    const firstQrToken = startQrRes.body.qr_token;
    const sessionId = startQrRes.body.session_id;

    // 1.2 Verify Active Session Recovery (Teacher reconnect/reload)
    const activeRes = await request('GET', '/api/session/active');
    assert(activeRes.status === 200 && activeRes.body.active === true, 'Teacher reconnect recovers active session');
    assert(activeRes.body.session.mode === 'DYNAMIC_QR', 'Recovered session mode matches DYNAMIC_QR');
    assert(activeRes.body.session.id === sessionId, 'Recovered session ID matches original');

    // 1.3 Valid QR attendance submission by eligible student
    const student1MarkRes = await request('POST', '/api/attendance/mark', {
      student_id: 's1',
      qr_token: firstQrToken,
      device_id: 'DEV_s1'
    });
    assert(student1MarkRes.status === 200, 'Eligible student marks attendance with valid QR (Status 200)');
    assert(student1MarkRes.body.verification_method === 'DYNAMIC_QR', 'Verification method recorded as DYNAMIC_QR');

    // 1.4 Duplicate attendance prevention (Same student scans again)
    const duplicateRes = await request('POST', '/api/attendance/mark', {
      student_id: 's1',
      qr_token: firstQrToken,
      device_id: 'DEV_s1'
    });
    assert(duplicateRes.status === 400, 'Duplicate QR scan by same student rejected (Status 400)');
    assert(duplicateRes.body.error === 'Already marked present for this session', 'Error explicitly indicates duplicate');

    // 1.5 Concurrency: Multiple simultaneous submissions
    // Register temporary guest students for concurrent test
    const regStudentA = await request('POST', '/api/register_student', { name: 'Concurrent Student A' });
    const regStudentB = await request('POST', '/api/register_student', { name: 'Concurrent Student B' });
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      request('POST', '/api/attendance/mark', { student_id: regStudentA.body.user.id, qr_token: firstQrToken }),
      request('POST', '/api/attendance/mark', { student_id: regStudentB.body.user.id, qr_token: firstQrToken })
    ]);
    assert(concurrentRes1.status === 200 && concurrentRes2.status === 200, 'Concurrent submissions from different students succeed');

    // 1.6 Invalid / Forged QR Token
    const forgedToken = jwt.sign(
      { sub: 'attendance_qr', sid: sessionId, nonce: 'fake', exp: Math.floor(Date.now() / 1000) + 60 },
      'wrong-secret-key'
    );
    const forgedRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      qr_token: forgedToken
    });
    assert(forgedRes.status === 400, 'Forged QR signature rejected (Status 400)');

    // 1.7 QR from different session
    const otherSessionToken = jwt.sign(
      { sub: 'attendance_qr', sid: 'other-session-uuid', nonce: 'other', exp: Math.floor(Date.now() / 1000) + 60 },
      CONFIG.JWT_SECRET
    );
    const wrongSessionRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      qr_token: otherSessionToken
    });
    assert(wrongSessionRes.status === 400, 'QR from another session rejected (Status 400)');

    // 1.8 Expired QR Token
    const expiredToken = jwt.sign(
      { sub: 'attendance_qr', sid: sessionId, nonce: 'exp', exp: Math.floor(Date.now() / 1000) - 10, iat: Math.floor(Date.now() / 1000) - 20 },
      `${CONFIG.JWT_SECRET}:${activeRes.body.session.session_secret || ''}`
    );
    const expiredRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      qr_token: expiredToken
    });
    assert(expiredRes.status === 400, 'Expired QR credential rejected (Status 400)');

    // 1.9 Unauthorized student (non-existent)
    const unauthorizedRes = await request('POST', '/api/attendance/mark', {
      student_id: 'non-existent-student-id',
      qr_token: firstQrToken
    });
    assert(unauthorizedRes.status === 404, 'Non-existent student rejected (Status 404)');

    // 1.10 Cross-Mode Enforcement: Submitting PIN code to a Dynamic QR session
    const crossModeCodeRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      pin: '1234'
    });
    assert(crossModeCodeRes.status === 400, 'PIN code submission rejected on Dynamic QR session');
    assert(crossModeCodeRes.body.error.includes('requires Dynamic QR scan'), 'Error clarifies required mode');

    // 1.11 End Session closes acceptance
    const stopRes = await request('POST', '/api/session/stop');
    assert(stopRes.status === 200, 'Teacher ends attendance session (Status 200)');

    // 1.12 Closed session scan fails
    const closedScanRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      qr_token: firstQrToken
    });
    assert(closedScanRes.status === 400, 'Scan after session closure rejected (Status 400)');

    // ----------------------------------------------------
    // 2. Attendance Code Mode Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 2: Attendance Code Mode Full Workflow]');

    // 2.1 Start Code Mode Session
    const startCodeRes = await request('POST', '/api/session/start', {
      class_id: 'c1',
      teacher_id: 't1',
      mode: 'CODE'
    });
    assert(startCodeRes.status === 200, 'Teacher starts Attendance Code session (Status 200)');
    assert(startCodeRes.body.mode === 'CODE', 'Session mode is CODE');
    assert(typeof startCodeRes.body.pin === 'string' && startCodeRes.body.pin.length === 4, '4-digit attendance PIN generated');
    const validPin = startCodeRes.body.pin;

    // 2.2 Correct code submission succeeds
    const codeSuccessRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      pin: validPin,
      device_id: 'DEV_s2'
    });
    assert(codeSuccessRes.status === 200, 'Student marks attendance with correct PIN (Status 200)');
    assert(codeSuccessRes.body.verification_method === 'ATTENDANCE_CODE', 'Verification method recorded as ATTENDANCE_CODE');

    // 2.3 Incorrect code fails
    const codeFailRes = await request('POST', '/api/attendance/mark', {
      student_id: 's1',
      pin: '999999_wrong'
    });
    assert(codeFailRes.status === 400, 'Incorrect PIN rejected (Status 400)');

    // 2.4 Duplicate code submission prevented
    const duplicateCodeRes = await request('POST', '/api/attendance/mark', {
      student_id: 's2',
      pin: validPin
    });
    assert(duplicateCodeRes.status === 400, 'Duplicate code entry rejected (Status 400)');

    // 2.5 Cross-Mode Enforcement: Submitting QR to a Code session
    const crossModeQrRes = await request('POST', '/api/attendance/mark', {
      student_id: 's1',
      qr_token: 'some-dummy-token'
    });
    assert(crossModeQrRes.status === 400, 'QR submission rejected on Attendance Code session');
    assert(crossModeQrRes.body.error.includes('requires Attendance Code entry'), 'Error clarifies required mode');

    // 2.6 Close Code session
    await request('POST', '/api/session/stop');

    // ----------------------------------------------------
    // 3. Attendance Logs Verification
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 3: Attendance Logs & Audit Trail]');
    const logsRes = await request('GET', '/api/attendance/logs');
    assert(logsRes.status === 200, 'Attendance logs retrieved successfully');
    assert(Array.isArray(logsRes.body.logs) && logsRes.body.logs.length > 0, 'Audit logs contain recorded attendances');
    const qrLogs = logsRes.body.logs.filter((l: any) => l.verification_method === 'DYNAMIC_QR');
    const codeLogs = logsRes.body.logs.filter((l: any) => l.verification_method === 'ATTENDANCE_CODE');
    assert(qrLogs.length > 0, 'Audit logs contain DYNAMIC_QR entries');
    assert(codeLogs.length > 0, 'Audit logs contain ATTENDANCE_CODE entries');

    // ----------------------------------------------------
    // 4. Teacher Authentication & Route Security Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 4: Teacher Authentication & Route Security]');

    // 4.1 Teacher login with wrong password rejected
    const wrongLoginRes = await request('POST', '/api/teacher/login', {
      email: 'teacher@test.com',
      password: 'wrongpassword'
    });
    assert(wrongLoginRes.status === 401, 'Wrong teacher password rejected (Status 401)');
    assert(wrongLoginRes.body.error === 'Invalid teacher ID or password', 'Generic error message on failed login');

    // 4.2 Teacher login with non-existent email rejected
    const nonExistentTeacherRes = await request('POST', '/api/teacher/login', {
      email: 'ghost@test.com',
      password: 'teacher123'
    });
    assert(nonExistentTeacherRes.status === 401, 'Non-existent teacher rejected (Status 401)');

    // 4.3 Teacher login with correct password succeeds and returns JWT
    const validLoginRes = await request('POST', '/api/teacher/login', {
      email: 'teacher@test.com',
      password: 'teacher123'
    });
    assert(validLoginRes.status === 200, 'Teacher authenticated with valid password (Status 200)');
    assert(typeof validLoginRes.body.token === 'string', 'JWT bearer token generated on login');
    const teacherToken = validLoginRes.body.token;

    // 4.4 Protected teacher profile check
    const meRes = await request('GET', '/api/teacher/me', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(meRes.status === 200 && meRes.body.user.email === 'teacher@test.com', 'Protected /api/teacher/me accessible with token');

    // 4.5 Protected route rejects invalid token
    const invalidTokenRes = await request('GET', '/api/teacher/me', undefined, {
      Authorization: 'Bearer invalid.token.payload'
    });
    assert(invalidTokenRes.status === 401, 'Protected route rejects forged token (Status 401)');

    // ----------------------------------------------------
    // 5. Passwordless Student Attendance by Enrollment Number
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 5: Passwordless Student Attendance by Enrollment Number]');

    // 5.1 Start a fresh Dynamic QR session with teacher token
    const authStartRes = await request('POST', '/api/session/start', {
      class_id: 'c1',
      mode: 'DYNAMIC_QR'
    }, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(authStartRes.status === 200, 'Teacher starts Dynamic QR session with Bearer token');
    const dynamicQrToken = authStartRes.body.qr_token;

    // 5.2 Serverless QR token endpoint generates valid token
    const qrEndpointRes = await request('GET', '/api/session/qr-token', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(qrEndpointRes.status === 200, 'Serverless on-demand QR endpoint generates token');
    assert(typeof qrEndpointRes.body.token === 'string', 'Serverless token is valid string');

    // 5.3 Student marks attendance using Enrollment Number (STU003) + QR Token
    const enrollmentMarkRes = await request('POST', '/api/attendance/mark', {
      enrollment_number: 'STU003',
      qr_token: dynamicQrToken,
      device_id: 'DEV_STU003'
    });
    assert(enrollmentMarkRes.status === 200, 'Student marks attendance using Enrollment Number (Status 200)');
    assert(enrollmentMarkRes.body.success === true, 'Attendance recorded successfully for enrollment STU003');

    // 5.4 Enrollment Number alone without QR token is strictly rejected
    const aloneRes = await request('POST', '/api/attendance/mark', {
      enrollment_number: 'STU002'
    });
    assert(aloneRes.status === 400, 'Enrollment number alone CANNOT mark attendance (Status 400)');
    assert(aloneRes.body.error.includes('requires Dynamic QR scan'), 'Error clarifies QR scan requirement');

    // 5.5 Non-existent enrollment number rejected
    const fakeEnrollmentRes = await request('POST', '/api/attendance/mark', {
      enrollment_number: 'FAKE999',
      qr_token: dynamicQrToken
    });
    assert(fakeEnrollmentRes.status === 404, 'Non-existent enrollment number rejected (Status 404)');

    // 5.6 Close session
    await request('POST', '/api/session/stop', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });

    console.log('\n====================================================');
    console.log(`  Tests Completed: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================');

    if (totalFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    httpServer.close();
  }
}

runAllTests();
