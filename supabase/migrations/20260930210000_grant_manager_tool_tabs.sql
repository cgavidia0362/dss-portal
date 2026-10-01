-- Existing managers currently get Income Verification and Vehicle Risk from the role itself.
-- Those tabs are now grantable, so copy them onto allowed_tabs so nobody loses access.
UPDATE profiles
SET allowed_tabs = (
  SELECT ARRAY(
    SELECT DISTINCT tab_id
    FROM unnest(
      coalesce(allowed_tabs, ARRAY[]::text[])
      || ARRAY['income-verification', 'vehicle-risk']
    ) AS tab_id
  )
)
WHERE role = 'manager';
