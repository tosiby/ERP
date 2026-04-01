-- =============================================================
-- KJSIS — Migration 005: Performance Indexes + Consistency Guards
-- =============================================================

-- ─── Composite indexes for hot query paths ────────────────────

-- Marks: teacher dashboard query (exam + subject filter)
CREATE INDEX IF NOT EXISTS idx_marks_exam_subject
  ON marks (exam_id, subject_id);

-- Marks: student report card
CREATE INDEX IF NOT EXISTS idx_marks_student_exam
  ON marks (student_id, exam_id);

-- Marks: status dashboard for exam cell
CREATE INDEX IF NOT EXISTS idx_marks_exam_status
  ON marks (exam_id, status);

-- Attendance: daily roll call (most common query)
CREATE INDEX IF NOT EXISTS idx_attendance_div_date_student
  ON attendance (division_id, date, student_id);

-- Attendance: student-wise summary
CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON attendance (student_id, date);

-- Students: active students per division per year (used everywhere)
CREATE INDEX IF NOT EXISTS idx_students_div_active
  ON students (division_id, is_active, academic_year_id);

-- Teacher subject map: teacher home screen
CREATE INDEX IF NOT EXISTS idx_tsm_teacher_year_active
  ON teacher_subject_map (teacher_id, academic_year_id, is_active);

-- Subject exam config: config lookup
CREATE INDEX IF NOT EXISTS idx_sec_subject_exam
  ON subject_exam_config (subject_id, exam_id, is_active);

-- ─── CHECK CONSTRAINTS (data consistency guards) ──────────────

-- Marks: marks_obtained must be 0 when student is absent
ALTER TABLE marks
  ADD CONSTRAINT chk_marks_absent_zero
  CHECK (
    (is_absent = TRUE  AND marks_obtained = 0) OR
    (is_absent = FALSE AND marks_obtained >= 0)
  );

-- Working days: cannot be a Sunday
ALTER TABLE working_days
  ADD CONSTRAINT chk_no_sunday_override
  CHECK (EXTRACT(DOW FROM date) != 0);

-- Students: roll_number must be positive
ALTER TABLE students
  ADD CONSTRAINT chk_roll_positive
  CHECK (roll_number > 0);

-- Subject exam config: passing < total
ALTER TABLE subject_exam_config
  ADD CONSTRAINT chk_passing_lt_total
  CHECK (passing_marks < total_marks);

-- ─── FUNCTION: verify subject belongs to division's class ─────
-- Called before teacher-subject-map inserts
CREATE OR REPLACE FUNCTION check_subject_class_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM subjects s
    JOIN classes c ON s.class_id = c.id
    JOIN divisions d ON d.class_id = c.id
    WHERE s.id = NEW.subject_id
      AND d.id = NEW.division_id
  ) THEN
    RAISE EXCEPTION 'Subject does not belong to the class of this division';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tsm_subject_class_check
  BEFORE INSERT OR UPDATE ON teacher_subject_map
  FOR EACH ROW EXECUTE FUNCTION check_subject_class_match();

-- ─── FUNCTION: elective validation ───────────────────────────
-- Student cannot be enrolled in both Hindi AND French (same elective_group)
CREATE OR REPLACE FUNCTION check_elective_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_elective_group TEXT;
BEGIN
  SELECT elective_group INTO v_elective_group
  FROM subjects WHERE id = NEW.subject_id;

  IF v_elective_group IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM student_subjects ss
      JOIN subjects s ON ss.subject_id = s.id
      WHERE ss.student_id     = NEW.student_id
        AND s.elective_group  = v_elective_group
        AND ss.subject_id    != NEW.subject_id
    ) THEN
      RAISE EXCEPTION 'Student already enrolled in another subject from elective group: %', v_elective_group;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_elective_conflict
  BEFORE INSERT ON student_subjects
  FOR EACH ROW EXECUTE FUNCTION check_elective_conflict();
