-- ==========================================================
-- PRAVAHAx Attendance Relational PostgreSQL Schema
-- Canonical Production Database Definition
-- ==========================================================

-- 1. Users Table (Teachers with scrypt passwords, Students passwordless)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')),
    student_id VARCHAR(64) UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_student_id ON users (student_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 2. Classes Table
CREATE TABLE IF NOT EXISTS classes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    course VARCHAR(64) NOT NULL,
    teacher_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes (teacher_id);

-- 3. Class Enrollments Table
CREATE TABLE IF NOT EXISTS class_enrollments (
    id VARCHAR(64) PRIMARY KEY,
    class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_class_student UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_class ON class_enrollments (class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON class_enrollments (student_id);

-- 4. Attendance Sessions Table
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id VARCHAR(64) PRIMARY KEY,
    class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(32) NOT NULL CHECK (mode IN ('DYNAMIC_QR', 'CODE')),
    current_code VARCHAR(16),
    session_secret VARCHAR(255) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_class ON attendance_sessions (class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON attendance_sessions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON attendance_sessions (status);

-- 5. Attendance Records Table
CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'PRESENT',
    verification_method VARCHAR(32) NOT NULL CHECK (verification_method IN ('DYNAMIC_QR', 'ATTENDANCE_CODE')),
    CONSTRAINT uq_record_session_student UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_records_session ON attendance_records (session_id);
CREATE INDEX IF NOT EXISTS idx_records_student ON attendance_records (student_id);
