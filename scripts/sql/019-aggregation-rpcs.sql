-- 019-aggregation-rpcs.sql
-- Server-side aggregation RPCs (replaces .range(0,1_000_000) hack)

-- ============================================================
-- HIERARCHY SUMMARY CACHE (for Data Insight — instant responses)
-- Pre-computed UC-level aggregates per bill_month (~300 rows)
-- Refreshed after each monthly enrichment + payment import
-- ============================================================
CREATE TABLE IF NOT EXISTS hierarchy_summary (
  city_district text NOT NULL,
  tehsil text NOT NULL,
  uc_name text NOT NULL,
  bill_month text NOT NULL,
  total_units integer NOT NULL DEFAULT 0,
  active_units integer NOT NULL DEFAULT 0,
  archived_units integer NOT NULL DEFAULT 0,
  no_coords integer NOT NULL DEFAULT 0,
  surveyors integer NOT NULL DEFAULT 0,
  billed_units integer NOT NULL DEFAULT 0,
  paid_units integer NOT NULL DEFAULT 0,
  total_collected numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (city_district, tehsil, uc_name, bill_month)
);

CREATE OR REPLACE FUNCTION refresh_hierarchy_summary(p_month text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_month = '' THEN
    p_month := upper(to_char(CURRENT_DATE - interval '5 days', 'MonYYYY'));
    p_month := upper(substr(p_month, 1, 3)) || substr(p_month, 4);
  END IF;
  DELETE FROM hierarchy_summary WHERE bill_month = p_month;
  INSERT INTO hierarchy_summary
  SELECT
    COALESCE(NULLIF(trim(su.city_district), ''), 'UNKNOWN'),
    COALESCE(NULLIF(trim(su.tehsil), ''), 'UNKNOWN'),
    COALESCE(UPPER(NULLIF(trim(su.uc_name), '')), 'UNKNOWN'),
    p_month,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE su.status IS NULL OR su.status = 'ACTIVE')::int,
    COUNT(*) FILTER (WHERE su.status IS NOT NULL AND su.status != 'ACTIVE')::int,
    COUNT(*) FILTER (WHERE su.lat IS NULL OR su.lng IS NULL)::int,
    COUNT(DISTINCT su.surveyor_name) FILTER (WHERE su.surveyor_name IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE su.psid IS NOT NULL)::int,
    COUNT(ph.psid)::int,
    COALESCE(SUM(ph.total_paid), 0)
  FROM survey_units su
  LEFT JOIN (
    SELECT psid, SUM(amount_paid) AS total_paid
    FROM payment_history
    WHERE bill_month = p_month AND payment_status = 'paid'
    GROUP BY psid
  ) ph ON ph.psid = su.psid
  WHERE su.uc_name IS NOT NULL
    AND TRIM(su.uc_name) != ''
    AND UPPER(TRIM(su.uc_name)) NOT IN ('UNKNOWN', 'TCP ZONE 4')
    AND UPPER(TRIM(su.uc_name)) !~ '^\d+$'
  GROUP BY su.city_district, su.tehsil, UPPER(NULLIF(trim(su.uc_name), ''));
END;
$$;

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


-- RPC 2: Data insight hierarchy aggregation (reads from hierarchy_summary cache)
-- ~1s response instead of 14s from full table scan
CREATE OR REPLACE FUNCTION get_hierarchy_stats(
  p_month text DEFAULT '',
  p_district text DEFAULT '',
  p_tehsil text DEFAULT '',
  p_uc text DEFAULT '',
  p_status text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
BEGIN
  WITH base AS (
    SELECT * FROM hierarchy_summary
    WHERE bill_month = p_month
      AND (p_district = '' OR city_district = p_district)
      AND (p_tehsil = '' OR tehsil = p_tehsil)
      AND (p_uc = '' OR uc_name = UPPER(TRIM(p_uc)))
  ),
  kpi AS (
    SELECT
      CASE WHEN p_status = 'ACTIVE' THEN SUM(base.active_units) ELSE SUM(base.total_units) END AS total_units,
      SUM(base.active_units) AS active_units,
      SUM(base.archived_units) AS archived_units,
      SUM(base.no_coords) AS no_coords,
      (SELECT COUNT(DISTINCT su.surveyor_name) FROM survey_units su
       WHERE (p_district = '' OR su.city_district = p_district)
         AND (p_tehsil = '' OR su.tehsil = p_tehsil)
         AND (p_uc = '' OR UPPER(TRIM(su.uc_name)) = UPPER(TRIM(p_uc)))
         AND su.surveyor_name IS NOT NULL
      ) AS unique_surveyors,
      SUM(base.billed_units) AS billed_units,
      (SELECT COUNT(DISTINCT ph.psid)::int FROM payment_history ph
       WHERE ph.bill_month = p_month AND ph.payment_status = 'paid'
         AND (p_district = '' OR ph.city_district = p_district)
         AND (p_tehsil = '' OR ph.tehsil = p_tehsil)
      ) AS paid_units,
      (SELECT COALESCE(SUM(ph.amount_paid), 0) FROM payment_history ph
       WHERE ph.bill_month = p_month AND ph.payment_status = 'paid'
         AND (p_district = '' OR ph.city_district = p_district)
         AND (p_tehsil = '' OR ph.tehsil = p_tehsil)
      ) AS total_collected
    FROM base
  ),
  grouped AS (
    SELECT
      CASE WHEN p_district = '' THEN base.city_district
           WHEN p_tehsil = '' THEN base.tehsil
           WHEN p_uc = '' THEN base.uc_name
           ELSE base.uc_name END AS gk,
      CASE WHEN p_status = 'ACTIVE' THEN SUM(base.active_units) ELSE SUM(base.total_units) END AS total_units,
      SUM(base.active_units) AS active,
      SUM(base.billed_units) AS billed,
      SUM(base.paid_units) AS paid,
      SUM(base.total_collected) AS collected,
      SUM(base.surveyors) AS surveyors,
      SUM(base.no_coords) AS no_coords
    FROM base
    GROUP BY gk
  )
  SELECT json_build_object(
    'kpis', (SELECT row_to_json(k) FROM kpi k),
    'rows', (SELECT COALESCE(json_agg(r ORDER BY r.total_units DESC), '[]'::json)
             FROM (SELECT * FROM grouped) r)
  ) INTO result;

  RETURN result;
END;
$$;
