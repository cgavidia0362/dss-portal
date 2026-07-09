-- Track who last updated a call (status, amount, notes, etc.)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_by_name text;
