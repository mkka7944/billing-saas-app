-- ==========================================================
-- Migration 007: Data Insight RPCs
-- Created: 2026-05-24
-- 
-- Two Postgres functions for admin-only aggregation:
--   1. get_survey_group_stats  — survey unit counts per group
--   2. get_billing_group_stats — billing + payment data per group
--
-- Both auto-detect hierarchy level based on which params
-- are supplied (null param = higher aggregation level).
--
-- Usage:
--   SELECT * FROM get_survey_group_stats('SARGODHA', NULL, NULL, NULL, 'ACTIVE');
--   SELECT * FROM get_billing_group_stats('SARGODHA', NULL, NULL, 'MAY2026');
-- ==========================================================

-- ── 1. Survey unit group stats ──────────────────────────────
-- Returns per-group counts of total units, active units,
-- units missing coordinates, and unique surveyor names.
-- group_key format:
--   district level: city_district
--   tehsil  level:  city_district::tehsil
--   uc      level:  city_district::tehsil::uc_name
--   unit    level:  survey_id
CREATE OR REPLACE FUNCTION get_survey_group_stats(
  p_city_district text DEFAULT NULL,
  p_tehsil       text DEFAULT NULL,
  p_uc           text DEFAULT NULL,
  p_surveyor     text DEFAULT NULL,
  p_status       text DEFAULT NULL  -- 'ACTIVE', 'ARCHIVED', or NULL for all
)
RETURNS TABLE (
  group_key     text,
  total_units   bigint,
  active_units  bigint,
  no_coords     bigint,
  surveyor_count bigint
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN p_city_district IS NULL THEN su.city_district
      WHEN p_tehsil IS NULL THEN su.city_district || '::' || COALESCE(su.tehsil, 'Unknown')
      ELSE su.city_district || '::' || COALESCE(su.tehsil, 'Unknown') || '::' || COALESCE(su.uc_name, 'Unknown')
    END::text,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE su.status = 'ACTIVE')::bigint,
    COUNT(*) FILTER (WHERE su.lat IS NULL OR su.lng IS NULL)::bigint,
    COUNT(DISTINCT su.surveyor_name)::bigint
  FROM survey_units su
  WHERE (p_city_district IS NULL OR su.city_district = p_city_district)
    AND (p_tehsil IS NULL OR su.tehsil = p_tehsil)
    AND (p_uc IS NULL OR su.uc_name = p_uc)
    AND (p_surveyor IS NULL OR su.surveyor_name = p_surveyor)
    AND (p_status IS NULL OR su.status = p_status)
  GROUP BY 1
  ORDER BY 1;
END;
$$;

COMMENT ON FUNCTION get_survey_group_stats IS
  'Returns per-group survey unit counts. Auto-detects hierarchy level from which params are non-null. group_key format: city_district (district), city_district::tehsil (tehsil), city_district::tehsil::uc_name (uc), survey_id (unit).';

