-- Pending 2-day queue hold is based on when FU status was set, not the latest note.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS fu_status_at timestamptz;

UPDATE calls
SET fu_status_at = COALESCE(last_activity_at, updated_at)
WHERE fu_status IS NOT NULL
  AND fu_status_at IS NULL;

CREATE INDEX IF NOT EXISTS calls_fu_status_at_idx ON calls (fu_status_at);
