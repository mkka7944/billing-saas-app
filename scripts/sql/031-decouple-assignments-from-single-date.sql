-- ==========================================================
-- Migration 031: Decouple assignments from single-date constraint
-- 2026-06-04
--
-- Changes:
--   1. Rename daily_assignments.assigned_date → issued_at
--   2. Update indexes
--   3. Add assignment_id to staff_daily_stats, change UNIQUE
--   4. Update trigger for per-assignment aggregation
-- ==========================================================

-- ── 1. Rename column ───────────────────────────────────────
ALTER TABLE public.daily_assignments RENAME COLUMN assigned_date TO issued_at;

-- ── 2. Update indexes ──────────────────────────────────────
DROP INDEX IF EXISTS idx_daily_assignments_date;
DROP INDEX IF EXISTS idx_daily_assignments_staff_date;
CREATE INDEX IF NOT EXISTS idx_daily_assignments_staff_issued
  ON public.daily_assignments(staff_id, issued_at);

-- ── 3. Update staff_daily_stats ────────────────────────────
ALTER TABLE public.staff_daily_stats ADD COLUMN assignment_id uuid REFERENCES public.daily_assignments(id) ON DELETE CASCADE;
ALTER TABLE public.staff_daily_stats DROP CONSTRAINT IF EXISTS staff_daily_stats_staff_id_assigned_date_key;
ALTER TABLE public.staff_daily_stats ADD UNIQUE (staff_id, assignment_id);

-- ── 4. Update trigger for per-assignment aggregation ───────
CREATE OR REPLACE FUNCTION refresh_staff_daily_stats()
RETURNS TRIGGER
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

  INSERT INTO staff_daily_stats (staff_id, assignment_id, assigned_date, total_assigned, delivered, missed)
  SELECT
    v_staff_id,
    v_aid,
    v_issued,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE ai.status = 'delivered')::integer,
    COUNT(*) FILTER (WHERE ai.status = 'missed')::integer
  FROM assignment_items ai
  WHERE ai.assignment_id = v_aid
  ON CONFLICT (staff_id, assignment_id) DO UPDATE SET
    total_assigned = EXCLUDED.total_assigned,
    delivered = EXCLUDED.delivered,
    missed = EXCLUDED.missed,
    assigned_date = EXCLUDED.assigned_date;

  RETURN NULL;
END;
$$;
