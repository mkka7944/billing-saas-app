-- ==========================================================
-- Migration 011: Missing Performance Indexes
-- Created: 2026-05-24
--
-- Adds indexes on columns that are filtered in API queries
-- but were missing from previous migrations.
-- ==========================================================

-- Enable pg_trgm for ILIKE search index (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. survey_units.status — filtered in EVERY API query ───
-- All survey queries filter `.eq('status', 'ACTIVE')` on 212K rows.
-- Without this index, every query does a full sequential scan.
CREATE INDEX IF NOT EXISTS idx_survey_status ON survey_units(status);

-- ── 2. survey_units.unit_type — used in filter dropdown ────
CREATE INDEX IF NOT EXISTS idx_survey_unit_type ON survey_units(unit_type);

-- ── 3. survey_units.consumer_name — for ILIKE search ──────
-- GIN trigram index enables fast `ILIKE '%search%'` queries.
-- Requires pg_trgm extension (enabled in base schema).
CREATE INDEX IF NOT EXISTS idx_survey_consumer_name_trgm
  ON survey_units USING gin (consumer_name gin_trgm_ops);

-- ── 4. payment_history.payment_status — used in payment filter ──
-- Query: `.eq('payment_status', 'paid')` on payment_history
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment_history(payment_status);

-- ── 5. bill_items composite — used in payment filter query ──
-- Query: `.eq('bill_month', ?).in('survey_id', ids)`
-- Composite index covers both columns in one index.
CREATE INDEX IF NOT EXISTS idx_bill_items_survey_month
  ON bill_items(survey_id, bill_month);

COMMENT ON INDEX idx_survey_status IS 'Critical: every survey query filters status=ACTIVE on 212K rows';
COMMENT ON INDEX idx_survey_unit_type IS 'Used in admin filter unit_type dropdown';
COMMENT ON INDEX idx_survey_consumer_name_trgm IS 'Enables fast ILIKE search on consumer_name';
COMMENT ON INDEX idx_payment_status IS 'Used in payment filter (paid/unpaid) queries';
COMMENT ON INDEX idx_bill_items_survey_month IS 'Composite for bill_items filtered by bill_month + survey_id IN clause';
