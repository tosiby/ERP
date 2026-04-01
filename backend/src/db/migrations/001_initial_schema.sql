-- =============================================================
-- KJSIS — KJ School Intelligence System
-- PostgreSQL Schema — Migration 001: Initial Schema
-- =============================================================

-- -------------------------------------------------------
-- EXTENSIONS
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'exam_cell',
  'teacher',
  'vp',
  'principal'
);

CREATE TYPE mark_status AS ENUM (
  'draft',
  'submitted',
  'locked'
);

CREATE TYPE entry_mode AS ENUM (
  'total',
  'component'
);

CREATE TYPE subject_type AS ENUM (
  'regular',
  'term_only'   -- GK, Moral Science — only appears in TERM exams
);

CREATE TYPE component_type AS ENUM (
  'TH',   -- Theory
  'PR',   -- Practical
  'IA'    -- Internal Assessment
);

-- -------------------------------------------------------
-- 1. ACADEMIC YEARS
-- -------------------------------------------------------
CREATE TABLE academic_years (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        VARCHAR(20) NOT NULL UNIQUE,  -- e.g. "2025-2026"
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  is_current   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one academic year can be current
CREATE UNIQUE INDEX uq_academic_years_current
  ON academic_years (is_current)
  WHERE is_current = TRUE;

-- -------------------------------------------------------
-- 2. USERS
-- -------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  mobile          VARCHAR(15)  NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  role            user_role    NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role      ON users (role);
CREATE INDEX idx_users_mobile    ON users (mobile);
CREATE INDEX idx_users_is_active ON users (is_active);

-- -------------------------------------------------------
-- 3. CLASSES  (Grade 1 – 12)
-- -------------------------------------------------------
CREATE TABLE classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_number  SMALLINT    NOT NULL UNIQUE CHECK (grade_number BETWEEN 1 AND 12),
  name          VARCHAR(20) NOT NULL UNIQUE,  -- "Class 1", "Class 12"
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_grade ON classes (grade_number);

-- -------------------------------------------------------
-- 4. DIVISIONS  (A, B, C … per class)
-- -------------------------------------------------------
CREATE TABLE divisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID        NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  name         VARCHAR(5)  NOT NULL,        -- "A", "B", "C"
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, name)
);

CREATE INDEX idx_divisions_class ON divisions (class_id);

-- -------------------------------------------------------
-- 5. STUDENTS
-- -------------------------------------------------------
CREATE TABLE students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_number  VARCHAR(30)  NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  roll_number       SMALLINT     NOT NULL,
  division_id       UUID         NOT NULL REFERENCES divisions (id) ON DELETE RESTRICT,
  academic_year_id  UUID         NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (division_id, roll_number, academic_year_id)
);

CREATE INDEX idx_students_division      ON students (division_id);
CREATE INDEX idx_students_academic_year ON students (academic_year_id);
CREATE INDEX idx_students_admission     ON students (admission_number);

-- -------------------------------------------------------
-- 6. SUBJECTS  (class-based, fully dynamic)
-- -------------------------------------------------------
CREATE TABLE subjects (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100)  NOT NULL,
  code            VARCHAR(20)   NOT NULL,
  class_id        UUID          NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  subject_type    subject_type  NOT NULL DEFAULT 'regular',
  is_elective     BOOLEAN       NOT NULL DEFAULT FALSE,
  elective_group  VARCHAR(50),          -- e.g. 'hindi_french' — NULL when not elective
  display_order   SMALLINT      NOT NULL DEFAULT 0,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, code)
);

CREATE INDEX idx_subjects_class        ON subjects (class_id);
CREATE INDEX idx_subjects_is_elective  ON subjects (is_elective);
CREATE INDEX idx_subjects_elective_grp ON subjects (elective_group) WHERE elective_group IS NOT NULL;

-- -------------------------------------------------------
-- 7. STUDENT_SUBJECTS  (elective choices per student)
-- -------------------------------------------------------
CREATE TABLE student_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id)
);

CREATE INDEX idx_student_subjects_student ON student_subjects (student_id);
CREATE INDEX idx_student_subjects_subject ON student_subjects (subject_id);

-- -------------------------------------------------------
-- 8. TEACHER_SUBJECT_MAP
-- -------------------------------------------------------
CREATE TABLE teacher_subject_map (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  division_id      UUID NOT NULL REFERENCES divisions (id) ON DELETE RESTRICT,
  subject_id       UUID NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, division_id, subject_id, academic_year_id)
);

CREATE INDEX idx_tsm_teacher       ON teacher_subject_map (teacher_id);
CREATE INDEX idx_tsm_division      ON teacher_subject_map (division_id);
CREATE INDEX idx_tsm_subject       ON teacher_subject_map (subject_id);
CREATE INDEX idx_tsm_academic_year ON teacher_subject_map (academic_year_id);

-- -------------------------------------------------------
-- 9. CLASS_TEACHERS
-- -------------------------------------------------------
CREATE TABLE class_teachers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  division_id      UUID NOT NULL REFERENCES divisions (id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (division_id, academic_year_id)   -- one class teacher per division per year
);

CREATE INDEX idx_ct_teacher       ON class_teachers (teacher_id);
CREATE INDEX idx_ct_division      ON class_teachers (division_id);
CREATE INDEX idx_ct_academic_year ON class_teachers (academic_year_id);

