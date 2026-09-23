import React from 'react';
import { BookOpen } from 'lucide-react';

export interface ClassItem {
  id: string;
  name: string;
  course: string;
}

interface ClassSelectorProps {
  classes: ClassItem[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  disabled?: boolean;
}

export const ClassSelector: React.FC<ClassSelectorProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  disabled = false
}) => {
  return (
    <div>
      <label
        htmlFor="class-selector"
        className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
      >
        Select Course
      </label>
      <div className="relative mt-1.5">
        <select
          id="class-selector"
          disabled={disabled}
          value={selectedClassId}
          onChange={(e) => onSelectClass(e.target.value)}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100 disabled:opacity-75 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
        >
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.course} &bull; {cls.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
          <BookOpen className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};
