-- RPC: get_finance_summary_metrics (V8 - Robust Filters)
-- Purpose: Fast-Path + Enhanced robustness for empty parameters.
-- Requirement: 
-- 1. CREATE INDEX IF NOT EXISTS idx_bills_survey_id ON bills(survey_id);
-- 2. CREATE INDEX IF NOT EXISTS idx_survey_units_survey_id ON survey_units(survey_id);

CREATE OR REPLACE FUNCTION get_finance_summary_metrics(
    p_district TEXT DEFAULT NULL,
    p_tehsil TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_tehsil_stats JSON;
    v_uc_stats JSON;
    v_category_stats JSON;
    v_grand_totals JSON;
    v_actual_district TEXT;
    v_actual_tehsil TEXT;
BEGIN
    -- Normalize Empty Strings to NULL
    v_actual_district := NULLIF(TRIM(p_district), '');
    v_actual_tehsil := NULLIF(TRIM(p_tehsil), '');

    -- 1. Grand Totals (Optimized Fast-Path)
    IF v_actual_district IS NULL AND v_actual_tehsil IS NULL THEN
        -- System-wide absolute totals (Fast)
        SELECT json_build_object(
            'total_demand', (SELECT COALESCE(SUM(monthly_fee), 0) FROM survey_units WHERE status = 'ACTIVE'),
            'total_units', (SELECT COUNT(*) FROM survey_units WHERE status = 'ACTIVE'),
            'total_revenue', (SELECT COALESCE(SUM(amount_paid), 0) FROM bills),
            'total_bills_paid', (SELECT COUNT(*) FROM bills WHERE amount_paid > 0)
        ) INTO v_grand_totals;
    ELSE
        -- Filtered Totals
        WITH filtered_units AS (
            SELECT survey_id, monthly_fee
            FROM survey_units
            WHERE (v_actual_district IS NULL OR city_district = v_actual_district)
            AND (v_actual_tehsil IS NULL OR tehsil = v_actual_tehsil)
            AND status = 'ACTIVE'
        ),
        filtered_recovery AS (
            SELECT 
                COALESCE(SUM(b.amount_paid), 0) as total_collected,
                COUNT(b.psid) as paid_count
            FROM bills b
            JOIN filtered_units fu ON b.survey_id = fu.survey_id
            WHERE b.amount_paid > 0
        )
        SELECT json_build_object(
            'total_demand', COALESCE(SUM(fu.monthly_fee), 0),
            'total_units', COUNT(fu.survey_id),
            'total_revenue', (SELECT total_collected FROM filtered_recovery),
            'total_bills_paid', (SELECT paid_count FROM filtered_recovery)
        ) INTO v_grand_totals
        FROM filtered_units fu;
    END IF;

    -- 2. Tehsil Stats
    SELECT json_agg(t) INTO v_tehsil_stats
    FROM (
        SELECT 
            su.tehsil as name,
            COUNT(DISTINCT su.survey_id) as total_units,
            COALESCE(SUM(b.amount_paid), 0) as total_collected
        FROM survey_units su
        LEFT JOIN bills b ON su.survey_id = b.survey_id
        WHERE (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND su.status = 'ACTIVE'
        GROUP BY su.tehsil
        ORDER BY total_collected DESC
    ) t;

    -- 3. UC Stats (Filtered by District/Tehsil)
    SELECT json_agg(u) INTO v_uc_stats
    FROM (
        SELECT 
            su.uc_name as name,
            COUNT(DISTINCT su.survey_id) as total_units,
            COALESCE(SUM(b.amount_paid), 0) as total_collected
        FROM survey_units su
        LEFT JOIN bills b ON su.survey_id = b.survey_id
        WHERE (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND (v_actual_tehsil IS NULL OR su.tehsil = v_actual_tehsil)
        AND su.status = 'ACTIVE'
        GROUP BY su.uc_name
        ORDER BY total_collected DESC
        LIMIT 10
    ) u;

    -- 4. Category Stats
    SELECT json_agg(c) INTO v_category_stats
    FROM (
        SELECT 
            COALESCE(NULLIF(UPPER(su.billing_category), ''), 'OTHER') as name,
            COUNT(DISTINCT su.survey_id) as count,
            COALESCE(SUM(su.monthly_fee), 0) as potential_revenue
        FROM survey_units su
        WHERE (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND (v_actual_tehsil IS NULL OR su.tehsil = v_actual_tehsil)
        AND su.status = 'ACTIVE'
        GROUP BY 1
        ORDER BY potential_revenue DESC
    ) c;

    -- Return Combined JSON
    RETURN json_build_object(
        'grand_totals', v_grand_totals,
        'tehsil_stats', COALESCE(v_tehsil_stats, '[]'::json),
        'uc_stats', COALESCE(v_uc_stats, '[]'::json),
        'category_stats', COALESCE(v_category_stats, '[]'::json)
    );

END;
$$;
