import { Pool } from 'pg';
import { hashPassword } from './crypto.js';

export interface DatabaseAdapter {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<void>;
  isPostgres(): boolean;
}

// 30 Student Roster
export const INITIAL_STUDENTS = [
  { id: 's1', name: 'Chetan Agrawal', email: 'chetan@pravaha.com', enrollment: 'STU001' },
  { id: 's2', name: 'Dhruv Sharma', email: 'dhruv@pravaha.com', enrollment: 'STU002' },
  { id: 's3', name: 'Pallav Patel', email: 'pallav@pravaha.com', enrollment: 'STU003' },
  { id: 's4', name: 'Varad Kulkarni', email: 'varad@pravaha.com', enrollment: 'STU004' },
  { id: 's5', name: 'Devang Joshi', email: 'devang@pravaha.com', enrollment: 'STU005' },
  { id: 's6', name: 'Ananya Desai', email: 'ananya@pravaha.com', enrollment: 'STU006' },
  { id: 's7', name: 'Aditya Joshi', email: 'aditya@pravaha.com', enrollment: 'STU007' },
  { id: 's8', name: 'Kavya Reddy', email: 'kavya@pravaha.com', enrollment: 'STU008' },
  { id: 's9', name: 'Siddharth Malhotra', email: 'siddharth@pravaha.com', enrollment: 'STU009' },
  { id: 's10', name: 'Riya Sen', email: 'riya@pravaha.com', enrollment: 'STU010' },
  { id: 's11', name: 'Aryan Gupta', email: 'aryan@pravaha.com', enrollment: 'STU011' },
  { id: 's12', name: 'Tanvi Kulkarni', email: 'tanvi@pravaha.com', enrollment: 'STU012' },
  { id: 's13', name: 'Varun Nair', email: 'varun@pravaha.com', enrollment: 'STU013' },
  { id: 's14', name: 'Pooja Iyer', email: 'pooja@pravaha.com', enrollment: 'STU014' },
  { id: 's15', name: 'Harsh Pandey', email: 'harsh@pravaha.com', enrollment: 'STU015' },
  { id: 's16', name: 'Neha Choudhary', email: 'neha@pravaha.com', enrollment: 'STU016' },
  { id: 's17', name: 'Yash Singhania', email: 'yash@pravaha.com', enrollment: 'STU017' },
  { id: 's18', name: 'Divya Bhat', email: 'divya@pravaha.com', enrollment: 'STU018' },
  { id: 's19', name: 'Kunal Agrawal', email: 'kunal@pravaha.com', enrollment: 'STU019' },
  { id: 's20', name: 'Shreya Kapoor', email: 'shreya@pravaha.com', enrollment: 'STU020' },
  { id: 's21', name: 'Gaurav Mishra', email: 'gaurav@pravaha.com', enrollment: 'STU021' },
  { id: 's22', name: 'Meera Pillai', email: 'meera@pravaha.com', enrollment: 'STU022' },
  { id: 's23', name: 'Nikhil Saxena', email: 'nikhil@pravaha.com', enrollment: 'STU023' },
  { id: 's24', name: 'Isha Jain', email: 'isha@pravaha.com', enrollment: 'STU024' },
  { id: 's25', name: 'Pranav Rao', email: 'pranav@pravaha.com', enrollment: 'STU025' },
  { id: 's26', name: 'Swati Tiwari', email: 'swati@pravaha.com', enrollment: 'STU026' },
  { id: 's27', name: 'Vivek Chauhan', email: 'vivek@pravaha.com', enrollment: 'STU027' },
  { id: 's28', name: 'Ritu Chawla', email: 'ritu@pravaha.com', enrollment: 'STU028' },
  { id: 's29', name: 'Manan Bhatt', email: 'manan@pravaha.com', enrollment: 'STU029' },
  { id: 's30', name: 'Kriti Roy', email: 'kriti@pravaha.com', enrollment: 'STU030' }
];

