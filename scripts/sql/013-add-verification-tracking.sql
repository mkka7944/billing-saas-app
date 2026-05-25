-- ==========================================================
-- Migration 013: Add last_verified_month to survey_units
-- Created: 2026-05-25
--
-- Tracks when each house was last GPS-verified by field staff
-- during delivery. Used by admin to identify houses that
-- haven't been verified in 3+ months for re-assignment.
--
-- Updated automatically by the delivery app when staff
-- long-presses the map to correct GPS coordinates and
-- saves a house_correction record.
-- ==========================================================

-- 1. Add column (nullable — NULL = never verified)
ALTER TABLE public.survey_units
ADD COLUMN IF NOT EXISTS last_verified_month text;

-- 2. Index for admin queries like "show unverified houses"
CREATE INDEX IF NOT EXISTS idx_survey_last_verified
ON public.survey_units(last_verified_month)
WHERE last_verified_month IS NOT NULL;

COMMENT ON COLUMN public.survey_units.last_verified_month IS
  'Month of last GPS verification, e.g. "MAY2026". NULL = never verified. Updated by delivery app on manual pin correction.';
COMMENT ON INDEX idx_survey_last_verified IS
  'Partial index for admin queries filtering houses not verified in 3+ months.';
