# Billing SaaS App — Database Schema Reference

> **Last verified:** 2026-05-30 (live Supabase query)
> **Project ref:** `qrxbsoqepfaryolwcedk`
> **How to query:** Read `SUPABASE_ACCESS_TOKEN` from `.env.local`, POST to Management API

## Quick Access

```powershell
# Get token at runtime (never hardcode)
$token = (Get-Content -LiteralPath ".env.local" | Select-String -Pattern "SUPABASE_ACCESS_TOKEN=").ToString().Split('=')[1].Trim()

# Run any SQL
$body = @{ query = "SQL here" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query" -Method Post -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $body
```

---

## 1. Tables

### 1.1 `app_settings`
Key-value store for application configuration.

| Column | Type | Constraints |
|--------|------|-------------|
| `key` | `text` | PK |
| `value` | `text` | |
| `description` | `text` | |
| `updated_at` | `timestamptz` | |

**Indexes:** `app_settings_pkey` UNIQUE BTREE (key)

---

### 1.2 `assignment_items`
Individual PSID delivery tracking within a daily assignment chunk.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `assignment_id` | `uuid` | FK → `daily_assignments(id)` CASCADE |
| `psid` | `text` | |
| `route_seq` | `int4` | |
| `status` | `text` | pending → delivered/missed/skipped |
| `delivered_at` | `timestamptz` | set server-side on PATCH |
| `gps_lat` | `numeric` | captured at delivery |
| `gps_lng` | `numeric` | captured at delivery |
| `notes` | `text` | miss reason, etc. |

**Indexes:**
- `assignment_items_pkey` UNIQUE BTREE (id)
- `assignment_items_assignment_id_psid_key` UNIQUE BTREE (assignment_id, psid)

**Triggers:** `trg_refresh_staff_stats` AFTER INSERT/UPDATE/DELETE → `refresh_staff_daily_stats()`

---

### 1.3 `bill_months`
Reference table for month filter dropdown. Populated from lifecycle import scripts.

| Column | Type | Constraints |
|--------|------|-------------|
| `month` | `text` | PK (e.g., 'MAY2026') |
| `created_at` | `timestamptz` | default `now()` |

**Indexes:** `bill_months_pkey` UNIQUE BTREE (month)

---

### 1.4 `daily_assignments`
One per staff per day per UC. Created by admin via `/assignments` page.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `staff_id` | `uuid` | FK → `profiles(id)` (or `staff(id)`) |
| `assigned_date` | `date` | |
| `uc_name` | `text` | |
| `total_items` | `int4` | |
| `created_by` | `uuid` | admin who created |
| `created_at` | `timestamptz` | default `now()` |

**Indexes:** `daily_assignments_pkey` UNIQUE BTREE (id)

---

### 1.5 `delivery_photos`
One row per photo captured during delivery.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `assignment_item_id` | `uuid` | FK → `assignment_items(id)` CASCADE |
| `photo_url` | `text` | Google Drive thumbnail URL |
| `gdrive_file_id` | `text` | |
| `gps_lat` | `numeric` | |
| `gps_lng` | `numeric` | |
| `captured_at` | `timestamptz` | |
| `synced_to_drive` | `bool` | default false |

**Indexes:** `delivery_photos_pkey` UNIQUE BTREE (id)

---

### 1.6 `hierarchy`
Reference table for filter dropdowns. Populated by trigger + import scripts.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `int4` | PK (identity) |
| `city_district` | `text` | |
| `tehsil` | `text` | |
| `uc_name` | `text` | |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | |

**Indexes:**
- `hierarchy_pkey` UNIQUE BTREE (id)
- `hierarchy_city_district_tehsil_uc_name_key` UNIQUE BTREE (city_district, tehsil, uc_name)
- `idx_hierarchy_district` BTREE (city_district)
- `idx_hierarchy_tehsil` BTREE (tehsil)
- `idx_hierarchy_uc` BTREE (uc_name)

**Trigger:** `trg_survey_units_upsert_hierarchy` AFTER INSERT/UPDATE/DELETE on `survey_units` → `sync_hierarchy()`

---

### 1.7 `house_corrections`
GPS pin corrections + house intel entered by staff during delivery.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `survey_id` | `text` | FK → `survey_units(survey_id)` |
| `corrected_lat` | `numeric` | |
| `corrected_lng` | `numeric` | |
| `original_lat` | `numeric` | auto-populated by trigger |
| `original_lng` | `numeric` | auto-populated by trigger |
| `street_no` | `text` | |
| `landmark` | `text` | |
| `notes` | `text` | |
| `correction_type` | `text` | |
| `corrected_by` | `uuid` | |
| `corrected_at` | `timestamptz` | |
| `assigned_date` | `date` | |

