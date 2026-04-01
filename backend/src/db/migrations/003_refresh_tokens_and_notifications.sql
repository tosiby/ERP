-- =============================================================
-- KJSIS — Migration 003: Refresh Tokens + Notifications
-- =============================================================

-- -------------------------------------------------------
-- REFRESH TOKENS
-- -------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  is_revoked  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  ip_address  INET,
  user_agent  TEXT
);

CREATE INDEX idx_rt_user      ON refresh_tokens (user_id);
CREATE INDEX idx_rt_token     ON refresh_tokens (token);
CREATE INDEX idx_rt_expires   ON refresh_tokens (expires_at);
CREATE INDEX idx_rt_revoked   ON refresh_tokens (is_revoked) WHERE is_revoked = FALSE;

-- -------------------------------------------------------
-- NOTIFICATIONS
-- -------------------------------------------------------
CREATE TYPE notification_type AS ENUM (
  'marks_submitted',
  'marks_locked',
  'attendance_alert',
  'at_risk_alert',
  'system'
);

CREATE TABLE notifications (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID              NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  title         VARCHAR(200)      NOT NULL,
  message       TEXT              NOT NULL,
  is_read       BOOLEAN           NOT NULL DEFAULT FALSE,
  metadata      JSONB,            -- structured payload (exam_id, student_id, etc.)
  sent_via_fcm  BOOLEAN           NOT NULL DEFAULT FALSE,
  fcm_token     TEXT,             -- device token used at send time
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);

CREATE INDEX idx_notif_user      ON notifications (user_id);
CREATE INDEX idx_notif_is_read   ON notifications (user_id, is_read);
CREATE INDEX idx_notif_type      ON notifications (type);
CREATE INDEX idx_notif_created   ON notifications (created_at DESC);

-- -------------------------------------------------------
-- FCM DEVICE TOKENS
-- One user can have multiple devices
-- -------------------------------------------------------
CREATE TABLE fcm_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fcm_token  TEXT NOT NULL UNIQUE,
  device     VARCHAR(50),      -- 'android', 'ios'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fcm_user ON fcm_tokens (user_id);

CREATE TRIGGER trg_fcm_updated_at
  BEFORE UPDATE ON fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
