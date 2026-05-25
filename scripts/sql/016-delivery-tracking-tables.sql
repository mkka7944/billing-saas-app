-- ==========================================================
-- Migration 016: Delivery Tracking Tables
-- Created: 2026-05-25
--
-- Four tables for the field staff delivery workflow:
--   1. daily_assignments — admin-created per-staff-per-day chunks
--   2. assignment_items  — individual PSID delivery tracking within a chunk
--   3. delivery_photos   — one row per photo, linked to Google Drive
--   4. staff_daily_stats — pre-computed daily performance (refreshed by trigger)
--
-- Designed for offline-first workflow:
--   - Photos captured offline → queued in IndexedDB → synced via GAS webhook
--   - assignment_items status updates → trigger refreshes staff_daily_stats
--   - delivery_photos linked to assignment_items for accountability
-- ==========================================================

-- ── 1. daily_assignments ───────────────────────────────────
-- Admin creates one per staff per day per UC.
CREATE TABLE IF NOT EXISTS public.daily_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  assigned_date date NOT NULL,
  uc_name text NOT NULL,
  total_items integer DEFAULT 0,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_assignments_staff_date
  ON public.daily_assignments(staff_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_daily_assignments_date
  ON public.daily_assignments(assigned_date);

-- ── 2. assignment_items ────────────────────────────────────
-- Individual PSIDs within a daily assignment chunk.
-- Staff marks delivered/missed/skipped with GPS coordinates.
CREATE TABLE IF NOT EXISTS public.assignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
  psid text NOT NULL,
  route_seq integer DEFAULT 0,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','delivered','missed','skipped')),
  delivered_at timestamptz,
  gps_lat numeric,
  gps_lng numeric,
  notes text,
  UNIQUE (assignment_id, psid)
);

CREATE INDEX IF NOT EXISTS idx_assignment_items_assignment
  ON public.assignment_items(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_items_status
  ON public.assignment_items(status);
CREATE INDEX IF NOT EXISTS idx_assignment_items_psid
  ON public.assignment_items(psid);

-- ── 3. delivery_photos ─────────────────────────────────────
-- One row per photo captured during delivery.
-- photo_url set by GAS webhook after Drive upload.
-- For offline captures, synced_to_drive = false until confirmed.
CREATE TABLE IF NOT EXISTS public.delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_item_id uuid NOT NULL REFERENCES assignment_items(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  gdrive_file_id text,
  gps_lat numeric,
  gps_lng numeric,
  captured_at timestamptz DEFAULT now(),
  synced_to_drive boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_delivery_photos_item
  ON public.delivery_photos(assignment_item_id);
CREATE INDEX IF NOT EXISTS idx_delivery_photos_sync
  ON public.delivery_photos(synced_to_drive)
  WHERE synced_to_drive = false;

-- ── 4. staff_daily_stats ───────────────────────────────────
-- Pre-computed daily performance counters.
-- Refreshed by trigger on assignment_items changes.
CREATE TABLE IF NOT EXISTS public.staff_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  assigned_date date NOT NULL,
  total_assigned integer DEFAULT 0,
  delivered integer DEFAULT 0,
  missed integer DEFAULT 0,
  start_time timestamptz,
  end_time timestamptz,
  UNIQUE (staff_id, assigned_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_daily_stats_date
  ON public.staff_daily_stats(assigned_date);

-- ── 5. Trigger: refresh staff_daily_stats ─────────────────
-- After any INSERT/UPDATE/DELETE on assignment_items,
-- recompute stats for the affected assignment's staff+date.
CREATE OR REPLACE FUNCTION refresh_staff_daily_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_staff_id uuid;
  v_date date;
BEGIN
  -- Determine affected staff_id and date from the assignment
  SELECT da.staff_id, da.assigned_date
  INTO v_staff_id, v_date
  FROM daily_assignments da
  WHERE da.id = COALESCE(NEW.assignment_id, OLD.assignment_id);

  IF v_staff_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO staff_daily_stats (staff_id, assigned_date, total_assigned, delivered, missed)
  SELECT
    v_staff_id,
    v_date,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE ai.status = 'delivered')::integer,
    COUNT(*) FILTER (WHERE ai.status = 'missed')::integer
  FROM assignment_items ai
  JOIN daily_assignments da ON da.id = ai.assignment_id
  WHERE da.staff_id = v_staff_id AND da.assigned_date = v_date
  ON CONFLICT (staff_id, assigned_date) DO UPDATE SET
    total_assigned = EXCLUDED.total_assigned,
    delivered = EXCLUDED.delivered,
    missed = EXCLUDED.missed;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_staff_stats ON public.assignment_items;
CREATE TRIGGER trg_refresh_staff_stats
AFTER INSERT OR UPDATE OR DELETE ON public.assignment_items
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_staff_daily_stats();

-- ── 6. Comments ────────────────────────────────────────────
COMMENT ON TABLE public.daily_assignments IS
  'Admin creates one per staff per day per UC. Links field staff to assigned PSIDs via assignment_items.';
COMMENT ON TABLE public.assignment_items IS
  'Individual PSID delivery tracking. Status lifecycle: pending → delivered/missed/skipped. GPS captured at delivery time.';
COMMENT ON TABLE public.delivery_photos IS
  'One row per photo captured during delivery. photo_url set by GAS webhook after Drive upload. synced_to_drive=false means queued in IndexedDB, not yet uploaded.';
COMMENT ON TABLE public.staff_daily_stats IS
  'Pre-computed daily performance counters. Auto-refreshed by trigger on assignment_items changes. Used by admin dashboard (/stats) and staff progress bar.';
COMMENT ON TRIGGER trg_refresh_staff_stats ON public.assignment_items IS
  'Statement-level trigger: recomputes staff_daily_stats for the affected staff+date after any assignment_items change.';
