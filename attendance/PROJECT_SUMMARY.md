# PRAVAHAx ERP — Smart Proximity-Based Classroom Attendance System
> **AI Context & Technical System Specification**  
> *Last Updated: September 2026*  
> *Target Audience: AI Coding Assistants, System Architects, Full-Stack Developers*

---

## 1. Executive Summary & Problem Statement

### 1.1 The Problem
Traditional college and university attendance systems suffer from major vulnerabilities and inefficiencies:
1. **Proxy Attendance (Buddy Punching):** Students share roll numbers, static QR codes, or one-time links via WhatsApp/Telegram to friends who are not physically in the classroom.
2. **GPS Spoofing & Multipath Issues:** Traditional GPS-based mobile attendance fails indoors (concrete buildings, lecture halls) and can easily be bypassed using mock location apps.
3. **Manual Roll Calls:** Wastes 10–15 minutes of every lecture, disrupting learning time and causing manual data entry errors.
4. **Hardware Complexity:** Biometric fingerprint machines cause bottlenecks at classroom doors and incur high hardware/maintenance costs.

### 1.2 Our Solution
The **PRAVAHAx ERP Attendance Module** is an anti-proxy, zero-hardware, real-time classroom attendance engine that verifies **physical classroom proximity** using a **multi-factor cryptographic validation pipeline**:
1. **Local Wi-Fi Subnet Verification:** Confirms the student's device is connected to the exact same local Wi-Fi router / access point subnet as the instructor's device.
2. **Dynamic Time-Rotating PIN (Visual Challenge):** Generates an ephemeral 4-digit code displayed only on the classroom projector/teacher screen, rotating every **10 seconds**. This prevents students inside the room from texting or sharing the code to peers outside.
3. **Real-time Live Sync via WebSockets (Socket.IO):** Instant bi-directional feedback between teacher and student portals.
4. **Device Fingerprinting & One-Time Mark Validation:** Detects duplicate attempts per device and prevents multi-marking for friends from a single phone.

---

## 2. System Architecture & Tech Stack

```
                     +--------------------------------------------------+
                     |         Classroom Wi-Fi Network / Router         |
                     |                 (e.g., 192.168.1.x)              |
                     +--------------------------------------------------+
                                      |                       |
               (Teacher's Laptop)     |                       | (Student's Phone)
         +----------------------------v----+            +-----v----------------------------+
         |        Teacher Dashboard        |            |          Student Portal          |
         |  - Displays Rotating 10s PIN    |            |  - Scans Local Subnet            |
         |  - Real-time Student Live Feed  |            |  - Enters Classroom PIN          |
         |  - Session Controls & Logs      |            |  - Instant Verification Status   |
         +---------------------------------+            +----------------------------------+
                         |                                               |
             (WebSocket: pin_rotated,                      (HTTP: /scan, /mark)
              student_marked)                                            |
                         |                                               |
                         +---------------------> <-----------------------+
                                                   |
                                    +--------------v---------------+
                                    |     Backend Service (Node)    |
                                    |  - Express 5 API on :4001    |
                                    |  - Socket.IO Real-Time Hub   |
                                    |  - Subnet IP Parser          |
                                    |  - 10s PIN Rotation Engine   |
                                    +--------------+---------------+
                                                   |
                                    +--------------v---------------+
                                    |     Database Layer (SQLite)   |
                                    |  - users                     |
                                    |  - classes                   |
                                    |  - attendance_sessions       |
                                    |  - attendance_records        |
                                    +------------------------------+
```

### 2.1 Technology Stack Details

| Layer | Technology | Key Libraries / Features |
| :--- | :--- | :--- |
| **Frontend** | React 18 + TypeScript + Vite | `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`, `socket.io-client` |
| **Backend** | Node.js + Express 5 + TypeScript | `tsx`, `express`, `cors`, `socket.io`, `dotenv`, `crypto` |
| **Database** | SQLite3 (Embedded) / Ready for Postgres | `sqlite3`, `pg` (PostgreSQL driver already in dependencies) |
| **Networking** | HTTPS + WebSockets | Basic SSL for secure local network testing, Vite Reverse Proxy |
| **Real-time Engine** | Socket.IO Server & Client | Rooms (`teacher_room`), broadcast channels |

---

## 3. Core Operational Workflows

