-- Saved Income Verification reports (shared among users with IV access).
CREATE TABLE IF NOT EXISTS income_verification_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name text NOT NULL,
  analysis jsonb NOT NULL,
  summary text NOT NULL,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  average_monthly numeric,
  coverage_start date,
  coverage_end date,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS income_verification_saves_created_at_idx
  ON income_verification_saves (created_at DESC);

CREATE INDEX IF NOT EXISTS income_verification_saves_applicant_name_idx
  ON income_verification_saves (lower(applicant_name));

ALTER TABLE income_verification_saves ENABLE ROW LEVEL SECURITY;

-- Anyone who can use Income Verification: admin, manager, or granted via allowed_tabs
DROP POLICY IF EXISTS "IV users can read verification saves" ON income_verification_saves;
CREATE POLICY "IV users can read verification saves"
  ON income_verification_saves
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'manager')
          OR 'income-verification' = ANY (COALESCE(p.allowed_tabs, '{}'::text[]))
        )
    )
  );

DROP POLICY IF EXISTS "IV users can insert verification saves" ON income_verification_saves;
CREATE POLICY "IV users can insert verification saves"
  ON income_verification_saves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'manager')
          OR 'income-verification' = ANY (COALESCE(p.allowed_tabs, '{}'::text[]))
        )
    )
  );

DROP POLICY IF EXISTS "IV users can delete verification saves" ON income_verification_saves;
CREATE POLICY "IV users can delete verification saves"
  ON income_verification_saves
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'manager')
          OR 'income-verification' = ANY (COALESCE(p.allowed_tabs, '{}'::text[]))
        )
    )
  );
