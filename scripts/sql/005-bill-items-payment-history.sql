-- ============================================================
-- Phase 0b Step 1: Create bill_items + payment_history
-- Drops old bills table (replaced by 2-table design)
-- Run in Supabase SQL Editor
-- ============================================================

-- Drop old tables (order matters)
DROP TABLE IF EXISTS public.bill_documents CASCADE;
DROP TABLE IF EXISTS public.bills CASCADE;

-- ============================================================
-- bill_items — Current month PSID snapshot from lifecycle XLSX
-- One row per PSID. Replaced the old multi-month bills table.
-- Refreshed monthly via import-lifecycle-data.py
-- ============================================================
CREATE TABLE public.bill_items (
  psid text NOT NULL PRIMARY KEY,
  survey_id text REFERENCES survey_units(survey_id),
  bill_month text NOT NULL,
  amount_due numeric,
  arrears numeric DEFAULT 0,
  monthly_fee integer DEFAULT 0,
  billing_category text,
  uc_name text,
  city text,
  deleted_in_portal text,         -- "Yes"/"No" — critical filter for staff
  is_issued boolean DEFAULT false,
  start_month text,
  route_name text,
  route_seq integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- payment_history — All payments, one row per (PSID, month)
-- Upserted daily from COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv
-- ============================================================
CREATE TABLE public.payment_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  psid text NOT NULL,
  bill_month text NOT NULL,
  amount_paid numeric DEFAULT 0,
  paid_date date,
  payment_method text,
  payment_status text,
  fine numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (psid, bill_month)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bill_items_survey_id ON bill_items(survey_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_deleted ON bill_items(deleted_in_portal);
CREATE INDEX IF NOT EXISTS idx_bill_items_uc ON bill_items(uc_name);
CREATE INDEX IF NOT EXISTS idx_bill_items_city ON bill_items(city);
CREATE INDEX IF NOT EXISTS idx_bill_items_month ON bill_items(bill_month);

CREATE INDEX IF NOT EXISTS idx_payment_psid ON payment_history(psid);
CREATE INDEX IF NOT EXISTS idx_payment_psid_month ON payment_history(psid, bill_month);
CREATE INDEX IF NOT EXISTS idx_payment_month ON payment_history(bill_month);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON bill_items;
CREATE POLICY "select_all" ON bill_items FOR SELECT USING (true);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON payment_history;
CREATE POLICY "select_all" ON payment_history FOR SELECT USING (true);