### 3.1 Teacher Workflow
1. **Login:** Teacher authenticates (e.g., `teacher@test.com`) and navigates to the Teacher Dashboard.
2. **Start Session:** Teacher clicks **"START ATTENDANCE SESSION"**:
   - Backend creates an active session entry in `attendance_sessions`.
   - Backend records the Teacher's current IP subnet (e.g., `192.168.1`).
   - Backend starts a 10-second interval timer generating random 4-digit PINs (`1000`-`9999`).
   - Active PIN is pushed to the teacher's screen via WebSocket `pin_rotated`.
3. **Live Attendance Monitoring:**
   - As students verify their presence, the teacher's dashboard receives `student_marked` events in real-time.
   - A complete live list of checked-in students is updated without page reload.
4. **Session Audit & Logs:**
   - Teacher views persistent records showing student name, timestamp, verification method (`LOCAL_NETWORK`), and confidence score (`99%`).

### 3.2 Student Workflow
1. **Access Portal:** Student accesses the web portal (`/student`) from their mobile device connected to the classroom Wi-Fi.
2. **Identification:** Student enters their full name (or logs in with institutional credentials).
3. **Proximity Scan (`/api/network/scan`):**
   - Student taps **"Scan Local Wi-Fi for Classes"**.
   - Server extracts student's client IP and checks if their subnet matches the active teacher's subnet.
   - If matched, the student's screen displays **"Connected to Class: [Course Name]"**.
4. **PIN Submission (`/api/attendance/mark`):**
   - Student looks at the classroom screen/projector and enters the active 4-digit PIN.
   - The payload sends `{ student_id, pin, device_id }`.
   - Backend validates:
     1. Subnet match (`teacherSubnet === studentSubnet`).
     2. PIN correctness (`pin === currentNetworkPin`).
     3. No duplicate attendance recorded for this student in this session.
5. **Confirmation:**
   - Student receives an immediate green verification banner: `✓ Attendance Recorded (Wi-Fi Verified)`.

---

## 4. Database Schema & Data Models

The system is managed via SQLite in development (`attendance.db`), architected to seamlessly map to PostgreSQL for production enterprise deployment.

### 4.1 `users` Table
Stores faculty, students, and administrators.
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  role TEXT,           -- 'TEACHER' | 'STUDENT' | 'ADMIN'
  student_id TEXT,     -- Institutional Roll / Enrollment Number
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 `classes` Table
Represents courses and subject sections.
```sql
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT,           -- e.g., 'Data Structures'
  course TEXT,         -- e.g., 'CS101'
  teacher_id TEXT,     -- Foreign Key to users.id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 `attendance_sessions` Table
Manages the temporary live attendance window opened by instructors.
```sql
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT,       -- Foreign Key to classes.id
  teacher_id TEXT,     -- Foreign Key to users.id
  started_at DATETIME,
  expires_at DATETIME,
  status TEXT,         -- 'ACTIVE' | 'CLOSED'
  session_secret TEXT, -- Cryptographic random token
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.4 `attendance_records` Table
The immutable audit log of verified student presence.
```sql
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT,                 -- Foreign Key to attendance_sessions.id
  student_id TEXT,                 -- Foreign Key to users.id
  marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT,                     -- 'PRESENT' | 'ABSENT' | 'LATE'
  verification_method TEXT,        -- 'LOCAL_NETWORK' | 'BLE' | 'QR' | 'BIOMETRIC'
  verification_confidence INTEGER, -- e.g., 99 (Percentage scale)
  device_id_hash TEXT              -- Hash of student device identifier
);
```

---

## 5. API & Communication Protocols

### 5.1 REST Endpoints

| Method | Route | Description | Request Body / Params | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | Authenticate user by email | `{ email: string }` | `{ user: UserObject }` |
| `GET` | `/api/classes/:teacherId` | Retrieve classes assigned to teacher | URL param `teacherId` | `{ classes: Class[] }` |
| `POST` | `/api/register_student` | Quick guest registration for students | `{ name: string }` | `{ user: UserObject }` |
| `POST` | `/api/session/start` | Start live attendance session | `{ class_id, teacher_id }` | `{ session_id, pin, subnet }` |
| `GET` | `/api/network/scan` | Check if student IP shares teacher subnet | *None* | `{ found: boolean, class_name? }` |
| `POST` | `/api/session/stop` | End the current active session | *None* | `{ success: true }` |
| `POST` | `/api/attendance/mark` | Verify proximity & PIN to record attendance | `{ student_id, pin, device_id }` | `{ success: true, message }` |
| `GET` | `/api/attendance/logs` | Fetch comprehensive attendance audit trail | *None* | `{ logs: AttendanceLog[] }` |

