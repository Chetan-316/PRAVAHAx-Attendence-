import { useState, useEffect, useRef, useCallback } from 'react';
import { ClassSelector, type ClassItem } from './ClassSelector';
import { AttendanceModeDialog } from './AttendanceModeDialog';
import { DynamicQrPanel } from './DynamicQrPanel';
import { AttendanceCodePanel } from './AttendanceCodePanel';
import { SessionMetrics } from './SessionMetrics';
import { LiveAttendanceTable, type AttendeeItem } from './LiveAttendanceTable';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusMessage } from './StatusMessage';
import { Play, BookOpen } from 'lucide-react';

interface ActiveSessionData {
  id: string;
  class_id: string;
  teacher_id: string;
  mode: 'DYNAMIC_QR' | 'CODE';
  started_at: string;
  class_name: string;
  course: string;
  current_code?: string;
  codeInfo?: {
    code: string;
    secondsRemaining: number;
    rotationInterval: number;
  };
  qr?: {
    token: string;
    secondsRemaining: number;
    rotationInterval: number;
  };
}

export const TeacherDashboard: React.FC = () => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [attendees, setAttendees] = useState<AttendeeItem[]>([]);
  const [totalEnrolled, setTotalEnrolled] = useState<number>(0);

  const [showModeModal, setShowModeModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const activePollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const codePollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Classes & Recover Active Session on Mount
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch Classes
      const classRes = await fetch('/api/teacher/classes', { credentials: 'include' });
      const classData = await classRes.json();
      if (classRes.ok && classData.classes && classData.classes.length > 0) {
        setClasses(classData.classes);
        setSelectedClassId(classData.classes[0].id);
      }

      // Recover Active Session
      const sessionRes = await fetch('/api/session/active', { credentials: 'include' });
      const sessionData = await sessionRes.json();
      if (sessionRes.ok && sessionData.active && sessionData.session) {
        setActiveSession({
          ...sessionData.session,
          current_code: sessionData.current_code,
          codeInfo: sessionData.codeInfo,
          qr: sessionData.qr
        });
        setAttendees(sessionData.attendees || []);
        setTotalEnrolled(sessionData.totalEnrolled || 0);
        setSelectedClassId(sessionData.session.class_id);
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Error connecting to the attendance service.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // 2. Poll Active Session & Attendees (every 3 seconds)
  useEffect(() => {
    if (!activeSession) {
      if (activePollTimerRef.current) clearInterval(activePollTimerRef.current);
      return;
    }

    const pollActiveSession = async () => {
      try {
        const res = await fetch('/api/session/active', { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.active && data.session) {
          setAttendees(data.attendees || []);
          setTotalEnrolled(data.totalEnrolled || 0);
          if (data.current_code && activeSession.mode === 'CODE') {
            setActiveSession((prev) => (prev ? { ...prev, current_code: data.current_code, codeInfo: data.codeInfo || prev.codeInfo } : null));
          }
        }
      } catch (err) {
        console.warn('Live count polling error:', err);
      }
    };

    activePollTimerRef.current = setInterval(pollActiveSession, 3000);
    return () => {
      if (activePollTimerRef.current) clearInterval(activePollTimerRef.current);
    };
  }, [activeSession?.id, activeSession?.mode]);

  // 3a. Poll Dynamic QR Token (every 3.8 - 4 seconds)
  useEffect(() => {
    if (!activeSession || activeSession.mode !== 'DYNAMIC_QR') {
      if (qrPollTimerRef.current) clearInterval(qrPollTimerRef.current);
      return;
    }

    const pollQrToken = async () => {
      try {
        const res = await fetch(`/api/session/qr-token?sessionId=${activeSession.id}`, {
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.token) {
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  qr: {
                    token: data.token,
                    secondsRemaining: data.secondsRemaining,
                    rotationInterval: data.rotationInterval
                  }
                }
              : null
          );
        }
      } catch (err) {
        console.warn('QR token polling error:', err);
      }
    };

    qrPollTimerRef.current = setInterval(pollQrToken, (activeSession.qr?.rotationInterval || 4) * 1000);
    return () => {
      if (qrPollTimerRef.current) clearInterval(qrPollTimerRef.current);
    };
  }, [activeSession?.id, activeSession?.mode]);

  // 3b. Fetch Rotating Code synchronized with server window boundary
  useEffect(() => {
    if (!activeSession || activeSession.mode !== 'CODE') {
      if (codePollTimerRef.current) clearTimeout(codePollTimerRef.current);
      return;
    }

    let isSubscribed = true;

    const fetchNextCode = async () => {
      try {
        const res = await fetch(`/api/session/code?sessionId=${activeSession.id}`, {
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.code && isSubscribed) {
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  current_code: data.code,
                  codeInfo: {
                    code: data.code,
                    secondsRemaining: data.secondsRemaining,
                    rotationInterval: data.rotationInterval
                  }
                }
              : null
          );

          // Synchronize to next server boundary (+ 60ms buffer to safely step into next window)
          const delayMs = Math.max(200, Math.floor(data.secondsRemaining * 1000) + 60);
          codePollTimerRef.current = setTimeout(fetchNextCode, delayMs);
        }
      } catch (err) {
        console.warn('Rotating code fetch error:', err);
        if (isSubscribed) {
          codePollTimerRef.current = setTimeout(fetchNextCode, 2000);
        }
      }
    };

    const initialDelayMs = Math.max(
      100,
      Math.floor((activeSession.codeInfo?.secondsRemaining ?? 4) * 1000) + 60
    );
    codePollTimerRef.current = setTimeout(fetchNextCode, initialDelayMs);

    return () => {
      isSubscribed = false;
      if (codePollTimerRef.current) clearTimeout(codePollTimerRef.current);
    };
  }, [activeSession?.id, activeSession?.mode]);

  // 4. Start Attendance Session
  const handleStartSession = async (mode: 'DYNAMIC_QR' | 'CODE') => {
    if (!selectedClassId) return;
    setStartingSession(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ class_id: selectedClassId, mode })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to start session.' });
        return;
      }

      const selectedClass = classes.find((c) => c.id === selectedClassId);
      setActiveSession({
        ...data.session,
        class_name: selectedClass ? selectedClass.name : '',
        course: selectedClass ? selectedClass.course : '',
        current_code: data.code,
        codeInfo: data.codeInfo,
        qr: data.qr
      });
      setAttendees([]);
      setShowModeModal(false);
      setStatusMsg({ type: 'success', text: `Attendance session started in ${mode === 'DYNAMIC_QR' ? 'Dynamic QR' : 'Rotating Code'} mode.` });
    } catch {
      setStatusMsg({ type: 'error', text: 'Error starting attendance session.' });
    } finally {
      setStartingSession(false);
    }
  };

  // 5. End Attendance Session
  const handleEndSession = async () => {
    if (!activeSession) return;
    setEndingSession(true);

    try {
      const res = await fetch('/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: activeSession.id })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActiveSession(null);
        setShowEndConfirm(false);
        setStatusMsg({
          type: 'success',
          text: `Attendance closed successfully. Total present: ${data.finalCount}.`
        });
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to close session.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Error closing session.' });
    } finally {
      setEndingSession(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Loading faculty dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statusMsg && (
        <StatusMessage
          type={statusMsg.type}
          message={statusMsg.text}
          onDismiss={() => setStatusMsg(null)}
        />
      )}

      {/* State A: No Active Session -> Start Card */}
      {!activeSession && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Start Classroom Attendance
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Select an assigned course and initiate attendance for your lecture.
            </p>
          </div>

          <div className="max-w-md space-y-5">
            <ClassSelector
              classes={classes}
              selectedClassId={selectedClassId}
              onSelectClass={(id) => setSelectedClassId(id)}
            />

            {selectedClass && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                  <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{selectedClass.course} &bull; {selectedClass.name}</span>
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Ready to start. Choose between Dynamic QR or 4-Second Rotating Classroom Code.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowModeModal(true)}
              disabled={startingSession || !selectedClassId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-700"
            >
              <Play className="h-4 w-4 fill-white" />
              <span>Start Attendance</span>
            </button>
          </div>
        </div>
      )}

      {/* State B: Active Session in Progress */}
      {activeSession && (
        <div className="space-y-6">
          {/* Active Session Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-950 dark:bg-indigo-950/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Attendance in Progress
                </span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeSession.course} &bull; {activeSession.class_name}
              </h2>
            </div>
            <div className="text-right text-xs text-slate-500 dark:text-slate-400 font-mono">
              Started at {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Main 2-Column Split: Credential on Left, Metrics on Right */}
          <div className="grid gap-6 md:grid-cols-2">
            {activeSession.mode === 'DYNAMIC_QR' ? (
              <DynamicQrPanel
                token={activeSession.qr?.token || ''}
                secondsRemaining={activeSession.qr?.secondsRemaining || 4}
                rotationInterval={activeSession.qr?.rotationInterval || 4}
              />
            ) : (
              <AttendanceCodePanel
                code={activeSession.current_code || ''}
                secondsRemaining={activeSession.codeInfo?.secondsRemaining || 4}
                rotationInterval={activeSession.codeInfo?.rotationInterval || 4}
              />
            )}

            <SessionMetrics
              presentCount={attendees.length}
              totalEnrolled={totalEnrolled}
              startedAt={activeSession.started_at}
              onEndSession={() => setShowEndConfirm(true)}
              ending={endingSession}
            />
          </div>

          {/* Live Attendance Table */}
          <LiveAttendanceTable attendees={attendees} />
        </div>
      )}

      {/* Modals & Confirmation Dialogs */}
      <AttendanceModeDialog
        isOpen={showModeModal}
        className={selectedClass?.name || ''}
        courseCode={selectedClass?.course || ''}
        onSelectMode={handleStartSession}
        onCancel={() => setShowModeModal(false)}
      />

      <ConfirmDialog
        isOpen={showEndConfirm}
        title="End Attendance Session?"
        message="Closing the session will immediately invalidate active credentials. Students will no longer be able to submit attendance."
        confirmLabel="End Attendance"
        isDestructive={true}
        onConfirm={handleEndSession}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  );
};
