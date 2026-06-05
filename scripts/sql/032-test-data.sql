-- ==========================================================
-- Migration 032: Test Data for GPS Enforcement Testing
-- 2026-06-05
--
-- Inserts 5 test survey units at known coordinates around
-- the admin's PC location (32.071639, 72.657694), plus a
-- pre-assigned batch for staff user 'zubair' to test the
-- full delivery flow end-to-end after deployment.
--
-- Prerequisites:
--   - Staff user with id '671dd08c-ffc1-401b-a9d9-209d1a128b16'
--     must exist in the `staff` table (field_staff, Sargodha).
--   - Run this AFTER the staff trigger (026) has populated
--     the staff row for that user.
-- ==========================================================

-- ── 1. Test Survey Units ──────────────────────────────────
-- Coordinates are offsets from PC location at 32.071639,72.657694
-- with distances 20m, 30m, 40m, 55m, and 70m to test threshold
-- enforcement boundaries.
-- Status = NULL (matches applyActiveFilter() like real enriched units).
-- Note: `city` column (migration 024) not yet applied to this DB — omitted.
INSERT INTO survey_units (survey_id, psid, status, city_district, tehsil, uc_name,
  consumer_name, address, lat, lng, monthly_fee, billing_category, start_month)
VALUES
  ('TESTPC01', 'TST_PSID_020', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC',
   'Test 20m East', 'GPS test point 20m East of admin PC', 32.071639, 72.657906,
   100, 'STANDARD', 'JUN2026'),
  ('TESTPC02', 'TST_PSID_030', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC',
   'Test 30m South', 'GPS test point 30m South of admin PC', 32.071370, 72.657694,
   100, 'STANDARD', 'JUN2026'),
  ('TESTPC03', 'TST_PSID_040', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC',
   'Test 40m West', 'GPS test point 40m West of admin PC', 32.071639, 72.657270,
   100, 'STANDARD', 'JUN2026'),
  ('TESTPC04', 'TST_PSID_055', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC',
   'Test 55m NE', 'GPS test point 55m NE diagonal of admin PC', 32.071988, 72.658106,
   100, 'STANDARD', 'JUN2026'),
  ('TESTPC05', 'TST_PSID_070', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC',
   'Test 70m North', 'GPS test point 70m North of admin PC', 32.072268, 72.657694,
   100, 'STANDARD', 'JUN2026')
ON CONFLICT (survey_id) DO NOTHING;

-- ── 2. Test Assignment (pre-assigned to zubair) ───────────
-- A single daily batch with all 5 test points, all pending.
INSERT INTO daily_assignments (id, staff_id, issued_at, uc_name, total_items, created_by)
VALUES ('a0000000-1111-0000-0000-000000000001',
        '671dd08c-ffc1-401b-a9d9-209d1a128b16',
        CURRENT_DATE, 'TESTMC', 5,
        '671dd08c-ffc1-401b-a9d9-209d1a128b16')
ON CONFLICT (id) DO NOTHING;

INSERT INTO assignment_items (assignment_id, psid, survey_id, route_seq, status)
VALUES
  ('a0000000-1111-0000-0000-000000000001', 'TST_PSID_020', 'TESTPC01', 1, 'pending'),
  ('a0000000-1111-0000-0000-000000000001', 'TST_PSID_030', 'TESTPC02', 2, 'pending'),
  ('a0000000-1111-0000-0000-000000000001', 'TST_PSID_040', 'TESTPC03', 3, 'pending'),
  ('a0000000-1111-0000-0000-000000000001', 'TST_PSID_055', 'TESTPC04', 4, 'pending'),
  ('a0000000-1111-0000-0000-000000000001', 'TST_PSID_070', 'TESTPC05', 5, 'pending')
ON CONFLICT (assignment_id, psid) DO NOTHING;
