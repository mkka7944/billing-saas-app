-- RPC: get_payer_retention_report (V2.0 - UNIVERSAL SEQUENCE ENGINE)
-- Purpose: Dynamically calculates retention for any starting month + 3 subsequent months.
-- Logic: 
--   1. Normalizes Input (SEP2025 -> sep2025).
--   2. Dynamically calculates Month+1, Month+2, Month+3.
--   3. Ignores "Ghost Data" (Anything not matching 7-char pattern like Dec-2025).
-- Author: Antigravity Analytics v2.0

CREATE OR REPLACE FUNCTION get_payer_retention_report(
    p_cohort_month TEXT DEFAULT 'NOV2025',
    p_district TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_norm_district TEXT := NULLIF(UPPER(TRIM(p_district)), '');
    v_start_date DATE;
    v_m0 TEXT; v_m1 TEXT; v_m2 TEXT; v_m3 TEXT;
    v_report JSON;
BEGIN
    -- 1. Convert String (NOV2025) to actual DATE for math
    -- Standardizing on MMMYYYY format
    BEGIN
        v_start_date := TO_DATE(p_cohort_month, 'MONYYYY');
    EXCEPTION WHEN OTHERS THEN
        v_start_date := '2025-11-01'::DATE;
    END;

    -- 2. Generate the Sequence of Months (Normalized to MMMYYYY)
    v_m0 := UPPER(TO_CHAR(v_start_date, 'MONYYYY'));
    v_m1 := UPPER(TO_CHAR(v_start_date + INTERVAL '1 month', 'MONYYYY'));
    v_m2 := UPPER(TO_CHAR(v_start_date + INTERVAL '2 month', 'MONYYYY'));
    v_m3 := UPPER(TO_CHAR(v_start_date + INTERVAL '3 month', 'MONYYYY'));

    WITH 
    -- 3. Identify the "Original Cohort"
    -- STRICT 7-CHARACTER MATCH to ignore "Dec-2025" ghost data
    cohort AS (
        SELECT DISTINCT 
            b.survey_id,
            su.tehsil,
            su.city_district
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = v_m0
          AND b.amount_paid > 0
          AND length(b.bill_month) = 7
          AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
    ),
    
    -- 4. Dynamic Sequence Tracking
    tracking AS (
        SELECT 
            c.tehsil,
            c.survey_id,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = v_m1 AND b.amount_paid > 0) as paid_m1,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = v_m2 AND b.amount_paid > 0) as paid_m2,
            EXISTS(SELECT 1 FROM bills b WHERE b.survey_id = c.survey_id AND b.bill_month = v_m3 AND b.amount_paid > 0) as paid_m3
        FROM cohort c
    ),
    
    -- 5. Aggregate by Tehsil
    tehsil_summary AS (
        SELECT 
            COALESCE(tehsil, 'UNKNOWN') as name,
            count(*) as cohort_size,
            count(*) FILTER (WHERE paid_m1) as m1_paid_count,
            count(*) FILTER (WHERE paid_m2) as m2_paid_count,
            count(*) FILTER (WHERE paid_m3) as m3_paid_count,
            -- Percentages
            COALESCE(ROUND((count(*) FILTER (WHERE paid_m1)::NUMERIC / NULLIF(count(*), 0) * 100), 1), 0) as m1_retention,
            COALESCE(ROUND((count(*) FILTER (WHERE paid_m2)::NUMERIC / NULLIF(count(*), 0) * 100), 1), 0) as m2_retention,
            COALESCE(ROUND((count(*) FILTER (WHERE paid_m3)::NUMERIC / NULLIF(count(*), 0) * 100), 1), 0) as m3_retention
        FROM tracking
        GROUP BY 1
    ),
    
    -- 6. Combine into Final JSON with dynamic labels
    grand_totals AS (
        SELECT 
            'ALL REGIONS' as name,
            SUM(cohort_size) as cohort_size,
            SUM(m1_paid_count) as m1_paid_count,
            SUM(m2_paid_count) as m2_paid_count,
            SUM(m3_paid_count) as m3_paid_count,
            COALESCE(ROUND((SUM(m1_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0) as m1_retention,
            COALESCE(ROUND((SUM(m2_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0) as m2_retention,
            COALESCE(ROUND((SUM(m3_paid_count)::NUMERIC / NULLIF(SUM(cohort_size), 0) * 100), 1), 0) as m3_retention
        FROM tehsil_summary
    )
    
    SELECT json_build_object(
        'meta', json_build_object(
            'm0_label', v_m0,
            'm1_label', v_m1,
            'm2_label', v_m2,
            'm3_label', v_m3
        ),
        'grand_totals', (SELECT row_to_json(gt) FROM grand_totals gt),
        'tehsil_retention', COALESCE((SELECT json_agg(ts) FROM tehsil_summary ts), '[]'::json)
    ) INTO v_report;

    RETURN v_report;
END;
$$;
