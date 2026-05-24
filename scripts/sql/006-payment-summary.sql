-- ============================================================
-- Payment Summary table — pre-computed monthly aggregates
-- Eliminates fetching all payment_history rows just to sum.
-- Updated by daily payment import script.
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.payment_summary (
  bill_month text NOT NULL,
  total_paid integer DEFAULT 0,
  total_collected numeric(12, 2) DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_summary_pkey PRIMARY KEY (bill_month)
);

-- 2. Seed with existing data (run once)
INSERT INTO public.payment_summary (bill_month, total_paid, total_collected)
SELECT
  bill_month,
  COUNT(*)::integer AS total_paid,
  COALESCE(SUM(amount_paid), 0) AS total_collected
FROM public.payment_history
WHERE payment_status = 'paid'
GROUP BY bill_month
ON CONFLICT (bill_month)
DO UPDATE SET
  total_paid = EXCLUDED.total_paid,
  total_collected = EXCLUDED.total_collected,
  updated_at = now();
