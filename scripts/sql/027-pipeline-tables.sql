-- 027-pipeline-tables.sql
-- Pipeline orchestration tables for data quality and audit.

-- ── 1. flagged_psids ─────────────────────────────────────────
-- Field staff marks ghost/duplicate PSIDs during delivery.
-- Used in 2-3 cycle cleanup: flagged list → enrichment filter.
CREATE TABLE IF NOT EXISTS public.flagged_psids (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psid          text NOT NULL,
  survey_id     text,                        -- matches survey_units.survey_id (text)
  reason        text NOT NULL CHECK (reason IN ('duplicate', 'ghost', 'wrong_address', 'wrong_bill', 'other')),
  notes         text,
  flagged_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  flagged_at    timestamptz DEFAULT now(),
  bill_month    text,
  city_district text,
  tehsil        text,
  resolved_at   timestamptz,
  resolution    text CHECK (resolution IN ('confirmed_duplicate', 'confirmed_valid', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_flagged_psids_psid      ON public.flagged_psids(psid);
CREATE INDEX IF NOT EXISTS idx_flagged_psids_month      ON public.flagged_psids(bill_month);
CREATE INDEX IF NOT EXISTS idx_flagged_psids_district   ON public.flagged_psids(city_district);

-- ── 2. bill_print_log ────────────────────────────────────────
-- Tracks which PSIDs were printed in which PDF page for each month.
-- Enables staff to look up bill PDF by PSID during delivery.
CREATE TABLE IF NOT EXISTS public.bill_print_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bill_month    text NOT NULL,
  psid          text NOT NULL,
  survey_id     text,                       -- matches survey_units.survey_id (text)
  page_number   int NOT NULL,
  file_name     text,
  city_district text,
  tehsil        text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (bill_month, psid)
);

CREATE INDEX IF NOT EXISTS idx_bill_print_log_month ON public.bill_print_log(bill_month);
CREATE INDEX IF NOT EXISTS idx_bill_print_log_psid  ON public.bill_print_log(psid);

-- ── 3. ingest_log ─────────────────────────────────────────────
-- Audit trail for data pipeline runs (bill-extractor, enrich-survey-units, etc.)
CREATE TABLE IF NOT EXISTS public.ingest_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  script_name     text NOT NULL,
  bill_month      text,
  city_district   text,
  status          text NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  rows_processed  int DEFAULT 0,
  rows_inserted   int DEFAULT 0,
  rows_updated    int DEFAULT 0,
  rows_errors     int DEFAULT 0,
  error_message   text,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  metadata        jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingest_log_script  ON public.ingest_log(script_name);
CREATE INDEX IF NOT EXISTS idx_ingest_log_status   ON public.ingest_log(status);

-- ── 4. Enable RLS ────────────────────────────────────────────
ALTER TABLE public.flagged_psids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_print_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_log ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write
DROP POLICY IF EXISTS "select_all" ON public.flagged_psids;
CREATE POLICY "select_all" ON public.flagged_psids FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert_all" ON public.flagged_psids;
CREATE POLICY "insert_all" ON public.flagged_psids FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update_all" ON public.flagged_psids;
CREATE POLICY "update_all" ON public.flagged_psids FOR UPDATE USING (true);

DROP POLICY IF EXISTS "select_all" ON public.bill_print_log;
CREATE POLICY "select_all" ON public.bill_print_log FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert_all" ON public.bill_print_log;
CREATE POLICY "insert_all" ON public.bill_print_log FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "select_all" ON public.ingest_log;
CREATE POLICY "select_all" ON public.ingest_log FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert_all" ON public.ingest_log;
CREATE POLICY "insert_all" ON public.ingest_log FOR INSERT WITH CHECK (true);
