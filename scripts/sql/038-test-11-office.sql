-- ==========================================================
-- Migration 038: Move TEST-11 to Office Coordinates
-- 2026-06-09
--
-- Centers all 50 TEST-11 units at office origin
-- (32.071639, 72.657694) with ±10m random scatter.
-- All other test MCs unchanged.
-- ==========================================================

SELECT setseed(0.42);

WITH scattered AS (
  SELECT
    survey_id,
    32.071639 + (sqrt(random()) * 10) * sin(random() * 2*pi()) / 111000 AS new_lat,
    72.657694 + (sqrt(random()) * 10) * cos(random() * 2*pi()) / (111000 * cos(radians(32))) AS new_lng
  FROM survey_units
  WHERE city_district = 'TEST' AND uc_name = 'TEST-11'
)
UPDATE survey_units su
SET
  lat = ROUND(s.new_lat::numeric, 6),
  lng = ROUND(s.new_lng::numeric, 6)
FROM scattered s
WHERE su.survey_id = s.survey_id;
