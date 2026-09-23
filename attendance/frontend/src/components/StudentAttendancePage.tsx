/**
 * StudentAttendancePage — Finite-state attendance flow for PRAVAHAx.
 *
 * State machine:
 *   DETAILS → METHOD → SCANNING → VERIFYING → SUCCESS
 *                                           → ALREADY_MARKED
 *                                           → ERROR_RETRY (Scan Again / re-enter code)
 *
 * Invariants:
 * - An AbortController is created per API call; cancelled on method switch / unmount.
 * - QrScanner receives a `key` prop; changing it forces a full remount (camera reinit).
 * - During VERIFYING: method switch is disabled; code submit is blocked.
 * - SUCCESS / ALREADY_MARKED are terminal: no auto-redirect, no auto-rescan.
 * - Camera is released when moving to SUCCESS, ALREADY_MARKED, or out of SCANNING/VERIFYING.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  QrCode,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { QrScanner } from './QrScanner';
import { StatusMessage } from './StatusMessage';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type Phase =
  | 'DETAILS'
  | 'METHOD'
  | 'SCANNING'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'ALREADY_MARKED'
  | 'ERROR_RETRY';

type AttendanceMethod = 'DYNAMIC_QR' | 'CODE';

interface ConfirmationData {
  student_name: string;
  enrollment_number: string;
  class_name: string;
  course: string;
  markedAt: string; // ISO string — formatted client-side
  verification_method: 'DYNAMIC_QR' | 'ATTENDANCE_CODE';
}

interface StudentAttendancePageProps {
  onBack: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return isoString;
  }
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

interface ConfirmationCardProps {
  data: ConfirmationData;
  isAlreadyMarked: boolean;
  onDone: () => void;
}

const ConfirmationCard: React.FC<ConfirmationCardProps> = ({ data, isAlreadyMarked, onDone }) => {
  const methodLabel =
    data.verification_method === 'DYNAMIC_QR' ? 'Dynamic QR Scan' : 'Attendance Code';

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm text-center ${
        isAlreadyMarked
          ? 'border-teal-200 bg-white dark:border-teal-900 dark:bg-slate-900'
          : 'border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900'
      }`}
    >
      {/* Icon */}
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-4 ${
          isAlreadyMarked
            ? 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400'
            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
        }`}
      >
        {isAlreadyMarked ? (
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        )}
      </div>

      {/* Heading */}
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
        {isAlreadyMarked ? 'Attendance Already Marked' : 'Attendance Marked'}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {isAlreadyMarked
          ? 'Your attendance has already been recorded for this class. You do not need to scan the QR or enter the code again.'
          : 'Your attendance has been marked successfully.'}
      </p>

      {/* Detail rows */}
      <div className="my-5 rounded-lg bg-slate-50 p-4 text-left dark:bg-slate-800/50 space-y-3">
        <DetailRow label="Student" value={data.student_name} />
        <DetailRow label="Enrollment" value={data.enrollment_number} mono />
        <DetailRow label="Course" value={`${data.course} — ${data.class_name}`} />
        <DetailRow
          label="Recorded at"
          value={`${formatTime(data.markedAt)}, ${formatDate(data.markedAt)}`}
          mono
        />
        <DetailRow
          label="Method"
          value={methodLabel}
          highlight={isAlreadyMarked ? 'teal' : 'indigo'}
        />
      </div>

      <p className="mb-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
        No further action is required.
      </p>

      <button
        type="button"
        id="student-attendance-done"
        onClick={onDone}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
      >
        Done
      </button>
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'indigo' | 'teal';
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, mono, highlight }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}:</span>
    <span
      className={`text-xs font-semibold text-right break-words ${
        mono ? 'font-mono' : ''
      } ${
        highlight === 'indigo'
          ? 'text-indigo-600 dark:text-indigo-400'
          : highlight === 'teal'
          ? 'text-teal-600 dark:text-teal-400'
          : 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </span>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ──────────────────────────────────────────────────────────────────────────────

export const StudentAttendancePage: React.FC<StudentAttendancePageProps> = ({ onBack }) => {
  const [enrollment, setEnrollment] = useState(
    () => localStorage.getItem('pravahax_student_enrollment') || ''
  );
  const [phase, setPhase] = useState<Phase>('DETAILS');
  const [activeMethod, setActiveMethod] = useState<AttendanceMethod | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  /**
   * Incrementing key forces QrScanner to fully remount (reinitialise camera).
   * Only bumped when the student explicitly presses "Scan Again".
   */
  const [scannerKey, setScannerKey] = useState(0);

  // AbortController for in-flight fetch; cancelled on method change / unmount
  const abortRef = useRef<AbortController | null>(null);

  // Code input ref for focus management after INVALID_CODE
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Cancel any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const isVerifying = phase === 'VERIFYING';
  const isTerminal = phase === 'SUCCESS' || phase === 'ALREADY_MARKED';

  const enrollmentTrimmed = enrollment.trim().toUpperCase();

  // ── Submit via QR ─────────────────────────────────────────────────────────────

  const handleQrScan = useCallback(
    async (scannedToken: string) => {
      if (!enrollmentTrimmed) {
        // This should not happen as we guard before SCANNING, but be defensive
        setPhase('ERROR_RETRY');
        setErrorMessage('Please enter your Enrollment Number first.');
        setErrorCode('');
        return;
      }

      // Move to VERIFYING immediately; abort any previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase('VERIFYING');
      setErrorMessage('');
      setErrorCode('');

      try {
        const res = await fetch('/api/attendance/mark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrollmentNumber: enrollmentTrimmed,
            mode: 'DYNAMIC_QR',
            qrToken: scannedToken
          }),
          signal: controller.signal
        });

        const data = await res.json();

        if (controller.signal.aborted) return; // method changed / unmounted

        if (res.status === 409 || data.code === 'ALREADY_MARKED') {
          const alreadyData: ConfirmationData = {
            student_name: data.student_name || enrollmentTrimmed,
            enrollment_number: data.enrollment_number || enrollmentTrimmed,
            class_name: data.class_name || '',
            course: data.course || '',
            markedAt: data.markedAt || new Date().toISOString(),
            verification_method: data.verification_method || 'DYNAMIC_QR'
          };
          localStorage.setItem('pravahax_student_enrollment', enrollmentTrimmed);
          setConfirmation(alreadyData);
          setPhase('ALREADY_MARKED');
          return;
        }

        if (!res.ok || !data.success) {
          const ec = data.code || '';
          let msg = data.error || 'Attendance verification failed.';
          if (ec === 'QR_EXPIRED') {
            msg = 'This QR code has expired. Please scan the current QR code shown on the classroom screen.';
          } else if (ec === 'SESSION_CLOSED') {
            msg = 'The attendance session has ended. Please check with your instructor.';
          } else if (ec === 'STUDENT_NOT_FOUND') {
            msg = `Enrollment number "${enrollmentTrimmed}" is not registered. Please check and try again.`;
          } else if (ec === 'STUDENT_NOT_ELIGIBLE') {
            msg = data.error || 'You are not enrolled in this class.';
          }
          setErrorMessage(msg);
          setErrorCode(ec);
          setPhase('ERROR_RETRY');
          return;
        }

        // Success
        localStorage.setItem('pravahax_student_enrollment', enrollmentTrimmed);
        const confirmData: ConfirmationData = {
          student_name: data.student_name,
          enrollment_number: data.enrollment_number,
          class_name: data.class_name,
          course: data.course,
          markedAt: data.markedAt || new Date().toISOString(),
          verification_method: data.verification_method || 'DYNAMIC_QR'
        };
        setConfirmation(confirmData);
        setPhase('SUCCESS');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setErrorMessage('Network connection error. Please check your connection and try again.');
        setErrorCode('NETWORK_ERROR');
        setPhase('ERROR_RETRY');
      }
    },
    // enrollmentTrimmed is derived from state; keep it as dep so the closure captures fresh value
    [enrollmentTrimmed]
  );

  // ── Submit via Code ───────────────────────────────────────────────────────────

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return; // double-click guard

    if (!enrollmentTrimmed) {
      setErrorMessage('Please enter your Enrollment Number.');
      setErrorCode('');
      return;
    }
    if (code.length !== 6) {
      setErrorMessage('Please enter the 6-digit classroom attendance code.');
      setErrorCode('');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('VERIFYING');
    setErrorMessage('');
    setErrorCode('');

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentNumber: enrollmentTrimmed,
          mode: 'CODE',
          code: code.trim()
        }),
        signal: controller.signal
      });

      const data = await res.json();

      if (controller.signal.aborted) return;

      if (res.status === 409 || data.code === 'ALREADY_MARKED') {
        const alreadyData: ConfirmationData = {
          student_name: data.student_name || enrollmentTrimmed,
          enrollment_number: data.enrollment_number || enrollmentTrimmed,
          class_name: data.class_name || '',
          course: data.course || '',
          markedAt: data.markedAt || new Date().toISOString(),
          verification_method: data.verification_method || 'ATTENDANCE_CODE'
        };
        localStorage.setItem('pravahax_student_enrollment', enrollmentTrimmed);
        setConfirmation(alreadyData);
        setPhase('ALREADY_MARKED');
        return;
      }

      if (!res.ok || !data.success) {
        const ec = data.code || '';
        let msg = data.error || 'Failed to record attendance.';
        if (ec === 'INVALID_CODE') {
          msg =
            'The classroom code may have refreshed. Please check the display and enter the currently shown 6-digit code.';
          setCode(''); // clear stale code
          setTimeout(() => codeInputRef.current?.focus(), 50);
        } else if (ec === 'SESSION_CLOSED') {
          msg = 'The attendance session has ended. Please check with your instructor.';
        } else if (ec === 'STUDENT_NOT_FOUND') {
          msg = `Enrollment number "${enrollmentTrimmed}" is not registered. Please check and try again.`;
        } else if (ec === 'STUDENT_NOT_ELIGIBLE') {
          msg = data.error || 'You are not enrolled in this class.';
        }
        setErrorMessage(msg);
        setErrorCode(ec);
        setPhase('METHOD'); // return to code form; scanner not involved
        return;
      }

      // Success
      localStorage.setItem('pravahax_student_enrollment', enrollmentTrimmed);
      const confirmData: ConfirmationData = {
        student_name: data.student_name,
        enrollment_number: data.enrollment_number,
        class_name: data.class_name,
        course: data.course,
        markedAt: data.markedAt || new Date().toISOString(),
        verification_method: data.verification_method || 'ATTENDANCE_CODE'
      };
      setCode('');
      setConfirmation(confirmData);
      setPhase('SUCCESS');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setErrorMessage('Network connection error. Please check your connection and try again.');
      setErrorCode('NETWORK_ERROR');
      setPhase('METHOD');
    }
  };

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const goToMethod = (method: AttendanceMethod) => {
    if (!enrollmentTrimmed) {
      setErrorMessage('Please enter your Enrollment Number first.');
      setErrorCode('');
      return;
    }
    abortRef.current?.abort();
    setActiveMethod(method);
    setErrorMessage('');
    setErrorCode('');
    setCode('');
    setPhase(method === 'DYNAMIC_QR' ? 'SCANNING' : 'METHOD');
  };

  const switchMethod = () => {
    if (isVerifying) return; // blocked during verification
    abortRef.current?.abort();
    setActiveMethod(null);
    setErrorMessage('');
    setErrorCode('');
    setCode('');
    setPhase('METHOD');
  };

  /** Student presses "Scan Again" after a QR error — remount scanner with fresh key */
  const handleScanAgain = () => {
    setErrorMessage('');
    setErrorCode('');
    setScannerKey((k) => k + 1); // forces QrScanner remount
    setPhase('SCANNING');
  };

  /** Enter enrollment step */
  const handleEnrollmentContinue = () => {
    if (!enrollmentTrimmed) {
      setErrorMessage('Please enter your Enrollment Number to continue.');
      setErrorCode('');
      return;
    }
    setErrorMessage('');
    setErrorCode('');
    setPhase('METHOD');
  };

  // ──────────────────────────────────────────────────────────────────────────────
  // Render: SUCCESS / ALREADY_MARKED
  // ──────────────────────────────────────────────────────────────────────────────

  if (isTerminal && confirmation) {
    return (
      <div className="mx-auto max-w-md">
        <ConfirmationCard
          data={confirmation}
          isAlreadyMarked={phase === 'ALREADY_MARKED'}
          onDone={onBack}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Render: Input + Method selection
  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-md">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        disabled={isVerifying}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Home</span>
      </button>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Student Attendance
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Enter your enrollment number, then scan the classroom QR or enter the code.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Error / status messages */}
          {errorMessage && (
            <StatusMessage
              type={errorCode === 'INVALID_CODE' ? 'warning' : 'error'}
              message={errorMessage}
              onDismiss={() => {
                setErrorMessage('');
                setErrorCode('');
              }}
            />
          )}

          {/* ── Enrollment Number ── */}
          <div>
            <label
              htmlFor="student-enrollment"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Enrollment Number
            </label>
            <input
              id="student-enrollment"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="e.g. STU001"
              value={enrollment}
              onChange={(e) => {
                setEnrollment(e.target.value.toUpperCase());
                if (phase !== 'DETAILS' && phase !== 'METHOD') {
                  // If student edits enrollment, reset back to METHOD
                  setPhase('METHOD');
                  setActiveMethod(null);
                }
              }}
              disabled={isVerifying || phase === 'SCANNING'}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 font-mono text-sm font-semibold uppercase text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
            />
          </div>

          {/* ── DETAILS phase: Continue button ── */}
          {phase === 'DETAILS' && (
            <button
              type="button"
              id="student-enrollment-continue"
              onClick={handleEnrollmentContinue}
              className="flex w-full min-h-[48px] items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800"
            >
              Continue
            </button>
          )}

          {/* ── METHOD phase: Choose QR or Code ── */}
          {phase === 'METHOD' && (
            <div className="space-y-3 pt-1">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Choose Attendance Method
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="method-qr-btn"
                  type="button"
                  onClick={() => goToMethod('DYNAMIC_QR')}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-600 hover:bg-indigo-50/30 active:bg-indigo-50 dark:border-slate-800 dark:hover:border-indigo-500"
                >
                  <QrCode className="h-6 w-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Scan QR
                  </span>
                </button>

                <button
                  id="method-code-btn"
                  type="button"
                  onClick={() => goToMethod('CODE')}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 transition hover:border-slate-900 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:hover:border-slate-100"
                >
                  <KeyRound className="h-6 w-6 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Enter Code
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── SCANNING phase: QR Scanner ── */}
          {(phase === 'SCANNING' || phase === 'VERIFYING') && activeMethod === 'DYNAMIC_QR' && (
            <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scan Classroom QR
                </span>
                <button
                  type="button"
                  onClick={switchMethod}
                  disabled={isVerifying}
                  className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-40 dark:text-indigo-400"
                >
                  Switch method
                </button>
              </div>

              <QrScanner
                key={scannerKey}
                onScanSuccess={handleQrScan}
                isScanningLocked={isVerifying}
              />
            </div>
          )}

          {/* ── ERROR_RETRY phase: after QR failure ── */}
          {phase === 'ERROR_RETRY' && activeMethod === 'DYNAMIC_QR' && (
            <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scan Classroom QR
                </span>
                <button
                  type="button"
                  onClick={switchMethod}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Switch method
                </button>
              </div>

              {/* Stopped scanner placeholder */}
              <div className="flex aspect-square w-full max-w-xs mx-auto flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center dark:border-slate-700 dark:bg-slate-800/50">
                <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 max-w-[200px]">
                  {errorCode === 'QR_EXPIRED' ? 'QR Expired' : 'Scan Failed'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] leading-relaxed">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  id="scan-again-btn"
                  onClick={handleScanAgain}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 active:bg-indigo-800"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Scan Again
                </button>
              </div>
            </div>
          )}

          {/* ── CODE method: form ── */}
          {(phase === 'METHOD' || phase === 'VERIFYING') && activeMethod === 'CODE' && (
            <form
              onSubmit={handleCodeSubmit}
              className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800"
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor="student-code"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Classroom Code
                </label>
                <button
                  type="button"
                  onClick={switchMethod}
                  disabled={isVerifying}
                  className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-40 dark:text-indigo-400"
                >
                  Switch method
                </button>
              </div>

              <input
                id="student-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isVerifying}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-900 shadow-sm transition placeholder:text-slate-300 placeholder:tracking-[0.4em] focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
              />
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                Enter the 6-digit code shown on the classroom display
              </p>

              <button
                type="submit"
                id="code-submit-btn"
                disabled={isVerifying || code.length !== 6}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <span>Submit Attendance</span>
                )}
              </button>
            </form>
          )}

          {/* Global verifying indicator (shown when VERIFYING on QR path) */}
          {phase === 'VERIFYING' && activeMethod === 'DYNAMIC_QR' && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 py-1">
              <Clock className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              <span>Verifying your attendance…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
