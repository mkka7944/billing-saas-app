-- ==========================================================
-- Migration 048: Batch Assignment Model
-- Created: 2026-06-18
--
-- Adds:
--   1. name, target_per_day, uc_names to daily_assignments
--   2. supervisor role
--   3. assigned_cities to staff for role scoping
-- ==========================================================

-- ── 1. Extend daily_assignments for batch model ────────────
ALTER TABLE public.daily_assignments
  ADD COLUMN IF NOT EXISTS name            text,                -- "Sargodha-B1"
  ADD COLUMN IF NOT EXISTS target_per_day  integer DEFAULT 500, -- daily minimum target
  ADD COLUMN IF NOT EXISTS uc_names        text[] DEFAULT '{}'; -- multiple UCs per batch

-- Index for lookup by batch name
CREATE INDEX IF NOT EXISTS idx_daily_assignments_name ON public.daily_assignments(name);

-- ── 2. Add supervisor role ─────────────────────────────────
INSERT INTO public.roles (name, description) VALUES
  ('supervisor', 'Creates batches, monitors delivery, read-only management')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Add city scoping to staff ───────────────────────────
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS assigned_cities text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_staff_assigned_cities ON public.staff USING GIN(assigned_cities);
