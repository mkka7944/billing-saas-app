-- ==========================================================
-- Migration 036: Test MC Data for Delivery Hardening Tests
-- 2026-06-09
--
-- Creates 11 test MCs × 50 houses = 550 survey units under
-- city_district='TEST', tehsil='TEST' for isolated testing.
-- GPS grid pattern: 10 MCs in office plus shape, TEST-11 at home.
-- Status = 'ACTIVE' so hierarchy trigger auto-populates.
--
-- Prerequisites:
--   - Must run AFTER hierarchy trigger (migration 010) is in place
--   - Staff users must be created separately via Settings > Users
-- ==========================================================

-- ── 1. Clean up old test data ──────────────────────────────
-- Delete delivery photos for old test assignments
DELETE FROM delivery_photos
WHERE assignment_item_id IN (
  SELECT id FROM assignment_items
  WHERE assignment_id IN (
    SELECT id FROM daily_assignments WHERE uc_name IN ('TESTMC-OFFICE', 'TESTMC-HOME')
  )
);

-- Delete old test assignment items
DELETE FROM assignment_items
WHERE assignment_id IN (
  SELECT id FROM daily_assignments WHERE uc_name IN ('TESTMC-OFFICE', 'TESTMC-HOME')
);

-- Delete old test daily assignments
DELETE FROM daily_assignments WHERE uc_name IN ('TESTMC-OFFICE', 'TESTMC-HOME');

-- Delete old test survey units
DELETE FROM survey_units WHERE uc_name IN ('TESTMC-OFFICE', 'TESTMC-HOME');

-- ── 2. Survey Units — 11 MCs × 50 houses ──────────────────
-- Uses generate_series grid: 5 rows × 10 cols per MC, 20m spacing.
-- Consumer names: "Test {n}-{m}" (e.g. "Test 1-01", "Test 11-50")
-- PSIDs: T{n}_{seq:03d} (e.g. T1_001, T11_050)
-- Survey IDs: TST{uc_num:02d}{seq:03d} (e.g. TST01001, TST11050)

WITH mc_config AS (
  SELECT * FROM (VALUES
    ('TEST-1',  32.071639, 72.657694),
    ('TEST-2',  32.071639, 72.662000),
    ('TEST-3',  32.071639, 72.653388),
    ('TEST-4',  32.075000, 72.657694),
    ('TEST-5',  32.068278, 72.657694),
    ('TEST-6',  32.075500, 72.653000),
    ('TEST-7',  32.075500, 72.662500),
    ('TEST-8',  32.067700, 72.653000),
    ('TEST-9',  32.067700, 72.662500),
    ('TEST-10', 32.073500, 72.658500),
    ('TEST-11', 32.093250, 72.696111)
  ) AS t(uc_name, center_lat, center_lng)
),
grid AS (
  SELECT
    row_num,
    col_num,
    (row_num - 3) * 0.0002 AS lat_offset,
    (col_num - 5) * 0.0002 AS lng_offset
  FROM generate_series(1, 5) AS row_num,
       generate_series(1, 10) AS col_num
),
numbered AS (
  SELECT
    m.uc_name,
    m.center_lat + g.lat_offset AS lat,
    m.center_lng + g.lng_offset AS lng,
    ROW_NUMBER() OVER (PARTITION BY m.uc_name ORDER BY g.row_num, g.col_num) AS seq,
    REPLACE(m.uc_name, 'TEST-', '') AS uc_num
  FROM mc_config m
  CROSS JOIN grid g
)
INSERT INTO survey_units (
  survey_id, psid, consumer_name, address,
  city_district, tehsil, uc_name,
  lat, lng, monthly_fee, billing_category,
  status, start_month, route_name, route_seq,
  surveyor_name, survey_date, survey_time,
  created_at, updated_at
)
SELECT
  CONCAT('TST', LPAD(uc_num, 2, '0'), LPAD(CAST(seq AS TEXT), 3, '0')),
  CONCAT('T', uc_num, '_', LPAD(CAST(seq AS TEXT), 3, '0')),
  CONCAT('Test ', uc_num, '-', LPAD(CAST(seq AS TEXT), 2, '0')),
  CONCAT('House ', seq, ', TEST-', uc_num),
  'TEST',
  'TEST',
  uc_name,
  lat,
  lng,
  100,
  'STANDARD',
  'ACTIVE',
  'JUN2026',
  CONCAT('ROUTE-TEST-', uc_num),
  seq,
  'Test Surveyor',
  CURRENT_DATE,
  CURRENT_TIME,
  NOW(),
  NOW()
FROM numbered
ORDER BY uc_num::int, seq
ON CONFLICT (survey_id) DO NOTHING;

-- ── 3. Insert app_settings key for test_mode ───────────────
INSERT INTO app_settings (key, value, updated_at)
VALUES ('test_mode', '{"enabled": false}', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
