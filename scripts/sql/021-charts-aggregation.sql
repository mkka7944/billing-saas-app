-- 021-charts-aggregation.sql
-- Single RPC returning all billing chart data for the admin dashboard.
-- Fast city/tehsil filtering via EXISTS (uses psid index, short-circuits when empty).
-- Month sorting via to_date() for chronological order.

CREATE OR REPLACE FUNCTION get_charts_data(
  p_district text DEFAULT '',
  p_tehsil text DEFAULT '',
  p_month text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb;
BEGIN
  WITH filtered AS (
    SELECT psid, bill_month, amount_paid, paid_date, fine
    FROM payment_history ph
    WHERE payment_status = 'paid'
      AND (
        (p_district = '' AND p_tehsil = '')
        OR EXISTS (
          SELECT 1 FROM survey_units su
          WHERE su.psid = ph.psid
            AND (p_district = '' OR su.city_district = p_district)
            AND (p_tehsil = '' OR su.tehsil = p_tehsil)
        )
      )
  ),
  base AS (
    SELECT f.psid, f.bill_month, f.amount_paid, f.paid_date, f.fine,
      su.tehsil, su.billing_category
    FROM filtered f
    LEFT JOIN LATERAL (
      SELECT tehsil, billing_category
      FROM survey_units
      WHERE psid = f.psid
      LIMIT 1
    ) su ON true
  ),
  monthly_trend AS (
    SELECT bill_month,
      coalesce(sum(amount_paid), 0) AS amount,
      count(*) AS bills,
      coalesce(sum(fine), 0) AS fine_total
    FROM base GROUP BY bill_month
  ),
  daily_detail AS (
    SELECT paid_date,
      coalesce(sum(amount_paid), 0) AS amount,
      count(*) AS bills
    FROM base
    WHERE p_month = '' OR bill_month = p_month
    GROUP BY paid_date
  ),
  category_summary AS (
    SELECT
      CASE
        WHEN billing_category LIKE 'Domestic Urban%' THEN 'Domestic Urban'
        WHEN billing_category LIKE 'Domestic Rural%' THEN 'Domestic Rural'
        WHEN billing_category LIKE 'Commercial Urban%' THEN 'Commercial Urban'
        WHEN billing_category LIKE 'Commercial Rural%' THEN 'Commercial Rural'
        ELSE 'Other'
      END AS category_group,
      coalesce(sum(amount_paid), 0) AS amount,
      count(*) AS bills
    FROM base GROUP BY category_group
  ),
  tehsil_breakdown AS (
    SELECT coalesce(tehsil, 'Unknown') AS tehsil,
      bill_month,
      coalesce(sum(amount_paid), 0) AS amount,
      count(*) AS bills
    FROM base GROUP BY tehsil, bill_month
  ),
  monthly_curves AS (
    SELECT bill_month, paid_date,
      (paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)::int AS day,
      coalesce(sum(amount_paid), 0) AS daily_amount,
      coalesce(sum(sum(amount_paid)) OVER (
        PARTITION BY bill_month ORDER BY paid_date
      ), 0) AS cumulative_amount
    FROM base
    WHERE paid_date IS NOT NULL
    GROUP BY bill_month, paid_date
  ),
  kpi AS (
    SELECT count(DISTINCT psid) AS total_units,
      coalesce(sum(amount_paid), 0) AS collected
    FROM base
  )
  SELECT jsonb_build_object(
    'monthly_trend', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'bill_month', bill_month, 'amount', amount, 'bills', bills, 'fine_total', fine_total
      ) ORDER BY to_date(bill_month, 'MonYYYY')) FROM monthly_trend),
      '[]'::jsonb
    ),
    'daily_detail', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'paid_date', paid_date, 'amount', amount, 'bills', bills
      ) ORDER BY paid_date) FROM daily_detail),
      '[]'::jsonb
    ),
    'category_summary', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'category_group', category_group, 'amount', amount, 'bills', bills
      ) ORDER BY amount DESC) FROM category_summary),
      '[]'::jsonb
    ),
    'tehsil_breakdown', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'tehsil', tehsil, 'bill_month', bill_month, 'amount', amount, 'bills', bills
      ) ORDER BY tehsil, to_date(bill_month, 'MonYYYY')) FROM tehsil_breakdown),
      '[]'::jsonb
    ),
    'monthly_curves', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
        'bill_month', bill_month, 'day', day,
        'daily_amount', daily_amount, 'cumulative_amount', cumulative_amount
      ) ORDER BY to_date(bill_month, 'MonYYYY'), paid_date) FROM monthly_curves),
      '[]'::jsonb
    ),
    'kpi', coalesce(
      (SELECT jsonb_build_object('total_units', total_units, 'collected', collected) FROM kpi),
      jsonb_build_object('total_units', 0, 'collected', 0)
    )
  ) INTO result;
  RETURN result;
END;
$$;