**Indexes:** `house_corrections_pkey` UNIQUE BTREE (id)

**Trigger:** `trg_house_corrections_set_originals` BEFORE INSERT → `set_correction_originals()`

---

### 1.8 `payment_history`
All payments, one row per (PSID, month). Append-only, all months.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `psid` | `text` | |
| `bill_month` | `text` | e.g., 'MAY2026' |
| `amount_paid` | `numeric` | |
| `paid_date` | `date` | |
| `payment_method` | `text` | |
| `payment_status` | `text` | |
| `fine` | `numeric` | |
| `created_at` | `timestamptz` | default `now()` |

**Indexes:**
- `payment_history_pkey` UNIQUE BTREE (id)
- `payment_history_psid_bill_month_key` UNIQUE BTREE (psid, bill_month)
- `idx_payment_psid` BTREE (psid)
- `idx_payment_psid_month` BTREE (psid, bill_month)
- `idx_payment_month` BTREE (bill_month)

**🔴 Known issue:** Trigger `trg_payment_history_refresh_summary` exists on this table and calls `refresh_payment_summary()`, but the target table `payment_summary` does NOT exist in the database. The trigger function would fail. Needs a cleanup migration.

---

### 1.9 `profiles`
User profiles linked to `auth.users`. Created by RBAC system.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (FK → `auth.users(id)`) |
| `full_name` | `text` | |
| `updated_at` | `timestamptz` | |
| `username` | `text` | UNIQUE |
| `role_id` | `int8` | FK → `roles(id)` |
| `suspended_at` | `timestamptz` | non-null = frozen |
| `deleted_at` | `timestamptz` | non-null = soft-deleted |

**Indexes:**
- `profiles_pkey` UNIQUE BTREE (id)
- `profiles_username_key` UNIQUE BTREE (username)
- `idx_profiles_username` BTREE (username)

---

### 1.10 `roles`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `int8` | PK (identity) |
| `name` | `text` | UNIQUE |
| `description` | `text` | |
| `created_at` | `timestamptz` | default `now()` |

**Values:** 1=super_admin, 2=admin, 3=field_staff

**Indexes:** `roles_pkey` UNIQUE BTREE (id), `roles_name_key` UNIQUE BTREE (name)

---

### 1.11 `staff`
Legacy staff table. May overlap with `profiles`. The assignments/delivery system queries this table.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK |
| `email` | `text` | |
| `role` | `text` | |
| `full_name` | `text` | |
| `assigned_city` | `text` | |
| `assigned_ucs` | `_text` | text array |
| `is_active` | `bool` | |
| `created_at` | `timestamptz` | |
| `username` | `text` | |
| `role_id` | `int8` | |

**⚠ Likely empty** — RBAC creates users in `profiles`, not `staff`. Sync SQL needed.

**Indexes:** `staff_pkey` UNIQUE BTREE (id)

---

### 1.12 `staff_daily_stats`
Pre-computed daily performance. Auto-refreshed by trigger on `assignment_items`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `staff_id` | `uuid` | |
| `assigned_date` | `date` | |
| `total_assigned` | `int4` | |
| `delivered` | `int4` | |
| `missed` | `int4` | |
| `start_time` | `timestamptz` | |
| `end_time` | `timestamptz` | |

**Indexes:**
- `staff_daily_stats_pkey` UNIQUE BTREE (id)
- `staff_daily_stats_staff_id_assigned_date_key` UNIQUE BTREE (staff_id, assigned_date)

---

### 1.13 `staff_performance`
Admin ratings and notes per staff per day.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK (default `gen_random_uuid()`) |
| `staff_id` | `uuid` | |
| `assigned_date` | `date` | |
| `rating` | `int2` | 1-5 |
| `notes` | `text` | |
| `created_by` | `uuid` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Indexes:**
- `staff_performance_pkey` UNIQUE BTREE (id)
- `staff_performance_staff_id_assigned_date_key` UNIQUE BTREE (staff_id, assigned_date)

---

### 1.14 `survey_units`
Core table — household identity, GPS, billing enrichment. ~212K rows.

