-- ============================================================
-- School Management — PostgreSQL Schema
-- Run this once on your Supabase / PostgreSQL database.
-- Supabase: paste into SQL Editor and click Run.
-- psql:     psql $DATABASE_URL -f schema.sql
-- ============================================================

-- Drop in reverse dependency order (safe for re-runs)
DROP TABLE IF EXISTS payments   CASCADE;
DROP TABLE IF EXISTS fees        CASCADE;
DROP TABLE IF EXISTS marks       CASCADE;
DROP TABLE IF EXISTS attendance  CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS exams       CASCADE;
DROP TABLE IF EXISTS library     CASCADE;
DROP TABLE IF EXISTS subjects    CASCADE;
DROP TABLE IF EXISTS classes     CASCADE;
DROP TABLE IF EXISTS students    CASCADE;
DROP TABLE IF EXISTS teachers    CASCADE;
DROP TABLE IF EXISTS parents     CASCADE;
DROP TABLE IF EXISTS settings    CASCADE;

-- ── parents ──────────────────────────────────────────────────
CREATE TABLE parents (
  id    TEXT PRIMARY KEY,          -- e.g. P01
  name  TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- ── teachers ─────────────────────────────────────────────────
CREATE TABLE teachers (
  id      TEXT PRIMARY KEY,        -- e.g. T01
  name    TEXT NOT NULL,
  subject TEXT,
  classes TEXT[],                  -- e.g. {7A,8B}
  phone   TEXT,
  email   TEXT,
  status  TEXT DEFAULT 'Active'
);

-- ── students ─────────────────────────────────────────────────
CREATE TABLE students (
  id       TEXT PRIMARY KEY,       -- e.g. S1001
  name     TEXT NOT NULL,
  cls      TEXT NOT NULL,
  gender   TEXT,
  dob      TEXT,
  phone    TEXT,
  guardian TEXT REFERENCES parents(id) ON DELETE SET NULL,
  status   TEXT DEFAULT 'Active',
  address  TEXT
);

-- ── classes ──────────────────────────────────────────────────
CREATE TABLE classes (
  id      TEXT PRIMARY KEY,        -- e.g. C1
  name    TEXT NOT NULL,
  teacher TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  room    TEXT
);

-- ── subjects ─────────────────────────────────────────────────
CREATE TABLE subjects (
  id   TEXT PRIMARY KEY,           -- e.g. U1
  name TEXT NOT NULL,
  code TEXT
);

-- ── exams ────────────────────────────────────────────────────
CREATE TABLE exams (
  id     TEXT PRIMARY KEY,         -- e.g. E1
  name   TEXT NOT NULL,
  cls    TEXT,
  date   TEXT,
  status TEXT DEFAULT 'Scheduled'
);

-- ── assignments ──────────────────────────────────────────────
CREATE TABLE assignments (
  id      TEXT PRIMARY KEY,        -- e.g. A1
  title   TEXT NOT NULL,
  subject TEXT,
  cls     TEXT,
  due     TEXT,
  status  TEXT DEFAULT 'Open'
);

-- ── library ──────────────────────────────────────────────────
CREATE TABLE library (
  id     TEXT PRIMARY KEY,         -- e.g. B1
  title  TEXT NOT NULL,
  author TEXT,
  copies INTEGER DEFAULT 0,
  issued INTEGER DEFAULT 0
);

-- ── fees ─────────────────────────────────────────────────────
CREATE TABLE fees (
  id      TEXT PRIMARY KEY,        -- e.g. F001
  student TEXT REFERENCES students(id) ON DELETE CASCADE,
  term    TEXT,
  amount  NUMERIC(10,2) DEFAULT 0,
  paid    NUMERIC(10,2) DEFAULT 0,
  date    TEXT,
  status  TEXT DEFAULT 'Unpaid'
);

-- ── payments ─────────────────────────────────────────────────
CREATE TABLE payments (
  id          TEXT,
  receipt_id  TEXT,
  student_id  TEXT REFERENCES students(id) ON DELETE CASCADE,
  date        TEXT,
  amount      NUMERIC(10,2)
);

-- ── marks  (one row per student+subject) ─────────────────────
CREATE TABLE marks (
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  mark       INTEGER DEFAULT 0,
  PRIMARY KEY (student_id, subject)
);

-- ── attendance (one row per student+date) ────────────────────
CREATE TABLE attendance (
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  status     CHAR(1) NOT NULL CHECK (status IN ('P','A','L','E')),
  PRIMARY KEY (student_id, date)
);

-- ── settings (single row) ─────────────────────────────────────
CREATE TABLE settings (
  id     INTEGER PRIMARY KEY DEFAULT 1,
  school TEXT    DEFAULT 'ABC Academy',
  year   TEXT    DEFAULT '2026/27',
  cur    TEXT    DEFAULT '$',
  theme  TEXT    DEFAULT 'system',
  CHECK (id = 1)          -- only one row allowed
);

INSERT INTO settings DEFAULT VALUES ON CONFLICT DO NOTHING;
