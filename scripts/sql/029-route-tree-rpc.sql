-- 029-route-tree-rpc.sql
-- RPC returning distinct routes per city/UC with unit counts
-- Excludes "Unrouted" (seq=999999) — returned as is_unrouted=true
-- Used by GET /api/routes for the route tree sidebar

CREATE OR REPLACE FUNCTION get_route_tree(p_city text DEFAULT '')
RETURNS TABLE(
  city_district text,
  tehsil text,
  uc_name text,
  route_name text,
  unit_count bigint,
  is_unrouted boolean
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    su.city_district,
    COALESCE(NULLIF(trim(su.tehsil), ''), 'Unknown'),
    su.uc_name,
    su.route_name,
    COUNT(*)::bigint,
    CASE WHEN su.route_name = 'Unrouted' THEN true ELSE false END
  FROM survey_units su
  WHERE su.route_name IS NOT NULL
    AND (p_city = '' OR su.city_district = p_city)
  GROUP BY su.city_district, su.tehsil, su.uc_name, su.route_name
  ORDER BY su.city_district, su.tehsil, su.uc_name,
    CASE WHEN su.route_name = 'Unrouted' THEN 'ZZZZ' ELSE su.route_name END;
END;
$$;
