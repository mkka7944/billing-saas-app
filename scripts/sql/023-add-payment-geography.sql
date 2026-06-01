-- 023-add-payment-geography.sql
-- Adds geography columns to payment_history so the charts RPC can filter/display
-- city/tehsil without a LATERAL join to survey_units.

ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS city_district text;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS tehsil text;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS uc_name text;

-- Backfill from survey_units for existing 122K rows
UPDATE payment_history ph
SET
  city_district = su.city_district,
  tehsil        = su.tehsil,
  uc_name       = su.uc_name
FROM survey_units su
WHERE su.psid = ph.psid;

CREATE INDEX IF NOT EXISTS idx_payment_city ON payment_history(city_district);
CREATE INDEX IF NOT EXISTS idx_payment_tehsil ON payment_history(tehsil);