| Column | Type | Constraints |
|--------|------|-------------|
| `survey_id` | `text` | PK |
| `status` | `text` | ACTIVE / ARCHIVED / etc. |
| `city_district` | `text` | SARGODHA / KHUSHAB |
| `tehsil` | `text` | SARGODHA / BHALWAL / KHUSHAB |
| `uc_name` | `text` | e.g., 'MC-17, ...' |
| `consumer_name` | `text` | |
| `address` | `text` | |
| `surveyor_name` | `text` | |
| `survey_date` | `date` | |
| `survey_time` | `time` | |
| `lat` | `float8` | |
| `lng` | `float8` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `monthly_fee` | `int4` | enriched from lifecycle |
| `billing_category` | `text` | enriched from lifecycle |
| `psid` | `text` | stable biller ID (may be NULL for unregistered) |
| `amount_due` | `int4` | NOT used in UI — computed as monthly_fee+arrears |
| `arrears` | `int4` | enriched from lifecycle |
| `route_name` | `text` | |
| `route_seq` | `int4` | |
| `current_bill_month` | `text` | last enriched month |
| `image_urls` | `_text` | legacy, may be dropped |

**Indexes:**
- `survey_units_pkey` UNIQUE BTREE (survey_id)
- `idx_survey_psid` BTREE (psid) WHERE psid IS NOT NULL
- `idx_survey_psid_unique` UNIQUE BTREE (psid) WHERE psid IS NOT NULL
- `idx_survey_status` BTREE (status)
- `idx_survey_district` BTREE (city_district)
- `idx_survey_tehsil` BTREE (tehsil)
- `idx_survey_uc` BTREE (uc_name)
- `idx_survey_units_city_district` BTREE (city_district)
- `idx_survey_units_psid` BTREE (psid)
- `idx_survey_units_tehsil` BTREE (tehsil)

**Triggers:** `trg_survey_units_upsert_hierarchy` AFTER INSERT/UPDATE/DELETE → `sync_hierarchy()`

---

### 1.15 `surveyors`
Reference table for surveyor filter dropdown.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `int4` | PK (identity) |
| `name` | `text` | UNIQUE |
| `is_active` | `bool` | default true |
| `created_at` | `timestamptz` | default `now()` |

**Indexes:**
- `surveyors_pkey` UNIQUE BTREE (id)
- `surveyors_name_key` UNIQUE BTREE (name)
- `idx_surveyors_name` BTREE (name)

---

## 2. RPCs (Functions)

### 2.1 Business RPCs

| Name | Args | Returns | Purpose |
|------|------|---------|---------|
| `get_billing_stats` | p_month, p_district, p_tehsil | `json` | Grand totals, tehsil/UC/category stats for the Data Insight KPI cards. Uses `survey_units.current_bill_month` + `payment_history`. |
| `get_hierarchy_stats` | p_month, p_district, p_tehsil, p_uc, p_status | `json` | Drill-down KPI rows for Data Insight. Groups by district→tehsil→UC→PSID. |
| `get_charts_data` | p_district, p_tehsil, p_month | `jsonb` | Dashboard charts: monthly_trend, daily_detail, category_summary, tehsil_breakdown, monthly_curves, kpi. Uses `payment_history` with `EXISTS` city/tehsil filter + LATERAL join. |
| `get_billing_summary` | p_city_district, p_tehsil, p_bill_month | `TABLE` | Recovery rate: total_units, paying, collected, expected, recovery_rate. Uses `payment_history` + `bill_items`. |
| `get_billing_group_stats` | p_city_district, p_tehsil, p_uc, p_bill_month | `TABLE` | Grouped billing stats by geographic hierarchy level. Uses `bill_items` + `payment_history`. |
| `get_survey_group_stats` | p_city_district, p_tehsil, p_uc, p_surveyor, p_status | `TABLE` | Survey unit counts grouped by geography level. Uses `survey_units` only. |
| `get_hierarchy` | — | `TABLE` | Returns all `(city_district, tehsil, uc_name)` from `hierarchy` table. |
| `get_surveyors` | — | `TABLE` | Returns active surveyor names from `surveyors` table. |
| `get_bill_months` | — | `TABLE` | Returns months from `bill_months` table. |
| `get_payment_summary` | p_bill_month | `TABLE` | Returns total_paid + total_collected from `payment_summary` (falls back to live query). |

### 2.2 Trigger Functions

| Name | Returns | Table | Purpose |
|------|---------|-------|---------|
| `refresh_payment_summary()` | `trigger` | `payment_history` | 🔴 **BROKEN** — target table `payment_summary` does NOT exist |
| `refresh_staff_daily_stats()` | `trigger` | `assignment_items` | Auto-recomputes `staff_daily_stats` after item changes |
| `set_correction_originals()` | `trigger` | `house_corrections` | Auto-fills original_lat/lng from `survey_units` |
| `set_bill_items_tehsil()` | `trigger` | — | **Dead code** — was for dropped `bill_items` table |
| `sync_hierarchy()` | `trigger` | `survey_units` | Maintains `hierarchy` reference table |

