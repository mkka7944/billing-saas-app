-- 020-billing-charts-rpc.sql
-- Dashboard chart aggregation RPC
-- Returns 5 JSON arrays for all dashboard tabs
-- Admin-only aggregate queries (per AGENTS.md exception)
-- Strategy: query payment_history directly when no filters active;
-- only join survey_units when district/tehsil filter requires it.

CREATE OR REPLACE FUNCTION get_billing_charts(
  p_district text DEFAULT '',
  p_tehsil text DEFAULT '',
  p_month text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
  filter_join text := '';
  filter_where text := '';
  month_where text := '';
BEGIN
  -- Only constrain by survey_units when a filter is active
  IF p_district != '' OR p_tehsil != '' THEN
    filter_join := 'INNER JOIN survey_units su ON su.psid = ph.psid';
    IF p_district != '' THEN
      filter_where := filter_where || format(' AND su.city_district = %L', p_district);
    END IF;
    IF p_tehsil != '' THEN
      filter_where := filter_where || format(' AND su.tehsil = %L', p_tehsil);
    END IF;
  ELSE
    filter_join := 'LEFT JOIN survey_units su ON su.psid = ph.psid';
    filter_where := '';
  END IF;

  -- month filter only applies to daily_detail (not monthly trend / curves)
  IF p_month != '' THEN
    month_where := format(' AND ph.bill_month = %L', p_month);
  END IF;

  EXECUTE format($sql$
    WITH base AS (
      SELECT ph.psid, ph.bill_month, ph.amount_paid, ph.paid_date, ph.fine,
        su.tehsil, su.billing_category
      FROM payment_history ph
      %s
      WHERE ph.payment_status = 'paid'
    ),
    filtered AS (
      SELECT * FROM base WHERE 1=1%s
    ),
    trend_data AS (
      SELECT * FROM base
    ),
    monthly_trend AS (
      SELECT
        bill_month,
        coalesce(sum(amount_paid), 0) AS amount,
        count(*) AS bills,
        coalesce(sum(fine), 0) AS fine_total
      FROM trend_data
      GROUP BY bill_month
      ORDER BY bill_month
    ),
    daily_detail AS (
      SELECT
        paid_date,
        coalesce(sum(amount_paid), 0) AS amount,
        count(*) AS bills
      FROM filtered
      WHERE 1=1%s
      GROUP BY paid_date
      ORDER BY paid_date
    ),
    category_summary AS (
      SELECT
        CASE
          WHEN billing_category LIKE 'Domestic Urban%%' THEN 'Domestic Urban'
          WHEN billing_category LIKE 'Domestic Rural%%' THEN 'Domestic Rural'
          WHEN billing_category LIKE 'Commercial Urban%%' THEN 'Commercial Urban'
          WHEN billing_category LIKE 'Commercial Rural%%' THEN 'Commercial Rural'
          ELSE 'Other'
        END AS category_group,
        coalesce(sum(amount_paid), 0) AS amount,
        count(*) AS bills
      FROM filtered
      GROUP BY category_group
      ORDER BY category_group
    ),
    tehsil_breakdown AS (
      SELECT
        coalesce(tehsil, 'Unknown') AS tehsil,
        bill_month,
        coalesce(sum(amount_paid), 0) AS amount,
        count(*) AS bills
      FROM filtered
      GROUP BY tehsil, bill_month
      ORDER BY tehsil, bill_month
    ),
    monthly_curves AS (
      SELECT
        bill_month,
        extract(day from paid_date)::int AS day,
        coalesce(sum(amount_paid), 0) AS daily_amount,
        coalesce(sum(sum(amount_paid)) OVER (
          PARTITION BY bill_month ORDER BY paid_date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ), 0) AS cumulative_amount
      FROM trend_data
      GROUP BY bill_month, paid_date
      ORDER BY bill_month, paid_date
    ),
    kpi_data AS (
      SELECT
        coalesce(count(DISTINCT psid), 0) AS total_units,
        coalesce(sum(amount_paid), 0) AS collected
      FROM trend_data
    )
    SELECT json_build_object(
      'monthly_trend', (SELECT json_agg(row_to_json(monthly_trend)) FROM monthly_trend),
      'daily_detail', (SELECT json_agg(row_to_json(daily_detail)) FROM daily_detail),
      'category_summary', (SELECT json_agg(row_to_json(category_summary)) FROM category_summary),
      'tehsil_breakdown', (SELECT json_agg(row_to_json(tehsil_breakdown)) FROM tehsil_breakdown),
      'monthly_curves', (SELECT json_agg(row_to_json(monthly_curves)) FROM monthly_curves),
      'kpi', (SELECT row_to_json(kpi_data) FROM kpi_data)
    ) INTO result
    $sql$, filter_join, filter_where, month_where);

  RETURN result;
END;
$$;
