import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import { QrScanner } from './components/QrScanner';

const socket = io('/', { autoConnect: true });

export type AttendanceMode = 'DYNAMIC_QR' | 'CODE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  student_id?: string;
}

export interface Attendee {
  id: string;
  name: string;
  enrollment_number?: string;
  status: string;
  method?: string;
}

export interface AttendanceSuccessData {
  class_name: string;
  subject: string;
  time: string;
  method: string;
  message: string;
}

function App() {
  // Navigation Route State ('/' | '/teacher/login' | '/teacher' | '/student')
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/');

  // Teacher Authentication State
  const [teacherToken, setTeacherToken] = useState<string>(() => localStorage.getItem('pravahax_teacher_token') || '');
  const [teacherUser, setTeacherUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('pravahax_teacher_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [teacherIdentifier, setTeacherIdentifier] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Teacher Session State
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionMode, setSessionMode] = useState<AttendanceMode>('DYNAMIC_QR');
  const [sessionId, setSessionId] = useState('');
  const [pin, setPin] = useState('----');
  const [qrToken, setQrToken] = useState<string>('');
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(4);
  const [showModeModal, setShowModeModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('c1');
  const [classes, setClasses] = useState<any[]>([
    { id: 'c1', name: 'Data Structures', course: 'CS101' },
    { id: 'c2', name: 'Computer Networks', course: 'CS102' }
  ]);
  const [students, setStudents] = useState<Attendee[]>([]);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [logs, setLogs] = useState<any[] | null>(null);

  // Student State
  const [enrollmentInput, setEnrollmentInput] = useState(() => localStorage.getItem('pravahax_student_enrollment') || '');
  const [studentModeTab, setStudentModeTab] = useState<AttendanceMode>('DYNAMIC_QR');
  const [studentPinInput, setStudentPinInput] = useState('');
  const [isScanningLocked, setIsScanningLocked] = useState(false);
  const [verifyingAttendance, setVerifyingAttendance] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [studentSuccess, setStudentSuccess] = useState<AttendanceSuccessData | null>(null);
  const [manualQrInput, setManualQrInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Countdown & Polling Refs
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tokenPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveCountPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Navigation Helper
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Save student enrollment to remember on current visit
  useEffect(() => {
    if (enrollmentInput) {
      localStorage.setItem('pravahax_student_enrollment', enrollmentInput.trim().toUpperCase());
    }
  }, [enrollmentInput]);

  // ==========================================
  // TEACHER AUTHENTICATION FLOW
  // ==========================================
  const handleTeacherLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');

    if (!teacherIdentifier.trim() || !teacherPassword.trim()) {
      setLoginError('Teacher ID or Email and password are required.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: teacherIdentifier.trim(),
          password: teacherPassword
        })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('pravahax_teacher_token', data.token);
        localStorage.setItem('pravahax_teacher_user', JSON.stringify(data.user));
        setTeacherToken(data.token);
        setTeacherUser(data.user);
        setTeacherPassword('');
        socket.emit('join_teacher_room');
        navigate('/teacher');
      } else {
        setLoginError(data.error || 'Invalid teacher ID or password');
      }
    } catch {
      setLoginError('Unable to connect to authentication server. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleTeacherLogout = async () => {
    try {
      await fetch('/api/teacher/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    localStorage.removeItem('pravahax_teacher_token');
    localStorage.removeItem('pravahax_teacher_user');
    setTeacherToken('');
    setTeacherUser(null);
    setSessionActive(false);
    navigate('/teacher/login');
  };

  // Reconnect recovery: restore active session on page refresh
  const checkActiveSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session/active');
      if (res.ok) {
        const data = await res.json();
        if (data.active && data.session) {
          setSessionActive(true);
          setSessionId(data.session.id);
          setSessionMode(data.session.mode);
          setPin(data.session.currentCode || '----');
          if (data.session.currentQrToken) {
            setQrToken(data.session.currentQrToken);
          }
          if (data.session.attendees) {
            setStudents(data.session.attendees.map((a: any) => ({
              id: a.student_id,
              name: a.name,
              enrollment_number: a.enrollment_number,
              status: a.verification_method === 'DYNAMIC_QR' ? 'Dynamic QR Verified' : 'Code Verified',
              method: a.verification_method
            })));
          }
        } else {
          setSessionActive(false);
        }
      }
    } catch (e) {
      console.warn('Failed to recover active session:', e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!teacherToken) return;
    try {
      const res = await fetch('/api/attendance/logs', {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (e) {
      console.warn('Failed to fetch logs:', e);
    }
  }, [teacherToken]);

  const fetchTeacherClasses = useCallback(async (tId: string) => {
    if (!teacherToken) return;
    try {
      const res = await fetch(`/api/classes/${tId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.classes && data.classes.length > 0) {
          setClasses(data.classes);
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (e) {
      console.warn('Failed to load teacher classes:', e);
    }
  }, [teacherToken]);

  // Request fresh rotating QR token from server (Serverless-compatible polling)
  const pollFreshQrToken = useCallback(async () => {
    if (!teacherToken || !sessionActive || sessionMode !== 'DYNAMIC_QR') return;
    try {
      const res = await fetch('/api/session/qr-token', {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setQrToken(data.token);
          setQrSecondsLeft(data.rotation_interval || 4);
        }
      }
    } catch (e) {
      console.warn('Token poll error:', e);
    }
  }, [teacherToken, sessionActive, sessionMode]);

  // Load teacher dashboard data on auth
  useEffect(() => {
    if (teacherToken && teacherUser) {
      socket.emit('join_teacher_room');
      checkActiveSession();
      fetchLogs();
      fetchTeacherClasses(teacherUser.id);
    }
  }, [teacherToken, teacherUser, checkActiveSession, fetchLogs, fetchTeacherClasses]);

  // Render QR Code DataURL whenever qrToken changes
  useEffect(() => {
    if (qrToken) {
      QRCode.toDataURL(qrToken, {
        width: 340,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
        .then(url => {
          setQrImageUrl(url);
        })
        .catch(err => {
          console.error('QR rendering error:', err);
        });

      setQrSecondsLeft(4);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setQrSecondsLeft(prev => (prev > 1 ? prev - 1 : 4));
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [qrToken]);

  // Dynamic QR Polling Interval for Serverless Vercel support
  useEffect(() => {
    if (sessionActive && sessionMode === 'DYNAMIC_QR' && teacherToken) {
      if (tokenPollIntervalRef.current) clearInterval(tokenPollIntervalRef.current);
      tokenPollIntervalRef.current = setInterval(() => {
        pollFreshQrToken();
      }, 4000);
    } else {
      if (tokenPollIntervalRef.current) clearInterval(tokenPollIntervalRef.current);
    }
    return () => {
      if (tokenPollIntervalRef.current) clearInterval(tokenPollIntervalRef.current);
    };
  }, [sessionActive, sessionMode, teacherToken, pollFreshQrToken]);

  // Controlled Polling for Live Attendance Count (every 4 seconds)
  useEffect(() => {
    if (sessionActive && teacherToken) {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
      liveCountPollIntervalRef.current = setInterval(() => {
        checkActiveSession();
      }, 4000);
    } else {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
    }
    return () => {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
    };
  }, [sessionActive, teacherToken, checkActiveSession]);

  // Socket.IO Events
  useEffect(() => {
    socket.on('pin_rotated', (newPin: string) => {
      setPin(newPin);
    });

    socket.on('qr_rotated', (data: { token: string; intervalSeconds: number }) => {
      setQrToken(data.token);
      setQrSecondsLeft(data.intervalSeconds || 4);
    });

    socket.on('student_marked', (student: any) => {
      setStudents(prev => {
        const exists = prev.some(s => s.id === student.id);
        if (exists) return prev;
        return [
          ...prev,
          {
            id: student.id,
            name: student.name,
            enrollment_number: student.enrollment_number,
            status: student.status,
            method: student.method
          }
        ];
      });
      fetchLogs();
    });

    socket.on('session_ended', () => {
      setSessionActive(false);
      setShowModeModal(false);
      setQrToken('');
      setQrImageUrl('');
    });

    return () => {
      socket.off('pin_rotated');
      socket.off('qr_rotated');
      socket.off('student_marked');
      socket.off('session_ended');
    };
  }, [fetchLogs]);

  // Start Attendance Session
  const handleStartSession = async (mode: AttendanceMode) => {
    setShowModeModal(false);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        },
        body: JSON.stringify({
          class_id: selectedClassId,
          mode
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSessionActive(true);
        setSessionId(data.session_id);
        setSessionMode(mode);
        setStudents([]);
        if (mode === 'DYNAMIC_QR') {
          setQrToken(data.qr_token);
        } else {
          setPin(data.pin);
        }
      } else {
        alert(`Could not start session: ${data.error || 'Server error'}`);
      }
    } catch {
      alert('Network error while starting attendance session');
    }
  };

  // End Attendance Session
  const handleEndSession = async () => {
    if (!confirm('Are you sure you want to end this attendance session? All further submissions will be rejected.')) {
      return;
    }

    try {
      const res = await fetch('/api/session/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`
        }
      });

      if (res.ok) {
        setSessionActive(false);
        setQrToken('');
        setQrImageUrl('');
        fetchLogs();
      } else {
        const data = await res.json();
        alert(`Failed to close session: ${data.error || 'Server error'}`);
      }
    } catch {
      alert('Network error while closing session');
    }
  };

  // ==========================================
  // STUDENT ATTENDANCE SUBMISSION
  // ==========================================

  // Submit via Attendance Code
  const handleStudentSubmitCode = async () => {
    setStudentError('');
    const enrollment = enrollmentInput.trim().toUpperCase();
    if (!enrollment) {
      setStudentError('Please enter your institutional Enrollment Number.');
      return;
    }

    if (!studentPinInput || studentPinInput.length !== 4) {
      setStudentError('Please enter the 4-digit attendance code displayed by your teacher.');
      return;
    }

    setVerifyingAttendance(true);
    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_number: enrollment,
          pin: studentPinInput.trim(),
          device_id: `DEV_${enrollment}`
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStudentSuccess({
          class_name: data.class_name,
          subject: data.subject,
          time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          method: 'Attendance Code',
          message: data.message
        });
        setStudentPinInput('');
      } else {
        setStudentError(data.error || 'Failed to record attendance. Please check code and try again.');
      }
    } catch {
      setStudentError('Network error. Unable to reach attendance server.');
    } finally {
      setVerifyingAttendance(false);
    }
  };

  // Submit via Dynamic QR Scan
  const handleStudentScanQr = async (scannedPayload: string) => {
    if (isScanningLocked || verifyingAttendance) return;
    setIsScanningLocked(true);
    setStudentError('');

    const enrollment = enrollmentInput.trim().toUpperCase();
    if (!enrollment) {
      setStudentError('Please enter your Enrollment Number before scanning.');
      setIsScanningLocked(false);
      return;
    }

    setVerifyingAttendance(true);
    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_number: enrollment,
          qr_token: scannedPayload.trim(),
          device_id: `DEV_${enrollment}`
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStudentSuccess({
          class_name: data.class_name,
          subject: data.subject,
          time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          method: 'Dynamic QR',
          message: data.message
        });
      } else {
        setStudentError(data.error || 'Invalid or expired QR credential.');
        // Debounce before allowing next scan attempt
        setTimeout(() => setIsScanningLocked(false), 3000);
      }
    } catch {
      setStudentError('Network error during verification. Please check connection.');
      setTimeout(() => setIsScanningLocked(false), 3000);
    } finally {
      setVerifyingAttendance(false);
    }
  };

  // ==========================================
  // ROUTING & VIEW RENDERING
  // ==========================================

  // 1. LANDING PAGE ( / )
  if (currentPath === '/') {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 30, background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
            PRAVAHAx ERP System
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #ffffff 40%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            PRAVAHAx Attendance
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8', margin: '0 auto 36px', maxWidth: 480, lineHeight: 1.5 }}>
            Mark and manage classroom attendance securely with Dynamic QR and Code verification.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, textAlign: 'left' }}>
            {/* Teacher Card */}
            <div 
              onClick={() => navigate('/teacher/login')}
              style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 20px', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1e293b'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
                👨‍🏫
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#f8fafc', fontWeight: 700 }}>Teacher Portal</h3>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
                Faculty login to launch Dynamic QR or Code attendance sessions and view live reports.
              </p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#60a5fa', fontWeight: 600 }}>
                Teacher Login &rarr;
              </span>
            </div>

            {/* Student Card */}
            <div 
              onClick={() => navigate('/student')}
              style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 20px', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#10b981'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1e293b'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
                🎓
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#f8fafc', fontWeight: 700 }}>Student Attendance</h3>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
                Passwordless check-in with your enrollment number and classroom Dynamic QR or Code.
              </p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#34d399', fontWeight: 600 }}>
                Student Attendance &rarr;
              </span>
            </div>
          </div>

          <div style={{ marginTop: 40, fontSize: 12, color: '#64748b' }}>
            PRAVAHAx Attendance Engine • Anti-Proxy Verification
          </div>
        </div>
      </div>
    );
  }

  // 2. TEACHER LOGIN PAGE ( /teacher/login )
  if (currentPath === '/teacher/login') {
    // If already authenticated, redirect to dashboard
    if (teacherToken) {
      navigate('/teacher');
    }

    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#131b2e', border: '1px solid #1e293b', borderRadius: 20, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>
              👨‍🏫
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>Teacher Login</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94a3b8' }}>Sign in to manage classroom attendance sessions</p>
          </div>

          {loginError && (
            <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 13, marginBottom: 18, textAlign: 'left' }}>
              ✕ {loginError}
            </div>
          )}

          <form onSubmit={handleTeacherLogin}>
            <div style={{ marginBottom: 16, textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Teacher ID / Email
              </label>
              <input 
                type="text"
                placeholder="e.g. teacher@test.com"
                value={teacherIdentifier}
                onChange={(e) => setTeacherIdentifier(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 24, textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Password
              </label>
              <input 
                type="password"
                placeholder="Enter password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              style={{ width: '100%', padding: '13px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loginLoading ? 'not-allowed' : 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}
            >
              {loginLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button 
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              &larr; Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. TEACHER DASHBOARD ( /teacher or /teacher/dashboard )
  if (currentPath === '/teacher' || currentPath === '/teacher/dashboard') {
    // Protected Route: redirect if not authenticated
    if (!teacherToken) {
      navigate('/teacher/login');
      return null;
    }

    const currentClass = classes.find(c => c.id === selectedClassId) || classes[0];

    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Navbar */}
        <header style={{ borderBottom: '1px solid #1e293b', background: '#131b2e', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              P
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>PRAVAHAx Attendance</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Faculty Dashboard</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{teacherUser?.name || 'Faculty'}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{teacherUser?.email}</div>
            </div>
            <button
              onClick={handleTeacherLogout}
              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Dashboard Main Content */}
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
          {/* Active Session Banner / Control Card */}
          {sessionActive ? (
            <div style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 20, padding: 28, textAlign: 'center', marginBottom: 28, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 16, marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 14, background: '#064e3b', color: '#34d399', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }} />
                    ATTENDANCE ACTIVE
                  </div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                    {currentClass?.name} ({currentClass?.course})
                  </h2>
                  {sessionId && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Session: {sessionId.substring(0, 8)}</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 13, background: sessionMode === 'DYNAMIC_QR' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: sessionMode === 'DYNAMIC_QR' ? '#60a5fa' : '#34d399', padding: '6px 12px', borderRadius: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)' }}>
                    {sessionMode === 'DYNAMIC_QR' ? '⚡ Dynamic QR Mode' : '🔢 Attendance Code Mode'}
                  </span>
                  <button
                    onClick={handleEndSession}
                    style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)' }}
                  >
                    End Attendance
                  </button>
                </div>
              </div>

              {/* Mode Active Visual Display */}
              {sessionMode === 'DYNAMIC_QR' ? (
                <div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#cbd5e1' }}>Classroom Dynamic QR Code</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                    Signed credential rotates every ~4 seconds. Students scan with their phone camera.
                  </p>

                  <div style={{ display: 'inline-block', padding: 14, background: '#ffffff', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                    {qrImageUrl ? (
                      <img src={qrImageUrl} alt="Dynamic Attendance QR" style={{ width: 310, height: 310, display: 'block', borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: 310, height: 310, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        Generating Rotating QR...
                      </div>
                    )}
                  </div>

                  {/* Progress Indicator */}
                  <div style={{ maxWidth: 310, margin: '14px auto 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                      <span>Rotates automatically</span>
                      <strong style={{ color: '#60a5fa' }}>Next QR in: {qrSecondsLeft}s</strong>
                    </div>
                    <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(qrSecondsLeft / 4) * 100}%`, height: '100%', background: '#3b82f6', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
              ) : (
                /* Attendance Code Mode Display */
                <div style={{ padding: '24px 16px' }}>
                  <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>Classroom Attendance Code:</div>
                  <h1 style={{ fontSize: 64, margin: '8px 0', letterSpacing: 10, fontFamily: 'monospace', fontWeight: 800, color: '#34d399' }}>
                    {pin}
                  </h1>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    Students enter this code along with their enrollment number on the student portal.
                  </p>
                </div>
              )}

              {/* Attendance Count Bar */}
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
                <div style={{ fontSize: 16, color: '#cbd5e1' }}>
                  Present: <strong style={{ fontSize: 22, color: '#34d399', marginLeft: 4 }}>{students.length}</strong>
                </div>
                <button
                  onClick={() => setShowAttendeesModal(!showAttendeesModal)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #334155', color: '#cbd5e1', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                >
                  {showAttendeesModal ? 'Hide Attendees' : `View Present Students (${students.length})`}
                </button>
              </div>

              {/* Collapsible Attendees List */}
              {showAttendeesModal && (
                <div style={{ marginTop: 18, textAlign: 'left', background: '#0b0f19', borderRadius: 12, padding: 16, border: '1px solid #1e293b', maxHeight: 240, overflowY: 'auto' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Checked-in Students:</div>
                  {students.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: 12 }}>Waiting for students to check in...</div>
                  ) : (
                    students.map((s, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #1e293b', fontSize: 13 }}>
                        <div>
                          <strong style={{ color: '#f8fafc' }}>{s.name}</strong>
                          {s.enrollment_number && <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 12 }}>({s.enrollment_number})</span>}
                        </div>
                        <span style={{ color: '#34d399', fontSize: 12, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                          ✓ {s.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Inactive State: Start Attendance Card */
            <div style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 20, padding: 28, textAlign: 'left', marginBottom: 28, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Start Classroom Attendance</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Select class and launch a new live session</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 13, color: '#94a3b8' }}>Class:</label>
                  <select 
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    style={{ background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', padding: '8px 12px', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.course})</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={() => setShowModeModal(true)}
                style={{ width: '100%', padding: '16px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)' }}
              >
                + Start Attendance
              </button>
            </div>
          )}

          {/* Mode Selection Modal */}
          {showModeModal && !sessionActive && (
            <div style={{ background: '#131b2e', border: '2px solid #2563eb', borderRadius: 20, padding: 28, marginBottom: 28, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, color: '#60a5fa' }}>Choose Attendance Method</h3>
                <button onClick={() => setShowModeModal(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
                Select the attendance verification method for this lecture:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {/* Method 1: Dynamic QR */}
                <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>⚡</span>
                    <h4 style={{ margin: 0, fontSize: 16, color: '#60a5fa' }}>Dynamic QR</h4>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.4 }}>
                    Displays a cryptographically signed QR that automatically rotates every ~4 seconds. Old screenshots quickly expire.
                  </p>
                  <button
                    onClick={() => handleStartSession('DYNAMIC_QR')}
                    style={{ width: '100%', padding: '10px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Start Dynamic QR
                  </button>
                </div>

                {/* Method 2: Attendance Code */}
                <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🔢</span>
                    <h4 style={{ margin: 0, fontSize: 16, color: '#34d399' }}>Attendance Code</h4>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.4 }}>
                    Generates a classroom numeric code. Students enter their enrollment number and code on the student portal.
                  </p>
                  <button
                    onClick={() => handleStartSession('CODE')}
                    style={{ width: '100%', padding: '10px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Generate Code
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audit Logs Table */}
          <div style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 20, padding: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Attendance Audit Trail</h3>
              <button
                onClick={fetchLogs}
                style={{ background: '#0b0f19', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
              >
                🔄 Refresh Logs
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                    <th style={{ padding: '10px 8px' }}>Timestamp</th>
                    <th style={{ padding: '10px 8px' }}>Student Name</th>
                    <th style={{ padding: '10px 8px' }}>Enrollment</th>
                    <th style={{ padding: '10px 8px' }}>Status</th>
                    <th style={{ padding: '10px 8px' }}>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {logs && logs.length > 0 ? (
                    logs.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 8px', color: '#94a3b8' }}>
                          {new Date(row.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 600, color: '#f8fafc' }}>{row.name}</td>
                        <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{row.enrollment_number || '-'}</td>
                        <td style={{ padding: '10px 8px', color: '#34d399', fontWeight: 600 }}>✓ Present</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: row.verification_method === 'DYNAMIC_QR' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: row.verification_method === 'DYNAMIC_QR' ? '#60a5fa' : '#34d399' }}>
                            {row.verification_method}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                        No attendance records found yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 4. STUDENT ATTENDANCE PORTAL ( /student )
  if (currentPath === '/student') {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 14px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: 440, background: '#131b2e', border: '1px solid #1e293b', borderRadius: 24, padding: '28px 20px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', textAlign: 'center', boxSizing: 'border-box' }}>
          
          {/* Student Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                🎓
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#f8fafc' }}>PRAVAHAx Attendance</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Student Check-In</div>
              </div>
            </div>

            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
            >
              Home
            </button>
          </div>

          {/* Success Screen */}
          {studentSuccess ? (
            <div style={{ padding: '24px 16px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 20 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)' }}>
                ✓
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#34d399', fontWeight: 800 }}>Attendance Marked</h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                Your attendance has been recorded successfully.
              </p>

              <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 12, padding: 14, textAlign: 'left', fontSize: 13, color: '#cbd5e1', marginBottom: 20 }}>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#94a3b8' }}>Course:</strong> {studentSuccess.class_name} ({studentSuccess.subject})</div>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#94a3b8' }}>Time:</strong> {studentSuccess.time}</div>
                <div><strong style={{ color: '#94a3b8' }}>Method:</strong> <span style={{ color: '#34d399' }}>{studentSuccess.method} Verified</span></div>
              </div>

              <button
                onClick={() => {
                  setStudentSuccess(null);
                  setStudentError('');
                  setIsScanningLocked(false);
                }}
                style={{ width: '100%', padding: '12px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Step 1: Enrollment Number Input */}
              <div style={{ textAlign: 'left', marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Enrollment Number
                </label>
                <input 
                  type="text"
                  placeholder="e.g. STU001"
                  value={enrollmentInput}
                  onChange={(e) => setEnrollmentInput(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  No password required. Institutional ID identifies your record.
                </div>
              </div>

              {/* Mode Selector Tabs */}
              <div style={{ display: 'flex', background: '#0b0f19', padding: 4, borderRadius: 12, marginBottom: 16, border: '1px solid #1e293b' }}>
                <button
                  onClick={() => { setStudentModeTab('DYNAMIC_QR'); setStudentError(''); }}
                  style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: studentModeTab === 'DYNAMIC_QR' ? '#2563eb' : 'transparent', color: studentModeTab === 'DYNAMIC_QR' ? '#ffffff' : '#94a3b8', transition: 'all 0.2s' }}
                >
                  ⚡ Scan QR
                </button>
                <button
                  onClick={() => { setStudentModeTab('CODE'); setStudentError(''); }}
                  style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: studentModeTab === 'CODE' ? '#059669' : 'transparent', color: studentModeTab === 'CODE' ? '#ffffff' : '#94a3b8', transition: 'all 0.2s' }}
                >
                  🔢 Enter Code
                </button>
              </div>

              {/* Tab Content */}
              <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 16, padding: '18px 14px' }}>
                {studentModeTab === 'DYNAMIC_QR' ? (
                  /* Dynamic QR Scan Flow */
                  <div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                      Align camera with the rotating QR code on teacher's screen:
                    </div>

                    <QrScanner
                      onScanSuccess={handleStudentScanQr}
                      isScanningLocked={isScanningLocked || verifyingAttendance}
                    />

                    {/* Manual token input fallback */}
                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={() => setShowManualInput(!showManualInput)}
                        style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {showManualInput ? 'Hide manual token' : 'Manual token input'}
                      </button>

                      {showManualInput && (
                        <div style={{ marginTop: 10 }}>
                          <input 
                            type="text"
                            placeholder="Paste token here"
                            value={manualQrInput}
                            onChange={(e) => setManualQrInput(e.target.value)}
                            style={{ width: '100%', padding: 8, fontSize: 12, borderRadius: 6, background: '#131b2e', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }}
                          />
                          <button
                            onClick={() => handleStudentScanQr(manualQrInput)}
                            disabled={verifyingAttendance}
                            style={{ marginTop: 8, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                          >
                            Submit Token
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Attendance Code Flow */
                  <div style={{ padding: '8px 4px' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                      Enter the 4-digit code displayed by your teacher:
                    </div>
                    <input 
                      type="text"
                      maxLength={4}
                      placeholder="----"
                      value={studentPinInput}
                      onChange={(e) => setStudentPinInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleStudentSubmitCode()}
                      style={{ width: 140, padding: '10px 8px', fontSize: 28, textAlign: 'center', letterSpacing: 6, borderRadius: 10, background: '#131b2e', border: '2px solid #334155', color: '#34d399', fontWeight: 800, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={handleStudentSubmitCode}
                      disabled={verifyingAttendance}
                      style={{ display: 'block', width: '100%', marginTop: 16, padding: '12px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: verifyingAttendance ? 'not-allowed' : 'pointer' }}
                    >
                      {verifyingAttendance ? 'Verifying...' : 'Mark Attendance'}
                    </button>
                  </div>
                )}
              </div>

              {/* Status or Error Banner */}
              {verifyingAttendance && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: 13 }}>
                  Verifying attendance with server...
                </div>
              )}

              {studentError && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: 13, textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>✕ {studentError}</span>
                    <button
                      onClick={() => { setStudentError(''); setIsScanningLocked(false); }}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;
