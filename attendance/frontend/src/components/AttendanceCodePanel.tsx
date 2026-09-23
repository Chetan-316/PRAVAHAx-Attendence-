import React, { useState } from 'react';
import { KeyRound, RefreshCw, Copy, Check } from 'lucide-react';

interface AttendanceCodePanelProps {
  code: string;
  onRegenerateCode: () => void;
  regenerating?: boolean;
}

export const AttendanceCodePanel: React.FC<AttendanceCodePanelProps> = ({
  code,
  onRegenerateCode,
  regenerating = false
}) => {
  const [copied, setCopied] = useState(false);

  // Format 6 digits with a space in the middle: e.g. "482 913"
  const formattedCode =
    code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code || '------';

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-between rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex w-full items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Attendance Code
          </span>
        </div>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Stable Session Code
        </span>
      </div>

      <div className="my-8 text-center">
        <div className="font-mono text-5xl font-extrabold tracking-widest text-slate-900 sm:text-6xl dark:text-white">
          {formattedCode}
        </div>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Students enter this code on the Student Attendance page.
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-6 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Code'}</span>
        </button>

        <button
          type="button"
          onClick={onRegenerateCode}
          disabled={regenerating}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-amber-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-amber-400"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          <span>Regenerate Code</span>
        </button>
      </div>
    </div>
  );
};
