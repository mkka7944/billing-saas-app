-- RPC: get_finance_summary_metrics (V11 - Audit Reconciliation)
-- Purpose: Includes 'total_transactions' to match Audit Excel counts.

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
    v_actual_district TEXT;
    v_actual_tehsil TEXT;
BEGIN
    -- Normalize Empty Strings to NULL
    v_actual_district := NULLIF(TRIM(p_district), '');
    v_actual_tehsil := NULLIF(TRIM(p_tehsil), '');

    -- 1. Grand Totals 
    WITH filtered_bills AS (
        SELECT 
            b.*,
            su.city_district as su_district,
            su.tehsil as su_tehsil
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND (v_actual_tehsil IS NULL OR su.tehsil = v_actual_tehsil)
    )
    SELECT json_build_object(
        'total_demand', COALESCE(SUM(current_bill), 0),
        'total_units', COUNT(*),
        'total_revenue', COALESCE(SUM(amount_paid), 0),
        'total_bills_paid', COUNT(*) FILTER (WHERE amount_paid > 0),
        'total_transactions', COALESCE(SUM(payment_count), 0) -- Match Excel Count
    ) INTO v_grand_totals
    FROM filtered_bills;

    -- 2. Tehsil Stats
    SELECT json_agg(t) INTO v_tehsil_stats
    FROM (
        SELECT 
            su.tehsil as name,
            COUNT(*) as total_units,
            COUNT(*) FILTER (WHERE b.amount_paid > 0) as total_paid,
            COALESCE(SUM(b.payment_count), 0) as total_transactions,
            COALESCE(SUM(b.amount_paid), 0) as total_collected
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_actual_district IS NULL OR su.city_district = v_actual_district)
        GROUP BY su.tehsil
        ORDER BY total_collected DESC
    ) t;

    -- 3. UC Stats
    SELECT json_agg(u) INTO v_uc_stats
    FROM (
        SELECT 
            su.uc_name as name,
            COUNT(*) as total_units,
             COUNT(*) FILTER (WHERE b.amount_paid > 0) as total_paid,
             COALESCE(SUM(b.payment_count), 0) as total_transactions,
            COALESCE(SUM(b.amount_paid), 0) as total_collected
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND (v_actual_tehsil IS NULL OR su.tehsil = v_actual_tehsil)
        GROUP BY su.uc_name
        ORDER BY total_collected DESC
        LIMIT 10
    ) u;

    -- 4. Category Stats
    SELECT json_agg(c) INTO v_category_stats
    FROM (
        SELECT 
            COALESCE(NULLIF(UPPER(b.billing_category), ''), 'OTHER') as name,
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE b.amount_paid > 0) as total_paid,
            COALESCE(SUM(b.payment_count), 0) as total_transactions,
            COALESCE(SUM(b.current_bill), 0) as potential_revenue
        FROM bills b
        JOIN survey_units su ON b.survey_id = su.survey_id
        WHERE b.bill_month = p_bill_month
        AND (v_actual_district IS NULL OR su.city_district = v_actual_district)
        AND (v_actual_tehsil IS NULL OR su.tehsil = v_actual_tehsil)
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