-- ── 2. Billing group stats ─────────────────────────────────
-- Returns per-group billing and payment data for a given month.
-- Uses bill_items.tehsil directly (requires migration 008).
-- group_key format matches get_survey_group_stats for merging.
CREATE OR REPLACE FUNCTION get_billing_group_stats(
  p_city_district text DEFAULT NULL,
  p_tehsil       text DEFAULT NULL,
  p_uc           text DEFAULT NULL,
  p_bill_month   text DEFAULT to_char(CURRENT_DATE, 'MONYYYY')
)
RETURNS TABLE (
  group_key      text,
  billed_units   bigint,
  paid_units     bigint,
  total_collected numeric(12,2)
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH bill_data AS (
    SELECT
      bi.psid,
      CASE
        WHEN p_city_district IS NULL THEN bi.city
        WHEN p_tehsil IS NULL THEN bi.city || '::' || COALESCE(bi.tehsil, 'Unknown')
        ELSE bi.city || '::' || COALESCE(bi.tehsil, 'Unknown') || '::' || COALESCE(bi.uc_name, 'Unknown')
      END::text AS gkey
    FROM bill_items bi
    WHERE bi.bill_month = p_bill_month
      AND (p_city_district IS NULL OR bi.city = p_city_district)
      AND (p_tehsil IS NULL OR bi.tehsil = p_tehsil)
      AND (p_uc IS NULL OR bi.uc_name = p_uc)
  )
  SELECT
    bd.gkey,
    COUNT(DISTINCT bd.psid)::bigint,
    COUNT(DISTINCT ph.psid)::bigint,
    COALESCE(SUM(ph.amount_paid), 0)::numeric(12,2)
  FROM bill_data bd
  LEFT JOIN payment_history ph ON bd.psid = ph.psid
    AND ph.payment_status = 'paid'
    AND ph.bill_month = p_bill_month
  GROUP BY bd.gkey
  ORDER BY bd.gkey;
END;
$$;

COMMENT ON FUNCTION get_billing_group_stats IS
  'Returns per-group billing/payment data for a given bill_month. Auto-detects hierarchy level from which params are non-null. group_key format matches get_survey_group_stats for key-based merging. Uses bill_items.tehsil (migration 008).';

-- ── 3. Payment summary lookup ───────────────────────────────
-- Returns pre-computed grand totals from payment_summary table.
-- Falls back to live aggregation if no summary row exists.
CREATE OR REPLACE FUNCTION get_payment_summary(
  p_bill_month text DEFAULT to_char(CURRENT_DATE, 'MONYYYY')
)
RETURNS TABLE (
  total_paid      integer,
  total_collected numeric(12,2)
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ps.total_paid, (
      SELECT COUNT(DISTINCT ph.psid)::integer
      FROM payment_history ph
      WHERE ph.payment_status = 'paid' AND ph.bill_month = p_bill_month
    ), 0)::integer,
    COALESCE(ps.total_collected, (
      SELECT COALESCE(SUM(ph.amount_paid), 0)::numeric(12,2)
      FROM payment_history ph
      WHERE ph.payment_status = 'paid' AND ph.bill_month = p_bill_month
    ), 0)::numeric(12,2)
  FROM (SELECT 1) t
  LEFT JOIN payment_summary ps ON ps.bill_month = p_bill_month;
END;
$$;

COMMENT ON FUNCTION get_payment_summary IS
  'Returns grand total paid units and collected amount for a given month. Uses pre-computed payment_summary table when available, falls back to live aggregation from payment_history.';

-- ── 4. Billing summary (for KPI cards) ─────────────────────
-- Returns 5 KPI numbers for the billing stats view:
--   total_units, total_paying, total_collected,
--   total_expected, recovery_rate
-- Supports city/tehsil filters. Uses bill_items.tehsil.
CREATE OR REPLACE FUNCTION get_billing_summary(
  p_city_district text DEFAULT NULL,
  p_tehsil       text DEFAULT NULL,
  p_bill_month   text DEFAULT to_char(CURRENT_DATE, 'MONYYYY')
)
RETURNS TABLE (
  total_units     integer,
  total_paying    integer,
  total_collected numeric(12,2),
  total_expected  numeric(12,2),
  recovery_rate   numeric(5,2)
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH bill_data AS (
    SELECT bi.psid, bi.amount_due
    FROM bill_items bi
    WHERE bi.bill_month = p_bill_month
      AND (p_city_district IS NULL OR bi.city = p_city_district)
      AND (p_tehsil IS NULL OR bi.tehsil = p_tehsil)
  ),
  paid_data AS (
    SELECT ph.psid, ph.amount_paid
    FROM payment_history ph
    WHERE ph.bill_month = p_bill_month
      AND ph.payment_status = 'paid'
  )
  SELECT
    COUNT(DISTINCT bd.psid)::integer,
    COUNT(DISTINCT pd.psid)::integer,
    COALESCE(SUM(pd.amount_paid), 0)::numeric(12,2),
    COALESCE(SUM(bd.amount_due), 0)::numeric(12,2),
    CASE
      WHEN COALESCE(SUM(bd.amount_due), 0) > 0
      THEN ROUND((COALESCE(SUM(pd.amount_paid), 0) / SUM(bd.amount_due)) * 100, 2)
      ELSE 0
    END::numeric(5,2)
  FROM bill_data bd
  LEFT JOIN paid_data pd ON bd.psid = pd.psid;
END;
$$;

COMMENT ON FUNCTION get_billing_summary IS
  'Returns 5 KPI numbers: total_units, total_paying, total_collected, total_expected, recovery_rate. Supports city/tehsil filters. Uses bill_items.tehsil (migration 008).';

-- ── 5. Hierarchy for filter dropdowns ─────────────────────────
-- Returns all distinct (city_district, tehsil, uc_name) combos
-- for ACTIVE survey units. Used by the filter panel's hierarchy
-- dropdowns. Avoids PostgREST 1000-row limit by using SELECT DISTINCT.
CREATE OR REPLACE FUNCTION get_hierarchy()
RETURNS TABLE (
  city_district text,
  tehsil       text,
  uc_name      text
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT city_district, tehsil, uc_name
  FROM survey_units
  WHERE status = 'ACTIVE'
  ORDER BY city_district, tehsil, uc_name;
$$;

COMMENT ON FUNCTION get_hierarchy IS
  'Returns all distinct district/tehsil/UC combos for ACTIVE survey units. Used by filter dropdowns.';

-- ── 6. Surveyors for filter dropdowns ─────────────────────────
-- Returns distinct surveyor names for ACTIVE survey units.
CREATE OR REPLACE FUNCTION get_surveyors()
RETURNS TABLE (surveyor_name text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT surveyor_name
  FROM survey_units
  WHERE status = 'ACTIVE'
    AND surveyor_name IS NOT NULL
  ORDER BY surveyor_name;
$$;

COMMENT ON FUNCTION get_surveyors IS
  'Returns distinct surveyor names for ACTIVE survey units. Used by filter dropdowns.';

-- ── 7. Bill months for filter dropdown ────────────────────────
-- Returns distinct bill_months from bill_items, most recent first.
CREATE OR REPLACE FUNCTION get_bill_months()
RETURNS TABLE (bill_month text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT bill_month
  FROM bill_items
  ORDER BY bill_month DESC;
$$;

COMMENT ON FUNCTION get_bill_months IS
  'Returns distinct bill months from bill_items. Used by the month filter dropdown.';
