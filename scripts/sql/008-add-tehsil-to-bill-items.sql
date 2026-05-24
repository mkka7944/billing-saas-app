-- ==========================================================
-- Migration 008: Add tehsil column to bill_items
-- Created: 2026-05-24
--
-- bill_items has city (=district) and uc_name but no tehsil
-- column. This forces expensive survey_id→survey_units joins
-- for tehsil-level aggregation.
--
-- This migration:
--   1. Adds tehsil text column to bill_items
--   2. Backfills from survey_units via survey_id FK
--   3. Creates an index on tehsil
-- ==========================================================

-- 1. Add the column (nullable to avoid blocking)
ALTER TABLE public.bill_items
ADD COLUMN IF NOT EXISTS tehsil text;

-- 2. Backfill from survey_units (joins on survey_id)
UPDATE public.bill_items bi
SET tehsil = su.tehsil
FROM public.survey_units su
WHERE bi.survey_id = su.survey_id
  AND bi.tehsil IS NULL;

-- 3. Index for tehsil-level filters
CREATE INDEX IF NOT EXISTS idx_bill_items_tehsil
ON public.bill_items(tehsil);

-- 4. Notify — log count of null tehsil rows after backfill
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.bill_items WHERE tehsil IS NULL;
  RAISE NOTICE 'bill_items rows with null tehsil after backfill: %', null_count;
END $$;
