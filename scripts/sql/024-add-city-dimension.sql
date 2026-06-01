-- 024-add-city-dimension.sql
-- Adds computed `city` column to survey_units + payment_history.
-- Normalizes the 3-city mapping into a single column.

ALTER TABLE survey_units ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS city text;

-- Backfill survey_units
UPDATE survey_units SET city = 'SARGODHA' WHERE city_district = 'SARGODHA' AND tehsil = 'SARGODHA' AND city IS NULL;
UPDATE survey_units SET city = 'BHALWAL'   WHERE city_district = 'SARGODHA' AND tehsil = 'BHALWAL'   AND city IS NULL;
UPDATE survey_units SET city = 'KHUSHAB'   WHERE city_district = 'KHUSHAB'  AND tehsil = 'KHUSHAB'  AND city IS NULL;
UPDATE survey_units SET city = 'UNKNOWN'   WHERE city IS NULL;

-- Backfill payment_history using the same mapping
UPDATE payment_history SET city = 'SARGODHA' WHERE city_district = 'SARGODHA' AND tehsil = 'SARGODHA' AND city IS NULL;
UPDATE payment_history SET city = 'BHALWAL'   WHERE city_district = 'SARGODHA' AND tehsil = 'BHALWAL'   AND city IS NULL;
UPDATE payment_history SET city = 'KHUSHAB'   WHERE city_district = 'KHUSHAB'  AND tehsil = 'KHUSHAB'  AND city IS NULL;
UPDATE payment_history SET city = 'UNKNOWN'   WHERE city IS NULL;

-- Also backfill any payment_history rows with tehsil but NULL city
UPDATE payment_history ph SET city = su.city
FROM survey_units su
WHERE su.psid = ph.psid AND ph.city IS NULL AND su.city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_city_v2 ON payment_history(city);
CREATE INDEX IF NOT EXISTS idx_survey_city ON survey_units(city);
