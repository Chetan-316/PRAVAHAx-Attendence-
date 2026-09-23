import React, { useState, useEffect } from 'react';
import { KeyRound, Copy, Check } from 'lucide-react';

interface AttendanceCodePanelProps {
  code: string;
  secondsRemaining?: number;
  rotationInterval?: number;
  onRegenerateCode?: () => void;
  regenerating?: boolean;
}

export const AttendanceCodePanel: React.FC<AttendanceCodePanelProps> = ({
  code,
  secondsRemaining = 5,
  rotationInterval = 5
}) => {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number>(secondsRemaining || rotationInterval);

  // Synchronize countdown when server updates secondsRemaining
  useEffect(() => {
    setCountdown(secondsRemaining);
  }, [secondsRemaining]);

  // Smooth local tick every 100ms
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        const next = Math.max(0, prev - 0.1);
        return parseFloat(next.toFixed(1));
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // Format 6 digits with a space in the middle: e.g. "482 913"
  const formattedCode =
    code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code || '------';

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const progressPercent = Math.min(100, Math.max(0, (countdown / rotationInterval) * 100));

  return (
    <div className="flex flex-col items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex w-full items-center justify-between mb-4 max-w-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Attendance Code
          </span>
        </div>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Rotating Attendance Code
        </span>
      </div>

      <div className="my-8 text-center">
        <div className="font-mono text-5xl font-extrabold tracking-widest text-slate-900 sm:text-6xl dark:text-white select-all">
          {formattedCode}
        </div>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Refreshes every {rotationInterval} seconds. Students enter this code on the Student Attendance page.
        </p>
      </div>

      {/* Progress & Countdown Indicator */}
      <div className="w-full max-w-sm mb-6">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-mono">
          <span>Next refresh</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{countdown.toFixed(1)}s</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-indigo-600 transition-all duration-100 ease-linear dark:bg-indigo-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex w-full items-center justify-center border-t border-slate-100 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Code'}</span>
        </button>
      </div>
    </div>
  );
};
