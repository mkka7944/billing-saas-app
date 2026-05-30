-- ==========================================================
-- Migration 015: Revise RPCs for survey_units.psid + ref tables
-- Created: 2026-05-25
--
-- Updates 5 RPCs to use survey_units.psid and reference tables:
--   1. get_billing_group_stats — geography via survey_units FK instead of bill_items columns
--   2. get_billing_summary — simplify geography join via survey_units.psid
--   3. get_hierarchy — query hierarchy reference table instead of SELECT DISTINCT
--   4. get_surveyors — query surveyors reference table instead of SELECT DISTINCT
--   5. get_bill_months — query bill_months reference table instead of SELECT DISTINCT
--
-- This completes the domain decoupling: payment queries no longer
-- depend on bill_items for geography. survey_units.psid is the bridge.
-- ==========================================================

-- ── 1. get_billing_group_stats ─────────────────────────────
-- Geography now comes from survey_units via bill_items.survey_id FK,
-- not from bill_items.city/tehsil/uc_name (monthly snapshot columns).
-- This correctly groups past months' billing data by current geography.
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
        WHEN p_city_district IS NULL THEN su.city_district
        WHEN p_tehsil IS NULL THEN su.city_district || '::' || COALESCE(su.tehsil, 'Unknown')
        ELSE su.city_district || '::' || COALESCE(su.tehsil, 'Unknown') || '::' || COALESCE(su.uc_name, 'Unknown')
      END::text AS gkey
    FROM bill_items bi
    LEFT JOIN survey_units su ON su.survey_id = bi.survey_id
    WHERE bi.bill_month = p_bill_month
      AND (p_city_district IS NULL OR su.city_district = p_city_district)
      AND (p_tehsil IS NULL OR su.tehsil = p_tehsil)
      AND (p_uc IS NULL OR su.uc_name = p_uc)
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
  'Returns per-group billing/payment data for a given bill_month. Geography from survey_units via FK (decoupled from bill_items snapshot). group_key format: city_district (district), city_district::tehsil (tehsil), city_district::tehsil::uc_name (uc).';

-- ── 2. get_billing_summary ─────────────────────────────────
-- Simplified geography join: survey_units.psid replaces the
-- old bill_items → survey_units double join for payment data.
-- Bill_data still uses bill_items for amount_due but geography
-- from survey_units via FK.
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
  WITH paid_data AS (
    SELECT ph.psid, ph.amount_paid
    FROM payment_history ph
    WHERE ph.bill_month = p_bill_month
      AND ph.payment_status = 'paid'
  ),
  paid_geo AS (
    SELECT pd.amount_paid
    FROM paid_data pd
    LEFT JOIN survey_units su ON su.psid = pd.psid
    WHERE (p_city_district IS NULL OR su.city_district = p_city_district)
      AND (p_tehsil IS NULL OR su.tehsil = p_tehsil)
  ),
  bill_data AS (
    SELECT bi.psid, bi.amount_due
    FROM bill_items bi
    LEFT JOIN survey_units su ON su.survey_id = bi.survey_id
    WHERE bi.bill_month = p_bill_month
      AND (p_city_district IS NULL OR su.city_district = p_city_district)
      AND (p_tehsil IS NULL OR su.tehsil = p_tehsil)
  )
  SELECT
    COALESCE((SELECT COUNT(*)::integer FROM bill_data), 0),
    COALESCE((SELECT COUNT(*)::integer FROM paid_geo), 0),
    COALESCE((SELECT SUM(amount_paid)::numeric(12,2) FROM paid_geo), 0),
    COALESCE((SELECT SUM(amount_due)::numeric(12,2) FROM bill_data), 0),
    CASE
      WHEN (SELECT COALESCE(SUM(amount_due), 0) FROM bill_data) > 0
      THEN ROUND(
        ((SELECT COALESCE(SUM(amount_paid), 0) FROM paid_geo) /
         (SELECT SUM(amount_due) FROM bill_data)) * 100, 2)
      ELSE 0
    END::numeric(5,2);
END;
$$;

COMMENT ON FUNCTION get_billing_summary IS
  'Returns 5 KPI numbers. Payment geography uses survey_units.psid direct join. Billing geography uses survey_units via bill_items.survey_id FK.';

-- ── 3. get_hierarchy ───────────────────────────────────────
-- Queries hierarchy reference table (<500 rows) instead of
-- SELECT DISTINCT on 212K-row survey_units.
CREATE OR REPLACE FUNCTION get_hierarchy()
RETURNS TABLE (
  city_district text,
  tehsil       text,
  uc_name      text
)
LANGUAGE sql STABLE
AS $$
  SELECT city_district, tehsil, uc_name
  FROM hierarchy
  ORDER BY city_district, tehsil, uc_name;
$$;

COMMENT ON FUNCTION get_hierarchy IS
  'Returns all district/tehsil/UC combos from hierarchy reference table. Populated by import scripts + trigger on survey_units changes.';

-- ── 4. get_surveyors ───────────────────────────────────────
-- Queries surveyors reference table (<100 rows) instead of
-- SELECT DISTINCT on 212K-row survey_units.
CREATE OR REPLACE FUNCTION get_surveyors()
RETURNS TABLE (surveyor_name text)
LANGUAGE sql STABLE
AS $$
  SELECT name
  FROM surveyors
  WHERE is_active = true
  ORDER BY name;
$$;

COMMENT ON FUNCTION get_surveyors IS
  'Returns active surveyor names from surveyors reference table.';

-- ── 5. get_bill_months ─────────────────────────────────────
-- Queries bill_months reference table (<20 rows) instead of
-- SELECT DISTINCT on 212K-row bill_items.
CREATE OR REPLACE FUNCTION get_bill_months()
RETURNS TABLE (bill_month text)
LANGUAGE sql STABLE
AS $$
  SELECT month
  FROM bill_months
  ORDER BY month DESC;
$$;

COMMENT ON FUNCTION get_bill_months IS
  'Returns bill months from bill_months reference table. Populated by import scripts + payment_history trigger.';
