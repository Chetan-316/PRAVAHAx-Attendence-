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

// 30 Student Registered Roster (Featuring 5 primary student logins: Chetan, Dhruv, Pallav, Varad, Devang)
export const STUDENT_ROSTER_LIST = [
  { enrollment: 'STU001', name: 'Chetan', username: 'chetan', email: 'chetan@pravaha.com' },
  { enrollment: 'STU002', name: 'Dhruv', username: 'dhruv', email: 'dhruv@pravaha.com' },
  { enrollment: 'STU003', name: 'Pallav', username: 'pallav', email: 'pallav@pravaha.com' },
  { enrollment: 'STU004', name: 'Varad', username: 'varad', email: 'varad@pravaha.com' },
  { enrollment: 'STU005', name: 'Devang', username: 'devang', email: 'devang@pravaha.com' },
  { enrollment: 'STU006', name: 'Ananya Desai' },
  { enrollment: 'STU007', name: 'Aditya Joshi' },
  { enrollment: 'STU008', name: 'Kavya Reddy' },
  { enrollment: 'STU009', name: 'Siddharth Malhotra' },
  { enrollment: 'STU010', name: 'Riya Sen' },
  { enrollment: 'STU011', name: 'Aryan Gupta' },
  { enrollment: 'STU012', name: 'Tanvi Kulkarni' },
  { enrollment: 'STU013', name: 'Varun Nair' },
  { enrollment: 'STU014', name: 'Pooja Iyer' },
  { enrollment: 'STU015', name: 'Harsh Pandey' },
  { enrollment: 'STU016', name: 'Neha Choudhary' },
  { enrollment: 'STU017', name: 'Yash Singhania' },
  { enrollment: 'STU018', name: 'Divya Bhat' },
  { enrollment: 'STU019', name: 'Kunal Agrawal' },
  { enrollment: 'STU020', name: 'Shreya Kapoor' },
  { enrollment: 'STU021', name: 'Gaurav Mishra' },
  { enrollment: 'STU022', name: 'Meera Pillai' },
  { enrollment: 'STU023', name: 'Nikhil Saxena' },
  { enrollment: 'STU024', name: 'Isha Jain' },
  { enrollment: 'STU025', name: 'Pranav Rao' },
  { enrollment: 'STU026', name: 'Swati Tiwari' },
  { enrollment: 'STU027', name: 'Vivek Chauhan' },
  { enrollment: 'STU028', name: 'Ritu Chawla' },
  { enrollment: 'STU029', name: 'Manan Bhatt' },
  { enrollment: 'STU030', name: 'Kriti Roy' }
];

export const getResolvedStudentName = (rawInput: string) => {
  let clean = (rawInput || '').trim().toUpperCase();
  if (clean.startsWith('STUD') && !clean.startsWith('STUDENT')) {
    clean = clean.replace('STUD', 'STU');
  }
  const match = STUDENT_ROSTER_LIST.find(s => 
    s.enrollment === clean || 
    s.enrollment === rawInput.trim().toUpperCase() ||
    s.name.toLowerCase() === rawInput.trim().toLowerCase() ||
    (s as any).username?.toLowerCase() === rawInput.trim().toLowerCase()
  );
  return match ? match.name : '';
};

