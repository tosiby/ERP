-- =============================================================
-- KJSIS — Migration 007: Report Configuration
-- Progress card remarks + school-level report settings
-- =============================================================

-- -------------------------------------------------------
-- 1. REPORT_SETTINGS  (one row per academic year)
-- -------------------------------------------------------
CREATE TABLE report_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id  UUID        NOT NULL UNIQUE REFERENCES academic_years (id) ON DELETE RESTRICT,
  school_name       VARCHAR(255) NOT NULL DEFAULT 'K.J. School',
  logo_url          TEXT,
  principal_name    VARCHAR(150),
  show_rank         BOOLEAN     NOT NULL DEFAULT TRUE,
  show_attendance   BOOLEAN     NOT NULL DEFAULT TRUE,
  show_insights     BOOLEAN     NOT NULL DEFAULT TRUE,
  show_ai_remarks   BOOLEAN     NOT NULL DEFAULT TRUE,
  footer_text       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_report_settings_updated_at
  BEFORE UPDATE ON report_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------
-- 2. REPORT_REMARKS  (per student × year × term)
--    term_id = NULL  →  full-year annual remark
--    term_id = UUID  →  per-term remark
-- -------------------------------------------------------
CREATE TABLE report_remarks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  academic_year_id UUID        NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
  term_id          UUID        REFERENCES terms (id) ON DELETE SET NULL,
  remark_text      TEXT        NOT NULL,
  is_ai_generated  BOOLEAN     NOT NULL DEFAULT TRUE,
  edited_by        UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique: one annual remark per student per year
CREATE UNIQUE INDEX uq_report_remarks_annual
  ON report_remarks (student_id, academic_year_id)
  WHERE term_id IS NULL;

-- Partial unique: one term remark per student per year per term
CREATE UNIQUE INDEX uq_report_remarks_term
  ON report_remarks (student_id, academic_year_id, term_id)
  WHERE term_id IS NOT NULL;

CREATE INDEX idx_report_remarks_student      ON report_remarks (student_id);
CREATE INDEX idx_report_remarks_academic_yr  ON report_remarks (academic_year_id);
CREATE INDEX idx_report_remarks_term         ON report_remarks (term_id);

CREATE TRIGGER trg_report_remarks_updated_at
  BEFORE UPDATE ON report_remarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------
-- 3. Seed default settings for current academic year
-- -------------------------------------------------------
INSERT INTO report_settings (academic_year_id, school_name)
SELECT id, 'K.J. School'
FROM academic_years
WHERE is_current = TRUE
ON CONFLICT (academic_year_id) DO NOTHING;
