-- DATA PATCH: Financial Columns for Revenue Projection
-- Issue: Missing 'Monthly Fee' and 'Billing Category' in the survey_units table.
-- Date: 2026-01-20

-- 1. Add 'monthly_fee' column (Integer/Numeric)
-- We use INTEGER assuming whole numbers like 500, 1000. BigInt is safer.
ALTER TABLE survey_units 
ADD COLUMN IF NOT EXISTS monthly_fee INTEGER DEFAULT 0;

-- 2. Add 'billing_category' column (Text)
-- Used for tariff slabs like '5-10 Marla', 'Commercial', etc.
ALTER TABLE survey_units 
ADD COLUMN IF NOT EXISTS billing_category TEXT DEFAULT 'UNKNOWN';

-- 3. (Optional) Comment on columns for documentation
COMMENT ON COLUMN survey_units.monthly_fee IS 'Fixed recurring base rate (e.g. 500). Source: Biller Lists.';
COMMENT ON COLUMN survey_units.billing_category IS 'Tariff slab (e.g. 5-10 Marla). Source: Biller Lists.';

-- 4. Verify
SELECT survey_id, monthly_fee, billing_category 
FROM survey_units 
LIMIT 5;
