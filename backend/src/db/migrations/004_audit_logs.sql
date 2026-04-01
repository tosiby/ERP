-- =============================================================
-- KJSIS — Migration 004: Audit Logs
-- =============================================================

CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'marks_submit',
  'marks_lock',
  'marks_unlock',
  'teacher_assign',
  'teacher_unassign',
  'exam_lock',
  'student_import',
  'password_change'
);

CREATE TABLE audit_logs (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         REFERENCES users (id) ON DELETE SET NULL,
  action       audit_action NOT NULL,
  entity_type  VARCHAR(50)  NOT NULL,   -- 'marks', 'attendance', 'user', 'exam', etc.
  entity_id    TEXT,                    -- UUID or composite key as string
  before_data  JSONB,                   -- snapshot before change
  after_data   JSONB,                   -- snapshot after change
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB,                   -- extra context
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by month for performance at scale (comment out if Supabase basic tier)
-- CREATE TABLE audit_logs_2025_09 PARTITION OF audit_logs
--   FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE INDEX idx_audit_user       ON audit_logs (user_id);
CREATE INDEX idx_audit_action     ON audit_logs (action);
CREATE INDEX idx_audit_entity     ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_created    ON audit_logs (created_at DESC);
