-- RPC: get_payer_retention_report (V1.1 - HARDENED)
-- Purpose: Tracks "Loyalty" or "Consistency" of the original cohort of payers.
-- Author: Antigravity Analytics v1.1

CREATE OR REPLACE FUNCTION get_payer_retention_report(
    p_cohort_month TEXT DEFAULT 'Oct-2025',
    p_district TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_norm_district TEXT := NULLIF(UPPER(TRIM(p_district)), '');
    v_report JSON;
BEGIN
    WITH 
    -- 1. Identify the "Original Cohort"
    cohort AS (
        SELECT DISTINCT 
            b.survey_id,
            su.tehsil,
            su.city_district
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_cohort_month
          AND b.amount_paid > 0
          AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
    ),
    
    -- 2. Define the Months to Track
    tracking AS (
        SELECT 
            c.tehsil,
            c.survey_id,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Nov-2025' AND b.amount_paid > 0) as paid_nov,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Dec-2025' AND b.amount_paid > 0) as paid_dec,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Jan-2026' AND b.amount_paid > 0) as paid_jan
        FROM cohort c
    ),
    
    -- 3. Aggregate results by Tehsil
    tehsil_summary AS (
        SELECT 
            COALESCE(tehsil, 'UNKNOWN') as name,
            count(*) as cohort_size,
            count(*) FILTER (WHERE paid_nov) as Nov_paid_count,
            count(*) FILTER (WHERE paid_dec) as Dec_paid_count,
            count(*) FILTER (WHERE paid_jan) as Jan_paid_count,
            ROUND((count(*) FILTER (WHERE paid_nov)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Nov_retention,
            ROUND((count(*) FILTER (WHERE paid_dec)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Dec_retention,
            ROUND((count(*) FILTER (WHERE paid_jan)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Jan_retention
        FROM tracking
        GROUP BY 1
    )
    
    -- 4. Construct Final JSON explicitly to avoid empty result nulls
    SELECT json_build_object(
        'grand_totals', (
            SELECT json_build_object(
                'name', 'ALL REGIONS',
                'cohort_size', COALESCE(SUM(cohort_size), 0),
                'nov_paid_count', COALESCE(SUM(Nov_paid_count), 0),
                'dec_paid_count', COALESCE(SUM(Dec_paid_count), 0),
                'jan_paid_count', COALESCE(SUM(Jan_paid_count), 0),
                'nov_retention', COALESCE(ROUND((SUM(Nov_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0),
                'dec_retention', COALESCE(ROUND((SUM(Dec_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0),
                'jan_retention', COALESCE(ROUND((SUM(Jan_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0)
            ) FROM tehsil_summary
        ),
        'tehsil_retention', COALESCE((SELECT json_agg(ts) FROM tehsil_summary ts), '[]'::json)
    ) INTO v_report;

    RETURN v_report;
END;
$$;
