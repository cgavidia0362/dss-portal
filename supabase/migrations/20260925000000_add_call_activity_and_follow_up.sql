-- Activity column stamps only on FU Status changes and new notes.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS last_activity_by text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS last_activity_by_name text;

-- Same-day Follow Up reminder; due when null or in the past.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;

CREATE INDEX IF NOT EXISTS calls_last_activity_at_idx ON calls (last_activity_at);
CREATE INDEX IF NOT EXISTS calls_follow_up_at_idx ON calls (follow_up_at);
