-- Dealer-level “do not call on updates” flags. One row covers every app for that dealer.
CREATE TABLE IF NOT EXISTS dealer_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_cif_number text,
  dealer_name text NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dealer_alerts_name_idx
  ON dealer_alerts (lower(btrim(dealer_name)));

CREATE UNIQUE INDEX IF NOT EXISTS dealer_alerts_cif_idx
  ON dealer_alerts (dealer_cif_number)
  WHERE dealer_cif_number IS NOT NULL AND btrim(dealer_cif_number) <> '';

ALTER TABLE dealer_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read dealer alerts" ON dealer_alerts;
CREATE POLICY "Authenticated users can read dealer alerts"
  ON dealer_alerts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and managers can insert dealer alerts" ON dealer_alerts;
CREATE POLICY "Admins and managers can insert dealer alerts"
  ON dealer_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins and managers can delete dealer alerts" ON dealer_alerts;
CREATE POLICY "Admins and managers can delete dealer alerts"
  ON dealer_alerts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  );

GRANT SELECT, INSERT, DELETE ON TABLE dealer_alerts TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE dealer_alerts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
