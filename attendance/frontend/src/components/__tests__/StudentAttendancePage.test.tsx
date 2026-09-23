/**
 * StudentAttendancePage tests — FSM state, API call de-duplication, mobile UX
 *
 * Mocks:
 * - fetch (global) — controlled per test
 * - html5-qrcode — stubbed out (camera not available in jsdom)
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StudentAttendancePage } from '../StudentAttendancePage';

// ── Mock html5-qrcode (no real camera in jsdom) ────────────────────────────────
vi.mock('html5-qrcode', () => {
  const Html5Qrcode = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    isScanning: true
  }));
  (Html5Qrcode as any).getCameras = vi.fn().mockResolvedValue([
    { id: 'rear', label: 'Back Camera' }
  ]);
  return { Html5Qrcode };
});

// ── Mock lucide-react icons to avoid SVG issues ────────────────────────────────
vi.mock('lucide-react', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, any>;
  return new Proxy(mod, {
    get(target, prop) {
      if (typeof prop === 'string' && !(prop in target)) {
        return () => React.createElement('span', { 'data-testid': `icon-${String(prop)}` });
      }
      return Reflect.get(target, prop);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: object) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  });
}

function renderPage() {
  const onBack = vi.fn();
  const utils = render(<StudentAttendancePage onBack={onBack} />);
  return { ...utils, onBack };
}

// Helper: advance through DETAILS → METHOD for QR
async function enterEnrollmentAndSelectQr(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByPlaceholderText(/e\.g\. STU001/i);
  await user.clear(input);
  await user.type(input, 'STU001');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await user.click(screen.getByRole('button', { name: /scan qr/i }));
}

// Helper: advance to Code method
async function enterEnrollmentAndSelectCode(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByPlaceholderText(/e\.g\. STU001/i);
  await user.clear(input);
  await user.type(input, 'STU001');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await user.click(screen.getByRole('button', { name: /enter code/i }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StudentAttendancePage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── T1: Initial render ────────────────────────────────────────────────────────
  it('renders enrollment input on initial load', () => {
    renderPage();
    expect(screen.getByLabelText(/enrollment number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  // ── T2: Method selection visible after enrollment ─────────────────────────────
  it('shows method selection after entering enrollment and clicking Continue', async () => {
    renderPage();
    const input = screen.getByLabelText(/enrollment number/i);
    await user.type(input, 'STU001');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /scan qr/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter code/i })).toBeInTheDocument();
  });

  // ── T3: Method switching disabled during VERIFYING (Code path) ───────────────
  it('disables method switch button during code verification', async () => {
    // Simulate a slow fetch that we control
    let resolveReq!: (value: any) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveReq = resolve; })
    );

    renderPage();
    await enterEnrollmentAndSelectCode(user);

    // Enter 6-digit code
    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    // While verifying, switch method button should be disabled
    const switchBtn = screen.getByRole('button', { name: /switch method/i });
    expect(switchBtn).toBeDisabled();

    // Resolve the request to clean up
    act(() => {
      resolveReq({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: 'err', code: 'INVALID_CODE' })
      });
    });
  });

  // ── T4: One QR decode → exactly one fetch ────────────────────────────────────
  it('sends exactly one API request per QR decode', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;

    (Html5Qrcode as any).mockImplementation(() => ({
      start: vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
        capturedDecodeCallback = onDecode;
        return Promise.resolve();
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: new Date().toISOString(),
      verification_method: 'DYNAMIC_QR'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    // Simulate QR decode (called twice as library might)
    await act(async () => {
      capturedDecodeCallback?.('v1.session1.100.validSig');
      capturedDecodeCallback?.('v1.session1.100.validSig'); // second call should be ignored
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── T5: Successful QR shows success screen and removes scanner ────────────────
  it('shows success screen after successful QR scan and no scanner is visible', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;

    (Html5Qrcode as any).mockImplementation(() => ({
      start: vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
        capturedDecodeCallback = onDecode;
        return Promise.resolve();
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T05:43:00.000Z',
      verification_method: 'DYNAMIC_QR'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    await act(async () => {
      capturedDecodeCallback?.('v1.session1.100.validSig');
    });

    await waitFor(() => {
      expect(screen.getByText(/attendance marked/i)).toBeInTheDocument();
      expect(screen.getByText(/chetan agrawal/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    });

    // Scanner container should not be in the DOM
    expect(screen.queryByRole('button', { name: /scan again/i })).not.toBeInTheDocument();
  });

  // ── T6: Duplicate QR → ALREADY_MARKED state (not error) ─────────────────────
  it('shows Already Marked screen for 409 ALREADY_MARKED on QR path', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;

    (Html5Qrcode as any).mockImplementation(() => ({
      start: vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
        capturedDecodeCallback = onDecode;
        return Promise.resolve();
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(409, {
      success: false,
      code: 'ALREADY_MARKED',
      error: 'Already recorded',
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T04:00:00.000Z',
      verification_method: 'DYNAMIC_QR'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    await act(async () => {
      capturedDecodeCallback?.('v1.session1.100.validSig');
    });

    await waitFor(() => {
      expect(screen.getByText(/attendance already marked/i)).toBeInTheDocument();
    });

    // Should NOT show generic error styling for this case
    expect(screen.queryByText(/scan again/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  // ── T7: Expired QR → ERROR_RETRY, Scan Again button visible ─────────────────
  it('shows ERROR_RETRY with Scan Again when QR is expired', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;

    (Html5Qrcode as any).mockImplementation(() => ({
      start: vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
        capturedDecodeCallback = onDecode;
        return Promise.resolve();
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(400, {
      success: false,
      code: 'QR_EXPIRED',
      error: 'QR credential has expired.'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    await act(async () => {
      capturedDecodeCallback?.('v1.session1.99.oldSig');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /scan again/i })).toBeInTheDocument();
    });
  });

  // ── T8: Invalid QR does NOT auto-rescan ──────────────────────────────────────
  it('does not auto-rescan after invalid QR; waits for explicit Scan Again', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;
    const startMock = vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
      capturedDecodeCallback = onDecode;
      return Promise.resolve();
    });

    (Html5Qrcode as any).mockImplementation(() => ({
      start: startMock,
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(400, {
      success: false,
      code: 'INVALID_CREDENTIAL',
      error: 'Invalid QR'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    const initialStartCalls = startMock.mock.calls.length;

    await act(async () => {
      capturedDecodeCallback?.('INVALID_TOKEN');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /scan again/i })).toBeInTheDocument();
    });

    // Camera must NOT have been restarted automatically
    expect(startMock.mock.calls.length).toBe(initialStartCalls);
  });

  // ── T9: Scan Again reinitialises scanner ──────────────────────────────────────
  it('remounts scanner when student clicks Scan Again', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;
    const startMock = vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
      capturedDecodeCallback = onDecode;
      return Promise.resolve();
    });

    (Html5Qrcode as any).mockImplementation(() => ({
      start: startMock,
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(400, { success: false, code: 'QR_EXPIRED', error: 'Expired' });

    renderPage();
    await enterEnrollmentAndSelectQr(user);
    const afterInitCalls = startMock.mock.calls.length;

    await act(async () => {
      capturedDecodeCallback?.('old-token');
    });

    await waitFor(() => screen.getByRole('button', { name: /scan again/i }));
    await user.click(screen.getByRole('button', { name: /scan again/i }));

    // Scanner should have reinitialised (start called once more)
    await waitFor(() => {
      expect(startMock.mock.calls.length).toBeGreaterThan(afterInitCalls);
    });
  });

  // ── T10: Code success → success screen ──────────────────────────────────────
  it('shows success screen after valid code submission', async () => {
    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T05:43:00.000Z',
      verification_method: 'ATTENDANCE_CODE'
    });

    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    await waitFor(() => {
      expect(screen.getByText(/attendance marked/i)).toBeInTheDocument();
      expect(screen.getByText(/chetan agrawal/i)).toBeInTheDocument();
    });
  });

  // ── T11: Duplicate Code → ALREADY_MARKED state ───────────────────────────────
  it('shows Already Marked screen for 409 on code path', async () => {
    mockFetch(409, {
      success: false,
      code: 'ALREADY_MARKED',
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T04:00:00.000Z',
      verification_method: 'ATTENDANCE_CODE'
    });

    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    await waitFor(() => {
      expect(screen.getByText(/attendance already marked/i)).toBeInTheDocument();
    });
  });

  // ── T12: Six-digit numeric input ─────────────────────────────────────────────
  it('only accepts numeric digits in the code input', async () => {
    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });

    await user.type(codeInput, 'ab12CD34ef');
    // Non-numeric chars should be stripped
    expect((codeInput as HTMLInputElement).value).toBe('1234');

    await user.clear(codeInput);
    await user.type(codeInput, '654321');
    expect((codeInput as HTMLInputElement).value).toBe('654321');
  });

  // ── T13: Submit button disabled until 6 digits ───────────────────────────────
  it('submit button is disabled when code has fewer than 6 digits', async () => {
    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const submitBtn = screen.getByRole('button', { name: /submit attendance/i });
    expect(submitBtn).toBeDisabled();

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '12345');
    expect(submitBtn).toBeDisabled();

    await user.type(codeInput, '6');
    expect(submitBtn).not.toBeDisabled();
  });

  // ── T14: INVALID_CODE clears the code field ───────────────────────────────────
  it('clears code input and shows message on INVALID_CODE error', async () => {
    mockFetch(404, {
      success: false,
      code: 'INVALID_CODE',
      error: 'Invalid or inactive classroom attendance code'
    });

    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '999999');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    await waitFor(() => {
      expect((codeInput as HTMLInputElement).value).toBe('');
      expect(screen.getByText(/classroom code may have refreshed/i)).toBeInTheDocument();
    });
  });

  // ── T15: Success screen stays stable — no auto-redirect ───────────────────────
  it('success screen remains stable without auto-redirecting', async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    let capturedDecodeCallback: ((text: string) => void) | null = null;

    (Html5Qrcode as any).mockImplementation(() => ({
      start: vi.fn().mockImplementation((_cam, _cfg, onDecode) => {
        capturedDecodeCallback = onDecode;
        return Promise.resolve();
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      isScanning: true
    }));

    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T05:43:00.000Z',
      verification_method: 'DYNAMIC_QR'
    });

    renderPage();
    await enterEnrollmentAndSelectQr(user);

    await act(async () => {
      capturedDecodeCallback?.('v1.session1.100.validSig');
    });

    await waitFor(() => screen.getByText(/attendance marked/i));

    // Wait 100ms — page must still show success
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByText(/attendance marked/i)).toBeInTheDocument();
  });

  // ── T16: Done button calls onBack ─────────────────────────────────────────────
  it('Done button on success screen calls onBack', async () => {
    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T05:43:00.000Z',
      verification_method: 'ATTENDANCE_CODE'
    });

    const { onBack } = renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    await waitFor(() => screen.getByRole('button', { name: /done/i }));
    await user.click(screen.getByRole('button', { name: /done/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // ── T17: Mark Another Check-in must NOT be present ───────────────────────────
  it('does not render a Mark Another Check-in button', async () => {
    mockFetch(200, {
      success: true,
      student_name: 'Chetan Agrawal',
      enrollment_number: 'STU001',
      class_name: 'Data Structures',
      course: 'CS101',
      markedAt: '2026-09-23T05:43:00.000Z',
      verification_method: 'ATTENDANCE_CODE'
    });

    renderPage();
    await enterEnrollmentAndSelectCode(user);

    const codeInput = screen.getByRole('textbox', { name: /classroom code/i });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /submit attendance/i }));

    await waitFor(() => screen.getByText(/attendance marked/i));
    expect(screen.queryByText(/mark another/i)).not.toBeInTheDocument();
  });
});
