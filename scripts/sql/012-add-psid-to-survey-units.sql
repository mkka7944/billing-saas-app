-- ==========================================================
-- Migration 012: Add psid to survey_units
-- Created: 2026-05-25
--
-- Decouples payment_history geography queries from bill_items.
-- Before: geography-based payment lookup required joining
--   payment_history → bill_items.psid → survey_units
--   (bill_items only has current month, so past months fail)
-- After:  geography-based payment lookup joins directly:
--   payment_history.psid → survey_units.psid
--   Works for ALL months without touching bill_items.
--
-- Design decisions:
-- - Partial unique index (WHERE psid IS NOT NULL) allows
--   NULL for survey units with no PSID (valid unbilled houses)
-- - Multiple PSIDs per survey_id: first PSID from bill_items
--   is stored as primary; secondary PSIDs remain in bill_items
--   (see Edge Case #3, #15)
-- ==========================================================

-- 1. Add psid column (nullable — existing data unaffected)
ALTER TABLE public.survey_units
ADD COLUMN IF NOT EXISTS psid text;

-- 2. Backfill from bill_items (primary PSID per survey_id)
UPDATE public.survey_units su
SET psid = bi.psid
FROM public.bill_items bi
WHERE bi.survey_id = su.survey_id
  AND su.psid IS NULL;

-- 3. Notify how many survey_units still have NULL psid
DO $$
DECLARE
  null_count integer;
  total_count integer;
BEGIN
  SELECT COUNT(*) INTO total_count FROM public.survey_units;
  SELECT COUNT(*) INTO null_count FROM public.survey_units WHERE psid IS NULL;
  RAISE NOTICE 'survey_units: % total, % with NULL psid (valid unbilled)', total_count, null_count;
END $$;

-- 4. Unique partial index — only non-null psids must be unique
-- This allows survey units without PSIDs while enforcing uniqueness
-- for the ones that have them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_psid_unique
ON public.survey_units(psid)
WHERE psid IS NOT NULL;

-- 5. Standard index for fast JOINs with payment_history
CREATE INDEX IF NOT EXISTS idx_survey_psid
ON public.survey_units(psid);

COMMENT ON COLUMN public.survey_units.psid IS
  'Stable biller PSID for domain decoupling. Enables payment_history geography queries for ALL months without joining bill_items.';
COMMENT ON INDEX idx_survey_psid_unique IS
  'Partial unique index — allows NULL for unbilled units, enforces uniqueness for billed units.';
COMMENT ON INDEX idx_survey_psid IS
  'Standard B-tree index for fast JOINs with payment_history.psid.';
