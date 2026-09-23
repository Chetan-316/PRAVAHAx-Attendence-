import React from 'react';
import { LogOut, GraduationCap, ShieldCheck } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  facultyName?: string;
  onLogout?: () => void;
  onHomeClick?: () => void;
  activeRole?: 'TEACHER' | 'STUDENT' | null;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  facultyName,
  onLogout,
  onHomeClick,
  activeRole
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Brand */}
          <div
            onClick={onHomeClick}
            className="flex cursor-pointer items-center gap-2.5 transition hover:opacity-85"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white sm:text-base">
                  PRAVAHAx Attendance
                </span>
                {/* Hide MVP badge on xs to prevent crowding with student badge */}
                <span className="hidden rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 sm:inline">
                  MVP
                </span>
              </div>
              {/* Hide subtitle on xs when student is active (prevents collision) */}
              <p
                className={`text-[11px] text-slate-500 dark:text-slate-400 ${
                  activeRole === 'STUDENT' ? 'hidden sm:block' : 'block'
                }`}
              >
                Institutional Attendance Engine
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-3">
            {facultyName && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-800">
                <div className="hidden text-right text-xs sm:block">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{facultyName}</div>
                  <div className="text-slate-500 dark:text-slate-400">Faculty</div>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    title="Sign Out"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rose-400"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            )}
            {!facultyName && activeRole === 'STUDENT' && (
              <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                <span>Student Check-in</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-4 sm:py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        PRAVAHAx Attendance MVP &bull; Institutional Classroom Verification System
      </footer>
    </div>
  );
};
