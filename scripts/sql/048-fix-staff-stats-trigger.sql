-- 048: Fix staff_daily_stats trigger — was FOR EACH STATEMENT but function uses NEW/OLD
-- In PostgreSQL, NEW and OLD are NULL in statement-level triggers, so the trigger
-- never actually wrote any rows. Changing to FOR EACH ROW fixes it.

DROP TRIGGER IF EXISTS trg_refresh_staff_stats ON public.assignment_items;

CREATE TRIGGER trg_refresh_staff_stats
AFTER INSERT OR UPDATE OR DELETE ON public.assignment_items
FOR EACH ROW
EXECUTE FUNCTION refresh_staff_daily_stats();

-- Backfill: populate staff_daily_stats from all existing data
-- (trigger was broken before, so table had 0 rows)
INSERT INTO staff_daily_stats (staff_id, assignment_id, assigned_date, total_assigned, delivered, missed, processing)
SELECT
  da.staff_id,
  da.id,
  da.issued_at,
  COUNT(*)::integer,
  COUNT(*) FILTER (WHERE ai.status = 'delivered')::integer,
  COUNT(*) FILTER (WHERE ai.status = 'missed')::integer,
  COUNT(*) FILTER (WHERE ai.status = 'processing')::integer
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
GROUP BY da.staff_id, da.id, da.issued_at
ON CONFLICT (staff_id, assignment_id) DO UPDATE SET
  total_assigned = EXCLUDED.total_assigned,
  delivered = EXCLUDED.delivered,
  missed = EXCLUDED.missed,
  processing = EXCLUDED.processing,
  assigned_date = EXCLUDED.assigned_date;
