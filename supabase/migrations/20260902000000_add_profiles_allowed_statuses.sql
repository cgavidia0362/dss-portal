-- Persist which Status Last values a rep should see in their Calls queue
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_statuses text[] NOT NULL DEFAULT '{}';
