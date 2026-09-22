process.env.NODE_ENV = 'test';
import http from 'http';
import jwt from 'jsonwebtoken';
import { app, httpServer } from '../server';
import { CONFIG } from '../config';
import { generateTeacherToken } from '../auth';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    failed++;
  }
}

function request(method: string, path: string, body?: any, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
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

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode || 500, body: parsed });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runComprehensiveTests() {
  console.log('===============================================================');
  console.log('  PRAVAHAx ATTENDANCE SYSTEM: Section 65 Required Negative Tests');
  console.log('===============================================================\n');

  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  }

  try {
    // 1. Wrong teacher password
    const test1 = await request('POST', '/api/teacher/login', { identifier: 'teacher@test.com', password: 'incorrect_password' });
    assert(test1.status === 401 && test1.body.error === 'Invalid teacher ID or password', '1. Wrong teacher password rejected');

    // 2. Direct API call without teacher authentication
    const test2 = await request('GET', '/api/teacher/me');
    assert(test2.status === 401, '2. Direct API call without teacher authentication rejected');

    // 3. Fake enrollment number
    // First login teacher and start a Dynamic QR session
    const loginRes = await request('POST', '/api/teacher/login', { identifier: 'teacher@test.com', password: 'teacher123' });
    const teacherToken = loginRes.body.token;
    assert(loginRes.status === 200 && !!teacherToken, 'Teacher login successful');

    const startQr = await request('POST', '/api/session/start', { class_id: 'c1', mode: 'DYNAMIC_QR' }, { Authorization: `Bearer ${teacherToken}` });
    const qrToken1 = startQr.body.qr_token;
    const sessionId1 = startQr.body.session_id;

    const test3 = await request('POST', '/api/attendance/mark', { enrollment_number: 'FAKE_ENR_9999', qr_token: qrToken1 });
    assert(test3.status === 404, '3. Fake enrollment number rejected (Status 404)');

    // 4. Valid enrollment without QR/code
    const test4 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001' });
    assert(test4.status === 400 && test4.body.error.includes('requires Dynamic QR scan'), '4. Valid enrollment without QR/code rejected');

    // 5. Invalid QR
    const test5 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', qr_token: 'PVX1.invalid.token.hash' });
    assert(test5.status === 400, '5. Invalid QR format rejected');

    // 6. Expired QR
    const expiredToken = jwt.sign(
      { sub: 'attendance_qr', sid: sessionId1, cid: 'c1', exp: Math.floor(Date.now() / 1000) - 10 },
      `${CONFIG.JWT_SECRET}:${startQr.body.session_id}`
    );
    const test6 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', qr_token: expiredToken });
    assert(test6.status === 400, '6. Expired QR rejected');

    // 7. Screenshot of old QR (simulated by expired timestamp)
    const oldScreenshotToken = jwt.sign(
      { sub: 'attendance_qr', sid: sessionId1, cid: 'c1', exp: Math.floor(Date.now() / 1000) - 20, iat: Math.floor(Date.now() / 1000) - 30 },
      `${CONFIG.JWT_SECRET}:${startQr.body.session_id}`
    );
    const test7 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU002', qr_token: oldScreenshotToken });
    assert(test7.status === 400, '7. Screenshot of old QR rejected');

    // 8. Modified QR payload (tampered cipher/tag)
    const modifiedQr = qrToken1.substring(0, qrToken1.length - 8) + 'deadbeef';
    const test8 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', qr_token: modifiedQr });
    assert(test8.status === 400, '8. Modified QR payload rejected');

    // 9. QR belonging to another attendance session
    const otherSessionToken = jwt.sign(
      { sub: 'attendance_qr', sid: 'different-session-uuid', exp: Math.floor(Date.now() / 1000) + 60 },
      CONFIG.JWT_SECRET
    );
    const test9 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', qr_token: otherSessionToken });
    assert(test9.status === 400, '9. QR belonging to another attendance session rejected');

    // 10. Code submitted to QR Mode session
    const test10 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', pin: '4819' });
    assert(test10.status === 400 && test10.body.error.includes('requires Dynamic QR scan'), '10. Code submitted to QR Mode session rejected');

    // 11. End QR session, then start Code Mode session
    await request('POST', '/api/session/stop', undefined, { Authorization: `Bearer ${teacherToken}` });
    const startCode = await request('POST', '/api/session/start', { class_id: 'c1', mode: 'CODE' }, { Authorization: `Bearer ${teacherToken}` });
    const activePin = startCode.body.pin;

    // QR submitted to Code Mode session
    const test11 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', qr_token: qrToken1 });
    assert(test11.status === 400 && test11.body.error.includes('requires Attendance Code entry'), '11. QR submitted to Code Mode session rejected');

    // 12. Incorrect attendance code
    const test12 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', pin: '0000' });
    assert(test12.status === 400 && test12.body.error === 'Invalid or expired attendance code.', '12. Incorrect attendance code rejected');

    // Valid code submission
    const validMark = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', pin: activePin });
    assert(validMark.status === 200, 'Student STU001 marked present with valid code');

    // 15. Same student scans/submits repeatedly (duplicate check)
    const test15 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU001', pin: activePin });
    assert(test15.status === 400 && test15.body.error === 'Already marked present for this session', '15. Same student submitting repeatedly rejected (duplicate prevented)');

    // 16. Same student submits concurrent requests
    const [c1, c2] = await Promise.all([
      request('POST', '/api/attendance/mark', { enrollment_number: 'STU002', pin: activePin }),
      request('POST', '/api/attendance/mark', { enrollment_number: 'STU002', pin: activePin })
    ]);
    const oneSuccess = (c1.status === 200 && c2.status === 400) || (c2.status === 200 && c1.status === 400);
    assert(oneSuccess, '16. Concurrent requests from same student: exactly one succeeds, duplicate rejected');

    // 17. Student submits again after success
    const test17 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU002', pin: activePin });
    assert(test17.status === 400, '17. Student submitting after success rejected');

    // 18. Teacher reconnects / refreshes active session
    const test18 = await request('GET', '/api/session/active');
    assert(test18.status === 200 && test18.body.active === true && test18.body.session.mode === 'CODE', '18. Teacher recovers active session on reconnect');

    // 19. Teacher logs out
    const test19 = await request('POST', '/api/teacher/logout');
    assert(test19.status === 200, '19. Teacher logs out successfully');

    // End session
    await request('POST', '/api/session/stop', undefined, { Authorization: `Bearer ${teacherToken}` });

    // 13. Code after session ended
    const test13 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU003', pin: activePin });
    assert(test13.status === 400, '13. Code submission after session ended rejected');

    // 14. QR after session ended
    const test14 = await request('POST', '/api/attendance/mark', { enrollment_number: 'STU003', qr_token: qrToken1 });
    assert(test14.status === 400, '14. QR submission after session ended rejected');

    console.log('\n===============================================================');
    console.log(`  Verification Summary: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Error running comprehensive tests:', err);
    process.exit(1);
  } finally {
    httpServer.close();
  }
}

runComprehensiveTests();
