import React, { useEffect, useState } from 'react';
import { Users, Clock, Percent, Power } from 'lucide-react';

interface SessionMetricsProps {
  presentCount: number;
  totalEnrolled: number;
  startedAt: string;
  onEndSession: () => void;
  ending?: boolean;
}

export const SessionMetrics: React.FC<SessionMetricsProps> = ({
  presentCount,
  totalEnrolled,
  startedAt,
  onEndSession,
  ending = false
}) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setElapsed(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const percentage =
    totalEnrolled > 0 ? Math.round((presentCount / totalEnrolled) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Session Metrics
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono font-medium">{elapsed}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Present</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {presentCount}
              </span>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                / {totalEnrolled}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Percent className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Attendance</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
              {percentage}%
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onEndSession}
          disabled={ending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60 dark:bg-rose-700 dark:hover:bg-rose-800"
        >
          <Power className="h-4 w-4" />
          <span>{ending ? 'Ending session...' : 'End Attendance'}</span>
        </button>
      </div>
    </div>
  );
};
