-- Migration 046: Efficient orphan PSID detection via SQL LEFT JOIN
-- Replaces the in-memory Set intersection in src/app/api/orphan-psids/route.ts
-- Admin-only aggregate query (permitted by data layer rules Section 9)

CREATE OR REPLACE FUNCTION get_orphan_psids(p_month text DEFAULT NULL)
RETURNS TABLE (
  psid text,
  bill_month text,
  amount_paid numeric,
  paid_date date,
  city_district text,
  tehsil text,
  uc_name text
) LANGUAGE sql STABLE AS $$
  SELECT ph.psid, ph.bill_month, ph.amount_paid, ph.paid_date, ph.city_district, ph.tehsil, ph.uc_name
  FROM payment_history ph
  LEFT JOIN survey_units su ON ph.psid = su.psid
  WHERE su.psid IS NULL
    AND ph.payment_status = 'paid'
    AND (p_month IS NULL OR ph.bill_month = p_month)
  ORDER BY ph.bill_month DESC, ph.paid_date DESC;
$$;