function App() {
  // Navigation Route State ('/' | '/teacher/login' | '/teacher' | '/student' | '/student/login')
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/');

  // Starting Page Dual Tab State ('FACULTY' | 'STUDENT')
  const [startTab, setStartTab] = useState<'FACULTY' | 'STUDENT'>('FACULTY');

  // Student Authentication State
  const [studentToken, setStudentToken] = useState<string>(() => localStorage.getItem('pravahax_student_token') || '');
  const [studentUser, setStudentUser] = useState<any>(() => {
    const saved = localStorage.getItem('pravahax_student_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [studentIdentifier, setStudentIdentifier] = useState('chetan');
  const [studentPassword, setStudentPassword] = useState('pravaha@123');
  const [studentLoginLoading, setStudentLoginLoading] = useState(false);
  const [studentLoginError, setStudentLoginError] = useState('');

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
  const [studentPinInput, setStudentPinInput] = useState('');
  const [isScanningLocked, setIsScanningLocked] = useState(false);
  const [verifyingAttendance, setVerifyingAttendance] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [studentSuccess, setStudentSuccess] = useState<AttendanceSuccessData | null>(null);
  const [manualQrInput, setManualQrInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [studentRecentLogs, setStudentRecentLogs] = useState<any[]>([]);
  const [activeLectureInfo, setActiveLectureInfo] = useState<{ active: boolean; className?: string; mode?: string } | null>(null);

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
    navigate('/');
  };

  // ==========================================
  // STUDENT AUTHENTICATION FLOW
  // ==========================================
  const handleStudentLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStudentLoginError('');

    if (!studentIdentifier.trim() || !studentPassword.trim()) {
      setStudentLoginError('Student username/ID and password are required.');
      return;
    }

    setStudentLoginLoading(true);
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: studentIdentifier.trim(),
          password: studentPassword.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('pravahax_student_token', data.token);
        localStorage.setItem('pravahax_student_user', JSON.stringify(data.user));
        setStudentToken(data.token);
        setStudentUser(data.user);
        setEnrollmentInput(data.user.student_id || data.user.id || studentIdentifier.trim().toUpperCase());
        setStudentPassword('pravaha@123');
        navigate('/student');
      } else {
        setStudentLoginError(data.error || 'Invalid student credentials. Password must be pravaha@123');
      }
    } catch {
      setStudentLoginError('Unable to connect to authentication server. Please try again.');
    } finally {
      setStudentLoginLoading(false);
    }
  };

  const handleStudentLogout = () => {
    localStorage.removeItem('pravahax_student_token');
    localStorage.removeItem('pravahax_student_user');
    setStudentToken('');
    setStudentUser(null);
    navigate('/');
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
            const mappedAttendees = data.session.attendees.map((a: any) => ({
              id: a.student_id,
              name: a.name,
              enrollment_number: a.enrollment_number,
              status: a.verification_method === 'DYNAMIC_QR' ? 'Dynamic QR Verified' : 'Code Verified',
              method: a.verification_method,
              marked_at: a.marked_at || new Date().toISOString()
            }));
            setStudents(mappedAttendees);
            if (!data.logs || data.logs.length === 0) {
              setLogs(mappedAttendees);
            }
          }
          if (data.logs && data.logs.length > 0) {
            setLogs(data.logs);
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

  // Controlled Polling for Live Attendance Count (every 3 seconds)
  useEffect(() => {
    if (sessionActive && teacherToken) {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
      liveCountPollIntervalRef.current = setInterval(() => {
        checkActiveSession();
        fetchLogs();
      }, 3000);
    } else {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
    }
    return () => {
      if (liveCountPollIntervalRef.current) clearInterval(liveCountPollIntervalRef.current);
    };
  }, [sessionActive, teacherToken, checkActiveSession, fetchLogs]);

  // Student Portal Live Polling: lecture status & live activity log stream
  useEffect(() => {
    if (currentPath !== '/student') return;

    const pollStudentActivity = async () => {
      try {
        const res = await fetch('/api/session/active');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.session) {
            setActiveLectureInfo({
              active: true,
              className: 'Data Structures (CS101)',
              mode: data.session.mode
            });
            if (data.session.attendees && data.session.attendees.length > 0) {
              setStudentRecentLogs(data.session.attendees);
            }
          } else {
            setActiveLectureInfo({ active: false });
          }
          if (data.logs && data.logs.length > 0) {
            setStudentRecentLogs(data.logs);
          }
        }
      } catch (e) {
        console.warn('Student activity poll error:', e);
      }
    };

    pollStudentActivity();
    const interval = setInterval(pollStudentActivity, 3000);
    return () => clearInterval(interval);
  }, [currentPath]);

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
    let enrollment = enrollmentInput.trim().toUpperCase();
    if (enrollment.startsWith('STUD') && !enrollment.startsWith('STUDENT')) {
      enrollment = enrollment.replace('STUD', 'STU');
    }
    if (!enrollment) {
      setStudentError('Please enter or select your institutional Enrollment Number.');
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

        // Push immediately into live downside activity log
        const resolvedName = getResolvedStudentName(enrollment) || (data.record && data.record.name) || data.student_name || `Student (${enrollment})`;
        const newRecord = {
          name: resolvedName,
          enrollment_number: enrollment,
          marked_at: new Date().toISOString(),
          status: 'PRESENT',
          verification_method: 'ATTENDANCE_CODE'
        };
        setStudentRecentLogs(prev => [newRecord, ...prev.filter(p => p.enrollment_number !== enrollment)]);
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

    let enrollment = enrollmentInput.trim().toUpperCase();
    if (enrollment.startsWith('STUD') && !enrollment.startsWith('STUDENT')) {
      enrollment = enrollment.replace('STUD', 'STU');
    }
    if (!enrollment) {
      setStudentError('Please enter or select your Enrollment Number before scanning.');
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

        // Push immediately into live downside activity log
        const resolvedName = getResolvedStudentName(enrollment) || (data.record && data.record.name) || data.student_name || `Student (${enrollment})`;
        const newRecord = {
          name: resolvedName,
          enrollment_number: enrollment,
          marked_at: new Date().toISOString(),
          status: 'PRESENT',
          verification_method: 'DYNAMIC_QR'
        };
        setStudentRecentLogs(prev => [newRecord, ...prev.filter(p => p.enrollment_number !== enrollment)]);
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

  // 1. UNIFIED LOGIN PORTAL ( / and /teacher/login )
  if (currentPath === '/' || currentPath === '/teacher/login' || currentPath === '/student/login') {
    // If teacher is already authenticated and visits /teacher/login, go to /teacher
    if (teacherToken && currentPath === '/teacher/login') {
      navigate('/teacher');
      return null;
    }

    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #172554 0%, #0b0f19 70%)', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          {/* Header Branding */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 30, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#60a5fa', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }} />
            PRAVAHAx ERP System
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #ffffff 30%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            PRAVAHAx Attendance
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8', margin: '0 auto 24px', maxWidth: 420, lineHeight: 1.5 }}>
            Enterprise anti-proxy attendance with Dynamic QR and Code verification. Select your portal below to begin:
          </p>

          {/* Unified Login Box */}
          <div style={{ background: '#131b2e', border: '1px solid #1e293b', borderRadius: 24, padding: '26px 22px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', boxSizing: 'border-box' }}>
            {/* Dual Portal Switcher Tabs */}
            <div style={{ display: 'flex', background: '#0b0f19', padding: 4, borderRadius: 14, marginBottom: 22, border: '1px solid #1e293b' }}>
              <button
                type="button"
                onClick={() => setStartTab('FACULTY')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: startTab === 'FACULTY' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                  color: startTab === 'FACULTY' ? '#ffffff' : '#94a3b8',
                  boxShadow: startTab === 'FACULTY' ? '0 4px 12px rgba(37, 99, 235, 0.4)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <span>👨‍🏫</span> Faculty Login
              </button>
              <button
                type="button"
                onClick={() => setStartTab('STUDENT')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: startTab === 'STUDENT' ? 'linear-gradient(135deg, #059669, #047857)' : 'transparent',
                  color: startTab === 'STUDENT' ? '#ffffff' : '#94a3b8',
                  boxShadow: startTab === 'STUDENT' ? '0 4px 12px rgba(5, 150, 105, 0.4)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <span>🎓</span> Student Login
              </button>
            </div>

            {/* TAB 1: FACULTY / TEACHER LOGIN */}
            {startTab === 'FACULTY' && (
              <div>
                <div style={{ textAlign: 'left', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    Sign in with faculty credentials to launch and monitor attendance sessions.
                  </div>
                </div>

                {loginError && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
                    ✕ {loginError}
                  </div>
                )}

                <form onSubmit={handleTeacherLogin}>
                  <div style={{ marginBottom: 14, textAlign: 'left' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Teacher ID or Email
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. teacher@test.com"
                      value={teacherIdentifier}
                      onChange={(e) => setTeacherIdentifier(e.target.value)}
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: 18, textAlign: 'left' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={teacherPassword}
                      onChange={(e) => setTeacherPassword(e.target.value)}
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* 1-Click Demo Fill for Teacher */}
                  <div style={{ textAlign: 'left', marginBottom: 18 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTeacherIdentifier('teacher@test.com');
                        setTeacherPassword('teacher123');
                      }}
                      style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ⚡ Quick Fill: teacher@test.com / teacher123
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loginLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}
                  >
                    {loginLoading ? 'Signing In...' : 'Sign In as Faculty →'}
                  </button>
                </form>

                {teacherToken && (
                  <div style={{ marginTop: 14, textAlign: 'center' }}>
                    <button
                      onClick={() => navigate('/teacher')}
                      style={{ background: 'transparent', border: 'none', color: '#34d399', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      ✓ Already logged in as Teacher &rarr; Open Dashboard
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: STUDENT LOGIN */}
            {startTab === 'STUDENT' && (
              <div>
                <div style={{ textAlign: 'left', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    Sign in using your student username/ID and password (<code style={{ color: '#34d399' }}>pravaha@123</code>).
                  </div>
                </div>

                {studentLoginError && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
                    ✕ {studentLoginError}
                  </div>
                )}

                {/* 5 Required Student 1-Tap Quick Fill Buttons */}
                <div style={{ textAlign: 'left', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Quick Select Student (5 Student Accounts):
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { name: 'Chetan', user: 'chetan', id: 'STU001' },
                      { name: 'Dhruv', user: 'dhruv', id: 'STU002' },
                      { name: 'Pallav', user: 'pallav', id: 'STU003' },
                      { name: 'Varad', user: 'varad', id: 'STU004' },
                      { name: 'Devang', user: 'devang', id: 'STU005' },
                    ].map((s) => (
                      <button
                        key={s.user}
                        type="button"
                        onClick={() => {
                          setStudentIdentifier(s.user);
                          setStudentPassword('pravaha@123');
                          setEnrollmentInput(s.id);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: studentIdentifier.toLowerCase() === s.user ? '1px solid #10b981' : '1px solid #334155',
                          background: studentIdentifier.toLowerCase() === s.user ? 'rgba(16, 185, 129, 0.2)' : '#0b0f19',
                          color: studentIdentifier.toLowerCase() === s.user ? '#34d399' : '#cbd5e1'
                        }}
                      >
                        🎓 {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleStudentLogin}>
                  <div style={{ marginBottom: 14, textAlign: 'left' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Student Username or ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. chetan, dhruv, STU001"
                      value={studentIdentifier}
                      onChange={(e) => setStudentIdentifier(e.target.value)}
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: 18, textAlign: 'left' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      placeholder="pravaha@123"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Default password for all student accounts: <code style={{ color: '#34d399' }}>pravaha@123</code>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={studentLoginLoading}
                    style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: studentLoginLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)' }}
                  >
                    {studentLoginLoading ? 'Signing In...' : 'Sign In as Student →'}
                  </button>
                </form>

                {studentToken && (
                  <div style={{ marginTop: 14, textAlign: 'center' }}>
                    <button
                      onClick={() => navigate('/student')}
                      style={{ background: 'transparent', border: 'none', color: '#34d399', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      ✓ Logged in as {studentUser?.name || 'Student'} &rarr; Go to Attendance Portal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, fontSize: 12, color: '#64748b' }}>
            PRAVAHAx Attendance Engine • PostgreSQL Persistent Dataset
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
                  {(() => {
                    const effectiveLogs = (logs && logs.length > 0)
                      ? logs
                      : (students && students.length > 0
                          ? students.map(s => ({
                              name: s.name,
                              enrollment_number: s.enrollment_number,
                              marked_at: (s as any).marked_at || new Date().toISOString(),
                              status: 'PRESENT',
                              verification_method: s.method || 'ATTENDANCE_CODE'
                            }))
                          : []);

                    if (effectiveLogs.length > 0) {
                      return effectiveLogs.map((row: any, i: number) => (
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
                      ));
                    }

                    return (
                      <tr>
                        <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                          No attendance records found yet.
                        </td>
                      </tr>
                    );
                  })()}
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
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #064e3b 0%, #0b0f19 70%)', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
        
        {/* Main Student Card */}
        <div style={{ width: '100%', maxWidth: 480, background: '#131b2e', border: '1px solid #1e293b', borderRadius: 24, padding: '26px 20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', textAlign: 'center', boxSizing: 'border-box' }}>
          
          {/* Student Portal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #1e293b', paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 2px 10px rgba(16, 185, 129, 0.2)' }}>
                🎓
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#f8fafc', letterSpacing: '-0.3px' }}>PRAVAHAx Student Portal</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {studentUser ? `${studentUser.name} (${studentUser.student_id || enrollmentInput})` : 'Student Login Required'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {studentUser ? (
                <button
                  onClick={handleStudentLogout}
                  style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5', padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={() => navigate('/')}
                  style={{ background: '#0b0f19', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >
                  Home
                </button>
              )}
            </div>
          </div>

          {/* If Student is NOT authenticated, show the login form first */}
          {!studentUser ? (
            <div>
              <div style={{ textAlign: 'left', marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#f8fafc', fontWeight: 700 }}>Student Sign In</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  Please select or enter your student account to access classroom attendance.
                </p>
              </div>

              {studentLoginError && (
                <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
                  ✕ {studentLoginError}
                </div>
              )}

              {/* 5 Quick-Select Test Buttons */}
              <div style={{ textAlign: 'left', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Select Student:
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { name: 'Chetan', user: 'chetan', id: 'STU001' },
                    { name: 'Dhruv', user: 'dhruv', id: 'STU002' },
                    { name: 'Pallav', user: 'pallav', id: 'STU003' },
                    { name: 'Varad', user: 'varad', id: 'STU004' },
                    { name: 'Devang', user: 'devang', id: 'STU005' },
                  ].map((s) => (
                    <button
                      key={s.user}
                      type="button"
                      onClick={() => {
                        setStudentIdentifier(s.user);
                        setStudentPassword('pravaha@123');
                        setEnrollmentInput(s.id);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: studentIdentifier.toLowerCase() === s.user ? '1px solid #10b981' : '1px solid #334155',
                        background: studentIdentifier.toLowerCase() === s.user ? 'rgba(16, 185, 129, 0.2)' : '#0b0f19',
                        color: studentIdentifier.toLowerCase() === s.user ? '#34d399' : '#cbd5e1'
                      }}
                    >
                      🎓 {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleStudentLogin}>
                <div style={{ marginBottom: 14, textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Student Username or ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. chetan, dhruv, STU001"
                    value={studentIdentifier}
                    onChange={(e) => setStudentIdentifier(e.target.value)}
                    required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: 18, textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="pravaha@123"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#0b0f19', border: '1px solid #334155', color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Password for all 5 student accounts: <code style={{ color: '#34d399' }}>pravaha@123</code>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={studentLoginLoading}
                  style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: studentLoginLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)' }}
                >
                  {studentLoginLoading ? 'Signing In...' : 'Sign In as Student →'}
                </button>
              </form>
            </div>
          ) : studentSuccess ? (
            /* Success Screen */
            <div style={{ padding: '24px 16px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)' }}>
                ✓
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#34d399', fontWeight: 800 }}>Attendance Marked!</h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                Your institutional attendance record has been confirmed.
              </p>

              <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 12, padding: 14, textAlign: 'left', fontSize: 13, color: '#cbd5e1', marginBottom: 20 }}>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#94a3b8' }}>Student:</strong> <span style={{ color: '#f8fafc', fontWeight: 700 }}>{studentUser.name}</span> ({studentUser.student_id || enrollmentInput})</div>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#94a3b8' }}>Course:</strong> {studentSuccess.class_name} ({studentSuccess.subject})</div>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#94a3b8' }}>Time:</strong> {studentSuccess.time}</div>
                <div><strong style={{ color: '#94a3b8' }}>Method:</strong> <span style={{ color: '#34d399', fontWeight: 600 }}>{studentSuccess.method} Verified</span></div>
              </div>

              <button
                onClick={() => {
                  setStudentSuccess(null);
                  setStudentError('');
                  setIsScanningLocked(false);
                }}
                style={{ width: '100%', padding: '12px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)' }}
              >
                Done
              </button>
            </div>
          ) : !activeLectureInfo?.active ? (
            /* STANDBY WAITING ROOM: Teacher has not started attendance */
            <div style={{ padding: '32px 16px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid #1e293b', borderRadius: 20 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                ⏳
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#f8fafc', fontWeight: 700 }}>
                Waiting for Faculty to Start
              </h3>
              <p style={{ margin: '0 auto 20px', maxWidth: 360, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Attendance has not been initiated by the teacher yet. As soon as the teacher starts the session, your camera QR scanner or code keypad will automatically launch!
              </p>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }} />
                Live Status: Listening for session start...
              </div>
            </div>
          ) : activeLectureInfo.mode === 'DYNAMIC_QR' ? (
            /* TEACHER SELECTED DYNAMIC QR: Show ONLY Camera QR Scanner */
            <div>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', boxShadow: '0 0 8px #3b82f6' }} />
                    Active Mode: Dynamic QR
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>{activeLectureInfo.className || 'Lecture Session'}</div>
                </div>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 700 }}>
                  ⚡ Camera Active
                </span>
              </div>

              <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 16, padding: '18px 14px' }}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                  Point your camera at the Dynamic QR code on the teacher's screen:
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
                    {showManualInput ? 'Hide manual token' : 'Trouble scanning? Enter token manually'}
                  </button>

                  {showManualInput && (
                    <div style={{ marginTop: 10 }}>
                      <input 
                        type="text"
                        placeholder="Paste signed token here"
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
            </div>
          ) : (
            /* TEACHER SELECTED CODE: Show ONLY 4-digit numeric code entry */
            <div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
                    Active Mode: Code Mode
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>{activeLectureInfo.className || 'Lecture Session'}</div>
                </div>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: '#059669', color: '#fff', fontWeight: 700 }}>
                  🔢 4-Digit Code
                </span>
              </div>

              <div style={{ background: '#0b0f19', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 16px' }}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
                  Enter the 4-digit classroom code displayed by your teacher:
                </div>
                <input 
                  type="text"
                  maxLength={4}
                  placeholder="----"
                  value={studentPinInput}
                  onChange={(e) => setStudentPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStudentSubmitCode()}
                  style={{ width: 150, padding: '12px 8px', fontSize: 32, textAlign: 'center', letterSpacing: 8, borderRadius: 12, background: '#131b2e', border: '2px solid #334155', color: '#34d399', fontWeight: 800, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={handleStudentSubmitCode}
                  disabled={verifyingAttendance || studentPinInput.length !== 4}
                  style={{ display: 'block', width: '100%', marginTop: 20, padding: '13px 16px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: (verifyingAttendance || studentPinInput.length !== 4) ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)' }}
                >
                  {verifyingAttendance ? 'Verifying Attendance...' : 'Mark Attendance →'}
                </button>
              </div>
            </div>
          )}

          {/* Status or Error Banner */}
          {verifyingAttendance && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: 13 }}>
              Verifying attendance record with server...
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
        </div>

        {/* DOWN-SIDE: Live Classroom Attendance Activity Stream */}
        <div style={{ width: '100%', maxWidth: 480, marginTop: 24, background: '#131b2e', border: '1px solid #1e293b', borderRadius: 20, padding: '20px 18px', textAlign: 'left', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 10px #10b981' }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                Live Attendance Activity Stream
              </h3>
            </div>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>
              {studentRecentLogs.length} Checked In
            </span>
          </div>

          {studentRecentLogs && studentRecentLogs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {studentRecentLogs.map((log: any, idx: number) => {
                const currentId = studentUser?.student_id || studentUser?.id || enrollmentInput.trim().toUpperCase();
                const isMe = (log.enrollment_number && log.enrollment_number === currentId) ||
                             (log.name && studentUser && log.name.toLowerCase() === studentUser.name.toLowerCase());
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: isMe ? 'rgba(16, 185, 129, 0.14)' : '#0b0f19',
                      border: isMe ? '1px solid #10b981' : '1px solid #1e293b',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#34d399' : '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {log.name || log.student_id}
                        {isMe && (
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: '#fff', fontWeight: 800 }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        ID: {log.enrollment_number} • {new Date(log.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>✓ Present</div>
                      <div style={{ fontSize: 10, color: '#60a5fa' }}>{log.verification_method || 'Verified'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: 13, background: '#0b0f19', borderRadius: 12, border: '1px dashed #1e293b' }}>
              No check-ins recorded yet for this session. Enter the code or scan QR above to be first!
            </div>
          )}
        </div>

      </div>
    );
  }

  return null;
}

export default App;
