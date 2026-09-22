process.env.NODE_ENV = 'test';
import http from 'http';
import { app, httpServer, io } from '../server';

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
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData).toString()
    };

    const addr = httpServer.address() as any;
    const port = addr ? addr.port : 4000;

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : {};
            resolve({ status: res.statusCode || 200, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 200, body: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runStudentLoginTests() {
  console.log('====================================================');
  console.log('  Testing 5 Student Logins with password pravaha@123');
  console.log('====================================================');

  if (!httpServer.listening) {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
  }

  const students = [
    { username: 'chetan', name: 'Chetan Agrawal', id: 'STU001' },
    { username: 'dhruv', name: 'Dhruv Sharma', id: 'STU002' },
    { username: 'pallav', name: 'Pallav Patel', id: 'STU003' },
    { username: 'varad', name: 'Varad Kulkarni', id: 'STU004' },
    { username: 'devang', name: 'Devang Joshi', id: 'STU005' }
  ];

  for (const s of students) {
    // 1. Username login
    const resUser = await request('POST', '/api/student/login', {
      identifier: s.username,
      password: 'pravaha@123'
    });
    assert(
      resUser.status === 200 && resUser.body.token && resUser.body.user.name === s.name,
      `Student ${s.name} (${s.username}) logged in with username`
    );

    // 2. Enrollment ID login
    const resId = await request('POST', '/api/student/login', {
      identifier: s.id,
      password: 'pravaha@123'
    });
    assert(
      resId.status === 200 && resId.body.token && resId.body.user.name === s.name,
      `Student ${s.name} (${s.id}) logged in with enrollment number`
    );

    // 3. Bad password rejected
    const resBad = await request('POST', '/api/student/login', {
      identifier: s.username,
      password: 'wrong_password_test'
    });
    assert(
      resBad.status === 401,
      `Invalid password rejected for ${s.username} (401 Unauthorized)`
    );
  }

  console.log('====================================================');
  console.log(`  Results: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('====================================================');

  httpServer.close();
  io.close();
  process.exit(totalFailed === 0 ? 0 : 1);
}

runStudentLoginTests().catch(e => {
  console.error(e);
  process.exit(1);
});

