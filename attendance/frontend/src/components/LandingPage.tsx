import React from 'react';
import { UserCheck, QrCode, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onNavigateTeacher: () => void;
  onNavigateStudent: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateTeacher,
  onNavigateStudent
}) => {
  return (
    <div className="mx-auto max-w-3xl py-12 text-center">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          PRAVAHAx Attendance
        </h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
          Classroom attendance, simplified.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 text-left">
        {/* Teacher Entry Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <UserCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Teacher
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Access your classes and manage attendance sessions.
            </p>
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={onNavigateTeacher}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700"
            >
              <span>Teacher Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Student Entry Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <QrCode className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Student
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Mark attendance using your institutional enrollment number.
            </p>
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={onNavigateStudent}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <span>Student Attendance</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