-- -------------------------------------------------------
-- 10. EXAMS
-- -------------------------------------------------------
CREATE TABLE exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL,    -- "MT1", "IA1", "TERM1", "TERM2"
  label            VARCHAR(100),            -- "Mid Term 1", "Internal Assessment 1"
  academic_year_id UUID NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
  start_date       DATE,
  end_date         DATE,
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, academic_year_id)
);

CREATE INDEX idx_exams_academic_year ON exams (academic_year_id);
CREATE INDEX idx_exams_is_locked     ON exams (is_locked);

-- -------------------------------------------------------
-- 11. SUBJECT_EXAM_CONFIG
--     Defines total marks + entry mode per subject per exam
-- -------------------------------------------------------
CREATE TABLE subject_exam_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      UUID        NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  exam_id         UUID        NOT NULL REFERENCES exams (id) ON DELETE RESTRICT,
  total_marks     SMALLINT    NOT NULL CHECK (total_marks > 0),
  passing_marks   SMALLINT    NOT NULL CHECK (passing_marks > 0),
  entry_mode      entry_mode  NOT NULL DEFAULT 'total',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, exam_id)
);

CREATE INDEX idx_sec_subject ON subject_exam_config (subject_id);
CREATE INDEX idx_sec_exam    ON subject_exam_config (exam_id);

-- -------------------------------------------------------
-- 12. COMPONENTS
--     TH / PR / IA — only used when entry_mode = 'component'
-- -------------------------------------------------------
CREATE TABLE components (
  id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_exam_config_id UUID          NOT NULL REFERENCES subject_exam_config (id) ON DELETE CASCADE,
  component_type       component_type  NOT NULL,
  max_marks            SMALLINT        NOT NULL CHECK (max_marks > 0),
  display_order        SMALLINT        NOT NULL DEFAULT 0,
  is_active            BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (subject_exam_config_id, component_type)
);

CREATE INDEX idx_components_config ON components (subject_exam_config_id);

-- -------------------------------------------------------
-- 13. MARKS
--     One row per student × subject × exam × component
--     component_id is NULL when entry_mode = 'total'
-- -------------------------------------------------------
CREATE TABLE marks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  subject_id      UUID        NOT NULL REFERENCES subjects (id) ON DELETE RESTRICT,
  exam_id         UUID        NOT NULL REFERENCES exams (id) ON DELETE RESTRICT,
  component_id    UUID        REFERENCES components (id) ON DELETE RESTRICT,  -- NULL = total mode
  teacher_id      UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  marks_obtained  NUMERIC(5,2) NOT NULL CHECK (marks_obtained >= 0),
  is_absent       BOOLEAN     NOT NULL DEFAULT FALSE,
  status          mark_status NOT NULL DEFAULT 'draft',
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One mark row per student / subject / exam / component combination
  UNIQUE (student_id, subject_id, exam_id, component_id)
);

CREATE INDEX idx_marks_student    ON marks (student_id);
CREATE INDEX idx_marks_subject    ON marks (subject_id);
CREATE INDEX idx_marks_exam       ON marks (exam_id);
CREATE INDEX idx_marks_teacher    ON marks (teacher_id);
CREATE INDEX idx_marks_status     ON marks (status);
CREATE INDEX idx_marks_composite  ON marks (exam_id, subject_id, status);

-- -------------------------------------------------------
-- 14. ATTENDANCE
--     Stores ONLY absentees (default = all present)
-- -------------------------------------------------------
CREATE TABLE attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  division_id  UUID        NOT NULL REFERENCES divisions (id) ON DELETE RESTRICT,
  date         DATE        NOT NULL,
  reason       TEXT,                    -- optional absence reason
  marked_by    UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,  -- must be class teacher
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, date)             -- one absence record per student per day
);

CREATE INDEX idx_attendance_student  ON attendance (student_id);
CREATE INDEX idx_attendance_division ON attendance (division_id);
CREATE INDEX idx_attendance_date     ON attendance (date);
CREATE INDEX idx_attendance_div_date ON attendance (division_id, date);

-- -------------------------------------------------------
-- 15. WORKING_DAYS
--     Saturday = holiday by default.
--     Class teacher can override a Saturday as working.
-- -------------------------------------------------------
CREATE TABLE working_days (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id      UUID  REFERENCES divisions (id) ON DELETE CASCADE,  -- NULL = school-wide
  date             DATE  NOT NULL,
  is_working       BOOLEAN NOT NULL DEFAULT TRUE,
  override_reason  TEXT,
  created_by       UUID  NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (division_id, date)
);

CREATE INDEX idx_working_days_division ON working_days (division_id);
CREATE INDEX idx_working_days_date     ON working_days (date);

-- -------------------------------------------------------
-- TRIGGERS — auto-update updated_at
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_marks_updated_at
  BEFORE UPDATE ON marks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------
-- SEED: Default academic year
-- -------------------------------------------------------
INSERT INTO academic_years (label, start_date, end_date, is_current)
VALUES ('2025-2026', '2025-06-01', '2026-03-31', TRUE);

-- -------------------------------------------------------
-- SEED: Classes 1 – 12
-- -------------------------------------------------------
INSERT INTO classes (grade_number, name) VALUES
  (1,  'Class 1'),
  (2,  'Class 2'),
  (3,  'Class 3'),
  (4,  'Class 4'),
  (5,  'Class 5'),
  (6,  'Class 6'),
  (7,  'Class 7'),
  (8,  'Class 8'),
  (9,  'Class 9'),
  (10, 'Class 10'),
  (11, 'Class 11'),
  (12, 'Class 12');
