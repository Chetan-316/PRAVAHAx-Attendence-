process.env.NODE_ENV = 'test';
import http from 'http';
import {
  app,
  httpServer,
  AttendanceService,
  CONFIG,
  hashPassword,
  generateRotatingCode,
  verifyRotatingCode,
  db
} from '../server';

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
    // 2. 4-Second Rotating Attendance Code Mode Tests (Tests 1-13)
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 2: Server-Authoritative 4-Second Rotating Code Mode]');

    // Setup Teacher B for isolation tests
    const teacher2PwHash = hashPassword('teacher456');
    await db.execute(
      `INSERT INTO users (id, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5)`,
      ['t2', 'Prof. Verma', 'teacher2@test.com', 'TEACHER', teacher2PwHash]
    );
    await db.execute(
      `INSERT INTO classes (id, name, course, teacher_id) VALUES ($1, $2, $3, $4)`,
      ['c3', 'Operating Systems', 'CS103', 't2']
    );
    await db.execute(
      `INSERT INTO class_enrollments (id, class_id, student_id, status) VALUES ($1, $2, $3, $4)`,
      ['enr_s18_c3', 'c3', 's18', 'ACTIVE']
    );

    const loginRes2 = await request('POST', '/api/teacher/login', {
      identifier: 'teacher2@test.com',
      password: 'teacher456'
    });
    assert(loginRes2.status === 200, 'Teacher 2 login succeeds (200)');
    const teacherToken2 = loginRes2.body.token;

    // Start Code Mode session for Teacher A
    const startCodeRes = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c1', mode: 'CODE' },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(startCodeRes.status === 200, 'Teacher starts Code Mode session (200)');
    assert(startCodeRes.body.session.mode === 'CODE', 'Session mode is CODE');
    const codeSessionId = startCodeRes.body.session.id;

    // TEST 1: Same window stability
    const codeReq1 = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const codeReq2 = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const codeReq3 = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });

    const c1 = codeReq1.body.code;
    const c2 = codeReq2.body.code;
    const c3 = codeReq3.body.code;
    assert(c1 === c2 && c2 === c3, 'Test 1: C1 === C2 === C3 (Code is identical within the same 4s window)');

    // TEST 3: Six-digit format
    assert(/^[0-9]{6}$/.test(c1), 'Test 3: Generated rotating code strictly matches ^[0-9]{6}$');

    // TEST 4: Current code accepted
    const studentSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU001',
      mode: 'CODE',
      code: c1
    });
    assert(studentSubmit.status === 200, 'Test 4: Passwordless student check-in with current rotating code succeeds (200)');
    assert(studentSubmit.body.success === true, 'Test 4: Attendance recorded');
    assert(studentSubmit.body.student_name === 'Chetan Agrawal', 'Test 4: Student name resolved correctly');
    assert(studentSubmit.body.verification_method === 'ATTENDANCE_CODE', 'Test 4: Method verified as ATTENDANCE_CODE');

    // Duplicate submission in same session rejected
    const dupSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU001',
      mode: 'CODE',
      code: c1
    });
    assert(dupSubmit.status === 409, 'Duplicate attendance rejected with 409 Conflict');

    // TEST 8: Unauthorized code retrieval
    const unauthCodeRes = await request('GET', `/api/session/code?sessionId=${codeSessionId}`);
    assert(unauthCodeRes.status === 401, 'Test 8: Unauthenticated GET /api/session/code rejected with 401');

    // TEST 9: Wrong teacher access
    const wrongTeacherRes = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken2}`
    });
    assert(wrongTeacherRes.status === 403, 'Test 9: Teacher B cannot fetch Teacher A session code (403 FORBIDDEN)');

    // TEST 2: Four-second rotation
    // Wait until crossing into the next window (+ 150ms buffer)
    const secondsRemaining = codeReq3.body.secondsRemaining || 4;
    const waitMs = Math.ceil(secondsRemaining * 1000) + 150;
    console.log(`  Waiting ${waitMs}ms to cross 4-second time boundary...`);
    await new Promise((r) => setTimeout(r, waitMs));

    const codeReqNext = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const c4 = codeReqNext.body.code;
    assert(c4 !== c1, 'Test 2: C4 !== C1 (Code rotated automatically at window boundary)');
    assert(/^[0-9]{6}$/.test(c4), 'Test 3: Newly rotated code satisfies ^[0-9]{6}$');

    // TEST 5: Immediately previous code tolerance (within 2 seconds)
    // We just crossed the boundary (< 1.5 seconds ago), submit previous code c1
    const prevCodeSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU002',
      mode: 'CODE',
      code: c1
    });
    assert(prevCodeSubmit.status === 200, 'Test 5: Immediately previous code accepted within tolerance window (200)');
    assert(prevCodeSubmit.body.student_name === 'Dhruv Sharma', 'Test 5: Student Dhruv Sharma attendance recorded');

    // TEST 6: Old code rejected past tolerance
    console.log('  Waiting 3 seconds for previous window to fully expire past tolerance...');
    await new Promise((r) => setTimeout(r, 3000));
    const oldCodeSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU003',
      mode: 'CODE',
      code: c1 // c1 is now definitely older than current and outside tolerance
    });
    assert(oldCodeSubmit.status === 404, 'Test 6: Expired code rejected past tolerance window (404)');
    assert(oldCodeSubmit.body.code === 'INVALID_CODE', 'Test 6: Returns structured error code INVALID_CODE');

    // TEST 12: Browser refresh / recovery
    const recoverRes = await request('GET', '/api/session/active', undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(recoverRes.status === 200, 'Test 12: Recover active session succeeds');
    assert(recoverRes.body.active === true, 'Test 12: Session is marked active');
    const currentOnRecovery = recoverRes.body.current_code;
    // Check that recovery returns the current server-calculated code, not stale initial code
    const freshCodeReq = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    assert(currentOnRecovery === freshCodeReq.body.code, 'Test 12: Browser refresh recovers the CURRENT server-window code');

    // TEST 13: Vercel cold-start / serverless simulation
    // Compute code independently for exact same session and time timestamp
    const nowTimestamp = Date.now();
    const inst1 = generateRotatingCode('test-session-id-123', 'test-secret-456', nowTimestamp);
    const inst2 = generateRotatingCode('test-session-id-123', 'test-secret-456', nowTimestamp);
    assert(inst1.code === inst2.code, 'Test 13: Vercel cold-start: independent instances derive identical code for same time window');

    // TEST 10: Multiple concurrent sessions
    const startCodeRes2 = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c3', mode: 'CODE' },
      { Authorization: `Bearer ${teacherToken2}` }
    );
    assert(startCodeRes2.status === 200, 'Test 10: Teacher 2 starts independent Code session for Class c3');
    const codeSessionId2 = startCodeRes2.body.session.id;

    const teacher2CodeFetch = await request('GET', `/api/session/code?sessionId=${codeSessionId2}`, undefined, {
      Authorization: `Bearer ${teacherToken2}`
    });
    const teacher1CodeFetch = await request('GET', `/api/session/code?sessionId=${codeSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });

    const t2Code = teacher2CodeFetch.body.code;
    const t1Code = teacher1CodeFetch.body.code;
    assert(t2Code !== t1Code, 'Test 10: Independent sessions derive independent cryptographic codes');

    // Student s18 is enrolled in c3 (and c1, c2)
    const t2StudentSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU018',
      mode: 'CODE',
      code: t2Code
    });
    assert(t2StudentSubmit.status === 200, 'Test 10: Student maps correctly to Teacher 2 class c3');
    assert(t2StudentSubmit.body.class_name === 'Operating Systems', 'Test 10: Class name correctly resolved to Operating Systems');

    // TEST 11: Collision / Ambiguity Handling
    // If student enters code for an active class they are NOT enrolled in
    // Student s30 is not enrolled in c3
    const notEnrolledSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU030',
      mode: 'CODE',
      code: t2Code
    });
    assert(notEnrolledSubmit.status === 403, 'Test 11: Student submitting code for non-enrolled class rejected with 403 STUDENT_NOT_ELIGIBLE');

    // Close session 2
    await request('POST', '/api/session/end', { sessionId: codeSessionId2 }, { Authorization: `Bearer ${teacherToken2}` });

    // TEST 7: Closed session
    // End session 1
    const endCodeRes = await request(
      'POST',
      '/api/session/end',
      { sessionId: codeSessionId },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(endCodeRes.status === 200, 'Teacher closes attendance session 1');

    // Submissions to closed session rejected even with valid current code
    const freshActiveCode = generateRotatingCode(codeSessionId, startCodeRes.body.session.session_secret).code;
    const postCloseSubmit = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU004',
      mode: 'CODE',
      code: freshActiveCode
    });
    assert(postCloseSubmit.status === 404, 'Test 7: Submission to closed session rejected (404)');

    // ----------------------------------------------------
    // 3. Dynamic QR Rotation & Window Expiry Tests (Verified Undisturbed)
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
    console.log('  Waiting for QR window rotation boundary (4 seconds)...');
    await new Promise((r) => setTimeout(r, 4200));

    const qrFetchNext = await request('GET', `/api/session/qr-token?sessionId=${qrSessionId}`, undefined, {
      Authorization: `Bearer ${teacherToken}`
    });
    const tokenNext = qrFetchNext.body.token;

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
    // 4. Concurrency & Database Deduplication Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 4: Concurrency & Database Deduplication]');

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

    // ----------------------------------------------------
    // 5. Duplicate Attendance Regression & API Safety Tests
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 5: ALREADY_MARKED Regression & API Safety]');

    // 5.1 Start a fresh session for regression tests
    const regressionSession = await request(
      'POST',
      '/api/session/start',
      { class_id: 'c1', mode: 'CODE' },
      { Authorization: `Bearer ${teacherToken}` }
    );
    assert(regressionSession.status === 200, '[5.1] Regression session started');
    const regCode = regressionSession.body.code;
    const regSessionId = regressionSession.body.session.id;

    // 5.2 First submission succeeds and returns ISO markedAt
    const firstReg = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU006',
      mode: 'CODE',
      code: regCode
    });
    assert(firstReg.status === 200, '[5.2] First submission returns 200');
    assert(firstReg.body.success === true, '[5.2] First submission success:true');
    assert(typeof firstReg.body.markedAt === 'string', '[5.2] markedAt is present');
    assert(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(firstReg.body.markedAt),
      '[5.2] markedAt is ISO 8601 format'
    );

    // 5.3 session_secret must NOT appear in student-facing success response
    assert(
      !JSON.stringify(firstReg.body).includes('session_secret'),
      '[5.3] session_secret NOT exposed in student success response'
    );

    // 5.4 Sequential duplicate returns 409 ALREADY_MARKED with enriched fields
    const dupReg = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU006',
      mode: 'CODE',
      code: regCode
    });
    assert(dupReg.status === 409, '[5.4] Sequential duplicate returns 409');
    assert(dupReg.body.code === 'ALREADY_MARKED', '[5.4] code is ALREADY_MARKED');
    assert(typeof dupReg.body.student_name === 'string', '[5.4] student_name present in 409 body');
    assert(typeof dupReg.body.class_name === 'string', '[5.4] class_name present in 409 body');
    assert(typeof dupReg.body.markedAt === 'string', '[5.4] markedAt present in 409 body');
    assert(typeof dupReg.body.verification_method === 'string', '[5.4] verification_method in 409 body');

    // 5.5 DB uniqueness: third sequential attempt still returns ALREADY_MARKED (not 200)
    const thirdAttempt = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU006',
      mode: 'CODE',
      code: regCode
    });
    assert(thirdAttempt.status === 409, '[5.5] Third sequential attempt still returns 409 ALREADY_MARKED (uniqueness)');
    assert(thirdAttempt.body.code === 'ALREADY_MARKED', '[5.5] code is ALREADY_MARKED on third attempt');

    // 5.6 Concurrent duplicate: send 3 simultaneous requests for same student
    const [conc1, conc2, conc3] = await Promise.all([
      request('POST', '/api/attendance/mark', { enrollmentNumber: 'STU007', mode: 'CODE', code: regCode }),
      request('POST', '/api/attendance/mark', { enrollmentNumber: 'STU007', mode: 'CODE', code: regCode }),
      request('POST', '/api/attendance/mark', { enrollmentNumber: 'STU007', mode: 'CODE', code: regCode })
    ]);
    const concSuccesses = [conc1, conc2, conc3].filter((r) => r.status === 200).length;
    const concDuplicates = [conc1, conc2, conc3].filter((r) => r.status === 409).length;
    assert(concSuccesses === 1, `[5.6] Exactly 1 of 3 concurrent requests succeeds (got ${concSuccesses})`);
    assert(concDuplicates === 2, `[5.6] Exactly 2 of 3 concurrent requests get 409 (got ${concDuplicates})`);

    // 5.7 DB uniqueness: fourth attempt after concurrent storm still returns ALREADY_MARKED
    const fourthAttempt = await request('POST', '/api/attendance/mark', {
      enrollmentNumber: 'STU007',
      mode: 'CODE',
      code: regCode
    });
    assert(fourthAttempt.status === 409, '[5.7] Post-concurrent attempt is also ALREADY_MARKED (DB uniqueness)');

    // 5.8 session_secret not exposed in ALREADY_MARKED 409 response
    assert(
      !JSON.stringify(dupReg.body).includes('session_secret'),
      '[5.8] session_secret NOT exposed in ALREADY_MARKED response'
    );

    // Cleanup regression session
    await request(
      'POST',
      '/api/session/end',
      { sessionId: regSessionId },
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

