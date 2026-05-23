-- RPC: get_finance_summary_metrics (V13 - ULTIMATE HARDENING)
-- Purpose: 100% Defensive Null Handling, Explicit Casting, and Normalized Matching.

CREATE OR REPLACE FUNCTION get_finance_summary_metrics(
    p_district TEXT DEFAULT NULL,
    p_tehsil TEXT DEFAULT NULL,
    p_bill_month TEXT DEFAULT 'Dec-2025'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_tehsil_stats JSON;
    v_uc_stats JSON;
    v_category_stats JSON;
    v_grand_totals JSON;
    v_norm_district TEXT := NULLIF(UPPER(TRIM(p_district)), '');
    v_norm_tehsil TEXT := NULLIF(UPPER(TRIM(p_tehsil)), '');
BEGIN
    -- 1. Grand Totals (Hardened Sums)
    WITH filtered_bills AS (
        SELECT 
            b.*
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
        AND (v_norm_tehsil IS NULL OR UPPER(TRIM(su.tehsil)) = v_norm_tehsil)
    )
    SELECT json_build_object(
        'total_demand', COALESCE(SUM(current_bill)::NUMERIC, 0),
        'total_units', COUNT(*)::BIGINT,
        'total_revenue', COALESCE(SUM(amount_paid)::NUMERIC, 0),
        'total_bills_paid', COUNT(*) FILTER (WHERE amount_paid > 0)::BIGINT,
        'total_transactions', COALESCE(SUM(payment_count)::BIGINT, 0)
    ) INTO v_grand_totals
    FROM filtered_bills;

    -- 2. Tehsil Stats (Handled Defaults)
    SELECT json_agg(t) INTO v_tehsil_stats
    FROM (
        SELECT 
            COALESCE(su.tehsil, 'UNKNOWN') as name,
            COUNT(*)::BIGINT as total_units,
            COUNT(*) FILTER (WHERE b.amount_paid > 0)::BIGINT as total_paid,
            COALESCE(SUM(b.payment_count)::BIGINT, 0) as total_transactions,
            COALESCE(SUM(b.amount_paid)::NUMERIC, 0) as total_collected
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
        GROUP BY 1
        ORDER BY total_collected DESC
    ) t;

    -- 3. UC Stats (Handled Defaults)
    SELECT json_agg(u) INTO v_uc_stats
    FROM (
        SELECT 
            COALESCE(su.uc_name, 'UNKNOWN') as name,
            COUNT(*)::BIGINT as total_units,
            COUNT(*) FILTER (WHERE b.amount_paid > 0)::BIGINT as total_paid,
            COALESCE(SUM(b.payment_count)::BIGINT, 0) as total_transactions,
            COALESCE(SUM(b.amount_paid)::NUMERIC, 0) as total_collected
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
        AND (v_norm_tehsil IS NULL OR UPPER(TRIM(su.tehsil)) = v_norm_tehsil)
        GROUP BY 1
        ORDER BY total_collected DESC
        LIMIT 10
    ) u;

    -- 4. Category Stats (Handled Defaults)
    SELECT json_agg(c) INTO v_category_stats
    FROM (
        SELECT 
            COALESCE(NULLIF(UPPER(TRIM(b.billing_category)), ''), 'OTHER') as name,
            COUNT(*)::BIGINT as count,
            COUNT(*) FILTER (WHERE b.amount_paid > 0)::BIGINT as total_paid,
            COALESCE(SUM(b.payment_count)::BIGINT, 0) as total_transactions,
            COALESCE(SUM(b.current_bill)::NUMERIC, 0) as potential_revenue
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_norm_district IS NULL OR UPPER(TRIM(su.city_district)) = v_norm_district)
        AND (v_norm_tehsil IS NULL OR UPPER(TRIM(su.tehsil)) = v_norm_tehsil)
        GROUP BY 1
        ORDER BY potential_revenue DESC
    ) c;

    -- Return Combined JSON (Ensuring Non-Null Lists)
    RETURN json_build_object(
        'grand_totals', COALESCE(v_grand_totals, '{"total_demand":0,"total_units":0,"total_revenue":0,"total_bills_paid":0,"total_transactions":0}'::json),
        'tehsil_stats', COALESCE(v_tehsil_stats, '[]'::json),
        'uc_stats', COALESCE(v_uc_stats, '[]'::json),
        'category_stats', COALESCE(v_category_stats, '[]'::json)
    );

END;
$$;
