-- 033: complaints about a user and warnings issued to a user. Severe warnings
-- (and upheld complaints) show on the user's public profile next to reviews.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS user_complaints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  subject_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id          UUID REFERENCES units(id) ON DELETE SET NULL,
  category         VARCHAR(40) NOT NULL,
  description      TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'investigating', 'upheld', 'dismissed')),
  resolution_note  TEXT,
  handled_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_complaints_subject ON user_complaints (subject_user_id, status);
CREATE INDEX IF NOT EXISTS idx_complaints_client ON user_complaints (client_id, status);

CREATE TABLE IF NOT EXISTS user_warnings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  complaint_id     UUID REFERENCES user_complaints(id) ON DELETE SET NULL,
  level            VARCHAR(20) NOT NULL CHECK (level IN ('notice', 'warning', 'final', 'severe')),
  reason           TEXT NOT NULL,
  public           BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warnings_user ON user_warnings (user_id, created_at DESC);
