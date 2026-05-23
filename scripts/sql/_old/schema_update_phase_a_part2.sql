-- Phase A (Part 2): Survey Unit Schema Update
-- Fix: Adds 'category' and 'sub_category' columns to the 'survey_units' table.
-- The previous script only added them to 'bills'.

ALTER TABLE survey_units
ADD COLUMN IF NOT EXISTS category text,         -- e.g., 'Urban', 'Rural'
ADD COLUMN IF NOT EXISTS sub_category text;     -- e.g., 'Domestic', 'Commercial'

-- Note: 'billing_category' already exists in survey_units.

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_survey_category ON survey_units(category);
