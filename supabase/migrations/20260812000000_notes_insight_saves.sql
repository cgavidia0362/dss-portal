-- Saved AI Insights from the Notes tab (managers/admins).
CREATE TABLE IF NOT EXISTS notes_insight_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  date_range_label text,
  selected_rep_id uuid,
  filter_source text,
  note_count integer NOT NULL DEFAULT 0,
  insights jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_insight_saves_created_at_idx
  ON notes_insight_saves (created_at DESC);

ALTER TABLE notes_insight_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers and admins can read insight saves" ON notes_insight_saves;
CREATE POLICY "Managers and admins can read insight saves"
  ON notes_insight_saves
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Managers and admins can insert insight saves" ON notes_insight_saves;
CREATE POLICY "Managers and admins can insert insight saves"
  ON notes_insight_saves
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

DROP POLICY IF EXISTS "Managers and admins can delete insight saves" ON notes_insight_saves;
CREATE POLICY "Managers and admins can delete insight saves"
  ON notes_insight_saves
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager')
    )
  );
