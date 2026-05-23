-- RPC: get_recovery_performance_report
-- Purpose: Detailed recovery metrics for Field Teams (UC/Tehsil Wise).
-- Logic: Calculates recovery % based on (Paid / Expected).
-- Returns: JSON object with 'performance_data' array.

CREATE OR REPLACE FUNCTION get_recovery_performance_report(
    p_district TEXT DEFAULT NULL,
    p_tehsil TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_report JSON;
BEGIN

    SELECT json_agg(r) INTO v_report
    FROM (
        SELECT 
            su.uc_name,
            su.tehsil,
            COUNT(DISTINCT su.survey_id) as total_units,
            COUNT(DISTINCT CASE WHEN b.payment_status = 'PAID' THEN su.survey_id END) as paying_units,
            
            -- Financials
            COALESCE(SUM(su.monthly_fee), 0) as expected_monthly,
            COALESCE(SUM(b.amount_paid), 0) as total_collected_history,
            
            -- Performance Metrics
            CASE 
                WHEN COUNT(DISTINCT su.survey_id) > 0 
                THEN ROUND((COUNT(DISTINCT CASE WHEN b.payment_status = 'PAID' THEN su.survey_id END)::numeric / COUNT(DISTINCT su.survey_id)::numeric) * 100, 1)
                ELSE 0 
            END as recovery_rate_percentage
            
        FROM survey_units su
        LEFT JOIN bills b ON su.survey_id = b.survey_id
        WHERE su.status = 'ACTIVE'
        AND (p_district IS NULL OR su.city_district = p_district)
        AND (p_tehsil IS NULL OR su.tehsil = p_tehsil)
        GROUP BY su.tehsil, su.uc_name
        ORDER BY recovery_rate_percentage DESC
    ) r;

    RETURN json_build_object(
        'report_date', NOW(),
        'performance_data', COALESCE(v_report, '[]'::json)
    );

END;
$$;
