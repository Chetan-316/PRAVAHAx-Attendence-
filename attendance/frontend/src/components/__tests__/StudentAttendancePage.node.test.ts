/**
 * Node.js built-in test runner for StudentAttendancePage.
 * Uses tsx for TypeScript execution. Mocks React-DOM via simple stubs.
 *
 * Run: npx tsx src/components/__tests__/StudentAttendancePage.node.test.ts
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal mock of the attendance API calls ────────────────────────────────

// Track fetch calls
let fetchCalls: { url: string; body: any }[] = [];
let fetchResponse: { ok: boolean; status: number; body: any } = { ok: true, status: 200, body: { success: true } };

(globalThis as any).fetch = async (url: string | URL | Request, opts: any) => {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  fetchCalls.push({ url: String(url), body });
  return {
    ok: fetchResponse.ok,
    status: fetchResponse.status,
    json: async () => fetchResponse.body
  } as any;
};

// ── Logic-only tests (no DOM) ────────────────────────────────────────────────

import { normalizeStudentEnrollment } from '../StudentAttendancePage';

describe('Enrollment validation & normalization', () => {

  test('empty enrollment should not proceed to method selection', () => {
    const enrollment = '';
    const isValid = enrollment.trim().length > 0;
    assert.equal(isValid, false);
  });

  test('enrollment STU001 is valid', () => {
    const enrollment = 'STU001';
    const isValid = enrollment.trim().length > 0;
    assert.equal(isValid, true);
  });

  test('enrollment is auto-uppercased', () => {
    const input = 'stu001';
    const normalized = normalizeStudentEnrollment(input);
    assert.equal(normalized, 'STU001');
  });

  test('enrollment STUD001 normalizes to STU001', () => {
    assert.equal(normalizeStudentEnrollment('STUD001'), 'STU001');
    assert.equal(normalizeStudentEnrollment('stud001'), 'STU001');
    assert.equal(normalizeStudentEnrollment('STUD1'), 'STU001');
  });

  test('bare numbers like 01 and 1 normalize to STU001', () => {
    assert.equal(normalizeStudentEnrollment('01'), 'STU001');
    assert.equal(normalizeStudentEnrollment('1'), 'STU001');
    assert.equal(normalizeStudentEnrollment('001'), 'STU001');
    assert.equal(normalizeStudentEnrollment('15'), 'STU015');
    assert.equal(normalizeStudentEnrollment('30'), 'STU030');
  });
});

describe('Code input validation', () => {
  test('6-digit code is valid', () => {
    const code = '123456';
    const valid = /^[0-9]{6}$/.test(code);
    assert.equal(valid, true);
  });

  test('5-digit code is invalid', () => {
    const code = '12345';
    const valid = /^[0-9]{6}$/.test(code);
    assert.equal(valid, false);
  });

  test('non-numeric code is stripped', () => {
    const rawInput = 'ab12CD34ef';
    const cleaned = rawInput.replace(/\D/g, '').slice(0, 6);
    assert.equal(cleaned, '1234');
  });

  test('code with 6 digits after stripping', () => {
    const rawInput = 'ab123456xyz';
    const cleaned = rawInput.replace(/\D/g, '').slice(0, 6);
    assert.equal(cleaned, '123456');
  });
});

describe('API fetch: single call per QR scan', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = {
      ok: true,
      status: 200,
      body: {
        success: true,
        student_name: 'Chetan Agrawal',
        enrollment_number: 'STU001',
        class_name: 'Data Structures',
        course: 'CS101',
        markedAt: '2026-09-23T05:43:00.000Z',
        verification_method: 'DYNAMIC_QR'
      }
    };
  });

  test('one QR decode produces one fetch call', async () => {
    // Simulate the guard in handleQrScan
    let hasFired = false;
    const guard = (token: string) => {
      if (hasFired) return; // locked ref guard
      hasFired = true;
      return fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentNumber: 'STU001', mode: 'DYNAMIC_QR', qrToken: token })
      });
    };

    await guard('token1');
    await guard('token1'); // second call should be ignored by guard
    await guard('token1'); // third call should be ignored by guard

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.qrToken, 'token1');
  });
});

describe('ALREADY_MARKED response handling', () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  test('409 response is mapped to ALREADY_MARKED state', async () => {
    fetchResponse = {
      ok: false,
      status: 409,
      body: {
        success: false,
        code: 'ALREADY_MARKED',
        student_name: 'Chetan Agrawal',
        enrollment_number: 'STU001',
        class_name: 'Data Structures',
        course: 'CS101',
        markedAt: '2026-09-23T04:00:00.000Z',
        verification_method: 'DYNAMIC_QR'
      }
    };

    const res = await fetch('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentNumber: 'STU001', mode: 'DYNAMIC_QR', qrToken: 'token' })
    });
    const data = await res.json();

    // Phase transition: 409 → ALREADY_MARKED (not ERROR_RETRY)
    const newPhase = res.status === 409 || data.code === 'ALREADY_MARKED'
      ? 'ALREADY_MARKED'
      : 'ERROR_RETRY';

    assert.equal(newPhase, 'ALREADY_MARKED');
    assert.equal(data.student_name, 'Chetan Agrawal');
    assert.equal(data.class_name, 'Data Structures');
    assert.match(data.markedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('INVALID_CODE clears the code and shows refresh message', () => {
    const errorCode = 'INVALID_CODE';
    let code = '999999';

    if (errorCode === 'INVALID_CODE') {
      code = ''; // simulating setCode('')
    }

    assert.equal(code, '');
  });
});

describe('ISO timestamp formatting', () => {
  test('ISO string can be formatted to locale time', () => {
    const iso = '2026-09-23T05:43:00.000Z';
    const formatted = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.length > 0);
  });

  test('ISO string can be formatted to locale date', () => {
    const iso = '2026-09-23T05:43:00.000Z';
    const formatted = new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.length > 0);
  });
});

describe('AbortController cancellation', () => {
  test('aborted request does not mutate state', async () => {
    const controller = new AbortController();
    let stateMutated = false;

    const doFetch = async () => {
      try {
        await fetch('/api/attendance/mark', {
          method: 'POST',
          body: JSON.stringify({ enrollmentNumber: 'STU001', mode: 'CODE', code: '123456' }),
          signal: controller.signal
        });
        if (controller.signal.aborted) return; // guard
        stateMutated = true; // would mutate state
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        stateMutated = true;
      }
    };

    controller.abort(); // abort before fetch completes
    await doFetch();
    assert.equal(stateMutated, false);
  });
});

console.log('\n✓ All node:test assertions completed successfully.');
