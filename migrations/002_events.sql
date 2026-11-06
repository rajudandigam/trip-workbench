CREATE TABLE IF NOT EXISTS event_drafts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  revision INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  title TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  location_mode TEXT NOT NULL CHECK (location_mode IN ('synthetic', 'manual')),
  location_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS event_drafts_owner_idx ON event_drafts (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS event_drafts_tenant_idx ON event_drafts (tenant_id);

CREATE TABLE IF NOT EXISTS event_submissions (
  event_id UUID PRIMARY KEY REFERENCES event_drafts(id),
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  source_revision INT NOT NULL,
  policy_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  review_requirements JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL
);
