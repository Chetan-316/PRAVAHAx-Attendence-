import React, { useState } from 'react';
import { Search, UserCheck, QrCode, KeyRound } from 'lucide-react';

export interface AttendeeItem {
  student_id: string;
  name: string;
  enrollment_number: string;
  verification_method: 'DYNAMIC_QR' | 'ATTENDANCE_CODE';
  marked_at: string;
}

interface LiveAttendanceTableProps {
  attendees: AttendeeItem[];
}

export const LiveAttendanceTable: React.FC<LiveAttendanceTableProps> = ({ attendees }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = attendees.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.enrollment_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Live Attendees ({attendees.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Verified check-ins for the active classroom session
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search student or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <Search className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {attendees.length === 0
              ? 'No students have checked in yet. Attendance records will appear here live.'
              : 'No students match the search filter.'}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-2.5 font-semibold">Student Name</th>
                <th className="pb-2.5 font-semibold">Enrollment Number</th>
                <th className="pb-2.5 font-semibold">Marked Time</th>
                <th className="pb-2.5 font-semibold">Verification Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((student, idx) => (
                <tr key={student.student_id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{student.name}</span>
                  </td>
                  <td className="py-2.5 font-mono text-slate-600 dark:text-slate-300">
                    {student.enrollment_number}
                  </td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400 font-mono">
                    {new Date(student.marked_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        student.verification_method === 'DYNAMIC_QR'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {student.verification_method === 'DYNAMIC_QR' ? (
                        <QrCode className="h-3 w-3" />
                      ) : (
                        <KeyRound className="h-3 w-3" />
                      )}
                      <span>{student.verification_method === 'DYNAMIC_QR' ? 'Dynamic QR' : 'Code'}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
