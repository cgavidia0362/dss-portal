-- Per-user optional tab grants (additive to role defaults)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_tabs text[] NOT NULL DEFAULT '{}';
