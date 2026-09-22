-- ==========================================================
-- PRAVAHAx Attendance System — PostgreSQL Dataset Schema & Seeds
-- Database: PostgreSQL 14+ compatible
-- ==========================================================

-- 1. Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Users Table (Teachers & Students)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')),
    student_id VARCHAR(64),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_student_id ON users (student_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 3. Classes Table
CREATE TABLE IF NOT EXISTS classes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    course VARCHAR(64) NOT NULL,
    teacher_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes (teacher_id);

-- 4. Attendance Sessions Table
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id VARCHAR(64) PRIMARY KEY,
    class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(32) NOT NULL DEFAULT 'DYNAMIC_QR' CHECK (mode IN ('DYNAMIC_QR', 'CODE')),
    current_code VARCHAR(16),
    session_secret VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_class ON attendance_sessions (class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON attendance_sessions (status);

-- 5. Attendance Records Table
CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'PRESENT',
    verification_method VARCHAR(32) NOT NULL CHECK (verification_method IN ('DYNAMIC_QR', 'ATTENDANCE_CODE', 'MANUAL')),
    verification_confidence INTEGER DEFAULT 95,
    device_id_hash VARCHAR(255)
);

-- Unique constraint: A student can only check into a session once
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique_student_session 
ON attendance_records (session_id, student_id);

CREATE INDEX IF NOT EXISTS idx_records_session ON attendance_records (session_id);
CREATE INDEX IF NOT EXISTS idx_records_student ON attendance_records (student_id);

-- ==========================================================
-- SEED DATASET
-- ==========================================================

-- Faculty Account (Password: teacher123)
-- Scrypt hash for 'teacher123'
INSERT INTO users (id, name, email, role, password_hash)
VALUES (
    't1',
    'Prof. Sharma',
    'teacher@test.com',
    'TEACHER',
    'scrypt:d3568b6b23b3762e5b7b9f8f41334ec4$c0a0c64c8dcf62bf1471f28b49e48753df186f91fa877c8e6378e38f9b9f3900b9809930fca683664d6db90aeeb5c55be0c2738cbce669bce055e85501869e96'
) ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 5 Key Student Accounts (Password: pravaha@123)
-- Chetan, Dhruv, Pallav, Varad, Devang
INSERT INTO users (id, name, email, role, student_id, password_hash)
VALUES
    ('s1', 'Chetan', 'chetan@pravaha.com', 'STUDENT', 'STU001', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s2', 'Dhruv', 'dhruv@pravaha.com', 'STUDENT', 'STU002', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s3', 'Pallav', 'pallav@pravaha.com', 'STUDENT', 'STU003', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s4', 'Varad', 'varad@pravaha.com', 'STUDENT', 'STU004', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s5', 'Devang', 'devang@pravaha.com', 'STUDENT', 'STU005', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    email = EXCLUDED.email, 
    password_hash = EXCLUDED.password_hash;

-- Remaining 25 Registered Students (Password: pravaha@123)
INSERT INTO users (id, name, email, role, student_id, password_hash)
VALUES
    ('s6', 'Ananya Desai', 'ananya@pravaha.com', 'STUDENT', 'STU006', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s7', 'Aditya Joshi', 'aditya@pravaha.com', 'STUDENT', 'STU007', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s8', 'Kavya Reddy', 'kavya@pravaha.com', 'STUDENT', 'STU008', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s9', 'Siddharth Malhotra', 'siddharth@pravaha.com', 'STUDENT', 'STU009', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s10', 'Riya Sen', 'riya@pravaha.com', 'STUDENT', 'STU010', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s11', 'Aryan Gupta', 'aryan@pravaha.com', 'STUDENT', 'STU011', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s12', 'Tanvi Kulkarni', 'tanvi@pravaha.com', 'STUDENT', 'STU012', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s13', 'Varun Nair', 'varun@pravaha.com', 'STUDENT', 'STU013', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s14', 'Pooja Iyer', 'pooja@pravaha.com', 'STUDENT', 'STU014', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s15', 'Harsh Pandey', 'harsh@pravaha.com', 'STUDENT', 'STU015', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s16', 'Neha Choudhary', 'neha@pravaha.com', 'STUDENT', 'STU016', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s17', 'Yash Singhania', 'yash@pravaha.com', 'STUDENT', 'STU017', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s18', 'Divya Bhat', 'divya@pravaha.com', 'STUDENT', 'STU018', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s19', 'Kunal Agrawal', 'kunal@pravaha.com', 'STUDENT', 'STU019', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s20', 'Shreya Kapoor', 'shreya@pravaha.com', 'STUDENT', 'STU020', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s21', 'Gaurav Mishra', 'gaurav@pravaha.com', 'STUDENT', 'STU021', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s22', 'Meera Pillai', 'meera@pravaha.com', 'STUDENT', 'STU022', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s23', 'Nikhil Saxena', 'nikhil@pravaha.com', 'STUDENT', 'STU023', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s24', 'Isha Jain', 'isha@pravaha.com', 'STUDENT', 'STU024', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s25', 'Pranav Rao', 'pranav@pravaha.com', 'STUDENT', 'STU025', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s26', 'Swati Tiwari', 'swati@pravaha.com', 'STUDENT', 'STU026', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s27', 'Vivek Chauhan', 'vivek@pravaha.com', 'STUDENT', 'STU027', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s28', 'Ritu Chawla', 'ritu@pravaha.com', 'STUDENT', 'STU028', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s29', 'Manan Bhatt', 'manan@pravaha.com', 'STUDENT', 'STU029', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128'),
    ('s30', 'Kriti Roy', 'kriti@pravaha.com', 'STUDENT', 'STU030', 'scrypt:a8b1c2d3e4f50123456789abcdef0123$7b5e481b212f46215ca4086ad02029ec2e8316dfc69992bbcd19688df2fc6ee8e614bc8a8d11c0f4f7223b28b4dcaea4bdfd6b1d161d9a263c5098ffbce5e128')
ON CONFLICT (id) DO NOTHING;

-- Seed Classes
INSERT INTO classes (id, name, course, teacher_id)
VALUES 
    ('c1', 'Data Structures', 'CS101', 't1'),
    ('c2', 'Computer Networks', 'CS102', 't1')
ON CONFLICT (id) DO NOTHING;
