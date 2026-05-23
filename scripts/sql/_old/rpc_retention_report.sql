-- RPC: get_payer_retention_report
-- Purpose: Tracks "Loyalty" or "Consistency" of the original cohort of payers.
-- Author: Antigravity Analytics v1.0

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
    -- 1. Identify the "Original Cohort" (Those who paid in the starting phase)
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
    
    -- 2. Define the Months to Track (Relative to Oct-2025)
    -- We track Oct-2025 (Base), Nov-2025, Dec-2025, Jan-2026
    tracking AS (
        SELECT 
            c.tehsil,
            c.survey_id,
            -- Check for payments in subsequent months
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Nov-2025' AND b.amount_paid > 0) as paid_nov,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Dec-2025' AND b.amount_paid > 0) as paid_dec,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = 'Jan-2026' AND b.amount_paid > 0) as paid_jan
        FROM cohort c
    ),
    
    -- 3. Aggregate results by Tehsil
    tehsil_summary AS (
        SELECT 
            tehsil as name,
            count(*) as cohort_size,
            count(*) FILTER (WHERE paid_nov) as Nov_paid_count,
            count(*) FILTER (WHERE paid_dec) as Dec_paid_count,
            count(*) FILTER (WHERE paid_jan) as Jan_paid_count,
            -- Percentages
            ROUND((count(*) FILTER (WHERE paid_nov)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Nov_retention,
            ROUND((count(*) FILTER (WHERE paid_dec)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Dec_retention,
            ROUND((count(*) FILTER (WHERE paid_jan)::NUMERIC / NULLIF(count(*), 0) * 100), 1) as Jan_retention
        FROM tracking
        GROUP BY tehsil
        ORDER BY cohort_size DESC
    ),
    
    -- 4. Grand Totals for the entire Area/District
    grand_totals AS (
        SELECT 
            'ALL REGIONS' as name,
            SUM(cohort_size) as cohort_size,
            SUM(Nov_paid_count) as Nov_paid_count,
            SUM(Dec_paid_count) as Dec_paid_count,
            SUM(Jan_paid_count) as Jan_paid_count,
            ROUND((SUM(Nov_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1) as Nov_retention,
            ROUND((SUM(Dec_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1) as Dec_retention,
            ROUND((SUM(Jan_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1) as Jan_retention
        FROM tehsil_summary
    )
    
    SELECT json_build_object(
        'grand_totals', (SELECT row_to_json(gt) FROM grand_totals gt),
        'tehsil_retention', COALESCE(json_agg(ts), '[]'::json)
    ) INTO v_report
    FROM tehsil_summary ts;

    RETURN v_report;
END;
$$;