### 5.2 Real-time Socket.IO Events

| Event Name | Direction | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `join_teacher_room` | Client -> Server | *None* | Subscribes teacher client to session events |
| `pin_rotated` | Server -> Client | `newPin: string` (e.g. `"4819"`) | Broadcasts new 4-digit PIN every 10s |
| `student_marked` | Server -> Client | `{ id, name, status }` | Notifies teacher room of newly verified student |

---

## 6. Anti-Proxy & Security Measures

1. **Subnet Proximity Enforcement:**
   - Both Teacher and Student must resolve to the same internal Class C subnet (e.g. `192.168.1.0/24`).
   - Prevents off-campus or cellular data check-ins.
2. **10-Second PIN Rolling Window:**
   - Short lifespan prevents a student in class from sharing the PIN on messaging apps before it expires.
3. **Session Secret & Device Integrity:**
   - Attendance submission requires a client device hash (`device_id_hash`), preventing a single student device from submitting attendance on behalf of multiple peers in succession.
4. **Idempotent Mark Validation:**
   - SQLite unique check (`WHERE session_id = ? AND student_id = ?`) stops duplicate submissions.

---

## 7. Current Project Directory Structure

```
attendance/
├── PROJECT_SUMMARY.md            <-- This Master Architecture & AI Summary
├── backend/
│   ├── package.json              <-- Express 5, Socket.IO, SQLite3, TypeScript
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts             <-- Express API, Socket.IO handlers, IP Subnet logic, PIN timer
│       ├── db.ts                 <-- SQLite schema definitions & initial seed data
│       └── attendance.db         <-- Local SQLite database storage
└── frontend/
    ├── package.json              <-- React 18, Vite, Basic SSL, Socket.IO Client
    ├── vite.config.ts            <-- SSL enabled, proxy configuration to :4001
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx               <-- Unified Dual-Portal UI (Teacher & Student Dashboards)
        ├── App.css
        └── index.css
```

---

## 8. Development & Execution Guide

### 8.1 Backend
```bash
cd attendance/backend
npm install
npm run dev # or: npx tsx watch src/server.ts
# Runs on http://localhost:4001
```

### 8.2 Frontend
```bash
cd attendance/frontend
npm install
npm run dev
# Runs on https://localhost:5173 (Self-signed SSL enabled for mobile LAN testing)
```

### 8.3 Testing Workflow Across Devices
1. Connect teacher device (laptop) and student device (phone) to the same Wi-Fi router or mobile hotspot.
2. Run backend and frontend on laptop.
3. Open `https://<laptop-lan-ip>:5173/teacher` on teacher laptop -> click "START ATTENDANCE SESSION".
4. Open `https://<laptop-lan-ip>:5173/student` on mobile device -> enter name -> Scan Wi-Fi -> enter current 4-digit PIN.
5. Instant verification reflects on both screens.

---

## 9. Immediate Roadmap & Planned AI Tasks

For future AI agents working on this project, prioritize the following enhancements:
1. **Modern UI/UX Redesign:**
   - Replace basic inline styles in `App.tsx` with a clean, modern design system (vibrant glassmorphism, responsive mobile-first student portal, dark/light theme, high-visibility PIN display for projector visibility).
2. **Multi-Class & Section Management:**
   - Support multiple simultaneous lectures across different classrooms/professors.
   - Class selection dropdown and timetable synchronization.
3. **Advanced Proximity Alternatives (Fallback Matrix):**
   - **BSSID / Wi-Fi SSID Verification:** Match exact router MAC address where subnets are shared across a campus network.
   - **Soundwave / Ultrasound Pairing:** Ultra-short range acoustic proximity validation.
   - **Dynamic QR Code:** Fallback for lecture halls where students are on cellular data or isolated VLANs.
4. **Enterprise ERP Integration (PRAVAHAx Suite):**
   - Central authentication with JWT/OAuth2 (Single Sign-On).
   - Migration from SQLite to PostgreSQL with Prisma or Drizzle ORM.
   - Export reports to CSV/Excel/PDF, attendance analytics, low attendance warning alerts.