### 2.3 Triggers (Live on DB)

| Trigger | Table | Timing | Event | Function |
|---------|-------|--------|-------|----------|
| `trg_payment_history_refresh_summary` | `payment_history` | AFTER | INSERT/UPDATE/DELETE | `refresh_payment_summary()` 🔴 |
| `trg_refresh_staff_stats` | `assignment_items` | AFTER | INSERT/UPDATE/DELETE | `refresh_staff_daily_stats()` |
| `trg_house_corrections_set_originals` | `house_corrections` | BEFORE | INSERT | `set_correction_originals()` |
| `trg_survey_units_upsert_hierarchy` | `survey_units` | AFTER | INSERT/UPDATE/DELETE | `sync_hierarchy()` |

---

## 3. Known Issues

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | `payment_summary` table doesn't exist, but `trg_payment_history_refresh_summary` trigger + `refresh_payment_summary()` function exist | Any INSERT/UPDATE/DELETE on `payment_history` throws an error | Drop the trigger and function, or create the table |
| 2 | `set_bill_items_tehsil()` function exists but targets dropped `bill_items` table | No trigger references it, so no runtime impact | Safe to drop |
| 3 | `staff` table likely empty — RBAC creates users in `profiles` only | Assignments page staff dropdown shows nothing | Sync SQL needed: INSERT staff SELECT from profiles |
| 4 | `get_charts_data` RPC uses `LEFT JOIN LATERAL` for tehsil — orphaned PSIDs get NULL → 'Unknown' | Office Breakdown chart shows "Unknown" bars | Add city/tehsil columns to payment_history, update RPC |
| 5 | `get_billing_summary` and `get_billing_group_stats` reference `bill_items` (dropped table) | These RPCs will fail if called | Update to use `survey_units` enrichment columns or drop |

---

## 4. Migration History

| Migration | File | Status | Notes |
|-----------|------|--------|-------|
| 005 | `005-bill-items-payment-history.sql` | ✅ Applied | Core tables |
| 006 | `006-payment-summary.sql` | ✅ Applied | payment_summary table (later dropped) |
| 007 | `007-data-insight-rpcs.sql` | ❌ Moved to `_old/` | Replaced by 019 + dynamic queries |
| 008 | `008-add-tehsil-to-bill-items.sql` | ❓ Unknown | Targets dropped bill_items |
| 009 | `009-triggers-and-automation.sql` | ✅ Applied | Triggers (tehsil, payment_summary) |
| 010 | `010-reference-tables.sql` | ✅ Applied | hierarchy, surveyors, bill_months |
| 011 | `011-performance-indexes.sql` | ✅ Applied | Indexes |
| 012 | `012-add-psid-to-survey-units.sql` | ✅ Applied | psid column to survey_units |
| 013 | `013-add-verification-tracking.sql` | ✅ Applied | last_verified_month |
| 014 | `014-house-corrections-table.sql` | ✅ Applied | house_corrections table |
| 015 | `015-revise-rpcs.sql` | ❌ Moved to `_old/` | Replaced by 019 + 021 |
| 016 | `016-delivery-tracking-tables.sql` | ✅ Applied | daily_assignments, assignment_items, delivery_photos, staff_daily_stats |
| 017 | `017-storage-optimization.sql` | ✅ Applied | Dropped image_urls, VACUUM FULL |
| 019 | `019-aggregation-rpcs.sql` | ✅ Applied | get_billing_stats, get_hierarchy_stats |
| 020 | `020-rbac-system.sql` | ✅ Applied | Roles, profiles migration |
| 021 | `021-charts-aggregation.sql` | ✅ Applied | get_charts_data RPC |

**Missing:** Migration 018 was skipped/never created.

---

## 5. Key Queries for Verification

```sql
-- Check if MC-17 has enriched data
SELECT count(*) FROM survey_units
WHERE uc_name LIKE 'MC-17%' AND status = 'ACTIVE' AND psid IS NOT NULL;

-- Check for orphaned PSIDs in payment_history
SELECT count(DISTINCT ph.psid) FROM payment_history ph
LEFT JOIN survey_units su ON su.psid = ph.psid
WHERE su.psid IS NULL;

-- Check staff table vs profiles
SELECT p.id, p.full_name, p.username, p.role_id FROM profiles p
WHERE p.role_id = 3 AND p.deleted_at IS NULL
AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = p.id);

-- Check RPC exists
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'get_charts_data';

-- List active triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers WHERE trigger_schema = 'public';
```
