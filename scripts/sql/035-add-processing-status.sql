-- 035: Add 'processing' to assignment_items status CHECK constraint
-- Also update refresh_staff_daily_stats() to count processing items

-- 1. Add processing column to staff_daily_stats
ALTER TABLE public.staff_daily_stats ADD COLUMN IF NOT EXISTS processing integer DEFAULT 0;

-- 2. Drop old constraint
ALTER TABLE public.assignment_items DROP CONSTRAINT IF EXISTS assignment_items_status_check;

-- 3. Add new constraint that includes 'processing'
ALTER TABLE public.assignment_items
  ADD CONSTRAINT assignment_items_status_check
  CHECK (status IN ('pending', 'processing', 'delivered', 'missed', 'skipped'));

-- 4. Update trigger function to count processing items in staff_daily_stats
CREATE OR REPLACE FUNCTION public.refresh_staff_daily_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_staff_id uuid;
  v_aid uuid;
  v_issued date;
BEGIN
  SELECT da.staff_id, da.id, da.issued_at
  INTO v_staff_id, v_aid, v_issued
  FROM daily_assignments da
  WHERE da.id = COALESCE(NEW.assignment_id, OLD.assignment_id);

  IF v_staff_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO staff_daily_stats (staff_id, assignment_id, assigned_date, total_assigned, delivered, missed, processing)
  SELECT
    v_staff_id,
    v_aid,
    v_issued,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE ai.status = 'delivered')::integer,
    COUNT(*) FILTER (WHERE ai.status = 'missed')::integer,
    COUNT(*) FILTER (WHERE ai.status = 'processing')::integer
  FROM assignment_items ai
  WHERE ai.assignment_id = v_aid
  ON CONFLICT (staff_id, assignment_id) DO UPDATE SET
    total_assigned = EXCLUDED.total_assigned,
    delivered = EXCLUDED.delivered,
    missed = EXCLUDED.missed,
    processing = EXCLUDED.processing,
    assigned_date = EXCLUDED.assigned_date;

  RETURN NULL;
END;
$$;
