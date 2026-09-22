import sqlite3 from 'sqlite3';
import path from 'path';
import { Pool } from 'pg';
import { hashPassword } from './auth';

// PostgreSQL Connection Pool (used if DATABASE_URL or PG environment is configured)
export const pgPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    })
  : null;

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
    const defaultStudentPassword = hashPassword('pravaha@123');

    db.get("SELECT id, password_hash FROM users WHERE email = 'teacher@test.com'", (err, row: any) => {
      if (!row) {
        db.run(
          `INSERT INTO users (id, name, email, role, password_hash) VALUES ('t1', 'Prof. Sharma', 'teacher@test.com', 'TEACHER', ?)`,
          [defaultTeacherPassword]
        );
        db.run(`INSERT INTO classes (id, name, course, teacher_id) VALUES ('c1', 'Data Structures', 'CS101', 't1')`);
        db.run(`INSERT INTO classes (id, name, course, teacher_id) VALUES ('c2', 'Computer Networks', 'CS102', 't1')`);
      } else {
        db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [defaultTeacherPassword, row.id]);
      }

      // 30 Students Roster (Featuring 5 primary student logins: Chetan, Dhruv, Pallav, Varad, Devang)
      const students30 = [
        ['s1', 'Chetan Agrawal', 'chetan@pravaha.com', 'STU001'],
        ['s2', 'Dhruv Sharma', 'dhruv@pravaha.com', 'STU002'],
        ['s3', 'Pallav Patel', 'pallav@pravaha.com', 'STU003'],
        ['s4', 'Varad Kulkarni', 'varad@pravaha.com', 'STU004'],
        ['s5', 'Devang Joshi', 'devang@pravaha.com', 'STU005'],
        ['s6', 'Ananya Desai', 'ananya@pravaha.com', 'STU006'],
        ['s7', 'Aditya Joshi', 'aditya@pravaha.com', 'STU007'],
        ['s8', 'Kavya Reddy', 'kavya@pravaha.com', 'STU008'],
        ['s9', 'Siddharth Malhotra', 'siddharth@pravaha.com', 'STU009'],
        ['s10', 'Riya Sen', 'riya@pravaha.com', 'STU010'],
        ['s11', 'Aryan Gupta', 'aryan@pravaha.com', 'STU011'],
        ['s12', 'Tanvi Kulkarni', 'tanvi@pravaha.com', 'STU012'],
        ['s13', 'Varun Nair', 'varun@pravaha.com', 'STU013'],
        ['s14', 'Pooja Iyer', 'pooja@pravaha.com', 'STU014'],
        ['s15', 'Harsh Pandey', 'harsh@pravaha.com', 'STU015'],
        ['s16', 'Neha Choudhary', 'neha@pravaha.com', 'STU016'],
        ['s17', 'Yash Singhania', 'yash@pravaha.com', 'STU017'],
        ['s18', 'Divya Bhat', 'divya@pravaha.com', 'STU018'],
        ['s19', 'Kunal Agrawal', 'kunal@pravaha.com', 'STU019'],
        ['s20', 'Shreya Kapoor', 'shreya@pravaha.com', 'STU020'],
        ['s21', 'Gaurav Mishra', 'gaurav@pravaha.com', 'STU021'],
        ['s22', 'Meera Pillai', 'meera@pravaha.com', 'STU022'],
        ['s23', 'Nikhil Saxena', 'nikhil@pravaha.com', 'STU023'],
        ['s24', 'Isha Jain', 'isha@pravaha.com', 'STU024'],
        ['s25', 'Pranav Rao', 'pranav@pravaha.com', 'STU025'],
        ['s26', 'Swati Tiwari', 'swati@pravaha.com', 'STU026'],
        ['s27', 'Vivek Chauhan', 'vivek@pravaha.com', 'STU027'],
        ['s28', 'Ritu Chawla', 'ritu@pravaha.com', 'STU028'],
        ['s29', 'Manan Bhatt', 'manan@pravaha.com', 'STU029'],
        ['s30', 'Kriti Roy', 'kriti@pravaha.com', 'STU030']
      ];

      students30.forEach(([sid, sname, semail, senr]) => {
        db.run(
          `INSERT INTO users (id, name, email, role, student_id, password_hash)
           VALUES (?, ?, ?, 'STUDENT', ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, password_hash = excluded.password_hash, student_id = excluded.student_id`,
          [sid, sname, semail, senr, defaultStudentPassword]
        );
      });
    });
  });
};

export default db;
