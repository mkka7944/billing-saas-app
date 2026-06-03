-- 030-drop-amount-due.sql
-- Remove amount_due column from survey_units (now computed as monthly_fee + arrears)
-- Step 1: Recreate RPCs that reference amount_due to use computed expression
-- (already done — see 019-aggregation-rpcs.sql)
-- Step 2: Drop the column

ALTER TABLE survey_units DROP COLUMN IF EXISTS amount_due;
