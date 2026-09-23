import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

interface StatusMessageProps {
  type?: 'error' | 'success' | 'info' | 'warning';
  message: string;
  onDismiss?: () => void;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  type = 'error',
  message,
  onDismiss
}) => {
  if (!message) return null;

  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
  }[type];

  const Icon = {
    error: AlertTriangle,
    success: CheckCircle2,
    warning: AlertTriangle,
    info: Info
  }[type];

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-all ${styles}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
