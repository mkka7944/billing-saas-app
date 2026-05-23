-- PHASE 1: HIGH-PERFORMANCE DATA HYDRATION (NORMALIZED V2)
-- Purpose: Replaces "3-way fetch" with a single RPC call + Normalized location matching.
-- Author: Antigravity Optimization

DROP FUNCTION IF EXISTS get_hydrated_survey_stats(text, text, text, text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS get_hydrated_survey_stats(text, text, text, text, text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION get_hydrated_survey_stats(
  p_district TEXT DEFAULT NULL,
  p_tehsil TEXT DEFAULT NULL,
  p_uc TEXT DEFAULT NULL,
  p_surveyor TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_master_status TEXT DEFAULT 'ALL',
  p_unit_type TEXT DEFAULT NULL,
  p_sort_column TEXT DEFAULT 'id_numeric',
  p_sort_direction TEXT DEFAULT 'desc',
  p_page_size INTEGER DEFAULT 50,
  p_page_index INTEGER DEFAULT 0
)
RETURNS TABLE (
  total_result_count BIGINT,
  hydrated_records JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER := p_page_index * p_page_size;
  v_total_count BIGINT;
  v_norm_district TEXT := NULLIF(UPPER(TRIM(p_district)), '');
  v_norm_tehsil TEXT := NULLIF(UPPER(TRIM(p_tehsil)), '');
  v_norm_uc TEXT := NULLIF(UPPER(TRIM(p_uc)), '');
BEGIN
  -- 1. Calculate the total count for the filtered set (NORMALIZED)
  SELECT count(*)
  INTO v_total_count
  FROM survey_units_with_stats s
  WHERE (v_norm_district IS NULL OR UPPER(TRIM(s.city_district)) = v_norm_district)
    AND (v_norm_tehsil IS NULL OR UPPER(TRIM(s.tehsil)) = v_norm_tehsil)
    AND (v_norm_uc IS NULL OR UPPER(TRIM(s.uc_name)) = v_norm_uc)
    AND (p_surveyor IS NULL OR s.surveyor_name = p_surveyor)
    AND (p_unit_type IS NULL OR s.unit_type ILIKE '%' || p_unit_type || '%')
    AND (p_search IS NULL OR (s.survey_id ILIKE '%' || p_search || '%' OR s.consumer_name ILIKE '%' || p_search || '%'))
    AND (
      p_master_status = 'ALL' OR
      (p_master_status = 'ARCHIVED' AND s.status = 'ARCHIVED') OR
      (p_master_status = 'ACTIVE_BILLER' AND s.status = 'ACTIVE' AND s.is_biller = TRUE) OR
      (p_master_status = 'NEW_SURVEY' AND s.status = 'ACTIVE' AND s.is_biller = FALSE) OR
      (p_master_status NOT IN ('ALL', 'ARCHIVED', 'ACTIVE_BILLER', 'NEW_SURVEY') AND s.status = 'ACTIVE')
    );

  -- 2. Return the single-trip result (Hydrated with billing calculations)
  RETURN QUERY
  WITH filtered_surveys AS (
    SELECT 
      s.survey_id, 
      s.consumer_name, 
      s.city_district, 
      s.tehsil, 
      s.uc_name, 
      s.status, 
      s.surveyor_name, 
      s.survey_date, 
      s.created_at, 
      s.is_biller,
      s.unit_type,
      s.id_numeric
    FROM survey_units_with_stats s
    WHERE (v_norm_district IS NULL OR UPPER(TRIM(s.city_district)) = v_norm_district)
      AND (v_norm_tehsil IS NULL OR UPPER(TRIM(s.tehsil)) = v_norm_tehsil)
      AND (v_norm_uc IS NULL OR UPPER(TRIM(s.uc_name)) = v_norm_uc)
      AND (p_surveyor IS NULL OR s.surveyor_name = p_surveyor)
      AND (p_unit_type IS NULL OR s.unit_type ILIKE '%' || p_unit_type || '%')
      AND (p_search IS NULL OR (s.survey_id ILIKE '%' || p_search || '%' OR s.consumer_name ILIKE '%' || p_search || '%'))
      AND (
        p_master_status = 'ALL' OR
        (p_master_status = 'ARCHIVED' AND s.status = 'ARCHIVED') OR
        (p_master_status = 'ACTIVE_BILLER' AND s.status = 'ACTIVE' AND s.is_biller = TRUE) OR
        (p_master_status = 'NEW_SURVEY' AND s.status = 'ACTIVE' AND s.is_biller = FALSE) OR
        (p_master_status NOT IN ('ALL', 'ARCHIVED', 'ACTIVE_BILLER', 'NEW_SURVEY') AND s.status = 'ACTIVE')
      )
    ORDER BY
      CASE WHEN p_sort_direction = 'asc' THEN
        CASE 
          WHEN p_sort_column = 'survey_id' THEN s.survey_id
          WHEN p_sort_column = 'consumer_name' THEN s.consumer_name
          WHEN p_sort_column = 'city_district' THEN s.city_district
          WHEN p_sort_column = 'surveyor_name' THEN s.surveyor_name
          ELSE NULL 
        END
      END ASC,
      CASE WHEN p_sort_direction = 'desc' THEN
        CASE 
          WHEN p_sort_column = 'survey_id' THEN s.survey_id
          WHEN p_sort_column = 'consumer_name' THEN s.consumer_name
          WHEN p_sort_column = 'city_district' THEN s.city_district
          WHEN p_sort_column = 'surveyor_name' THEN s.surveyor_name
          ELSE NULL 
        END
      END DESC,
      CASE WHEN p_sort_direction = 'asc' AND p_sort_column = 'id_numeric' THEN s.id_numeric END ASC,
      CASE WHEN p_sort_direction = 'desc' AND p_sort_column = 'id_numeric' THEN s.id_numeric END DESC,
      CASE WHEN p_sort_direction = 'asc' AND p_sort_column = 'created_at' THEN s.created_at END ASC,
      CASE WHEN p_sort_direction = 'desc' AND p_sort_column = 'created_at' THEN s.created_at END DESC
    LIMIT p_page_size OFFSET v_offset
  ),
  hydrated_records AS (
    SELECT 
      fs.*,
      COALESCE((
        -- Inner aggregation for bill history (DEC, NOV, OCT, SEP 2025)
        SELECT jsonb_agg(jsonb_build_object(
          'month', b.bill_month,
          'paid', (b.payment_status = 'PAID'),
          'issued', b.is_issued
        ) ORDER BY b.bill_month DESC)
        FROM bills b 
        WHERE b.survey_id = fs.survey_id
          AND b.bill_month IN ('DEC2025', 'NOV2025', 'OCT2025', 'SEP2025')
      ), '[]'::jsonb) as history,
      COALESCE((
        SELECT SUM(amount_due) FROM bills b WHERE b.survey_id = fs.survey_id
      ), 0) as total_due,
      COALESCE((
        SELECT SUM(amount_paid) FROM bills b WHERE b.survey_id = fs.survey_id
      ), 0) as total_paid
    FROM filtered_surveys fs
  )
  SELECT 
    v_total_count as total_result_count, 
    COALESCE(jsonb_agg(hr), '[]'::jsonb) as hydrated_records 
  FROM hydrated_records hr;
END;
$$;
