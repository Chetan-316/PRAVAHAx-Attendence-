import { useState, useEffect, useCallback } from 'react';
import { AppShell } from './components/AppShell';
import { LandingPage } from './components/LandingPage';
import { TeacherLoginPage } from './components/TeacherLoginPage';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentAttendancePage } from './components/StudentAttendancePage';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
}

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [teacherUser, setTeacherUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Synchronize browser history
  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Check teacher authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/teacher/me', { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.user) {
          setTeacherUser(data.user);
        } else {
          setTeacherUser(null);
        }
      } catch {
        setTeacherUser(null);
      } finally {
        setAuthChecking(false);
      }
    };

    checkAuth();
  }, []);

  const handleTeacherLoginSuccess = (user: User) => {
    setTeacherUser(user);
    navigate('/teacher');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/teacher/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    setTeacherUser(null);
    navigate('/');
  };

  // Route Controller
  const renderContent = () => {
    if (authChecking && currentPath === '/teacher') {
      return (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Checking authorization...
        </div>
      );
    }

    if (currentPath === '/teacher/login') {
      return (
        <TeacherLoginPage
          onLoginSuccess={handleTeacherLoginSuccess}
          onBack={() => navigate('/')}
        />
      );
    }

    if (currentPath === '/teacher') {
      if (!teacherUser) {
        return (
          <TeacherLoginPage
            onLoginSuccess={handleTeacherLoginSuccess}
            onBack={() => navigate('/')}
          />
        );
      }
      return <TeacherDashboard />;
    }

    if (currentPath === '/student') {
      return <StudentAttendancePage onBack={() => navigate('/')} />;
    }

    // Default: Root Landing Page
    return (
      <LandingPage
        onNavigateTeacher={() => (teacherUser ? navigate('/teacher') : navigate('/teacher/login'))}
        onNavigateStudent={() => navigate('/student')}
      />
    );
  };

  return (
    <AppShell
      facultyName={teacherUser?.name}
      onLogout={teacherUser ? handleLogout : undefined}
      onHomeClick={() => navigate('/')}
      activeRole={currentPath === '/student' ? 'STUDENT' : teacherUser ? 'TEACHER' : null}
    >
      {renderContent()}
    </AppShell>
  );
}

export default App;
