-- 042-delivery-quality-rpc.sql
-- Per-staff delivery quality metrics for a billing month
-- Used by Settings → Administration → Delivery Quality tab
-- Admin-only RPC (per AGENTS.md exception for admin aggregate queries)

CREATE OR REPLACE FUNCTION get_delivery_quality(p_month text)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  assigned_city text,
  total_assigned bigint,
  total_delivered bigint,
  photo_fail_count bigint,
  gps_oor_count bigint,
  fail_rate numeric,
  quality_score numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH assigned_items(sid, item_id, status) AS (
    SELECT da.staff_id, ai.id, ai.status
    FROM daily_assignments da
    JOIN assignment_items ai ON ai.assignment_id = da.id
    WHERE da.bill_month = p_month
  ),
  photo_fails(sid, item_id) AS (
    SELECT DISTINCT da.staff_id, ai.id
    FROM daily_assignments da
    JOIN assignment_items ai ON ai.assignment_id = da.id
    JOIN delivery_photos dp ON dp.assignment_item_id = ai.id
    WHERE da.bill_month = p_month
      AND dp.synced_to_drive = false AND dp.photo_url IS NULL
  ),
  staff_total AS (
    SELECT sid, COUNT(*)::bigint AS cnt FROM assigned_items GROUP BY sid
  ),
  staff_delivered AS (
    SELECT sid, COUNT(*)::bigint AS cnt FROM assigned_items WHERE status = 'delivered' GROUP BY sid
  ),
  staff_processing AS (
    SELECT sid, COUNT(*)::bigint AS cnt FROM assigned_items WHERE status = 'processing' GROUP BY sid
  ),
  staff_photo_fails AS (
    SELECT sid, COUNT(*)::bigint AS cnt FROM photo_fails GROUP BY sid
  )
  SELECT
    s.id,
    COALESCE(NULLIF(TRIM(s.full_name), ''), s.username, 'Unknown'),
    s.assigned_city,
    COALESCE(st.cnt, 0),
    COALESCE(sd.cnt, 0),
    COALESCE(spf.cnt, 0),
    COALESCE(sp.cnt, 0),
    CASE
      WHEN COALESCE(sd.cnt, 0) > 0
      THEN ROUND((COALESCE(spf.cnt, 0) + COALESCE(sp.cnt, 0)) * 100.0 / sd.cnt, 1)
      ELSE 0
    END,
    CASE
      WHEN COALESCE(st.cnt, 0) > 0
      THEN GREATEST(0, ROUND(100.0 - (
        COALESCE(spf.cnt, 0) * 5.0 + COALESCE(sp.cnt, 0) * 3.0
      ) / st.cnt::numeric * 100, 1))
      ELSE 0
    END
  FROM staff s
  LEFT JOIN staff_total st ON st.sid = s.id
  LEFT JOIN staff_delivered sd ON sd.sid = s.id
  LEFT JOIN staff_processing sp ON sp.sid = s.id
  LEFT JOIN staff_photo_fails spf ON spf.sid = s.id
  WHERE st.cnt IS NOT NULL
  ORDER BY s.assigned_city, COALESCE(NULLIF(TRIM(s.full_name), ''), s.username, 'Unknown');
END;
$$;
