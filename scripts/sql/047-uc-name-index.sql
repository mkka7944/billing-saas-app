-- Migration 047: Add usable indexes for UC-filtered queries
-- Two problems fixed:
--   1. idx_survey_units_lower_uc is function-based (lower+trim) — unusable for exact uc_name = 'X' queries
--   2. OR(status IS NULL, status = 'ACTIVE') + uc_name filter needs composite index

-- Plain btree index on uc_name for exact-match IN/eq filters
CREATE INDEX IF NOT EXISTS idx_survey_units_uc_name
  ON survey_units (uc_name);

-- Composite index covering the common query pattern:
--   WHERE uc_name IN (...) AND (status IS NULL OR status = 'ACTIVE')
CREATE INDEX IF NOT EXISTS idx_survey_units_uc_status
  ON survey_units (uc_name, status);
