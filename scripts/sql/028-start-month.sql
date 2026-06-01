-- 028-start-month.sql
-- Add start_month to survey_units for precise billing cycle range.
-- Enables PaymentHistoryCard to show history from the household's first month
-- instead of using a 24-month rolling lookback.

ALTER TABLE public.survey_units
  ADD COLUMN IF NOT EXISTS start_month text;

COMMENT ON COLUMN public.survey_units.start_month IS 'First billed month (e.g. SEP2025) from lifecycle XLSX. Used as lower bound for payment history display.';

CREATE INDEX IF NOT EXISTS idx_survey_units_start_month
  ON public.survey_units(start_month);
