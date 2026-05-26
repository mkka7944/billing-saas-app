-- ==========================================================
-- Migration 018: Restore survey_units.image_urls column
-- Created: 2026-05-26
--
-- Re-adds the image_urls column that was dropped in 017.
-- The actual data will be populated by scripts/restore-image-urls.mjs
-- from the CSV scraped data at scripts/data/scraped_data/
-- ==========================================================

ALTER TABLE public.survey_units ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[];

ANALYZE public.survey_units;
