-- ==========================================================
-- Migration 017: Storage Optimization (Free Tier Recovery)
-- Created: 2026-05-25
--
-- Reduces database footprint from ~460MB to <300MB by:
--   1. Drop image_urls from survey_units (TOAST-heavy text[] column)
--   2. Drop orphan indexes from dropped tables
--   3. Drop expensive but optional indexes
--   4. VACUUM FULL to reclaim physical space
-- ==========================================================

-- ── 1. Drop survey_units.image_urls column ────────────────
-- This text[] column stores legacy survey photo URLs (~120 chars each).
-- Each row may have 1-4 URLs stored as TOAST out-of-line values.
-- Photos now go through delivery_photos table + GAS webhook.
-- If you need these URLs later, back them up first:
--   CREATE TABLE survey_photos AS SELECT survey_id, image_urls FROM survey_units WHERE image_urls IS NOT NULL;
ALTER TABLE public.survey_units DROP COLUMN IF EXISTS image_urls;

-- ── 2. Drop orphan indexes from old/dropped tables ───────
-- These indexes were created in reset-and-create.sql for the
-- old 'bills' table and old 'verified_houses' table.
-- Both tables have been dropped; indexes may still consume space.
DROP INDEX IF EXISTS idx_bills_month;
DROP INDEX IF EXISTS idx_bills_status;
DROP INDEX IF EXISTS idx_bills_survey_id;
DROP INDEX IF EXISTS idx_verified_survey_id;

-- ── 3. Drop expensive optional indexes ───────────────────
-- idx_survey_consumer_name_trgm is a GIN trigram index for ILIKE search.
-- GIN indexes are ~3x larger than B-tree for the same data.
-- If ILIKE search is not a critical feature, this saves ~30-50MB.
-- Re-create with: CREATE INDEX ... ON survey_units USING gin (...);
DROP INDEX IF EXISTS idx_survey_consumer_name_trgm;

-- idx_survey_city/tehsil/uc/surveyor are redundant if the newer
-- idx_survey_status + application-level filtering suffice.
-- Keep them for now; they're small B-tree indexes.
-- But if space is critical, uncomment:
-- DROP INDEX IF EXISTS idx_survey_city;
-- DROP INDEX IF EXISTS idx_survey_tehsil;
-- DROP INDEX IF EXISTS idx_survey_uc;
-- DROP INDEX IF EXISTS idx_survey_surveyor;

-- ── 4. VACUUM FULL to reclaim physical space ─────────────
-- After dropping columns + indexes, the space is marked as free
-- but NOT returned to the OS. VACUUM FULL rewrites the table
-- and returns the space. Requires an ACCESS EXCLUSIVE lock.
-- Run this during low-usage period.
VACUUM FULL public.survey_units;
VACUUM FULL public.bill_items;
VACUUM FULL public.payment_history;

-- ── 5. Re-analyze for query planner ──────────────────────
ANALYZE public.survey_units;
ANALYZE public.bill_items;
ANALYZE public.payment_history;
