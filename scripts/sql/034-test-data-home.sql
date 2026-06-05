-- ==========================================================
-- Migration 034: Test Data for Home + Rename Office Test MC
-- 2026-06-05
--
-- Part A: Renames existing TESTMC (from migration 032) to TESTMC-OFFICE
--         so the two test MCs are clearly distinguishable.
-- Part B: Adds 5 new test survey units at the home location
--         (32.093250, 72.696111) clustered 5-25m east of home.
-- Part C: Pre-assigns a daily batch for staff 'zubair' so the
--         new home units are immediately testable on mobile.
--
-- Prerequisites:
--   - Migration 032 must have been applied (otherwise Part A is a no-op).
--   - Staff user 'zubair' (uuid 671dd08c-ffc1-401b-a9d9-209d1a128b16)
--     must exist in the `staff` table (field_staff, Sargodha).
--   - Run AFTER the staff trigger (026) has populated the staff row.
-- ==========================================================

-- ── 1. Rename existing TESTMC → TESTMC-OFFICE ─────────────
-- Idempotent: only matches unrenamed rows (uc_name = 'TESTMC').
-- Also updates the address text from "admin PC" to "office PC" for clarity.
UPDATE survey_units
   SET uc_name = 'TESTMC-OFFICE',
       address = REPLACE(address, 'admin PC', 'office PC')
 WHERE uc_name = 'TESTMC';

UPDATE daily_assignments
   SET uc_name = 'TESTMC-OFFICE'
 WHERE uc_name = 'TESTMC';

-- ── 2. Test Survey Units — TESTMC-HOME ────────────────────
-- Coordinates are offsets east of home at 32.093250, 72.696111
-- with distances 5m, 10m, 15m, 20m, 25m. All within 50m threshold,
-- so on real mobile GPS all should auto-verify as 'delivered'.
-- Status = NULL (matches applyActiveFilter() like real enriched units).
-- City is Sargodha district + Sargodha tehsil (home is north of Sargodha city).
INSERT INTO survey_units (survey_id, psid, status, city_district, tehsil, uc_name,
  consumer_name, address, lat, lng, monthly_fee, billing_category, start_month)
VALUES
  ('TESTHM01', 'TSTHM_PSID_005', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC-HOME',
   'Home Test 5m E', 'GPS test point 5m East of home', 32.093250, 72.696164,
   100, 'STANDARD', 'JUN2026'),
  ('TESTHM02', 'TSTHM_PSID_010', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC-HOME',
   'Home Test 10m E', 'GPS test point 10m East of home', 32.093250, 72.696217,
   100, 'STANDARD', 'JUN2026'),
  ('TESTHM03', 'TSTHM_PSID_015', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC-HOME',
   'Home Test 15m E', 'GPS test point 15m East of home', 32.093250, 72.696271,
   100, 'STANDARD', 'JUN2026'),
  ('TESTHM04', 'TSTHM_PSID_020', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC-HOME',
   'Home Test 20m E', 'GPS test point 20m East of home', 32.093250, 72.696324,
   100, 'STANDARD', 'JUN2026'),
  ('TESTHM05', 'TSTHM_PSID_025', NULL, 'SARGODHA', 'SARGODHA', 'TESTMC-HOME',
   'Home Test 25m E', 'GPS test point 25m East of home', 32.093250, 72.696378,
   100, 'STANDARD', 'JUN2026')
ON CONFLICT (survey_id) DO NOTHING;

-- ── 3. Test Assignment (pre-assigned to zubair) ───────────
-- Distinct assignment id from the office batch (a0000000-...) to avoid conflicts.
INSERT INTO daily_assignments (id, staff_id, issued_at, uc_name, total_items, created_by)
VALUES ('b0000000-1111-0000-0000-000000000001',
        '671dd08c-ffc1-401b-a9d9-209d1a128b16',
        CURRENT_DATE, 'TESTMC-HOME', 5,
        '671dd08c-ffc1-401b-a9d9-209d1a128b16')
ON CONFLICT (id) DO NOTHING;

INSERT INTO assignment_items (assignment_id, psid, survey_id, route_seq, status)
VALUES
  ('b0000000-1111-0000-0000-000000000001', 'TSTHM_PSID_005', 'TESTHM01', 1, 'pending'),
  ('b0000000-1111-0000-0000-000000000001', 'TSTHM_PSID_010', 'TESTHM02', 2, 'pending'),
  ('b0000000-1111-0000-0000-000000000001', 'TSTHM_PSID_015', 'TESTHM03', 3, 'pending'),
  ('b0000000-1111-0000-0000-000000000001', 'TSTHM_PSID_020', 'TESTHM04', 4, 'pending'),
  ('b0000000-1111-0000-0000-000000000001', 'TSTHM_PSID_025', 'TESTHM05', 5, 'pending')
ON CONFLICT (assignment_id, psid) DO NOTHING;