// ==========================================
// Postgres Implementation
// ==========================================
class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  }

  isPostgres() {
    return true;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query(sql, params);
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      // 1. Run core schema
      await this.pool.query(`
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

        CREATE TABLE IF NOT EXISTS classes (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            course VARCHAR(64) NOT NULL,
            teacher_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes (teacher_id);

        CREATE TABLE IF NOT EXISTS class_enrollments (
            id VARCHAR(64) PRIMARY KEY,
            class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            student_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_class_student UNIQUE (class_id, student_id)
        );
        CREATE INDEX IF NOT EXISTS idx_enrollments_class ON class_enrollments (class_id);

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
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON attendance_sessions (status);

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
      `);

      // 2. Seed default teacher (Prof. Sharma, password: teacher123)
      const teacherPwHash = hashPassword('teacher123');
      await this.pool.query(
        `INSERT INTO users (id, name, email, role, password_hash)
         VALUES ($1, $2, $3, 'TEACHER', $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
        ['t1', 'Prof. Sharma', 'teacher@test.com', teacherPwHash]
      );

      // 3. Seed default classes
      await this.pool.query(
        `INSERT INTO classes (id, name, course, teacher_id)
         VALUES ('c1', 'Data Structures', 'CS101', 't1')
         ON CONFLICT (id) DO NOTHING`
      );
      await this.pool.query(
        `INSERT INTO classes (id, name, course, teacher_id)
         VALUES ('c2', 'Computer Networks', 'CS102', 't1')
         ON CONFLICT (id) DO NOTHING`
      );

      // 4. Seed 30 students (Passwordless: password_hash is NULL)
      for (const s of INITIAL_STUDENTS) {
        await this.pool.query(
          `INSERT INTO users (id, name, email, role, student_id, password_hash)
           VALUES ($1, $2, $3, 'STUDENT', $4, NULL)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, student_id = EXCLUDED.student_id`,
          [s.id, s.name, s.email, s.enrollment]
        );

        // Enroll in c1 and c2
        await this.pool.query(
          `INSERT INTO class_enrollments (id, class_id, student_id, status)
           VALUES ($1, 'c1', $2, 'ACTIVE')
           ON CONFLICT (class_id, student_id) DO NOTHING`,
          [`enr_${s.id}_c1`, s.id]
        );
        await this.pool.query(
          `INSERT INTO class_enrollments (id, class_id, student_id, status)
           VALUES ($1, 'c2', $2, 'ACTIVE')
           ON CONFLICT (class_id, student_id) DO NOTHING`,
          [`enr_${s.id}_c2`, s.id]
        );
      }
    } catch (err) {
      console.error('Postgres initialization error:', err);
    }
  }
}

// ==========================================
// Relational In-Memory Adapter (Offline / Zero-Config fallback)
// ==========================================
class MemoryRelationalAdapter implements DatabaseAdapter {
  private users: Map<string, any> = new Map();
  private classes: Map<string, any> = new Map();
  private enrollments: Map<string, any> = new Map();
  private sessions: Map<string, any> = new Map();
  private records: Map<string, any> = new Map();

  constructor() {
    this.seed();
  }

  isPostgres() {
    return false;
  }

  private seed() {
    const teacherPwHash = hashPassword('teacher123');
    this.users.set('t1', {
      id: 't1',
      name: 'Prof. Sharma',
      email: 'teacher@test.com',
      role: 'TEACHER',
      password_hash: teacherPwHash,
      created_at: new Date().toISOString()
    });

    this.classes.set('c1', {
      id: 'c1',
      name: 'Data Structures',
      course: 'CS101',
      teacher_id: 't1',
      created_at: new Date().toISOString()
    });
    this.classes.set('c2', {
      id: 'c2',
      name: 'Computer Networks',
      course: 'CS102',
      teacher_id: 't1',
      created_at: new Date().toISOString()
    });

    INITIAL_STUDENTS.forEach(s => {
      this.users.set(s.id, {
        id: s.id,
        name: s.name,
        email: s.email,
        role: 'STUDENT',
        student_id: s.enrollment,
        password_hash: null,
        created_at: new Date().toISOString()
      });

      this.enrollments.set(`c1_${s.id}`, {
        id: `enr_${s.id}_c1`,
        class_id: 'c1',
        student_id: s.id,
        status: 'ACTIVE'
      });
      this.enrollments.set(`c2_${s.id}`, {
        id: `enr_${s.id}_c2`,
        class_id: 'c2',
        student_id: s.id,
        status: 'ACTIVE'
      });
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const cleanSql = sql.trim().toUpperCase();

    // SELECT user by email or student_id
    if (cleanSql.includes('FROM USERS')) {
      const allUsers = Array.from(this.users.values());
      if (
        cleanSql.includes('WHERE EMAIL =') ||
        cleanSql.includes('WHERE (EMAIL =') ||
        cleanSql.includes('WHERE (EMAIL = $1 OR ID = $1)') ||
        cleanSql.includes('LOWER(EMAIL) = $1')
      ) {
        const val = (params[0] || '').toLowerCase();
        return allUsers.filter(u => u.email.toLowerCase() === val || u.id.toLowerCase() === val) as any;
      }
      if (cleanSql.includes('WHERE STUDENT_ID =') || cleanSql.includes('WHERE UPPER(STUDENT_ID) =')) {
        const val = (params[0] || '').toUpperCase();
        return allUsers.filter(u => u.student_id && u.student_id.toUpperCase() === val) as any;
      }
      if (cleanSql.includes('WHERE ID =')) {
        const val = params[0];
        return allUsers.filter(u => u.id === val) as any;
      }
      return allUsers as any;
    }

    // SELECT classes by teacher_id
    if (cleanSql.includes('FROM CLASSES')) {
      const allClasses = Array.from(this.classes.values());
      if (cleanSql.includes('WHERE TEACHER_ID =') || cleanSql.includes('WHERE ID = $1 AND TEACHER_ID = $2')) {
        if (params.length === 2) {
          return allClasses.filter(c => c.id === params[0] && c.teacher_id === params[1]) as any;
        }
        return allClasses.filter(c => c.teacher_id === params[0]) as any;
      }
      if (cleanSql.includes('WHERE ID =')) {
        return allClasses.filter(c => c.id === params[0]) as any;
      }
      return allClasses as any;
    }

    // SELECT class_enrollments
    if (cleanSql.includes('FROM CLASS_ENROLLMENTS')) {
      if (cleanSql.includes('COUNT(*)')) {
        const clsId = params[0];
        const count = Array.from(this.enrollments.values()).filter(e => e.class_id === clsId && e.status === 'ACTIVE').length;
        return [{ count }] as any;
      }
      const all = Array.from(this.enrollments.values());
      if (cleanSql.includes('CLASS_ID = $1 AND STUDENT_ID = $2')) {
        return all.filter(e => e.class_id === params[0] && e.student_id === params[1] && e.status === 'ACTIVE') as any;
      }
      if (cleanSql.includes('WHERE CLASS_ID =')) {
        return all.filter(e => e.class_id === params[0]) as any;
      }
      return all as any;
    }

    // SELECT attendance_sessions
    if (cleanSql.includes('FROM ATTENDANCE_SESSIONS')) {
      const allSessions = Array.from(this.sessions.values());
      const withClassDetails = (sList: any[]) =>
        sList.map(s => {
          const cls = this.classes.get(s.class_id);
          return {
            ...s,
            class_name: cls ? cls.name : '',
            course: cls ? cls.course : ''
          };
        });

      let filtered = allSessions;

      if (/\b(s\.)?id\s*=\s*\$1\s+AND\s+(s\.)?teacher_id\s*=\s*\$2/i.test(sql)) {
        filtered = filtered.filter(s => s.id === params[0] && s.teacher_id === params[1]);
      } else if (/\b(s\.)?id\s*=\s*\$1\b/i.test(sql)) {
        filtered = filtered.filter(s => s.id === params[0]);
      } else if (/\b(s\.)?current_code\s*=\s*\$1\b/i.test(sql)) {
        filtered = filtered.filter(s => s.current_code === params[0]);
      } else if (/\b(s\.)?class_id\s*=\s*\$1\b/i.test(sql)) {
        filtered = filtered.filter(s => s.class_id === params[0]);
      } else if (/\b(s\.)?teacher_id\s*=\s*\$1\b/i.test(sql)) {
        filtered = filtered.filter(s => s.teacher_id === params[0]);
      }

      if (/status\s*=\s*'ACTIVE'/i.test(sql)) {
        filtered = filtered.filter(s => s.status === 'ACTIVE');
      }

      if (/mode\s*=\s*'DYNAMIC_QR'/i.test(sql)) {
        filtered = filtered.filter(s => s.mode === 'DYNAMIC_QR');
      } else if (/mode\s*=\s*'CODE'/i.test(sql)) {
        filtered = filtered.filter(s => s.mode === 'CODE');
      }

      return withClassDetails(filtered) as any;
    }

    // SELECT attendance_records
    if (cleanSql.includes('FROM ATTENDANCE_RECORDS')) {
      const allRecords = Array.from(this.records.values());
      if (cleanSql.includes('SESSION_ID = $1 AND STUDENT_ID = $2')) {
        return allRecords.filter(r => r.session_id === params[0] && r.student_id === params[1]) as any;
      }
      if (cleanSql.includes('SESSION_ID =') || cleanSql.includes('.SESSION_ID =')) {
        const sid = params[0];
        const recs = allRecords.filter(r => r.session_id === sid);
        return recs.map(r => {
          const u = this.users.get(r.student_id);
          return {
            ...r,
            name: u ? u.name : '',
            enrollment_number: u ? u.student_id : ''
          };
        }) as any;
      }
      return allRecords as any;
    }

    return [];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    const cleanSql = sql.trim().toUpperCase();

    // INSERT INTO attendance_sessions
    if (cleanSql.startsWith('INSERT INTO ATTENDANCE_SESSIONS')) {
      const [id, class_id, teacher_id, mode, current_code, session_secret, started_at, status] = params;
      this.sessions.set(id, {
        id, class_id, teacher_id, mode, current_code, session_secret, started_at, status
      });
      return;
    }

    // UPDATE attendance_sessions
    if (cleanSql.startsWith('UPDATE ATTENDANCE_SESSIONS')) {
      if (cleanSql.includes('SET STATUS = \'CLOSED\'') || cleanSql.includes('STATUS = $1')) {
        const id = params[params.length - 1];
        const s = this.sessions.get(id);
        if (s) {
          s.status = 'CLOSED';
          s.ended_at = new Date().toISOString();
        }
      } else if (cleanSql.includes('CURRENT_CODE =')) {
        const newCode = params[0];
        const id = params[1];
        const s = this.sessions.get(id);
        if (s) s.current_code = newCode;
      }
      return;
    }

    // INSERT INTO users
    if (cleanSql.startsWith('INSERT INTO USERS')) {
      const id = params[0];
      const name = params[1];
      const email = params[2];
      const role = params.length === 5 ? params[3] : 'TEACHER';
      const password_hash = params[params.length - 1];
      this.users.set(id, {
        id,
        name,
        email,
        role,
        password_hash,
        created_at: new Date().toISOString()
      });
      return;
    }

    // INSERT INTO classes
    if (cleanSql.startsWith('INSERT INTO CLASSES')) {
      const [id, name, course, teacher_id] = params;
      this.classes.set(id, {
        id,
        name,
        course,
        teacher_id,
        created_at: new Date().toISOString()
      });
      return;
    }

    // INSERT INTO class_enrollments
    if (cleanSql.startsWith('INSERT INTO CLASS_ENROLLMENTS')) {
      const [id, class_id, student_id, status] = params;
      this.enrollments.set(`${class_id}_${student_id}`, {
        id,
        class_id,
        student_id,
        status: status || 'ACTIVE'
      });
      return;
    }

    // INSERT INTO attendance_records
    if (cleanSql.startsWith('INSERT INTO ATTENDANCE_RECORDS')) {
      const [id, session_id, student_id, marked_at, status, verification_method] = params;
      const key = `${session_id}_${student_id}`;
      if (this.records.has(key)) {
        const err: any = new Error('Duplicate key violation');
        err.code = '23505'; // Postgres unique violation error code
        throw err;
      }
      this.records.set(key, {
        id, session_id, student_id, marked_at, status, verification_method
      });
      return;
    }
  }
}

// Global Singleton Database Instance
const databaseUrl = process.env.DATABASE_URL || '';
export const db: DatabaseAdapter = databaseUrl
  ? new PostgresAdapter(databaseUrl)
  : new MemoryRelationalAdapter();
