CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('traveler', 'observer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policies (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  version TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_drafts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  revision INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  origin TEXT,
  destination TEXT,
  departure_date DATE,
  return_date DATE,
  trip_type TEXT NOT NULL CHECK (trip_type IN ('one_way', 'round_trip')),
  passenger_count INT NOT NULL CHECK (passenger_count BETWEEN 1 AND 9),
  cabin TEXT NOT NULL CHECK (cabin IN ('economy', 'premium_economy', 'business')),
  purpose TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS trip_drafts_owner_idx ON trip_drafts (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS trip_drafts_tenant_idx ON trip_drafts (tenant_id);

CREATE TABLE IF NOT EXISTS command_receipts (
  tenant_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  resource_scope TEXT NOT NULL,
  command_id TEXT NOT NULL,
  action TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, resource_scope, command_id)
);

CREATE TABLE IF NOT EXISTS trip_submissions (
  trip_id UUID PRIMARY KEY REFERENCES trip_drafts(id),
  tenant_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  source_revision INT NOT NULL,
  policy_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  review_requirements JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL
);
