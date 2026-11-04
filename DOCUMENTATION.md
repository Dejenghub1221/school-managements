# School Management System (SMS) — Complete Workflow & System Documentation

> **Comprehensive Architecture, Operational Workflows, Security Model & Technical Reference Guide**  
> *Version 2.0 · Production Multi-Role Web Application*

---

## Table of Contents
1. [Executive Overview & System Architecture](#1-executive-overview--system-architecture)
2. [User Roles, Permissions & Security Architecture](#2-user-roles-permissions--security-architecture)
   - [2.1 Role Definitions & Permission Matrix](#21-role-definitions--permission-matrix)
   - [2.2 Password Governance: Admin Reset vs. Self-Service Change](#22-password-governance-admin-reset-vs-self-service-change)
   - [2.3 Data Visibility & Scoping Rules](#23-data-visibility--scoping-rules)
3. [End-to-End System Workflows](#3-end-to-end-system-workflows)
   - [3.1 Workflow 1: Student Enrollment & Academic Lifecycle](#31-workflow-1-student-enrollment--academic-lifecycle)
   - [3.2 Workflow 2: Teacher Instructional & Classroom Workflow](#32-workflow-2-teacher-instructional--classroom-workflow)
   - [3.3 Workflow 3: Student Learning & LMS Engagement Workflow](#33-workflow-3-student-learning--lms-engagement-workflow)
   - [3.4 Workflow 4: Parent Engagement & Fee Payment Approval Workflow](#34-workflow-4-parent-engagement--fee-payment-approval-workflow)
   - [3.5 Workflow 5: Administrative Governance, Auditing & Reporting](#35-workflow-5-administrative-governance-auditing--reporting)
4. [Database Schema & Data Model Reference](#4-database-schema--data-model-reference)
5. [API Endpoint Catalog](#5-api-endpoint-catalog)
6. [Deployment & Environment Operations](#6-deployment--environment-operations)

---

## 1. Executive Overview & System Architecture

The **School Management System (SMS)** is an integrated, enterprise-grade educational ERP and Learning Management System (LMS) designed for modern K-12 and secondary schools. The system unifies academic grading, attendance roll-calls, timetable orchestration, homework submissions, digital learning modules, tuition fee billing with mandatory payment receipt approval, and multi-child parent communication into a cohesive platform.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (React 18 + Vite)                  │
│   ┌───────────────┐ ┌────────────────┐ ┌───────────────┐ ┌───────────┐ │
│   │ Administrator │ │ Teacher Portal │ │ Student App   │ │ Parent App│ │
│   │  (Full ERP)   │ │  (Classroom)   │ │ (Assignments) │ │(8 Modules)│ │
│   └───────┬───────┘ └───────┬────────┘ └───────┬───────┘ └─────┬─────┘ │
└───────────┼─────────────────┼──────────────────┼───────────────┼───────┘
            │                 │                  │               │
            ▼                 ▼                  ▼               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        REST API GATEWAY & MIDDLEWARE                   │
│   • Express.js Server (Node.js 20+)                                    │
│   • JWT Auth & Dynamic Scoping (`allow`, `ownStudentIds`, `myClasses`) │
│   • Request Validation & Rate Limiting                                 │
│   • Automated Audit Logging (`audit_logs`)                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PERSISTENCE & STORAGE                          │
│   • PostgreSQL / Supabase Database with SSL Connection Pooling         │
│   • 20+ Normalized Relational Tables                                   │
│   • Automated Schema Migrations on Startup                             │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Technical Characteristics
* **Frontend**: React 18, Vite, React Router 6, pure responsive CSS (custom theme engine supporting dynamic color scales, light/dark themes, and Amharic/English multi-language localization via `LangContext`).
* **Backend**: Express.js REST API with modular routers, database transactions, bcrypt password hashing, and stateless JWT authorization.
* **Database**: PostgreSQL (hosted on Supabase) utilizing a single persistent connection pool with SSL certificate handling.
* **Security**: Role-Based Access Control (RBAC), row-level visibility filtering, strict approver segregation for financial transactions, and immutable audit logging.

---

## 2. User Roles, Permissions & Security Architecture

### 2.1 Role Definitions & Permission Matrix

The application enforces four distinct user personas:

| Role | Intended User | Default Nav Access | Write Capabilities |
| :--- | :--- | :--- | :--- |
| **`admin`** | School Principal, Registrar, Finance Director | All 18 modules (Dashboard, Portals, Core entities, Fees, Settings, LMS) | Global write & approval access across all entities, settings, fee approvals, and password resets. |
| **`teacher`** | Classroom Teachers & Subject Instructors | Dashboard, LMS, Students (read), Classes, Attendance, Exams, Assignments, Timetable, Reports | Roll-call attendance marking, assignment creation & grading, exam marks entry, leave requests. Restricted to assigned classes. |
| **`student`** | Enrolled Students | Dashboard, Student App, LMS, Exams, Assignments, Timetable, Library, Fees (read), Attendance | Homework submission, LMS quiz attempts, self-service password change, profile management. |
| **`parent`** | Parents & Legal Guardians | Dashboard, Family Portal / Parent App, LMS, Exams, Assignments, Timetable, Fees, Attendance | Fee payment submission with receipt attachment, absence notices, teacher messaging, self-service password change. |

#### Backend Permission Matrix (`PM` in `server/src/API/auth.js`)
* `r` = Read-only inspection.
* `w` = Full write/mutation authorization.
* Admin inherently inherits `'w'` across all operational scopes.

```javascript
const PM = {
  teacher: { dashboard: 'r', teacherApp: 'w', students: 'r', teachers: 'r', classes: 'r', subjects: 'r', attendance: 'w', exams: 'w', assignments: 'w', parents: 'r', timetable: 'r', library: 'r', reports: 'r', lms: 'w' },
  student: { dashboard: 'r', studentApp: 'w', students: 'r', classes: 'r', subjects: 'r', exams: 'r', assignments: 'r', timetable: 'r', library: 'r', fees: 'r', attendance: 'r', lms: 'w' },
  parent:  { dashboard: 'r', familyPortal: 'w', parentApp: 'w', students: 'r', classes: 'r', subjects: 'r', exams: 'r', assignments: 'r', timetable: 'r', fees: 'r', attendance: 'r', lms: 'r' }
};
```

---

### 2.2 Password Governance: Admin Reset vs. Self-Service Change

The system establishes an institutional-grade credential management policy that strictly separates **administrative password resets** from **user self-service password changes**:

```
                       ┌──────────────────────────────┐
                       │     Forgot Password Flow     │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                      [ User clicks "Forgot Password?" ]
                                      │
                                      ▼
                      ┌──────────────────────────────┐
                      │ Displays Admin Contact Modal │
                      │  • Email: admin@school.com   │
                      │  • Phone: +251 91 123 4567   │
                      └──────────────┬───────────────┘
                                      │
                                      ▼
                      ┌──────────────────────────────┐
                      │    Admin Performs Reset      │
                      │ (Manual or DB Level in users)│
                      │  • password_status =         │
                      │    'Reset by Admin'          │
                      │  • must_change_password=true │
                      └──────────────┬───────────────┘
                                      │
                                      ▼
                        [ User Logs in with New Pass ]
                                      │
                                      ▼
                     ┌────────────────────────────────┐
                     │ User Changes Password in       │
                     │ Profile (Self-Service)         │
                     │  • Verifies Current Password   │
                     │  • password_status =           │
                     │    'Changed by User'           │
                     │  • must_change_password=false  │
                     └────────────────────────────────┘
```

#### Key Rules:
1. **Admin-Only Reset**: Non-admin users cannot trigger an automated unauthenticated email/SMS reset. Only an administrator can reset passwords manually in the user settings or directly in the `users` table. Upon an admin reset:
   * `password_status` is stamped as `'Reset by Admin'`.
   * `password_reset_by` stores the administrator username.
   * `must_change_password` is flagged `true`.
2. **User Self-Service Password Change**: Any authenticated user (Teacher, Student, Parent, Admin) can update their credentials at any time in [`Profile.jsx`](file:///d:/BIB/document/school-management/school-management/client/src/pages/Profile.jsx):
   * Endpoint: `POST /api/profile/change-password`.
   * Requires providing and verifying the existing `currentPassword` with bcrypt.
   * Enforces minimum 6-character length and confirmation match.
   * Upon successful update, `password_status` transitions to `'Changed by User'`, and `must_change_password` is set to `false`.
3. **Login Screen Forgotten Button**: Located directly underneath the "Sign in" button. Clicking it presents an informative modal with official school administration contact channels.

---

### 2.3 Data Visibility & Scoping Rules

To prevent data leakage between classes, students, and parents, backend routes enforce row-level scoping (`server/src/routes/crud.js`):
* **Fees Visibility**: Teachers are strictly barred from viewing fees (`403 Forbidden`). Parents can only view fees where `student` matches their linked children (`student_parents` table). Students only view their own invoice.
* **Exams & Assignments Visibility**: Teachers can only view or post assignments and exams for classes assigned to them in `classes` or `teaching_assignments`. Students and parents only view items targeted to `'All'` or their specific class section.
* **Marks Visibility**: Teachers only grade subjects they instruct. Students and parents only see their personal verified grades.

---

## 3. End-to-End System Workflows

### 3.1 Workflow 1: Student Enrollment & Academic Lifecycle

```
[ Admissions / Registrar ]
           │
           ▼
1. Register Student (ID S0001, Name, Class 7A, Guardian P01)
           │
           ├─► Auto-create Mark records for core subjects (Math, Eng, Sci, etc.)
           ├─► Link Guardian in student_parents (is_primary = true)
           └─► Audit Log created (CREATE / students)
           │
           ▼
2. Daily Roll-Call Attendance (Teacher / Admin marks Present, Absent, Late, Excused)
           │
           ▼
3. Continuous Assessment & Terminal Exams (Exams scheduled -> Marks entered 0-100)
           │
           ▼
4. GPA & Grading Computation (Calculates Average %, Grade A-F, Class Rank)
           │
           ▼
5. Report Card Generation (Official Printable Report Card with Principal Verification)
```

1. **Student Registration**: Admin navigates to `/students` and adds student details (ID prefixed with `S`, class, guardian phone, address). Upon creation:
   * Zero-initialized marks rows are generated across all core subjects.
   * Guardian relation is linked in `student_parents`.
2. **Daily Attendance**: Handled either school-wide via `/attendance` or directly inside the Teacher Portal for specific class periods.
3. **Assessment & Grading**: Handled in `/results` and `/exams`. Scores are stored in `marks` table with teacher comments.
4. **Report Card**: Generates end-of-term summary reports containing GPA, class rank, subject marks, and teacher remarks.

---

### 3.2 Workflow 2: Teacher Instructional & Classroom Workflow

The Teacher Portal ([`TeacherApp.jsx`](file:///d:/BIB/document/school-management/school-management/client/src/pages/TeacherApp.jsx)) provides an all-in-one hub for educators:

```
[ Teacher Signs In ]
       │
       ├─► 1. Class Roster: Inspect student attendance rates, guardian phone & status
       │
       ├─► 2. Fast Attendance: 1-click toggle (Present / Absent / Late / Excused)
       │
       ├─► 3. Assignment Engine:
       │      • Create Assignment (Title, Class, Subject, Due Date)
       │      • Inspect Student Submissions & File Attachments
       │      • Grade (0-100) & Provide Written Feedback
       │
       ├─► 4. Gradebook: Direct marks entry with automated letter grade calculation
       │
       ├─► 5. Timetable Schedule: View daily periods, class rooms, and subject slots
       │
       └─► 6. Leave Requests: Submit absence notice with cover teacher designation
```

* **Assignment Grading Loop**: Teachers open an assignment, review attached documents submitted by students, enter scores (0–100) and qualitative feedback. The status updates to `'Graded'`, immediately alerting the student and parent.
* **Teacher Absence & Cover System**: If a teacher takes leave, they submit a request specifying dates, reason, and an eligible colleague from the same faculty. Admin approves the request, temporarily remapping `teaching_assignments` to the cover teacher.

---

### 3.3 Workflow 3: Student Learning & LMS Engagement Workflow

The Student Portal ([`StudentApp.jsx`](file:///d:/BIB/document/school-management/school-management/client/src/pages/StudentApp.jsx)) and LMS ([`Lms.jsx`](file:///d:/BIB/document/school-management/school-management/client/src/pages/Lms.jsx)) empower independent student learning:

```
[ Student Signs In ]
       │
       ├─► Academic Progress Dashboard (Term Average, Attendance Rate, Class Standing)
       │
       ├─► Homework Module:
       │      • View Open Assignments & Due Dates
       │      • Attach Files & Write Online Responses
       │      • Submit for Grading (Status: Submitted ➔ Graded)
       │      • Review Teacher Feedback & Scores
       │
       ├─► LMS Learning Hub:
       │      • Enrolled Courses (Filtered by Student Class e.g. 7A)
       │      • Step-by-Step Lesson Modules & Videos
       │      • Interactive Quizzes (Instant Scoring & Pass/Fail Metrics)
       │      • Lesson Progress Tracking (0 - 100% Course Completion)
       │
       └─► Examination Timetable & Digital Clearance Inspection
```

* **File Attachments**: Students can submit files up to 10MB in format (PDF, PNG, JPEG, DOCX).
* **LMS Progression**: Lessons are marked completed upon reading; quiz attempts record highest score, time taken, and pass rate.

---

### 3.4 Workflow 4: Parent Engagement & Fee Payment Approval Workflow

This critical workflow encompasses financial compliance, payment receipt verification, and parent communications.

#### Complete Payment Approval State Machine

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PARENT ACTION                                   │
│  1. Parent logs into Parent Portal (/parent-app).                      │
│  2. Navigates to "Fee Payment" module.                                 │
│  3. Selects unpaid invoice (e.g., F034 - Term 1 Tuition).              │
│  4. Enters Payment Details (Telebirr, CBE Birr, Card, Wire).           │
│  5. Inputs Transaction Reference Code (e.g. FT26118492).               │
│  6. MANDATORY: Attaches Payment Receipt (Photo/PDF up to 8MB).         │
│  7. Clicks "Submit for Approval".                                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SUBMISSION STATE: "PENDING"                       │
│  • Record created in `fee_payment_submissions` (status: 'Pending').    │
│  • Invoice in `fees` table updated: status='Pending'.                  │
│  • `pending_submission_id` links the submission.                       │
│  • IMPORTANT: Paid amount is NOT incremented; balance NOT cleared!     │
│  • Parent Portal displays amber "Pending Approval" pill.               │
│  • "Pay Online" button is hidden to prevent double payment.            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      APPROVER REVIEW & VERIFICATION                    │
│  • Finance Approver (Admin) opens Fees & Payments (/fees).             │
│  • Dedicated "Payment Approval Workflow" card displays live counter.   │
│  • Approver clicks "Review Receipt" on the pending item.               │
│  • Full Receipt Image / Document displayed with Zoom & Download.       │
│  • Approver cross-checks with school bank statement.                   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
         [ Option A: APPROVE ]             [ Option B: REJECT ]
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐ ┌──────────────────────────────┐
│       STATUS UPDATES TO "PAID"       │ │      STATUS REVERTED         │
│ 1. `fee_payment_submissions` status  │ │ 1. `fee_payment_submissions` │
│    marked as 'Approved'.             │ │    marked as 'Rejected'.     │
│ 2. `fees.paid` incremented by amount.│ │ 2. `fees.status` reverted    │
│ 3. `fees.status` set to 'Paid'       │ │    to 'Unpaid' or 'Partial'. │
│    (or 'Partial' if partial payment).│ │ 3. `fees.pending_submission_ │
│ 4. Official record created in        │ │    id` cleared to NULL.      │
│    `payments` with `RCP_xxxxxx`.     │ │ 4. Reviewer note stored &    │
│ 5. Audit Log logged.                 │ │    surfaced to parent.       │
│ 6. Parent Portal shows "✓ Settled".  │ │ 5. Parent can re-upload.     │
└───────────────────┬──────────────────┘ └──────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     EXAMINATION FINANCIAL CLEARANCE                    │
│  • Once fees are settled (Balance = $0), student is automatically      │
│    cleared for term exams.                                             │
│  • Parent or Student can click "Examination Clearance Slip" to view    │
│    and print official certificate bearing Finance Registrar Seal.      │
└────────────────────────────────────────────────────────────────────────┘
```

#### Strict Access Restriction Rules
* **No Direct Parent Settlement**: Parents cannot mark payments as "Paid" or use "Set Settled". Calling `POST /fees/:id/pay` or `PUT /fees/:id` with parent credentials returns `403 Forbidden`.
* **Zero Premature Settling**: Uploading a receipt never clears the balance automatically. Clearance only occurs after human review by an authorized administrator.

#### Other Parent Portal Modules
1. **Attendance**: Live monthly calendar and attendance percentages for each child.
2. **Academic Results**: Subject breakdowns, continuous marks, and official downloadable report cards.
3. **Teacher Messaging**: Direct two-way messaging with assigned subject teachers with meeting scheduling.
4. **Absence Reporting**: Parents can report upcoming student absences with dates and medical/personal reasons.
5. **Homework Monitoring**: Real-time visibility into child homework completion and teacher feedback.
6. **Class Timetable**: Schedule of daily classes and instructors.

---

### 3.5 Workflow 5: Administrative Governance, Auditing & Reporting

1. **Bulk Class Fee Structure**: Admins configure class-wide fees (e.g. Class 7A Term 1 Tuition = $600). The system updates or initializes invoices for all enrolled students in that class in a single transaction.
2. **Library Circulation**: Tracks physical textbooks and reference materials. Validates that issued copies cannot exceed total copies.
3. **Audit Logging Engine**:
   Every state-altering event writes an immutable record to `audit_logs` containing:
   * `username` & `role`
   * `action` (e.g. `CREATE`, `UPDATE`, `DELETE`, `APPROVE_FEE_PAYMENT`, `REJECT_FEE_PAYMENT`, `SUBMIT_ASSIGNMENT`, `RESET_PASSWORD`)
   * `table_name` & `record_id`
   * `timestamp` (PostgreSQL `NOW()`)
   * `details` (JSON payload of modified fields)
4. **Financial & Academic Reporting**: Aggregates total revenue billed vs. collected, outstanding debt aging, student-teacher ratios, and grade distribution charts.

---

## 4. Database Schema & Data Model Reference

```mermaid
erDiagram
    users {
        int id PK
        varchar username
        varchar password_hash
        varchar role
        varchar name
        varchar email
        varchar phone
        varchar password_status
        varchar password_reset_by
        timestamp password_reset_at
        boolean must_change_password
        varchar student_id FK
        varchar teacher_id FK
        varchar parent_id FK
    }

    students {
        varchar id PK
        varchar name
        varchar cls
        varchar gender
        date dob
        varchar phone
        varchar guardian FK
        varchar status
        text address
    }

    teachers {
        varchar id PK
        varchar name
        varchar subject
        text_array classes
        varchar phone
        varchar email
        varchar status
    }

    classes {
        varchar name PK
        varchar teacher FK
        varchar room
    }

    fees {
        varchar id PK
        varchar student FK
        numeric amount
        numeric paid
        varchar term
        date date
        varchar status
        varchar pending_submission_id FK
    }

    fee_payment_submissions {
        varchar id PK
        varchar fee_id FK
        varchar student_id FK
        varchar parent_id FK
        varchar parent_name
        numeric amount
        varchar payment_method
        varchar reference_code
        varchar receipt_filename
        text receipt_file
        varchar status
        timestamp submitted_at
        varchar reviewed_by
        timestamp reviewed_at
        text review_notes
    }

    payments {
        varchar id
        varchar receipt_id PK
        varchar student_id FK
        date date
        numeric amount
    }

    assignments {
        varchar id PK
        varchar title
        varchar subject
        varchar cls
        date due
        varchar status
        varchar teacher_id FK
    }

    submissions {
        varchar id PK
        varchar assignment_id FK
        varchar student_id FK
        text content
        varchar file_name
        text file_data
        timestamp submitted_at
        numeric grade
        text feedback
        varchar status
    }

    marks {
        int id PK
        varchar student_id FK
        varchar subject
        numeric mark
        text comments
        varchar exam_id FK
    }

    attendance {
        int id PK
        varchar student_id FK
        date date
        varchar status
        varchar period
    }

    audit_logs {
        int id PK
        varchar user_name
        varchar role
        varchar action
        varchar target_entity
        varchar target_id
        jsonb details
        timestamp created_at
    }

    students ||--o{ fees : "billed"
    fees ||--o{ fee_payment_submissions : "payments submitted for"
    fees ||--o{ payments : "reconciled in"
    students ||--o{ marks : "achieves"
    students ||--o{ attendance : "logged"
    assignments ||--o{ submissions : "submitted to"
    students ||--o{ submissions : "authors"
```

---

## 5. API Endpoint Catalog

### Authentication & Profile (`/api`)
* `POST /api/login`: Authenticates credentials; returns signed JWT token, user profile, role, and permission map.
* `POST /api/forgot-password`: Returns official administrator contact information for manual reset.
* `GET /api/profile`: Retrieves current authenticated user profile, linked identity, and contact cards.
* `PUT /api/profile`: Updates user address, bio, avatar photo, emergency contacts.
* `POST /api/profile/change-password`: Verifies `currentPassword` and updates password (`password_status: 'Changed by User'`).

### Fee Tracking & Approvals (`/api/fee-approvals`, `/api/parent-app`)
* `POST /api/parent-app/pay-fee`: Parent submits payment amount, method, ref code, and **mandatory receipt file**. Sets status to `Pending`.
* `GET /api/fee-approvals/submissions`: Approver query listing submissions with status filter (`Pending`, `Approved`, `Rejected`).
* `GET /api/fee-approvals/submissions/:id`: Retrieves individual submission with high-resolution receipt document.
* `POST /api/fee-approvals/submissions/:id/approve`: Approver approves payment; updates fee to `Paid`/`Partial`, creates `payments` row with receipt number.
* `POST /api/fee-approvals/submissions/:id/reject`: Approver rejects payment with mandatory review notes; reverts fee status.
* `POST /api/fees/:id/pay`: Direct admin cash payment recording (forbidden to parents).

### Learning Management System (`/api/lms`)
* `GET /api/lms/courses`: Lists available courses (filtered by user class or role).
* `POST /api/lms/courses`: Teacher/Admin creates course module.
* `GET /api/lms/courses/:id/lessons`: Retrieves lesson curriculum, videos, and reading materials.
* `POST /api/lms/lessons/:id/complete`: Marks lesson progress for student.
* `POST /api/lms/quizzes/:id/submit`: Submits quiz responses and computes score.

### Portals & Classroom Operations
* `GET /api/parent-app/portal`: Bundles children summary, fee invoices, approval history, attendance, marks, and announcements.
* `GET /api/teacher-app/overview`: Returns roster, timetable schedule, and assigned subjects for logged-in teacher.
* `GET /api/student-app/overview`: Returns academic standing, upcoming homework, and attendance rate for logged-in student.
* `POST /api/attendance/bulk`: Records roll-call attendance for a class on a specified date.
* `POST /api/submissions`: Student submits homework with attachment.
* `PUT /api/submissions/:id/grade`: Teacher records grade (0-100) and feedback comments.

---

## 6. Deployment & Environment Operations

### System Requirements
* **Node.js**: v20.0.0 or higher
* **Database**: PostgreSQL 14+ (or Supabase Postgres instance)
* **Package Manager**: npm 9+ or pnpm 8+

### Environment Configuration (`server/.env`)
```ini
PORT=4000
DATABASE_URL=postgresql://user:password@host:5432/postgres?sslmode=require
JWT_SECRET=production-secure-random-jwt-key
DEMO_PASSWORD=school123
CLIENT_URL=http://localhost:5173
```

### Application Execution
```bash
# 1. Install dependencies
npm run install-all

# 2. Launch production build
npm run build
npm start

# 3. Development Mode
# Terminal 1 (Backend API):
cd server && npm run dev    # Listens on http://localhost:4000

# Terminal 2 (Frontend Client):
cd client && npm run dev    # Listens on http://localhost:5173
```

---
*Documented and certified for School Management System v2.0.*

