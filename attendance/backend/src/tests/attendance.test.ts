process.env.NODE_ENV = 'test';
import http from 'http';
import { app, httpServer, AttendanceService, CONFIG } from '../server';

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

function request(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: any }> {
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
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAllTests() {
  console.log('================================================================');
  console.log('  PRAVAHAx Production-Grade MVP Comprehensive Test Suite');
  console.log('================================================================\n');

  if (!httpServer.listening) {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
  }

  try {
    let teacherToken = '';
    let teacherCookie = '';

    // ----------------------------------------------------
    // 1. Teacher Authentication Tests
    // ----------------------------------------------------
    console.log('[TEST GROUP 1: Teacher Authentication & Authorization]');

    // 1.1 Correct password succeeds
    const loginRes = await request('POST', '/api/teacher/login', {
      identifier: 'teacher@test.com',
      password: 'teacher123'
    });
    assert(loginRes.status === 200, 'Teacher login with correct password succeeds (200)');
    assert(loginRes.body.success === true, 'Teacher login returns success: true');
    assert(loginRes.body.user.role === 'TEACHER', 'Teacher role is TEACHER');
    assert(typeof loginRes.body.token === 'string', 'Session token issued');
    teacherToken = loginRes.body.token;

    // Cookie verification
    const setCookie = loginRes.headers['set-cookie'];
    assert(Array.isArray(setCookie) && setCookie.some((c: string) => c.includes('pravahax_teacher_session')), 'HttpOnly session cookie set');
    if (Array.isArray(setCookie)) {
      teacherCookie = setCookie[0].split(';')[0];
    }

    // 1.2 Wrong password fails
    const badLoginRes = await request('POST', '/api/teacher/login', {
      identifier: 'teacher@test.com',
      password: 'incorrect_password'
    });
    assert(badLoginRes.status === 401, 'Teacher login with wrong password rejected (401)');
    assert(badLoginRes.body.code === 'UNAUTHORIZED', 'Structured UNAUTHORIZED code returned');

    // 1.3 Missing authentication rejected on protected endpoints
    const noAuthClasses = await request('GET', '/api/teacher/classes');
    assert(noAuthClasses.status === 401, 'Unauthenticated request to /api/teacher/classes rejected (401)');

    // 1.4 Authenticated teacher can fetch assigned classes
    const classesRes = await request('GET', '/api/teacher/classes', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(classesRes.status === 200, 'Teacher accesses classes with Bearer token (200)');
    assert(Array.isArray(classesRes.body.classes) && classesRes.body.classes.length >= 2, 'Assigned classes returned');

    // ----------------------------------------------------
    // 2. Stable Code Mode Attendance Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 2: Stable Attendance Code Mode]');

    // 2.1 Start Code Mode session
    const startCodeRes = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c1', mode: 'CODE' },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(startCodeRes.status === 200, 'Teacher starts Code Mode session (200)');
    assert(startCodeRes.body.session.mode === 'CODE', 'Session mode is CODE');
    const initialCode = startCodeRes.body.code;
    assert(typeof initialCode === 'string' && initialCode.length === 6, 'Generated stable code is exactly 6 digits');
    const codeSessionId = startCodeRes.body.session.id;

    // 2.2 Re-query active session (simulating browser refresh / polling / cold-start)
    const recoverCodeRes = await request('GET', '/api/session/active', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(recoverCodeRes.status === 200, 'Recover active session succeeds (200)');
    assert(recoverCodeRes.body.active === true, 'Session is marked active');
    assert(recoverCodeRes.body.current_code === initialCode, 'Code remains IDENTICAL on recovery (No auto-rotation)');

    // 2.3 Wait and query again: Code must NOT rotate
    await new Promise((r) => setTimeout(r, 1000));
    const queryAgain = await request('GET', '/api/session/active', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(queryAgain.body.current_code === initialCode, 'Code remains stable after time delay');

    // 2.4 Unauthenticated /api/session/active does NOT leak active code or secrets
    const publicActiveRes = await request('GET', '/api/session/active');
    assert(publicActiveRes.body.active === false || !publicActiveRes.body.current_code, 'Public unauthenticated caller cannot view attendance code');

    // 2.5 Passwordless student check-in with valid code
    const studentSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU001',
      mode: 'CODE',
      code: initialCode
    });
    assert(studentSubmit.status === 200, 'Passwordless student check-in with valid code succeeds (200)');
    assert(studentSubmit.body.success === true, 'Attendance recorded');
    assert(studentSubmit.body.student_name === 'Chetan Agrawal', 'Student name resolved correctly');
    assert(studentSubmit.body.verification_method === 'ATTENDANCE_CODE', 'Method verified as ATTENDANCE_CODE');

    // 2.6 Duplicate attendance rejected
    const duplicateSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU001',
      mode: 'CODE',
      code: initialCode
    });
    assert(duplicateSubmit.status === 409, 'Duplicate attendance rejected with 409 Conflict');
    assert(duplicateSubmit.body.code === 'ALREADY_MARKED', 'Error code is ALREADY_MARKED');

    // 2.7 Invalid code rejected
    const badCodeSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU002',
      mode: 'CODE',
      code: '999999'
    });
    assert(badCodeSubmit.status === 404, 'Invalid attendance code rejected (404)');

    // 2.8 Unknown student enrollment rejected
    const unknownStudent = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'UNKNOWN_999',
      mode: 'CODE',
      code: initialCode
    });
    assert(unknownStudent.status === 404, 'Unknown student enrollment rejected (404)');
    assert(unknownStudent.body.code === 'STUDENT_NOT_FOUND', 'Code is STUDENT_NOT_FOUND');

    // 2.9 End session
    const endCodeRes = await request(
      'POST',
      '/api/session/end',
      { sessionId: codeSessionId },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(endCodeRes.status === 200, 'Teacher closes attendance session');

    // 2.10 Submissions to closed session rejected
    const postCloseSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU002',
      mode: 'CODE',
      code: initialCode
    });
    assert(postCloseSubmit.status === 404, 'Submission to closed code session rejected');

    // ----------------------------------------------------
    // 3. Dynamic QR Rotation & Window Expiry Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 3: Deterministic 4-Second Dynamic QR Mode]');

    // 3.1 Start Dynamic QR session
    const startQrRes = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c2', mode: 'DYNAMIC_QR' },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(startQrRes.status === 200, 'Teacher starts Dynamic QR session (200)');
    assert(startQrRes.body.session.mode === 'DYNAMIC_QR', 'Mode is DYNAMIC_QR');
    const qrSessionId = startQrRes.body.session.id;

    // 3.2 Dynamic QR stability test inside current window
    // Request QR three times consecutively in current window
    const qrFetch1 = await request('GET', `/api/session/qr-token?sessionId=${qrSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const qrFetch2 = await request('GET', `/api/session/qr-token?sessionId=${qrSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const qrFetch3 = await request('GET', `/api/session/qr-token?sessionId=${qrSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });

    const token1 = qrFetch1.body.token;
    const token2 = qrFetch2.body.token;
    const token3 = qrFetch3.body.token;

    // Assert: QR1 === QR2 === QR3 within the same window
    assert(token1 === token2 && token2 === token3, 'QR1 === QR2 === QR3 (Identical token within the same rotation window)');

    // 3.3 Submit valid QR token
    const qrStudentSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU002',
      mode: 'DYNAMIC_QR',
      qrToken: token1
    });
    assert(qrStudentSubmit.status === 200, 'Student check-in with active Dynamic QR succeeds (200)');
    assert(qrStudentSubmit.body.student_name === 'Dhruv Sharma', 'Student name resolved');
    assert(qrStudentSubmit.body.verification_method === 'DYNAMIC_QR', 'Method is DYNAMIC_QR');

    // 3.4 Tampered QR signature rejected
    const tamperedToken = token1.slice(0, -4) + 'abcd';
    const tamperedSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU003',
      mode: 'DYNAMIC_QR',
      qrToken: tamperedToken
    });
    assert(tamperedSubmit.status === 400, 'Tampered QR signature rejected (400)');
    assert(tamperedSubmit.body.code === 'INVALID_CREDENTIAL', 'Code is INVALID_CREDENTIAL');

    // 3.5 QR from wrong session rejected
    const fakeSessionQr = `v1.fake-session-uuid.${qrFetch1.body.windowNumber || 100}.invalid-sig`;
    const wrongSessionSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU003',
      mode: 'DYNAMIC_QR',
      qrToken: fakeSessionQr
    });
    assert(wrongSessionSubmit.status === 404, 'QR referencing non-existent session rejected (404)');

    // 3.6 Window progression test: wait for next rotation window
    console.log('  Waiting for window rotation boundary (4 seconds)...');
    await new Promise((r) => setTimeout(r, 4200));

    const qrFetchNext = await request('GET', `/api/session/qr-token?sessionId=${qrSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const tokenNext = qrFetchNext.body.token;

    // Assert: tokenNext !== token1 (Changed deterministically at next window boundary)
    assert(tokenNext !== token1, 'QR4 !== QR1 (QR rotates at next time window boundary)');

    // Submit newly rotated QR
    const qrSubmitNext = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU003',
      mode: 'DYNAMIC_QR',
      qrToken: tokenNext
    });
    assert(qrSubmitNext.status === 200, 'Freshly rotated QR token accepted (200)');

    // Wait past tolerance (4s window + 2s tolerance = wait 7s) and test token1 expiration
    console.log('  Waiting for token1 to fully expire past latency tolerance (6.5 seconds)...');
    await new Promise((r) => setTimeout(r, 6500));

    const expiredSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU004',
      mode: 'DYNAMIC_QR',
      qrToken: token1
    });
    assert(expiredSubmit.status === 400, 'Old QR token rejected past tolerance window (400)');
    assert(expiredSubmit.body.code === 'QR_EXPIRED', 'Expired token returns code QR_EXPIRED');

    // 3.7 End Dynamic QR session
    await request(
      'POST',
      '/api/session/end',
      { sessionId: qrSessionId },
      { Authorization: `Bearer ${teacherToken}` }
    );

    // ----------------------------------------------------
    // 4. Concurrency & Multi-Teacher Isolation Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 4: Concurrency & Database Deduplication]');

    // Start fresh session
    const concSession = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c1', mode: 'CODE' },
      { Authorization: `Bearer ${teacherToken}` }
    );
    const concCode = concSession.body.code;
    const concSessionId = concSession.body.session.id;

    // Send two concurrent requests for STU005 with the same code
    const [reqA, reqB] = await Promise.all([
      request('POST', '/api/attendance/mark', { enrollmentNumber: 'STU005', mode: 'CODE', code: concCode }),
      request('POST', '/api/attendance/mark', { enrollmentNumber: 'STU005', mode: 'CODE', code: concCode })
    ]);

    const successes = [reqA, reqB].filter((r) => r.status === 200);
    const duplicates = [reqA, reqB].filter((r) => r.status === 409);

    assert(successes.length === 1, 'Exactly one concurrent request succeeds (Status 200)');
    assert(duplicates.length === 1, 'Concurrent duplicate request rejected with 409 Conflict');

    // Cleanup session
    await request(
      'POST',
      '/api/session/end',
      { sessionId: concSessionId },
      { Authorization: `Bearer ${teacherToken}` }
    );
  } catch (err) {
    console.error('Test execution error:', err);
    totalFailed++;
  } finally {
    console.log('\n================================================================');
    console.log(`  Test Suite Completed: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('================================================================');

    httpServer.close();
    process.exit(totalFailed === 0 ? 0 : 1);
  }
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
