-- Allow Follow Up on calls.fu_status. The previous check rejected the reminder save.
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_fu_status_check;

ALTER TABLE calls ADD CONSTRAINT calls_fu_status_check CHECK (
  fu_status IS NULL
  OR fu_status IN (
    'Deal',
    'Confirmed Deal',
    'No Deal',
    'Pending',
    'No Answer',
    'Closed',
    'Duplicates',
    'Follow Up'
  )
);
