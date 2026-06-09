-- ==========================================================
-- Migration 037: Test MC Coords — Northward Semicircle
-- 2026-06-09
--
-- All 11 test MCs (550 houses) clustered in a northward
-- semicircle (NW→N→NE) within ~130m of office origin.
-- Ring 1 (55m): TEST-1..4   at ±7.5°, ±22.5°
-- Ring 2 (115m): TEST-5..11 at 0°, ±12.5°, ±25°, ±37.5°
-- Each MC: 50 houses with ±30m random scatter.
-- ==========================================================

SELECT setseed(0.42);

WITH centers AS (
  SELECT * FROM (VALUES
    ('TEST-1',  32.072097, 72.657470),
    ('TEST-2',  32.072130, 72.657618),
    ('TEST-3',  32.072130, 72.657770),
    ('TEST-4',  32.072097, 72.657918),
    ('TEST-5',  32.072461, 72.656950),
    ('TEST-6',  32.072578, 72.657178),
    ('TEST-7',  32.072650, 72.657430),
    ('TEST-8',  32.072675, 72.657694),
    ('TEST-9',  32.072650, 72.657958),
    ('TEST-10', 32.072578, 72.658210),
    ('TEST-11', 32.072461, 72.658438)
  ) AS t(uc_name, center_lat, center_lng)
),
scatter AS (
  SELECT
    su.survey_id,
    su.uc_name,
    c.center_lat + (sqrt(random()) * 30) * sin(random() * 2*pi()) / 111000 AS new_lat,
    c.center_lng + (sqrt(random()) * 30) * cos(random() * 2*pi()) / (111000 * cos(radians(32))) AS new_lng
  FROM survey_units su
  JOIN centers c ON su.uc_name = c.uc_name
  WHERE su.city_district = 'TEST'
)
UPDATE survey_units su
SET
  lat = ROUND(s.new_lat::numeric, 6),
  lng = ROUND(s.new_lng::numeric, 6)
FROM scatter s
WHERE su.survey_id = s.survey_id;
