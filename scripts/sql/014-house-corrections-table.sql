-- ==========================================================
-- Migration 014: House Corrections Table
-- Created: 2026-05-25
--
-- Replaces legacy verified_houses table with FK-linked,
-- auditable house correction records.
--
-- Key differences from verified_houses:
--   1. FK to survey_units(survey_id) with referential integrity
--   2. Original coords snapshot — captures survey_units.lat/lng
--      at time of correction (auto-populated by trigger)
--   3. corrected_by FK to staff(id) — audit trail
--   4. assigned_date links correction to the delivery day
--   5. correction_type enum: gps_fix, address_update, intel_add, full_verify
-- ==========================================================

-- ── 1. Create house_corrections table ─────────────────────
CREATE TABLE IF NOT EXISTS public.house_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id text NOT NULL REFERENCES survey_units(survey_id),
  corrected_lat numeric,
  corrected_lng numeric,
  original_lat numeric,
  original_lng numeric,
  street_no text,
  landmark text,
  notes text,
  correction_type text DEFAULT 'gps_fix'
    CHECK (correction_type IN ('gps_fix','address_update','intel_add','full_verify')),
  corrected_by uuid REFERENCES staff(id),
  corrected_at timestamptz DEFAULT now(),
  assigned_date date
);

-- ── 2. Trigger: auto-capture original GPS on INSERT ───────
-- When a correction is inserted, snapshot the current
-- survey_units.lat/lng as the original coordinates.
-- This ensures we always know what the GPS was before correction,
-- even if the app doesn't explicitly send original values.
CREATE OR REPLACE FUNCTION set_correction_originals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.original_lat IS NULL OR NEW.original_lng IS NULL THEN
    SELECT lat, lng INTO NEW.original_lat, NEW.original_lng
    FROM survey_units
    WHERE survey_id = NEW.survey_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_house_corrections_set_originals ON public.house_corrections;
CREATE TRIGGER trg_house_corrections_set_originals
BEFORE INSERT ON public.house_corrections
FOR EACH ROW
EXECUTE FUNCTION set_correction_originals();

-- ── 3. Indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_house_corrections_survey_id
  ON public.house_corrections(survey_id);
CREATE INDEX IF NOT EXISTS idx_house_corrections_corrected_by
  ON public.house_corrections(corrected_by);
CREATE INDEX IF NOT EXISTS idx_house_corrections_assigned_date
  ON public.house_corrections(assigned_date);

-- ── 4. Row-Level Security ─────────────────────────────────
ALTER TABLE public.house_corrections ENABLE ROW LEVEL SECURITY;

-- Staff can insert corrections during delivery
CREATE POLICY "Staff can insert corrections"
  ON public.house_corrections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    corrected_by = auth.uid()
  );

-- Staff can view their own corrections; admin can view all
CREATE POLICY "Staff can view own corrections, admin can view all"
  ON public.house_corrections
  FOR SELECT
  TO authenticated
  USING (
    corrected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 5. Comments ───────────────────────────────────────────
COMMENT ON TABLE public.house_corrections IS
  'GPS pin corrections + house intel entered by staff during delivery. Replaces verified_houses.';
COMMENT ON COLUMN public.house_corrections.correction_type IS
  'gps_fix=pin adjustment, address_update=street/landmark change, intel_add=extra notes, full_verify=complete re-survey';
COMMENT ON COLUMN public.house_corrections.assigned_date IS
  'Which delivery day triggered this correction. Enables daily reconciliation.';
COMMENT ON COLUMN public.house_corrections.original_lat IS
  'Snapshot of survey_units.lat at time of correction. Auto-populated by trigger.';
COMMENT ON COLUMN public.house_corrections.original_lng IS
  'Snapshot of survey_units.lng at time of correction. Auto-populated by trigger.';
COMMENT ON TRIGGER trg_house_corrections_set_originals ON public.house_corrections IS
  'Auto-captures survey_units.lat/lng as original coordinates on INSERT, unless explicitly provided.';
