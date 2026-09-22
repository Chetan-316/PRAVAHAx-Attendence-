import sqlite3 from 'sqlite3';
import path from 'path';
import { hashPassword } from './auth';

const dbPath = path.resolve(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath);

export const initDB = () => {
  db.serialize(() => {
    // Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        role TEXT,
        student_id TEXT,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add 'password_hash' column if not present
    db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
      if (!err && columns) {
        const hasPasswordHash = columns.some(col => col.name === 'password_hash');
        if (!hasPasswordHash) {
          db.run("ALTER TABLE users ADD COLUMN password_hash TEXT");
        }
      }
    });

    // Create index on student_id for fast enrollment lookup
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_student_id ON users (student_id)`);

    // Classes Table
    db.run(`
      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        name TEXT,
        course TEXT,
        teacher_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance Sessions Table
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id TEXT PRIMARY KEY,
        class_id TEXT,
        teacher_id TEXT,
        started_at DATETIME,
        expires_at DATETIME,
        status TEXT,
        session_secret TEXT,
        mode TEXT DEFAULT 'CODE',
        current_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add 'mode' and 'current_code' column migrations for existing databases
    db.all("PRAGMA table_info(attendance_sessions)", (err, columns: any[]) => {
      if (!err && columns) {
        const hasMode = columns.some(col => col.name === 'mode');
        if (!hasMode) {
          db.run("ALTER TABLE attendance_sessions ADD COLUMN mode TEXT DEFAULT 'CODE'");
        }
        const hasCurrentCode = columns.some(col => col.name === 'current_code');
        if (!hasCurrentCode) {
          db.run("ALTER TABLE attendance_sessions ADD COLUMN current_code TEXT");
        }
      }
    });

    // Attendance Records Table
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        student_id TEXT,
        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT,
        verification_method TEXT,
        verification_confidence INTEGER,
        device_id_hash TEXT
      )
    `);

    // Unique index to prevent duplicate attendance at the database level
    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_records_unique_student_session
      ON attendance_records (session_id, student_id)
    `);

    // Seed initial teacher and student data
    const defaultTeacherPassword = hashPassword('teacher123');

    db.get("SELECT id, password_hash FROM users WHERE email = 'teacher@test.com'", (err, row: any) => {
      if (!row) {
        db.run(
          `INSERT INTO users (id, name, email, role, password_hash) VALUES ('t1', 'Prof. Sharma', 'teacher@test.com', 'TEACHER', ?)`,
          [defaultTeacherPassword]
        );
        db.run(`INSERT INTO users (id, name, email, role, student_id) VALUES ('s1', 'Rahul Patil', 'student1@test.com', 'STUDENT', 'STU001')`);
        db.run(`INSERT INTO users (id, name, email, role, student_id) VALUES ('s2', 'Sneha Shah', 'student2@test.com', 'STUDENT', 'STU002')`);
        db.run(`INSERT INTO users (id, name, email, role, student_id) VALUES ('s3', 'Aman Verma', 'student3@test.com', 'STUDENT', 'STU003')`);
        
        db.run(`INSERT INTO classes (id, name, course, teacher_id) VALUES ('c1', 'Data Structures', 'CS101', 't1')`);
        db.run(`INSERT INTO classes (id, name, course, teacher_id) VALUES ('c2', 'Computer Networks', 'CS102', 't1')`);
      } else if (!row.password_hash) {
        // Upgrade existing teacher record with secure password hash
        db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [defaultTeacherPassword, row.id]);
      }
    });
  });
};

export default db;
