-- 032: server-side reviews (were browser-only). Property, agent and application
-- experience reviews with category ratings, verified badges, helpful votes,
-- reports, a reply from the agency, and moderation. Safe to re-run.
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE CASCADE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  target_type      VARCHAR(20) NOT NULL DEFAULT 'property'
                     CHECK (target_type IN ('property', 'agent', 'application')),
  target_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  author_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name      VARCHAR(120) NOT NULL,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  sub_ratings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  title            VARCHAR(120),
  body             TEXT NOT NULL,
  verified         VARCHAR(20) CHECK (verified IS NULL OR verified IN ('tenant', 'applicant', 'viewer')),
  status           VARCHAR(20) NOT NULL DEFAULT 'published'
                     CHECK (status IN ('published', 'pending', 'hidden')),
  moderation_note  TEXT,
  helpful_count    INT NOT NULL DEFAULT 0,
  report_count     INT NOT NULL DEFAULT 0,
  response_body    TEXT,
  response_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  response_name    VARCHAR(120),
  response_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, target_type, author_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_unit ON reviews (unit_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_target_user ON reviews (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_client_status ON reviews (client_id, status);

CREATE TABLE IF NOT EXISTS review_votes (
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_reports (
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     VARCHAR(40) NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);
