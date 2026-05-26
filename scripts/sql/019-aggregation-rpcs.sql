-- 019-aggregation-rpcs.sql
-- Server-side aggregation RPCs (replaces .range(0,1_000_000) hack)

-- RPC 1: Billing stats — grand totals + tehsil/UC/category breakdowns
CREATE OR REPLACE FUNCTION get_billing_stats(
  p_month text DEFAULT '',
  p_district text DEFAULT '',
  p_tehsil text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
  f text := '';
BEGIN
  IF p_district != '' THEN f := f || format(' AND su.city_district = %L', p_district); END IF;
  IF p_tehsil != '' THEN f := f || format(' AND su.tehsil = %L', p_tehsil); END IF;

  EXECUTE format($sql$
    WITH base AS (
      SELECT su.psid, su.tehsil, su.uc_name, su.billing_category, su.amount_due
      FROM survey_units su
      WHERE su.current_bill_month = %L%s
    ),
    pays AS (
      SELECT ph.psid, sum(ph.amount_paid) AS total_paid
      FROM payment_history ph
      WHERE ph.bill_month = %L AND ph.payment_status = 'paid'
        AND (ph.psid IN (SELECT psid FROM base) OR %L = '' AND %L = '')
      GROUP BY ph.psid
    ),
    grand AS (
      SELECT
        count(*) AS total_units,
        count(pays.psid) AS paying_units,
        coalesce(sum(base.amount_due), 0) AS total_expected,
        coalesce(sum(pays.total_paid), 0) AS total_collected
      FROM base LEFT JOIN pays ON pays.psid = base.psid
    ),
    tehsil_agg AS (
      SELECT
        coalesce(base.tehsil, 'Unknown') AS name,
        count(*) AS total_units,
        count(pays.psid) AS paying_units,
        coalesce(sum(base.amount_due), 0) AS expected,
        coalesce(sum(pays.total_paid), 0) AS collected
      FROM base LEFT JOIN pays ON pays.psid = base.psid
      GROUP BY base.tehsil
    ),
    uc_agg AS (
      SELECT
        coalesce(base.uc_name, 'Unknown') AS name,
        coalesce(base.tehsil, 'Unknown') AS tehsil,
        count(*) AS total_units,
        count(pays.psid) AS paying_units,
        coalesce(sum(base.amount_due), 0) AS expected,
        coalesce(sum(pays.total_paid), 0) AS collected
      FROM base LEFT JOIN pays ON pays.psid = base.psid
      GROUP BY base.uc_name, base.tehsil
    ),
    cat_agg AS (
      SELECT
        coalesce(base.billing_category, 'UNKNOWN') AS name,
        count(*) AS total_units,
        count(pays.psid) AS paying_units,
        coalesce(sum(pays.total_paid), 0) AS collected
      FROM base LEFT JOIN pays ON pays.psid = base.psid
      GROUP BY base.billing_category
    )
    SELECT json_build_object(
      'grand_totals', (SELECT row_to_json(g) FROM grand g),
      'tehsil_stats', (SELECT coalesce(json_agg(t ORDER BY t.name), '[]'::json) FROM tehsil_agg t),
      'uc_stats', (SELECT coalesce(json_agg(u ORDER BY u.name), '[]'::json) FROM uc_agg u),
      'category_stats', (SELECT coalesce(json_agg(c ORDER BY c.name), '[]'::json) FROM cat_agg c)
    )
  $sql$, p_month, f, p_month, p_district, p_tehsil) INTO result;

  RETURN result;
END;
$$;


-- RPC 2: Data insight hierarchy aggregation (includes payment data)
CREATE OR REPLACE FUNCTION get_hierarchy_stats(
  p_month text DEFAULT '',
  p_district text DEFAULT '',
  p_tehsil text DEFAULT '',
  p_uc text DEFAULT '',
  p_status text DEFAULT 'ACTIVE'
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
  f text := '';
BEGIN
  IF p_district != '' THEN f := f || format(' AND su.city_district = %L', p_district); END IF;
  IF p_tehsil != '' THEN f := f || format(' AND su.tehsil = %L', p_tehsil); END IF;
  IF p_uc != '' THEN f := f || format(' AND su.uc_name = %L', p_uc); END IF;
  IF p_status != '' THEN f := f || format(' AND su.status = %L', p_status); END IF;

  EXECUTE format($sql$
    WITH base AS (
      SELECT
        su.city_district, su.tehsil, su.uc_name, su.psid, su.lat, su.lng,
        su.amount_due, su.surveyor_name, su.status, su.current_bill_month
      FROM survey_units su
      WHERE 1=1%s
    ),
    pays AS (
      SELECT ph.psid, sum(ph.amount_paid) AS total_paid
      FROM payment_history ph
      WHERE ph.bill_month = %L AND ph.payment_status = 'paid'
        AND ph.psid IN (SELECT psid FROM base)
      GROUP BY ph.psid
    ),
    kpi AS (
      SELECT
        count(*) AS total_units,
        count(*) FILTER (WHERE status = 'ACTIVE') AS active_units,
        count(*) FILTER (WHERE status != 'ACTIVE') AS archived_units,
        count(*) FILTER (WHERE lat IS NULL OR lng IS NULL) AS no_coords,
        count(DISTINCT surveyor_name) FILTER (WHERE surveyor_name IS NOT NULL) AS unique_surveyors,
        count(*) FILTER (WHERE current_bill_month = %L AND amount_due > 0) AS billed_units,
        count(pays.psid) AS paid_units,
        coalesce(sum(pays.total_paid), 0) AS total_collected
      FROM base
      LEFT JOIN pays ON pays.psid = base.psid
    ),
    grouped AS (
      SELECT
        CASE WHEN %L = '' THEN city_district
             WHEN %L = '' THEN tehsil
             WHEN %L = '' THEN uc_name
             ELSE base.psid END AS gk,
        count(*) AS total_units,
        count(*) FILTER (WHERE status = 'ACTIVE') AS active,
        count(*) FILTER (WHERE current_bill_month = %L AND amount_due > 0) AS billed,
        count(DISTINCT surveyor_name) AS surveyors,
        count(*) FILTER (WHERE lat IS NULL OR lng IS NULL) AS no_coords,
        count(pays.psid) AS paid,
        coalesce(sum(pays.total_paid), 0) AS collected
      FROM base
      LEFT JOIN pays ON pays.psid = base.psid
      GROUP BY gk
    )
    SELECT json_build_object(
      'kpis', (SELECT row_to_json(k) FROM kpi k),
      'rows', (SELECT coalesce(json_agg(r ORDER BY r.total_units DESC), '[]'::json)
               FROM (SELECT gk, total_units, active, billed, paid, collected, surveyors, no_coords FROM grouped) r)
    )
  $sql$, f, p_month, p_month, p_district, p_tehsil, p_uc, p_month) INTO result;

  RETURN result;
END;
$$;
