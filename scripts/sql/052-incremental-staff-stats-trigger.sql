-- ==========================================================
-- Migration 052: Incremental staff_daily_stats trigger
-- Created: 2026-06-27
--
-- Previous trigger (016 + 048) ran FOR EACH ROW with a full
-- aggregate query (SELECT COUNT(*) ... GROUP BY). For bulk
-- inserts of 6293 rows, this caused O(n²) runtime — each of
-- the 6293 trigger invocations rescanned all items.
--
-- New trigger: adds/subtracts 1 per row — O(1) per invocation.
-- ==========================================================

CREATE OR REPLACE FUNCTION refresh_staff_daily_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_staff_id uuid;
  v_assignment_id uuid;
  v_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
  ELSE
    v_assignment_id := NEW.assignment_id;
  END IF;

  SELECT da.staff_id, da.issued_at
  INTO v_staff_id, v_date
  FROM daily_assignments da
  WHERE da.id = v_assignment_id;

  IF v_staff_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO staff_daily_stats (staff_id, assigned_date, assignment_id, total_assigned, delivered, missed, processing)
    VALUES (v_staff_id, v_date, v_assignment_id, 1,
      CASE WHEN NEW.status = 'delivered' THEN 1 ELSE 0 END,
      CASE WHEN NEW.status = 'missed' THEN 1 ELSE 0 END,
      CASE WHEN NEW.status = 'processing' THEN 1 ELSE 0 END)
    ON CONFLICT (staff_id, assignment_id) DO UPDATE SET
      total_assigned = staff_daily_stats.total_assigned + 1,
      delivered = staff_daily_stats.delivered + (CASE WHEN NEW.status = 'delivered' THEN 1 ELSE 0 END),
      missed = staff_daily_stats.missed + (CASE WHEN NEW.status = 'missed' THEN 1 ELSE 0 END),
      processing = staff_daily_stats.processing + (CASE WHEN NEW.status = 'processing' THEN 1 ELSE 0 END);

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE staff_daily_stats SET
      delivered = delivered + (CASE WHEN NEW.status = 'delivered' THEN 1 WHEN OLD.status = 'delivered' THEN -1 ELSE 0 END),
      missed = missed + (CASE WHEN NEW.status = 'missed' THEN 1 WHEN OLD.status = 'missed' THEN -1 ELSE 0 END),
      processing = processing + (CASE WHEN NEW.status = 'processing' THEN 1 WHEN OLD.status = 'processing' THEN -1 ELSE 0 END)
    WHERE staff_id = v_staff_id AND assignment_id = v_assignment_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE staff_daily_stats SET
      total_assigned = total_assigned - 1,
      delivered = delivered - (CASE WHEN OLD.status = 'delivered' THEN 1 ELSE 0 END),
      missed = missed - (CASE WHEN OLD.status = 'missed' THEN 1 ELSE 0 END),
      processing = processing - (CASE WHEN OLD.status = 'processing' THEN 1 ELSE 0 END)
    WHERE staff_id = v_staff_id AND assignment_id = v_assignment_id;
  END IF;

  RETURN NULL;
END;
$$;
