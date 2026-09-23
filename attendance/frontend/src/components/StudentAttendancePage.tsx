import React, { useState } from 'react';
import { QrCode, KeyRound, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { QrScanner } from './QrScanner';
import { StatusMessage } from './StatusMessage';

interface AttendanceConfirmation {
  class_name: string;
  course: string;
  student_name: string;
  enrollment_number: string;
  time: string;
  verification_method: string;
}

interface StudentAttendancePageProps {
  onBack: () => void;
}

export const StudentAttendancePage: React.FC<StudentAttendancePageProps> = ({ onBack }) => {
  const [enrollment, setEnrollment] = useState(
    () => localStorage.getItem('pravahax_student_enrollment') || ''
  );
  const [method, setMethod] = useState<'NONE' | 'DYNAMIC_QR' | 'CODE'>('NONE');
  const [code, setCode] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<AttendanceConfirmation | null>(null);

  // Submit via Dynamic QR
  const handleQrScan = async (scannedToken: string) => {
    if (!enrollment.trim()) {
      setError('Please enter your Enrollment Number first.');
      setIsLocked(false);
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentNumber: enrollment.trim().toUpperCase(),
          mode: 'DYNAMIC_QR',
          qrToken: scannedToken
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Attendance verification failed.');
        setIsLocked(false);
        return;
      }

      // Success
      localStorage.setItem('pravahax_student_enrollment', enrollment.trim().toUpperCase());
      setConfirmation(data);
    } catch {
      setError('Network connection error. Please try again.');
      setIsLocked(false);
    } finally {
      setVerifying(false);
    }
  };

  // Submit via Attendance Code
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment.trim()) {
      setError('Please enter your Enrollment Number.');
      return;
    }
    if (!code.trim()) {
      setError('Please enter the classroom Attendance Code.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentNumber: enrollment.trim().toUpperCase(),
          mode: 'CODE',
          code: code.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to record attendance.');
        return;
      }

      // Success
      localStorage.setItem('pravahax_student_enrollment', enrollment.trim().toUpperCase());
      setConfirmation(data);
    } catch {
      setError('Network connection error. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setConfirmation(null);
    setMethod('NONE');
    setCode('');
    setError('');
    setIsLocked(false);
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Home</span>
      </button>

      {/* State 1: Attendance Successfully Recorded */}
      {confirmation && (
        <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm dark:border-emerald-950 dark:bg-slate-900 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </div>

          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
            Attendance Recorded
          </h2>

          <div className="my-6 rounded-lg bg-slate-50 p-4 text-left text-xs dark:bg-slate-800/50 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Student:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{confirmation.student_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Enrollment Number:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">{confirmation.enrollment_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Course:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{confirmation.course} &bull; {confirmation.class_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Recorded At:</span>
              <span className="font-mono text-slate-900 dark:text-white">{confirmation.time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Method:</span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {confirmation.verification_method === 'DYNAMIC_QR' ? 'Dynamic QR Scan' : 'Attendance Code'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Mark Another Check-in
          </button>
        </div>
      )}

      {/* State 2: Student Input & Method Selection */}
      {!confirmation && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Student Attendance
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Enter your institutional enrollment number, then scan the classroom Dynamic QR or enter the Code.
            </p>
          </div>

          {error && (
            <div className="mb-4">
              <StatusMessage type="error" message={error} onDismiss={() => setError('')} />
            </div>
          )}

          <div className="space-y-4">
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
                required
                placeholder="e.g. STU001"
                value={enrollment}
                onChange={(e) => setEnrollment(e.target.value.toUpperCase())}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-semibold uppercase text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Attendance Method Selection */}
            {method === 'NONE' && (
              <div className="pt-2 space-y-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Select Classroom Attendance Method
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!enrollment.trim()) {
                        setError('Please enter your Enrollment Number first.');
                        return;
                      }
                      setMethod('DYNAMIC_QR');
                      setError('');
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 transition hover:border-indigo-600 hover:bg-indigo-50/30 dark:border-slate-800 dark:hover:border-indigo-500"
                  >
                    <QrCode className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Scan Dynamic QR
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!enrollment.trim()) {
                        setError('Please enter your Enrollment Number first.');
                        return;
                      }
                      setMethod('CODE');
                      setError('');
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4 transition hover:border-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-100"
                  >
                    <KeyRound className="h-6 w-6 text-slate-700 dark:text-slate-300" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Enter Code
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Method A: Dynamic QR Scanner */}
            {method === 'DYNAMIC_QR' && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Scan Active Classroom QR
                  </span>
                  <button
                    type="button"
                    onClick={() => setMethod('NONE')}
                    className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Switch method
                  </button>
                </div>

                <QrScanner
                  onScanSuccess={handleQrScan}
                  isScanningLocked={isLocked || verifying}
                />
              </div>
            )}

            {/* Method B: Code Input */}
            {method === 'CODE' && (
              <form onSubmit={handleCodeSubmit} className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="student-code"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Classroom Attendance Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setMethod('NONE')}
                    className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Switch method
                  </button>
                </div>

                <input
                  id="student-code"
                  type="text"
                  maxLength={6}
                  required
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-center font-mono text-xl font-bold tracking-widest text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                <button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying code...</span>
                    </>
                  ) : (
                    <span>Submit Attendance</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
