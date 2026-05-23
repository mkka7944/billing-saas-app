-- Phase A: Finance Schema Update
-- Description: Adds strict financial buckets, categorization, and lifecycle flags to the 'bills' table.
-- Run this in the Supabase SQL Editor.

-- 1. Financial Buckets (Precision Numeric for Currency)
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS current_bill numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS arrears numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS fine numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_payable numeric DEFAULT 0;

-- 2. Categorization Fields (Sourced from Lifecycle Excel)
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS category text,         -- e.g., 'Urban', 'Rural'
ADD COLUMN IF NOT EXISTS sub_category text,     -- e.g., 'Domestic', 'Commercial'
ADD COLUMN IF NOT EXISTS billing_category text; -- e.g., '5 Marla', 'Small Shop'

-- 3. Lifecycle & Status Flags
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS start_month text,      -- e.g., '2025-06' (First month of service)
ADD COLUMN IF NOT EXISTS deleted_in_portal text; -- 'Yes' or 'No' / NULL

-- 4. Indexing for Performance (Optional but recommended)
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(deleted_in_portal);
CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category);
