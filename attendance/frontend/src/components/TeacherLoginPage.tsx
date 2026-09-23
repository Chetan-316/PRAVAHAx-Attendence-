import React, { useState } from 'react';
import { UserCheck, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { StatusMessage } from './StatusMessage';

interface TeacherLoginPageProps {
  onLoginSuccess: (user: any) => void;
  onBack: () => void;
}

export const TeacherLoginPage: React.FC<TeacherLoginPageProps> = ({
  onLoginSuccess,
  onBack
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your Faculty ID or Email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid Faculty ID or password.');
        return;
      }

      onLoginSuccess(data.user);
    } catch {
      setError('Unable to connect to the authentication service. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Portal</span>
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">
            Faculty Sign In
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Enter your institutional faculty credentials to access active sessions.
          </p>
        </div>

        {error && (
          <div className="mb-4">
            <StatusMessage type="error" message={error} onDismiss={() => setError('')} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="teacher-identifier"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Faculty ID or Email
            </label>
            <input
              id="teacher-identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="teacher@test.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="teacher-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="teacher-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
