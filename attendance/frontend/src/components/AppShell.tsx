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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div
            onClick={onHomeClick}
            className="flex cursor-pointer items-center gap-3 transition hover:opacity-85"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  PRAVAHAx Attendance
                </span>
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  MVP
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Institutional Attendance Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {facultyName && (
              <div className="flex items-center gap-3 border-l border-slate-200 pl-4 dark:border-slate-800">
                <div className="text-right text-xs">
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
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Student Check-in</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        PRAVAHAx Attendance MVP &bull; Institutional Classroom Verification System
      </footer>
    </div>
  );
};
