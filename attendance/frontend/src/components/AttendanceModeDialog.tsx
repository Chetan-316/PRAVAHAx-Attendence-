import React from 'react';
import { QrCode, KeyRound, X } from 'lucide-react';

interface AttendanceModeDialogProps {
  isOpen: boolean;
  className: string;
  courseCode: string;
  onSelectMode: (mode: 'DYNAMIC_QR' | 'CODE') => void;
  onCancel: () => void;
}

export const AttendanceModeDialog: React.FC<AttendanceModeDialogProps> = ({
  isOpen,
  className: courseTitle,
  courseCode,
  onSelectMode,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-mode-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 id="attendance-mode-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Choose Attendance Method
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {courseCode} &bull; {courseTitle}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Dynamic QR Option */}
          <div
            onClick={() => onSelectMode('DYNAMIC_QR')}
            className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 p-4 transition hover:border-indigo-600 hover:bg-indigo-50/30 dark:border-slate-800 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Dynamic QR
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Short-lived classroom QR that refreshes automatically every 4 seconds.
              </p>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
            >
              Start Dynamic QR
            </button>
          </div>

          {/* Attendance Code Option */}
          <div
            onClick={() => onSelectMode('CODE')}
            className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 p-4 transition hover:border-slate-900 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:border-slate-100 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                <KeyRound className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Attendance Code
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Stable classroom 6-digit code entered directly by students.
              </p>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Start with Code
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4 text-right dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
