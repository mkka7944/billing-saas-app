-- 045 — Add is_paid to survey_units + missing indexes

-- 1. Add is_paid column to survey_units for instant payment filtering
ALTER TABLE survey_units ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;

-- 3. Trigger: update is_paid when payment_history changes
CREATE OR REPLACE FUNCTION update_survey_is_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_psid text;
  current_bm text;
BEGIN
  target_psid := COALESCE(NEW.psid, OLD.psid);
  current_bm := to_char(
    CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) < 16
      THEN CURRENT_DATE - INTERVAL '1 month'
      ELSE CURRENT_DATE
    END,
    'MONYYYY'
  );
  UPDATE survey_units
  SET is_paid = EXISTS (
    SELECT 1 FROM payment_history
    WHERE psid = target_psid
    AND payment_status = 'paid'
    AND bill_month = current_bm
  )
  WHERE psid = target_psid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_update_is_paid ON payment_history;
CREATE TRIGGER trg_payment_update_is_paid
  AFTER INSERT OR UPDATE OR DELETE ON payment_history
  FOR EACH ROW EXECUTE FUNCTION update_survey_is_paid();

-- 4. Backfill: mark currently paid units
WITH current_paid AS (
  SELECT DISTINCT ph.psid
  FROM payment_history ph
  WHERE ph.payment_status = 'paid'
    AND ph.bill_month = (
      SELECT to_char(
        CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) < 16
          THEN CURRENT_DATE - INTERVAL '1 month'
          ELSE CURRENT_DATE
        END,
        'MONYYYY'
      )
    )
)
UPDATE survey_units su
SET is_paid = true
FROM current_paid cp
WHERE su.psid = cp.psid;

-- 5. Missing indexes
CREATE INDEX IF NOT EXISTS idx_daily_assignments_uc ON daily_assignments(uc_name);
CREATE INDEX IF NOT EXISTS idx_assignment_items_survey_id ON assignment_items(survey_id);
CREATE INDEX IF NOT EXISTS idx_flagged_psids_reason ON flagged_psids(reason);
CREATE INDEX IF NOT EXISTS idx_flagged_psids_survey_id ON flagged_psids(survey_id);
CREATE INDEX IF NOT EXISTS idx_flagged_psids_unresolved ON flagged_psids(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active) WHERE is_active = true;
