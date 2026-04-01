-- =============================================================
-- KJSIS — Migration 006: Dynamic Term Structure
--
-- Adds:
--   • exam_types   — reusable exam templates per academic year
--   • terms        — 1–3 terms per academic year
--   • exams        — gets term_id + exam_type_id (backward-compatible)
--
-- Design:
--   Admin configures exam types (MT, IA, TERM) once per year.
--   Admin sets term count (1–3).
--   System auto-generates exam rows: MT1, IA1, TERM1, MT2 …
--   Existing exam rows (legacy) remain valid — columns are nullable.
-- =============================================================

-- ─── 1. exam_types ───────────────────────────────────────────
CREATE TABLE exam_types (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id      UUID         NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  code                  VARCHAR(20)  NOT NULL,             -- 'MT', 'IA', 'TERM'
  label                 VARCHAR(100) NOT NULL,             -- 'Mid Term', 'Internal Assessment'
  max_marks_default     INT          NOT NULL DEFAULT 100 CHECK (max_marks_default > 0),
  passing_marks_default INT          NOT NULL DEFAULT 35  CHECK (passing_marks_default > 0),
  entry_mode_default    entry_mode   NOT NULL DEFAULT 'total',
  display_order         INT          NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_exam_types_year_code UNIQUE (academic_year_id, code),
  CONSTRAINT chk_exam_type_passing CHECK (passing_marks_default < max_marks_default)
);

CREATE INDEX idx_exam_types_year ON exam_types (academic_year_id);

CREATE TRIGGER trg_exam_types_updated_at
  BEFORE UPDATE ON exam_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 2. terms ────────────────────────────────────────────────
CREATE TABLE terms (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_number      INT         NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  name             VARCHAR(50) NOT NULL,      -- 'Term 1', 'Term 2', 'Term 3'
  start_date       DATE,
  end_date         DATE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_terms_year_number UNIQUE (academic_year_id, term_number),
  CONSTRAINT chk_term_dates CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX idx_terms_year ON terms (academic_year_id);

CREATE TRIGGER trg_terms_updated_at
  BEFORE UPDATE ON terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 3. Extend exams (backward-compatible) ───────────────────
ALTER TABLE exams
  ADD COLUMN term_id      UUID REFERENCES terms(id)      ON DELETE SET NULL,
  ADD COLUMN exam_type_id UUID REFERENCES exam_types(id) ON DELETE SET NULL;

-- One generated exam per term × exam_type combination
-- Partial unique index: only enforced when both columns are non-NULL
CREATE UNIQUE INDEX uq_exams_term_type
  ON exams (term_id, exam_type_id)
  WHERE term_id IS NOT NULL AND exam_type_id IS NOT NULL;

CREATE INDEX idx_exams_term_id      ON exams (term_id);
CREATE INDEX idx_exams_exam_type_id ON exams (exam_type_id);

-- ─── 4. Seed default exam types for current academic year ─────
DO $$
DECLARE
  v_year_id UUID;
BEGIN
  SELECT id INTO v_year_id FROM academic_years WHERE is_current = TRUE LIMIT 1;
  IF v_year_id IS NOT NULL THEN
    INSERT INTO exam_types (academic_year_id, code, label, max_marks_default, passing_marks_default, display_order)
    VALUES
      (v_year_id, 'MT',   'Mid Term',           100, 35, 1),
      (v_year_id, 'IA',   'Internal Assessment',  50, 18, 2),
      (v_year_id, 'TERM', 'Terminal Exam',        100, 35, 3)
    ON CONFLICT (academic_year_id, code) DO NOTHING;
  END IF;
END $$;
