# Billing & Recovery — Master Plan
**Generated:** 2026-05-24 | **Stack:** Next.js 16 + Supabase + Tailwind v4 + Zustand + TanStack Query  
**Project:** Billing SaaS App — Field staff bill delivery & verification system  
**Scale:** ~350K households, ~70 field staff, 3 cities (Bhalwal/Khushab/Sargodha)
> This file is the single source of truth. All prior plan documents are archived to `docs/archive/`.  
> Every session **starts** by reading this file and **ends** by appending to the Session Log.
---
## Table of Contents
1. [Project Identity & Architecture](#1-project-identity--architecture)
2. [User Experience: Two Modes](#2-user-experience-two-modes)
3. [Visual Design System](#3-visual-design-system)
4. [Route Structure](#4-route-structure)
5. [Lifecycle Data Pipeline](#5-lifecycle-data-pipeline)
6. [Data Model](#6-data-model)
7. [Monthly Data Workflow](#7-monthly-data-workflow)
8. [Performance Rules](#8-performance-rules)
9. [Edge Case Decisions](#9-edge-case-decisions)
10. [Implementation Phases](#10-implementation-phases)
11. [Implementation Workflow](#11-implementation-workflow)
12. [Session Log](#12-session-log)
13. [File Inventory](#13-file-inventory)
14. [Changelog](#14-changelog)
---
## 1. Project Identity & Architecture
### 1.1 Company Context
We are a sanitation contract company working under **SWMC** (Solid Waste Management Company), a government agency. We survey households and deliver bills issued through the SWMC portal.
### 1.2 The Core Mission
A digital system forcing accountability: lifecycle data → PDF generation → staff assignment → GPS-tracked delivery with mandatory photo proof → performance tracking. Every bill delivery requires timestamped photo evidence. Staff performance tracked per delivery, with auto-routing derived from actual delivery timestamps.

**We do NOT collect payments.** Payment data comes from the SWMC govt portal (daily CSV export). Our system tracks recovery rates by matching our delivery data against portal payment data.
### 1.3 Scale
- **Households:** ~350K across 3 cities
- **Field Staff:** ~70 delivery staff
- **Monthly Bills:** ~30K–70K printed per month
- **Free Tier Commitment:** Optimized for Supabase (500MB DB, 1GB Storage) and Vercel (100GB Bandwidth) free tiers
### 1.4 Technology Stack
- **Framework:** Next.js 16 (App Router) with `src/` directory
- **Language:** TypeScript (strict type-safety)
- **Database:** Supabase (PostgreSQL) — project `qrxbsoqepfaryolwcedk`
- **Auth:** Supabase Auth (admin-created accounts for field staff)
- **State:** Zustand (persisted stores for UI state)
- **Styling:** Tailwind CSS v4 + Shadcn UI
- **Data Fetching:** TanStack Query v5
- **Map:** react-leaflet + Google Maps tiles (streets + satellite)
- **Photos:** Google Drive Apps Script webhook (zero Supabase Storage egress)
- **PDF:** PyMuPDF (fitz) + qrcode + python-barcode (local engine)
- **Data Pipeline:** Python (pandas + openpyxl + PyMuPDF) for lifecycle XLSX → DB
- **CLI Dependencies:** `fitz`, `pandas`, `openpyxl`, `python-dotenv`, `supabase-py`

### 1.5 Key Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| **Standalone app** | Separate Supabase project (not HR), separate Vercel deploy |
| **Google Maps tiles** | Internal office tool, not commercial SaaS — better satellite resolution than MapTiler |
| **Photos via GAS webhook** | Reuse proven routing station endpoint. Zero Supabase Storage egress costs |
| **Reference tables for filters** | Small `hierarchy`, `surveyors`, `bill_months` tables replace `SELECT DISTINCT` on 212K rows. Never hit PostgREST 1000-row limit. Populated once, maintained by import scripts + triggers. |
| **No RPCs for client features** | RPCs banned for client-facing features (prevents N+1). **EXCEPTION:** RPCs allowed for admin-only aggregate queries — Data Insight, admin dashboards. See `scripts/sql/007-data-insight-rpcs.sql` for approved RPCs. |
| **SSR API routes for all client data** | All survey/billing/payment data fetched via Next.js API routes (`/api/surveys`, `/api/billing-stats`) — NOT direct client-side Supabase queries. Reduces egress, hides service role, enables server-side JOINs. |
| **DB triggers for data integrity** | `bill_items.tehsil` auto-populated on INSERT via trigger. `payment_summary` auto-refreshed on payment_history changes. Hierarchy reference table upserted on survey_units changes. |
| **Explicit column selects** | Never `select('*')` — egress cost control |
| **Manual monthly processing** | pdf-bill-printer.py runs manually on 19-20th each month (handles PDF gen) |
| **Offline photo queue** | Photos stored in IndexedDB when offline, upload when online |

### 1.6 Authentication System (RBAC)
- 3 roles: `super_admin` (full access), `admin` (operations), `field_staff` (deliver only)
- Staff log in with **username** (transformed to `username@billing.local` behind the scenes)
- Admin logs in with email or username
- Passwords set by admin only — no self-service password change
- Frozen accounts (`suspended_at`) blocked with "Account is frozen. Contact your admin."
- Soft-delete (`deleted_at`) preserves performance history
- Refer to `scripts/sql/020-rbac-system.sql` for schema

### 1.7 Maps
- **Streets:** `https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`
- **Satellite hybrid:** `https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}`
- **Subdomains:** `mt0,mt1,mt2,mt3` | **MaxZoom:** 20

---
## 2. User Experience: Two Modes

The app has two distinct user modes, each with a different interface:

### 2.1 Field Staff Mode (Mobile-First)
**Primary device:** Phone browser
**Goal:** Navigate assigned bills, capture photo proof, finish daily chunk

| Element | Design |
|---------|--------|
| **Home screen** | Map fills screen. Bottom sheet shows daily progress (Delivered X/Y) + next house name. |
| **Map** | Full-screen Leaflet. Markers only for today's assigned bills. Green=delivered, blue=pending, red=missed. |
| **List** | Swipeable card list. Each card: house name, address snippet, delivery status badge, photo count. Pull-to-refresh. |
| **Photo capture** | One tap opens camera (native `capture="environment"`). Auto-compress. Queued in IndexedDB if offline. |
| **Navigation** | Tap marker → show house detail bottom sheet → "Deliver" button → camera → done. Swipe to next. |
| **Progress** | Persistent progress bar at top: "12/25 delivered today" + time elapsed. |
| **Theme** | Light mode only (sunlight readability). High contrast. Huge touch targets (48px+). Bold sans-serif font. |
| **Bottom nav** | Map | List | Today's Stats |
| **Data** | Staff sees ONLY assigned bills via `daily_assignments` join. No hierarchy filters. No admin controls. |

### 2.2 Admin Mode (Desktop-First, Mobile-Available)
**Primary device:** Desktop browser (also works on tablet/phone)
**Goal:** Manage assignments, view analytics, configure filters, oversee operations

| Element | Design |
|---------|--------|
| **Home screen** | Map with all ACTIVE survey markers (colored by UC). Sidebar with filter options. |
| **Map** | Desktop: map fills content area next to sidebar. Mobile: full-screen map with floating filter button. |
| **Filter bar** | Desktop: inline chips (District / Tehsil / MC-UC / Month / Surveyor / Status). Mobile: bottom sheet accordions. |
| **List** | Desktop: table view with sortable columns, page-size control. Mobile: card list. |
| **Data Insight** | Desktop-only: KPI grid + aggregation table with row grouping (district→tehsil→UC drill-down). |
| **Assignments** | Desktop: UC list with totals → click → staff picker → count → create. Mobile: simplified same flow. |
| **Theme** | Dark mode available. Compact data-dense layouts. Monospace for numbers. |

### 2.3 Routing Logic
- `/` → checks `roleName` → redirects `field_staff` to `/deliver`, admin/super_admin to `/map`
- Role-based access: sidebar hides admin items for field_staff (Data Insight, Dashboard, Assignments, Routes)
- API routes check role for admin-only operations (create user, stats, assignments)

---
## 3. Visual Design System
### 3.1 Field Staff (Mobile)
- **Background:** White `#ffffff` — maximum sunlight contrast
- **Primary:** `#0072f5` (Vercel blue) — action buttons, progress bars
- **Success:** `#16a34a` (green-600) — delivered badges
- **Warning:** `#d97706` (amber-600) — pending markers
- **Danger:** `#dc2626` (red-600) — missed badges
- **Cards:** White, 8px radius, subtle border `#e5e7eb`, no shadow
- **Typography:** Inter/Plus Jakarta Sans, 16px body (readability on phone)
- **Touch targets:** Minimum 48px height on all buttons, 44px on icons
- **Safe areas:** Respects notch/home indicator with `env(safe-area-inset-*)`
- **Animations:** Slide-up bottom sheets, map marker transitions only. No decorative animations.

### 3.2 Admin (Desktop)
- **Background:** `#fafafa` (muted gray)
- **Cards:** White, 8px radius, flat (no shadow)
- **Typography:** 13px body, 11px captions, 10px data (compact density)
- **Tables:** Compact rows (h-9), sticky headers, monospace data columns
- **Sidebar:** Collapsible to icon-only mode. 240px expanded, 60px collapsed.
- **Filter bar:** Inline chip-style dropdowns. No full-width filters.
- **Theme options:** Light / Dark / Vercel / Vercel-Dark via Settings page

### 3.3 Shared Rules
- No decorative shadows or gradients
- No page-load animations (spinners only for data loading)
- Font: Plus Jakarta Sans (body), Geist Mono (data/monospace), Outfit (headings)
- Border radius: 0.5rem (8px) throughout
- Primary color: `#0072f5` in all themes

---
## 4. Route Structure
| Route | Access | Description |
|-------|--------|-------------|
| `/` | All | Redirects based on role |
| `/login` | All | Email/password auth |
| `/map` | Admin | Full map with all survey markers + filters |
| `/list` | Admin | Survey table view with filters |
| `/deliver` | Staff | Mobile delivery dashboard: assigned bills, map, progress |
| `/route` | Admin | Route management from `saved_routes` |
| `/assignments` | Admin | UC list → staff assignment creation |
| `/stats` | Admin | Performance dashboard, staff tracking |
| `/data-insight` | Admin | Aggregated KPI cards + hierarchy table |
| `/settings` | All | Theme, account info, **Users tab** (admin only — user CRUD, freeze, password reset) |

---
## 5. Lifecycle Data Pipeline
### 5.1 Overview
The core data flow starts at the **SWMC Portal** which provides:
- **Biller list CSVs** (available ~16th each month) — contains PSIDs, Survey IDs, amounts, household info
- **Original A4 PDF bills** — scanned PDFs containing 20-digit PSIDs embedded in pages

Your local Python scripts process these into two outputs: (1) the **lifecycle XLSX** (master reference file), and (2) **A5 print PDFs** for field staff delivery.

**Important: The lifecycle XLSX is YOUR processed output, not a raw portal download.** It already has the Survey ID ↔ PSID linkage baked in by `pdf-psid-extractor.py`.

### 5.2 Script Pipeline (3 scripts)

#### Script 1: pdf-psid-extractor.py (runs 16th–20th monthly)
- Reads raw A4 PDFs from the portal
- Uses PyMuPDF (fitz) to extract 20-digit PSIDs via regex `\b(\d{20})\b`
- Matches extracted PSIDs with the biller list CSV
- Cross-references with survey data to identify `Deleted in Portal` flag
- **Output:** `test_lifecycle_Biller_{City}_{Month}.xlsx` — the enriched lifecycle file (~57+ columns per row)

#### Script 2: pdf-bill-printer.py (runs 19th–20th monthly, ~1305 lines)
- Reads the lifecycle XLSX + original A4 PDFs
- Two-filter system: `Deleted in Portal != 'Yes'` AND `psid found in source PDF`
- Groups by UC, sorts by route, assigns Bill# per UC (`#1/50`, `#2/50`, ...)
- Generates A5 print PDFs with QR codes, barcodes, and metadata overlays
- **Output:** Final A5 print PDFs at `F:\Final_print\{Month}-Final-Print\`

#### Script 3: bill-extractor-v4.py (runs daily, multiple times)
- Fetches payment data from the SWMC portal
- **Output:** `COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` — all paid PSIDs with amount, date, channel
- Used for daily payment tracking in Excel

### 5.3 Lifecycle XLSX Files
**Pattern:** `test_lifecycle_Biller_{City}_{Month}.xlsx` (e.g. `test_lifecycle_Biller_Sargodha_May2026.xlsx`)
- **3 cities:** Sargodha (sgd), Khushab (ksb), Bhalwal (bhl)
- **8 months:** Sep/Oct 2025 → May 2026 (18 files total)
- **5 combined master XLSX** (~17MB → ~42MB, grows monthly)
- **~57+ columns** including: `Biller PSID`, `Survey ID`, `Deleted in Portal`, `Route Segment`, `Route Seq`, `Route Total`, `Monthly Fee`, `Arrears`, `Total Payable`, `Surveyor Name`, `Survey Date`, `Survey Time`, `UC`, `District`, `Tehsil`, and per-month `PDF Issued` columns

### 5.4 Routes
Route data is embedded in the lifecycle XLSX (Route Segment, Route Seq columns). Some UCs/MCs have routes from a separate route CSV exported from the Routing Station app. Staff can also assign custom route numbers via the House Intel module (Routing Station Pro). These custom routes are also used in final print sorting. Route enrichment into lifecycle is handled during the pdf-psid-extractor step.

### 5.5 enrich-survey-units.py (replaces import-lifecycle-data.py)
**Purpose:** Reads the lifecycle XLSX (already produced by pdf-psid-extractor.py) and enriches `survey_units` in the database.
**Insert targets:**
- `survey_units` — upserts columns: psid, monthly_fee, billing_category, amount_due, arrears, route_name, route_seq, current_bill_month
- `hierarchy`, `surveyors`, `bill_months` — upsert reference tables for filter dropdowns
**Note:** `bill_items` table was dropped — all enrichment happens directly on `survey_units`.
**CLI:**
```bash
python scripts/enrich-survey-units.py
```

**Historical fallback:** `run_historical_migration.py` was used once for the initial bulk migration of CSVs/XLSXs. It writes to `bill_items` (for reference) + `survey_units` + `payment_history`.

### 5.6 Biller CSVs — SKIPPED
All 21 `Biller_{City}_{Month}.csv` files (8 months × 3 cities) are **redundant**. The lifecycle XLSX already contains the Survey ID ↔ PSID linkage and all financial columns. The Biller CSVs were only needed as a bridge; the lifecycle XLSX is the authoritative source.

---
## 6. Data Model
### 6.1 Tables

| Table | Key | Purpose | Size |
|-------|-----|---------|------|
| `survey_units` | survey_id | Household identity, GPS, images, monthly_fee, billing_category, psid (stable biller ID), arrears, amount_due, current_bill_month, route_name/seq, last_verified_month | ~212K |
| `payment_history` | id | All payments — one row per (PSID, month) from daily combined Payment CSV. Append-only, all months. | ~122K |
| `payment_summary` | bill_month | Pre-computed monthly totals (paid count + collected amount) | ~10 |
| `roles` | id | Role definitions: super_admin, admin, field_staff | 3 |
| `profiles` | id (auth.users) | User profiles with role FK, username, suspension/deletion | ~10 |
| `staff` | id (auth.users) | Field staff metadata (city, UC assignment) | ~70 |
| `saved_routes` | id | Saved route data (JSON) for navigation | ~50 |
| `house_corrections` | id | GPS pin corrections + house intel entered by staff during delivery. Replaces `verified_houses`. | ~1K |
| `daily_assignments` | id | Admin creates per-staff-per-day chunk. Replaces old `staff_sync_logs`. | ~200/day |
| `assignment_items` | id | Individual PSID delivery tracking with photo proof. Replaces old `verified_houses.is_delivered`. | ~2000/day |
| `delivery_photos` | id | One row per photo captured during delivery. Linked to Google Drive via photo_url. Replaces `staff_sync_logs` photo tracking. | ~3K/day |
| `staff_daily_stats` | id | Pre-computed daily perf (assigned, delivered, missed, start/end time). Updated via trigger. | ~70/day |
| `app_settings` | key | Key-value config store | ~5 |
| `hierarchy` | id | Reference: distinct (city_district, tehsil, uc_name) for ACTIVE units | ~500 |
| `surveyors` | id | Reference: distinct surveyor names for ACTIVE units | ~70 |
| `bill_months` | month | Reference: distinct months in payment_history | ~10 |

**Dropped:** `bills`, `bill_items` (merged into `survey_units` columns: monthly_fee, arrears, amount_due, billing_category, route_name/seq), `verified_houses` (replaced by `house_corrections`), `staff_sync_logs` (replaced by `delivery_photos` + `assignment_items`)

### 6.2 Domain Separation (Critical)

**Biller data and payments are two separate domains. Do not couple them.**

- **Biller Data** (`survey_upserted columns`): Monthly enrichment from lifecycle XLSX overwrites `monthly_fee`, `arrears`, `amount_due`, `billing_category`, `route_name`, `route_seq`, `current_bill_month` on `survey_units`. Only the current month snapshot is stored — history lives in lifecycle XLSX files as JSON exports.

- **Payments** (`payment_history`): Append-only log — who paid, how much, when, channel. All months historically complete.

- **The bridge** is `psid` (stable biller ID assigned to a property). `survey_units.psid` is the stable mapping. Payment queries join `payment_history.psid → survey_units.psid` for geography — no intermediate table needed.

- **PDF bill number** per month comes from the separate `pdf-bill-printer.py` run. Stored in exported JSON (`bills.json`) alongside the current month's data.

- **Three UIs:**
  1. **Survey records** — browse/search properties with their PSID, geography, type (uses `survey_units`)
  2. **Payments per survey unit** — per-property payment lookup (uses `payment_history` + `survey_units.psid`)
  3. **Recovery reports** — district/tehsil/UC aggregates for recovery data (uses `payment_history` + `survey_units` geography, independent of biller columns)

### 6.3 Reference Tables (New)

```sql
-- hierarchy: Filter dropdown reference. Populated once, upserted by import scripts + trigger.
CREATE TABLE public.hierarchy (
  id SERIAL PRIMARY KEY,
  city_district text NOT NULL,
  tehsil text NOT NULL,
  uc_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (city_district, tehsil, uc_name)
);

-- surveyors: Filter dropdown + assignment target reference.
CREATE TABLE public.surveyors (
  id SERIAL PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- bill_months: Month filter dropdown. Populated from bill_items.
CREATE TABLE public.bill_months (
  month text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);
```

These three tables never exceed 1000 rows total. All filter dropdown queries are simple `.select('*')` — zero PostgREST row limit issues, no RPCs needed.

### 6.3 Core Schema

```sql
-- survey_units: Household identity + stable psid bridge to payments
CREATE TABLE public.survey_units (
  survey_id text PRIMARY KEY,
  status text DEFAULT 'ACTIVE',
  city_district text, tehsil text, uc_name text, uc_type text,
  consumer_name text, address text, house_type text, unit_type text,
  surveyor_name text, survey_date date, survey_time time,
  lat double precision, lng double precision,
  image_urls text[],
  monthly_fee integer DEFAULT 0, billing_category text DEFAULT 'UNKNOWN',
  category text, sub_category text,
  is_biller boolean DEFAULT false,
  psid text,                              -- Stable biller ID for domain decoupling (added Phase 0f)
  last_verified_month text,               -- e.g. "MAY2026" — tracks monthly GPS verification (added Phase 0f)
  created_at timestamptz, updated_at timestamptz
);

-- bill_items: Current month snapshot, populated from lifecycle XLSX
CREATE TABLE public.bill_items (
  psid text NOT NULL,
  bill_month text NOT NULL,
  survey_id text REFERENCES survey_units(survey_id),
  amount_due numeric, arrears numeric DEFAULT 0,
  monthly_fee integer DEFAULT 0, billing_category text,
  uc_name text, city text,
  tehsil text,                            -- Populated via trigger from survey_units
  deleted_in_portal text,                 -- "Yes"/"No" — critical filter for staff delivery
  is_issued boolean DEFAULT false,
  start_month text, route_name text, route_seq integer DEFAULT 0,
  pdf_bill_number text,                   -- Populated post-print by pdf-bill-printer mapping
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (psid, bill_month)          -- Composite PK enables historical queries (Phase 0f)
);

-- payment_history: All payments, upserted daily from Payment CSV
CREATE TABLE public.payment_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  psid text NOT NULL,
  bill_month text NOT NULL,
  amount_paid numeric DEFAULT 0,
  paid_date date, payment_method text,
  payment_status text, fine numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (psid, bill_month)
);

-- house_corrections: Manual GPS pin corrections by staff during delivery
CREATE TABLE public.house_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id text NOT NULL REFERENCES survey_units(survey_id),
  corrected_lat numeric, corrected_lng numeric,
  original_lat numeric, original_lng numeric,   -- Snapshot before correction
  street_no text, landmark text, notes text,
  correction_type text DEFAULT 'gps_fix'
    CHECK (correction_type IN ('gps_fix','address_update','intel_add','full_verify')),
  corrected_by uuid REFERENCES staff(id),
  corrected_at timestamptz DEFAULT now(),
  assigned_date date                             -- Which day's delivery triggered this
);

-- daily_assignments: Admin creates one per staff per day per UC
CREATE TABLE public.daily_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  assigned_date date NOT NULL,
  uc_name text NOT NULL,
  total_items integer DEFAULT 0,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

-- assignment_items: Individual PSIDs within a daily chunk
CREATE TABLE public.assignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
  psid text NOT NULL,
  route_seq integer DEFAULT 0,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','delivered','missed','skipped')),
  delivered_at timestamptz,
  gps_lat numeric, gps_lng numeric,             -- GPS at time of delivery capture
  notes text,
  UNIQUE (assignment_id, psid)
);

-- delivery_photos: One row per photo captured during delivery
CREATE TABLE public.delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_item_id uuid NOT NULL REFERENCES assignment_items(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  gdrive_file_id text,                           -- Google Drive file ID for webhook tracking
  gps_lat numeric, gps_lng numeric,
  captured_at timestamptz DEFAULT now(),
  synced_to_drive boolean DEFAULT false
);

-- staff_daily_stats: Pre-computed, updated via trigger on assignment_items changes
CREATE TABLE public.staff_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  assigned_date date NOT NULL,
  total_assigned integer DEFAULT 0,
  delivered integer DEFAULT 0,
  missed integer DEFAULT 0,
  start_time timestamptz,
  end_time timestamptz,
  UNIQUE (staff_id, assigned_date)
);
```

Indexes: `payment_history(psid)`, `payment_history(psid, bill_month)`, `payment_history(bill_month)`, `survey_units(status)`, `survey_units(psid)` UNIQUE WHERE NOT NULL, `survey_units(current_bill_month)`, `house_corrections(survey_id)`

### 6.4 Database Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `trg_payment_history_refresh_summary` | `payment_history` | AFTER INSERT/UPDATE/DELETE | Recomputes `payment_summary` for the affected `bill_month`. |
| `trg_survey_units_upsert_hierarchy` | `survey_units` | AFTER INSERT/UPDATE/DELETE | Upserts `hierarchy` reference table when city_district/tehsil/uc_name/status changes. |
| `trg_refresh_staff_stats` | `assignment_items` | AFTER INSERT/UPDATE/DELETE | Recomputes `staff_daily_stats` for affected staff+date. Updates delivered/missed counts. |

**Dropped:** `trg_bill_items_set_tehsil` (table `bill_items` no longer exists)

### 6.5 Data Sources → Field Mapping

#### Survey CSVs (3 files) → `survey_units`
| CSV column | DB field |
|---|---|
| Survey ID | survey_id (PK) |
| Name / Consumer | consumer_name |
| Address | address |
| Latitude / Longitude | lat / lng |
| District / City | city_district (normalized via geography.json) |
| Tehsil | tehsil |
| Union Council / UC / Area | uc_name |
| UC Type / Type | uc_type |
| Consumer Type / Unit Type | unit_type |
| House Type | house_type |
| Surveyor Name / Surveyor | surveyor_name |
| Survey Date / Date | survey_date |
| Survey Time / Time | survey_time |
| Image URL 1–4 / URL 1–4 | image_urls[] |
| *(from lifecycle)* | monthly_fee, billing_category (enriched) |

#### Lifecycle XLSX (current month, 1 per city) → `survey_units` enrichment (via `enrich-survey-units.py`)
| XLSX column | DB field |
|---|---|
| Biller PSID | survey_units.psid |
| Survey ID | survey_units.survey_id |
| Total Payable | *(not used — computed as monthly_fee + arrears in UI)* |
| Arrears | survey_units.arrears |
| Monthly Fee | survey_units.monthly_fee |
| Billing Category | survey_units.billing_category |
| Start Month | *(not stored in DB since bill_items dropped)* |
| Route Segment | survey_units.route_name |
| Route Seq | survey_units.route_seq |

#### Payment CSV (1 combined file) → `payment_history`
| CSV column | DB field |
|---|---|
| PSID | psid |
| Month | bill_month |
| Paid Amount | amount_paid |
| Paid Date | paid_date |
| Channel | payment_method |
| Status | payment_status |

**Note:** Lifecycle XLSX per-month Paid columns are Yes/No flags only. Payment CSV is the sole truth for payment amounts/dates.

### 6.6 Archived / Orphan Records
Survey IDs found in lifecycle data but missing from Survey CSVs get stubs in `survey_units` with `status='ARCHIVED'`, `consumer_name='Archived Biller Data'`. These preserve the linkage without requiring a full survey record.

### 6.7 Migration Order
Run these in order in the Supabase SQL Editor:
1. `006-payment-summary.sql` — creates `payment_summary` table, seeds from historical data
2. `007-data-insight-rpcs.sql` — creates RPCs for Data Insight admin page
3. `008-add-tehsil-to-bill-items.sql` — adds `tehsil` column, backfills from `survey_units`, creates index
4. `009-triggers-and-automation.sql` — creates triggers for ongoing data integrity
5. `010-reference-tables.sql` — creates `hierarchy`, `surveyors`, `bill_months` + maintenance trigger
6. `011-performance-indexes.sql` — adds missing indexes (status, trigram, composite, payment_status)
7. `012-add-psid-to-survey-units.sql` — adds `psid` column, backfills from `bill_items`, creates unique index
8. `013-add-verification-tracking.sql` — adds `last_verified_month` to survey_units
9. `014-house-corrections-table.sql` — creates `house_corrections` (replaces `verified_houses`)
10. `015-revise-rpcs.sql` — updates 5 RPCs to use `survey_units.psid` + reference tables
11. `016-delivery-tracking-tables.sql` — creates 4 delivery tables + triggers
12. `020-rbac-system.sql` — creates `roles` table, adds username/role_id/suspension/deletion to profiles, drops legacy role/permissions columns, adds RLS policies

**Note:** Migrations 008, 009, 011, 012 reference `bill_items` which has been dropped from the database. These are included for reference only — if re-applying, create `bill_items` first or skip these steps.

---
## 7. Monthly Data Workflow

### Monthly (16th–20th)
1. **16th:** SWMC portal provides biller list CSV + original A4 PDFs
2. **16th–18th:** `pdf-psid-extractor.py` reads PDFs, extracts PSIDs, matches with biller list + survey data → generates `test_lifecycle_Biller_{City}_{Month}.xlsx`
3. **19th–20th:** `pdf-bill-printer.py` runs → generates A5 print PDFs with overlays
4. **18th–20th:** `enrich-survey-units.py` runs → reads lifecycle XLSX, upserts `survey_units` columns (psid, monthly_fee, arrears, amount_due, billing_category, route_name, route_seq, current_bill_month), upserts reference tables (`hierarchy`, `surveyors`, `bill_months`)
   - Fallback: `run_historical_migration.py` for initial bulk import (runs once)

### Daily
1. **Admin:** Runs `bill-extractor-v4.py` → fetches updated payment CSV → upserts `payment_history`
   - Trigger `trg_payment_history_refresh_summary` auto-refreshes `payment_summary`
2. **Admin:** Opens `/settings` → Users tab → creates/manages staff accounts (username + password, role assignment, freeze/delete)
3. **Admin:** Opens `/assignments` → picks UC → sees unassigned bills → picks staff → sets count → creates daily chunk
   - Creates `daily_assignments` + `assignment_items` rows
4. **Field Staff:** Opens `/deliver` → sees today's assigned bills only (from `assignment_items` joined to `daily_assignments`)
5. **Staff:** Navigates house-to-house in route sequence order:
   - Arrives at house → taps "Deliver" → camera opens → captures 1-3 photos
   - Photos compressed locally → queued in IndexedDB if offline
   - GPS captured at delivery time → saved to `assignment_items.gps_lat/gps_lng`
   - Status set to `delivered` or `missed` (with reason + photo)
6. **Photo sync:** IndexedDB queue → GAS webhook → Drive URL → saved to `delivery_photos`
7. **Route derivation:** After 2-3 months, actual delivery timestamps from `assignment_items.delivered_at` form the optimal route order for each UC
8. **House corrections:** Staff long-presses map to correct GPS → saved to `house_corrections` with original+corrected coords + staff ID + delivery date

---
## 8. Performance Rules (Must Follow)
1. Never `select('*')` — name explicit columns (egress cost)
2. Push filters to the server — `.eq()`, `.in()`, `.gte()`, not JS `.filter()`
3. No N+1 sequential queries — use `Promise.all` for independent queries
4. No RPCs for client-facing features — admin-only aggregate queries (Data Insight, dashboards) may use RPCs from `scripts/sql/007-data-insight-rpcs.sql`
5. **Reference tables for filter dropdowns** — never query 212K tables for filter options. Use `hierarchy`, `surveyors`, `bill_months` tables (all <1000 rows).
6. `staleTime > 0` — 5min for billing data (daily updates), 30min for hierarchy (rarely changes)
7. `gcTime > staleTime` — keep cached data for back-navigation
8. Index every filtered column — especially `survey_units.status` (all queries filter by ACTIVE)
9. No client-side `.filter()` / `.find()` / `.sort()` on large datasets (use server-side)
10. `useMemo` on all derived data in render components

---
## 9. Edge Case Decisions

| # | Edge Case | Decision |
|---|---|---|
| 1 | PSID in lifecycle with `Deleted in Portal = Yes` | Keep in `survey_units`. Staff app filters at query: `survey_units.status != 'ARCHIVED'`. Shows house with "No active bill" context. |
| 2 | PSID was active last month, removed entirely from current lifecycle | `enrich-survey-units.py` overwrites current month's columns. House still on map with stale enrichment. Shows "No bill this month". Payment history remains accessible. |
| 3 | Multiple PSIDs per active Survey ID (neither deleted) | **Keep all PSIDs.** Staff sees all PSIDs per house with their payment history. App highlights the one with recent payment. Staff chooses which to deliver. |
| 4 | Admin-only RPCs for aggregate queries | RPCs are banned for client-facing features but allowed for admin-only aggregate queries (Data Insight, admin dashboards). |
| 5 | PSID has payment history but NOT in current lifecycle | Payment history still in `payment_history`. House shows "No active bill" + past payments. |
| 6 | Same PSID paid in multiple months (including current) | `payment_history` has all records. Staff app cross-references current `bill_month`: if paid, shows "Already paid" — do not deliver. |
| 7 | Survey exists but no PSID in current lifecycle | Valid unbilled survey. Map shows house with "No bill this month". Gets PSID next month. |
| 8 | `survey_units` enrichment missing for current month | `enrich-survey-units.py` must be re-run. Old enrichment remains until overwritten. |
| 9 | `payment_summary` stale after payment import | Trigger auto-refreshes on payment_history changes. |
| 10 | Reference table out of sync after bulk import | Import script upserts reference tables. Trigger provides real-time sync for incremental changes. |
| 11 | Staff assigned to UC that disappears from hierarchy | Assignment references `assignment_items.psid` directly, not UC name. House still renders even if UC renamed. |
| 12 | Photo taken offline, assignment completed hours later | Photo queued in IndexedDB with assignment_item_id. On sync, photo metadata links to assignment. Count reflects sync'd count, not taken count. |
| 13 | House GPS coordinates are wrong — staff needs to correct | Staff long-presses correct location on map → pin drops. Saved to `house_corrections` with original+corrected lat/lng, staff ID, and delivery date. Admin reviews and can update `survey_units.lat/lng`. |
| 14 | Legacy `verified_houses` and `staff_sync_logs` data | No import — corrections are stale, old photo logs lack house linkage. Archive to JSON file in `scripts/archive/` before dropping tables. |
| 15 | Multiple PSIDs per survey_id — which one is the "primary" for `survey_units.psid`? | First PSID from lifecycle data (earliest start_month). Only one PSID stored on `survey_units`. |

---
## 10. Implementation Phases

### Phase 0d — Reference Tables & Filter Fix (~1.5 hrs)
| Step | Time | Task |
|------|------|------|
| 0d.1 | 30 min | SQL migration `010-reference-tables.sql`: create `hierarchy`, `surveyors`, `bill_months`, populate from existing data, add maintenance trigger |
| 0d.2 | 15 min | Update `GET /api/hierarchy` to query `hierarchy` + `surveyors` tables (remove RPC/fallback) |
| 0d.3 | 15 min | Update `GET /api/bill-months` to query `bill_months` table (remove RPC/fallback) |
| 0d.4 | 10 min | Verify all filters populate correctly: Khushab, Bhalwal, MC-1, all months |
| 0d.5 | 5 min | Delete 6 dead service files: `finance-service`, `retention-service`, `recovery-service`, `hierarchy-service`, `survey-service`, `route-service` |

### Phase 0e — Stabilize & Clean (~2 hrs)
| Step | Time | Task |
|------|------|------|
| 0e.1 | 20 min | Fix payment filter pagination: fetch all survey IDs, apply payment filter, THEN paginate |
| 0e.2 | 15 min | Fix `billing-stats` API: populate or remove empty `tehsil_stats`/`uc_stats`/`category_stats` |
| 0e.3 | 15 min | Move `useBillingRoutes` to API route pattern (`/api/routes`) |
| 0e.4 | 10 min | Deduplicate `currentMonth()` — single shared utility |
| 0e.5 | 10 min | Add `survey_units.status` index |
| 0e.6 | 30 min | Fix `FinanceSummary` type to match actual API response (remove empty arrays or populate them) |

### Phase 0f — Schema Restructuring Foundation (~3 hrs)
| Step | Time | Task |
|------|------|------|
| 0f.1 | 20 min | `012-add-psid-to-survey-units.sql` — add `psid` column, backfill from `bill_items`, unique partial index |
| 0f.2 | 5 min | `013-add-verification-tracking.sql` — add `last_verified_month` to `survey_units` |
| 0f.3 | 20 min | `014-house-corrections-table.sql` — create `house_corrections` table to replace `verified_houses` |
| 0f.4 | 15 min | `015-revise-rpcs.sql` — update 5 RPCs (`get_billing_group_stats`, `get_billing_summary`, `get_hierarchy`, `get_surveyors`, `get_bill_months`) |
| 0f.5 | 30 min | `016-delivery-tracking-tables.sql` — create 4 delivery tables + triggers |
| 0f.6 | 10 min | Archive legacy tables: `scripts/archive-legacy-tables.py` → JSON → drop `verified_houses`, `staff_sync_logs` |

### Phase A — Admin Assignment UI (~3 hrs)
| Step | Time | Task |
|------|------|------|
| A.1 | 30 min | `GET /api/assignments` + `POST /api/assignments` endpoints |
| A.2 | 60 min | `/assignments` page: UC list with totals, click → unassigned bills → pick staff → set count |
| A.3 | 30 min | Assignment management: view active, completion %, revoke |
| A.4 | 30 min | `/route` tab from `saved_routes`, grouped city→UC→route |

### Phase B — Field Staff Delivery UI (~6 hrs)
| Step | Time | Task |
|------|------|------|
| B.1 | 60 min | `/deliver` page: full-screen mobile map with assigned bill markers, bottom sheet with progress bar |
| B.2 | 30 min | House detail bottom sheet: name, address, bill amount, delivery status, photo button |
| B.3 | 60 min | Photo capture: camera API → WebP compress → IndexedDB queue → GAS webhook → Drive URL saved to `delivery_photos` |
| B.4 | 30 min | Status marking: delivered (photo+GPS) or missed (photo+reason+GPS) — both update `assignment_items` |
| B.5 | 30 min | Live progress: "Delivered X/Y" from assignment_items photo count |
| B.6 | 60 min | Swipeable card list view: pull-to-refresh, sorted by route sequence |
| B.7 | 30 min | Offline support: cached assignment + IndexedDB photo queue + sync indicator |
| B.8 | 30 min | Route-based navigation: show next house on map, auto-advance after marking |

### Phase C — Admin Dashboard (~3 hrs)
| Step | Time | Task |
|------|------|------|
| C.1 | 60 min | `/stats` page: daily delivery stats per staff (assigned/delivered/missed/rate) |
| C.2 | 60 min | Staff performance tracking: filter by staff, date range. Add notes + rating (1-5) |
| C.3 | 60 min | Data Insight enhancement: add delivery KPIs (delivery rate, photos per staff, avg time per delivery) |

### Phase D — Visual Rehaul (~4 hrs)
| Step | Time | Task |
|------|------|------|
| D.1 | 60 min | Staff mode route guard: `/deliver` is default for staff role, no admin nav access |
| D.2 | 60 min | Staff mobile layout: map fills screen, bottom sheet for detail, progress bar in header, bottom tab nav (Map/List/Progress) |
| D.3 | 60 min | Admin desktop sidebar: collapsed/expanded, nav groups (Map/List/Assignments/Stats/Insight/Settings) |
| D.4 | 30 min | Admin filter bar: inline chips for desktop, bottom sheet for mobile |
| D.5 | 30 min | Theme system: Vercel light/dark defaults, staff forced to light mode |
| D.6 | 30 min | Touch target audit: all interactive elements 44px+ on mobile, 48px+ for primary actions |

### Phase RBAC — User Management & Auth System (~2 hrs)
| Step | Time | Task |
|------|------|------|
| RBAC.1 | 15 min | SQL migration `020-rbac-system.sql`: roles table, profiles migration, RLS policies |
| RBAC.2 | 15 min | Update auth-store: username→email login, freeze/deletion check, roleName replaces role |
| RBAC.3 | 5 min | Update login page: accept username or email |
| RBAC.4 | 15 min | `POST /api/admin/users` — create user with service_role |
| RBAC.5 | 10 min | `GET /api/admin/users` — list users with roles |
| RBAC.6 | 15 min | `PATCH/DELETE /api/admin/users/[id]` — edit, freeze, password reset, soft-delete/restore |
| RBAC.7 | 25 min | `/settings` page: Users tab with table, add modal, row actions |
| RBAC.8 | 5 min | AppHeader shows displayName from profile |
| RBAC.9 | 5 min | Update all role references across app (role→roleName, 'staff'→'field_staff') |
| RBAC.10 | 15 min | Apply migration to Supabase + backfill admin + E2E test |

### Total Estimate Breakdown
| Phase | Time | Cumulative |
|-------|------|------------|
| 0d | 1.5 hrs | 1.5 hrs |
| 0e | 2 hrs | 3.5 hrs |
| 0f | 3 hrs | 6.5 hrs |
| A | 3 hrs | 9.5 hrs |
| B | 6 hrs | 15.5 hrs |
| C | 3 hrs | 18.5 hrs |
| D | 4 hrs | 22.5 hrs |
| RBAC | 2 hrs | 24.5 hrs |

---
## 11. Implementation Workflow (Permanent Rule)
Every task is broken into short atomic steps (max 1-2 file changes per step).
1. Present the next step with clear description
2. Wait for user approval
3. Implement only that step (with time estimate)
4. Wait for user verification
5. Present the next step

Never skip ahead or batch multiple steps without explicit approval.
When in a phase/step and the user asks a question: Answer the question, then return to the current phase/step without advancing unless told to proceed.

---
## 16. Future Workflow — Data Pipeline Streamlining

### 16.1 Current State (Manual, Error-Prone)

| Step | Tool | Frequency | Pain Points |
|------|------|-----------|-------------|
| Lifecycle enrichment | `enrich-survey-units.py` | Monthly manual run | Must have lifecycle XLSX on disk, run per-city, no error feedback |
| Payment sync | `bill-extractor-v4.py` | Daily manual run | Must download CSV from SWMC portal, run locally, no automation |
| PDF generation | `pdf-bill-printer.py` | Monthly manual run | Local-only, Python deps, fragile PyMuPDF setup |
| Export bills JSON | `export-bills-json.py` | Monthly manual run | Required for HouseDetailSheet bill display |
| Payment CSV → DB | Supabase upsert via script | Manual trigger | No scheduled sync, inconsistent data freshness |

**Data flows are entirely local (engineer's PC).** There is no server-side ingestion, no cron scheduling, no webhook — meaning:
- If the engineer is unavailable, data doesn't get imported
- Live payment data is always at least 1 day stale
- New survey units from lifecycle must be manually enriched

### 16.2 Target State — Automated Daily Pipeline

The goal is a **server-side ingestion pipeline** that eliminates local script dependencies:

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ SWMC Portal │───→│ Supabase Ingest  │───→│ survey_units         │
│ (CSV export) │    │ (Edge Function)  │    │  monthly_fee + arrears│
└─────────────┘    └──────────────────┘    │  current_bill_month  │
        │                                   │  psid, route info    │
        │         ┌──────────────────┐      └──────────────────────┘
        └────────→│ Payment Ingest   │───→ payment_history
                  │ (Edge Function)  │      upsert per PSID+month
                  └──────────────────┘
```

### 16.3 Priority Implementation (Phase P — Pipeline)

#### P.1 Payment CSV Auto-Ingest (~4 hrs)
**Goal:** Eliminate manual `bill-extractor-v4.py` — payments sync automatically.

| Step | Time | Task |
|------|------|------|
| P.1a | 60 min | Create `POST /api/ingest/payments` endpoint — accepts CSV body or URL, parses with `papaparse`, upserts `payment_history` using Supabase admin client |
| P.1b | 30 min | Add idempotency: skip rows where `(psid, bill_month)` already has matching `payment_status` and `amount_paid` |
| P.1c | 60 min | Build mini admin UI at `/ingest` — drag-and-drop CSV upload, preview rows, confirm import, show results (inserted/skipped/errors) |
| P.1d | 30 min | **Calculation fix:** If `bill_items` start_month ever gets re-imported, use it as the lookup floor for `allMonths` generation (currently using 24-month rolling window as fallback) |

#### P.2 Lifecycle Enrichment via Server (~3 hrs)
**Goal:** Load lifecycle XLSX through the app instead of local Python scripts.

| Step | Time | Task |
|------|------|------|
| P.2a | 60 min | Create `POST /api/ingest/lifecycle` endpoint — accepts XLSX file upload, reads with `xlsx` npm package (or converts to JSON client-side), upserts `survey_units` columns + reference tables |
| P.2b | 30 min | Add validation: detect duplicate PSIDs, missing survey_ids, mismatched cities |
| P.2c | 60 min | Build upload page: file picker, city/month selector, preview+diff before apply |
| P.2d | 30 min | **Store `start_month`** on `survey_units` if present in the lifecycle XLSX. Requires a one-time migration: `ALTER TABLE survey_units ADD COLUMN start_month text`. This enables precise billing cycle range for PaymentHistoryCard instead of the 24-month rolling window. |

#### P.3 Scheduled Payment Sync (~3 hrs)
**Goal:** Payments auto-fetch from SWMC portal without manual CSV download.

| Step | Time | Task |
|------|------|------|
| P.3a | 60 min | Create a **Vercel Cron Job** (`/api/cron/payments`) that fetches the payment CSV from a configurable URL (SWMC portal or GDrive upload), parses it, and upserts `payment_history` |
| P.3b | 30 min | Add config UI (`/settings`) to set the payment CSV source URL, sync schedule (daily/6hr/manual), and last-sync timestamp |
| P.3c | 30 min | Notification on failure: email or in-app alert when payment sync fails (wrong format, empty rows, access denied) |
| P.3d | 60 min | **Historical backfill:** One-time script to import all previous months' payment CSVs through the ingest endpoint |

#### P.4 Data Quality & Verification (~2 hrs)

| Step | Time | Task |
|------|------|------|
| P.4a | 30 min | **Add `start_month` migration** (`021-add-start-month.sql`): `ALTER TABLE survey_units ADD COLUMN start_month text;` Backfill from archives or lifecycle XLSX files if available. |
| P.4b | 30 min | Dashboard at `/ingest/history` showing: last sync time, rows imported, errors count, month coverage |
| P.4c | 30 min | Alert system: email notification when payment sync fails or lifecycle enrichment detects anomalies |
| P.4d | 30 min | **Calculation finalization:** Update `GET /api/surveys/payments` to use `survey_units.start_month` as the `allMonths` lower bound (replacing the 24-month lookback). Document that this requires the P.4a migration to be applied first. |

### 16.4 Migration Scripts to Create

| File | Purpose | Depends On |
|------|---------|------------|
| `scripts/sql/021-add-start-month.sql` | Adds `start_month text` to `survey_units` for precise billing cycle range | P.2d, P.4a |
| `scripts/sql/022-payment-ingest-tables.sql` | Creates `ingest_log` table for tracking CSV import history (optional) | P.1a |

### 16.5 Summary of Calculation Changes

| Change | Component | What Changed | Migrations Needed |
|--------|-----------|-------------|-------------------|
| `amount_due` display → `monthly_fee + arrears` | All UI surfaces | Display calculation only; DB column unchanged | None |
| `allMonths` lower bound → min(oldestPayment, 24-month lookback) | `/api/surveys/payments` | Server-side sort + rolling window; no `start_month` available | None (until P.4a) |
| `allMonths` lower bound → `start_month` (future) | `/api/surveys/payments` | Replace lookback with `survey_units.start_month` | P.4a (`021-add-start-month.sql`) |
| Month sort: alphabetical → chronological | `/api/surveys/payments` | Added `monthKey()` helper for `year*12+monthIndex` sort | None |
| KPI cards: double value → compact single-value | `data-insight.tsx` | Removed CardHeader/CardContent, single source of truth | None |

### 16.6 Total Phase P Estimate: ~12 hours

### 16.7 Quick Wins (can be done immediately, no pipeline work)

| Task | Time | File | Description |
|------|------|------|-------------|
| Add `start_month` column to survey_units | 15 min | New SQL migration | `ALTER TABLE survey_units ADD COLUMN start_month text;` — column only, no backfill |
| Update enrich-survey-units.py to write start_month | 15 min | `enrich-survey-units.py` | Read "Start Month" from lifecycle XLSX and include in the upsert |
| Backfill start_month from lifecycle XLSX archives | 1 hr | ad-hoc Python | If XLSX files in `scripts/data/processed_pdfs/` are accessible, extract start_month per PSID |
| Switch allMonths to use start_month | 15 min | `/api/surveys/payments` | Replace `24-month lookback` with queried `survey_units.start_month` |

---
## 12. Session Log
### 2026-05-25 (Domain Separation Discovery) — Location: Home
**Focus:** Fixing month dropdown, surveys API timeout, and discovering fundamental domain coupling bug
**Done:**
- Created `011-performance-indexes.sql` — added missing indexes (`survey_units.status`, `survey_units.consumer_name` trigram, `payment_history.payment_status`, `bill_items` composite) — fixed surveys API timeout ("canceling statement due to statement timeout")
- Updated `/api/bill-months` to fallback to `payment_history` when `bill_months` reference table is empty
- Re-seeded `bill_months` from `payment_history` (OCT2025–MAY2026 now show)
- Ran `run_historical_migration.py --payments-only` — confirmed all 122K payment records already exist (duplicate key errors)
- Fixed `get_billing_summary` RPC to use `payment_history` as primary source instead of `bill_items` — now shows `total_collected` and `total_paying` for ALL months, not just current
- Fixed surveys API payment filter — removed `.eq('bill_month')` from bill_items lookup (psid↔survey_id mapping is stable across months)
**Key discoveries:**
- **Domain coupling bug:** `payment_history` had no direct geography link — it relied on `bill_items` (a monthly snapshot) as the bridge. This caused all non-current months to show zero payments.
- **Fix:** `psid` is a stable property-level identifier — it belongs on `survey_units`, not as a coupling point. Adding `psid` to `survey_units` decouples billing from payments.
- **PDF bill number** comes from `pdf-bill-printer.py` mapping file, NOT from lifecycle XLSX. Lifecycle only has a boolean `is_issued` (PDF Issued) column.
- **Biller data and payments are separate domains** — should never be intermingled in the same query path.
**Next session:**
- Phase 0f: Schema restructuring — add `psid`, `last_verified_month`, `house_corrections`, delivery tables, revise RPCs, archive legacy

### 2026-05-25 (Schema Restructuring Plan) — Location: Office
**Focus:** Comprehensive schema restructuring to fix domain coupling, add delivery accountability, clean legacy
**Done:**
- Analyzed full DB schema (11 SQL files, all API routes, TypeScript types, 618-line MASTER.md)
- Designed 6-step Phase 0f migration plan:
  1. `012-add-psid-to-survey-units.sql` — decouples payments from bill_items via survey_units.psid
  2. `013-add-verification-tracking.sql` — last_verified_month for GPS verification tracking
  3. `014-house-corrections-table.sql` — replaces `verified_houses` with FK-linked, auditable corrections
  4. `015-revise-rpcs.sql` — 5 RPCs updated for survey_units.psid + reference tables
  5. `016-delivery-tracking-tables.sql` — 4 new tables (daily_assignments, assignment_items, delivery_photos, staff_daily_stats)
  6. Archive legacy tables (`verified_houses`, `staff_sync_logs`) to JSON before dropping
- Decided: No legacy data import needed (stale corrections, unlinked photo logs)
- Decided: Separate `delivery_photos` table (not array column) — better for GAS webhook async flow
- Decided: Composite PK `(psid, bill_month)` for bill_items — enables historical billing queries
- Added 3 new edge case decisions (#13-#15): GPS correction flow, legacy archive, primary PSID resolution
- Updated MASTER.md extensively: Section 6 tables, 6.3 Core Schema, 6.4 Triggers, 6.7 Migration Order, Section 9 Edge Cases, Section 10 Phases (0f added, A revised), estimates, changelog
**Key decisions:**
- `delivery_photos` table over array column — avoids race conditions with GAS webhook concurrent uploads
- No legacy import — corrections stale, photos unlinked. Archive to JSON for reference.
- Composite PK for bill_items — enables querying past monthly billing amounts and is_issued history
**Next session:**
- Continue Phase 0f from Step 0f.3 (house_corrections table)

### 2026-05-26 (Storage Crisis → Lean Schema Redesign) — Location: Office
**Focus:** Drop from 480MB to 126MB by eliminating bill_items + VACUUM FULL
**Done:**
1. **DB optimization** — Dropped `image_urls` column, orphan indexes, unused survey_units columns
2. **Schema restructure** — Moved billing columns to survey_units, eliminated bill_items
3. **Data import** — Enriched 207K survey_units, imported 122K payments
4. **JSON export scripts** — bills.json (146MB), payments.json (12MB), kpis.json
5. **API routes updated** — surveys, surveys/payments, billing-stats, data-insight
6. **VACUUM FULL** — Ran via Supabase Management API. Reclaimed ~206MB of bloat.
7. **Dropped** `survey_photos_backup` (46MB backup of old image_urls column), `bill_items`, `payment_summary`, `saved_routes` shells
**DB footprint:** survey_units 82MB + payment_history 32MB + reference/delivery tables <1MB = **126MB total**
**Monthly growth:** ~12MB (payment imports). ~31 months runway to 500MB.
**Next session:**
- Phase A.1: `GET /api/assignments` + `POST /api/assignments` endpoints

### 2026-05-26 (Option A Nav Fixes + RPC Aggregation) — Location: Office
**Focus:** Navigation audit fixes, eliminating 1MB response limit via aggregation RPCs, Apply/Update buttons
**Done:**
- **Option A navigation fixes (6 changes):**
  - Created shared `AppHeader.tsx` component (replaces 3 different inline headers)
  - Display `pageTitle` from billing-ui-store in header
  - Set `setPageIdentity()` on every page (`/map`, `/assignments`, `/route`, `/deliver`, `/settings`, `/stats`)
  - Renamed "Staff Stats" → "Delivery Stats" with `ClipboardCheck` icon in sidebar
  - Hide bottom tabs on non-map routes
  - Debounced resize handler in AppShell (100ms)
- **`unit_type` column removed** — never existed in Supabase DB, was only in TypeScript type, API COLS, and filter components. Removed from `surveys/route.ts`, `types/index.ts`, `house-detail-sheet.tsx` (now uses `billing_category`)
- **`.in(psid)` array chunking** — created `chunkArray(arr, 800)` helper. Applied to surveys, data-insight routes for payment_history + assignment_items + delivery_photos queries. Avoids Supabase URL length limits.
- **Discovered PostgREST limitations:**
  - `sum:amount_due` syntax returns column values, NOT SUM aggregates (`"Use of aggregate functions is not allowed"`)
  - `distinct=psid` parameter fails with `400`
  - No way to do server-side SUM or DISTINCT through REST API
- **Created `019-aggregation-rpcs.sql`** — two RPCs for server-side aggregation:
  - `get_billing_stats(p_month, p_district, p_tehsil)` — grand totals + tehsil/UC/category breakdowns with payment joins
  - `get_hierarchy_stats(p_month, p_district, p_tehsil, p_uc, p_status)` — KPIs + grouped rows with payment joins
- **Updated `billing-stats/route.ts`** — replaced 172K-row fetch + client-side aggregation with `sup.rpc('get_billing_stats')`. Field names remapped to match frontend expectations.
- **Updated `data-insight/route.ts`** — replaced 172K-row fetch with `sup.rpc('get_hierarchy_stats')`. Delivery KPIs computed from independent `assignment_items` queries (no psid dependency). Added try-catch error handling.
- **Added `pendingFilters` to billing-store** — `setPendingFilter`, `applyFilters`, `cancelFilters` actions. DesktopFilterBar writes to `s.filters` directly (auto-apply). MobileFilterSheet writes to `pendingFilters` (pending→apply pattern). `setFilters` keeps both in sync.
- **Apply/Update buttons** in DesktopFilterBar's `ActionButtons` — Update (↻) calls `queryClient.invalidateQueries()`. Apply/Cancel appear when `pendingFilters` ≠ `filters` (after mobile sheet changes).
- **Fixed RPC bug** — `ELSE psid` → `ELSE base.psid` in `get_hierarchy_stats` (ambiguous column reference with `pays` CTE).
- **Error display** — `DataInsight` component now shows error state with server message.
- **`useDataInsight` hook** — forwards server error message instead of generic "Failed to fetch data insight".
**Key discoveries:**
- PostgREST cannot do aggregate functions via REST API at all — RPCs are the ONLY path for server-side aggregation
- `.range(0, 1_000_000)` is a band-aid — Supabase's 1MB response body limit silently truncates rows, making client-side aggregation unreliable
- `pendingFilters` pattern requires careful sync — DesktopFilterBar must write to `s.filters` AND keep `pendingFilters` in sync via `setFilters`
- The 172K `survey_units` table will never fit through REST for aggregation — RPCs are mandatory
**Next session:**
- Run fixed `019-aggregation-rpcs.sql` to resolve `psid` ambiguous column error
- Continue Phase A: Admin Assignment UI (`GET/POST /api/assignments` + `/assignments` page)
- Backlog: Remove `.range(0, 1_000_000)` from remaining routes (bill-months, surveys psid query, assignments, routes)

### 2026-05-25 (Phase 0f Start — Steps 0f.1 + 0f.2) — Location: Office
**Focus:** Execute Phase 0f schema restructuring — first 2 migrations
**Done:**
- Created `scripts/sql/012-add-psid-to-survey-units.sql` — adds `psid` to `survey_units`, backfills from `bill_items`, creates unique partial index + JOIN index
  - Column already existed from partial prior run (4,682 rows populated)
  - UPDATE backfilled remaining 207K+ rows using `bill_items.survey_id` match
  - Verified: 0 unmatched rows, all survey_units with matching bill_items got psid
- Created `scripts/sql/013-add-verification-tracking.sql` — adds `last_verified_month` to `survey_units`, creates partial index
- Updated MASTER.md: Phase 0f progress tracked, changelog v5.2
**Key finding:** `survey_units.psid` already existed from previous partial run (4,682 rows). Migration ran cleanly — `ADD COLUMN IF NOT EXISTS` skipped, UPDATE handled remaining rows.
**Next session:**
- Continue Phase 0f → Step 0f.3: `014-house-corrections-table.sql`
- Steps remaining: 0f.3 (house_corrections), 0f.4 (revise RPCs), 0f.5 (delivery tables), 0f.6 (archive legacy)
- Then Phase A: Admin Assignment API + UI

---
### 2026-05-26 (Phase D Visual Rehaul + City Context Selector) — Location: Office
**Focus:** Complete Phase D visual rehaul, add city context selector (replacing district/tehsil cascade), fix all cascading bugs
**Done:**
- **Phase D complete (D.1-D.6):** Staff route guard (`/`→role-based redirect), staff mobile layout (bottom tab nav, progress bar, Today's Stats), sidebar review (no changes needed), filter bar polish (already well-implemented), theme system (removed `forcedTheme`, 5 themes, `.staff-light-mode`), touch target audit (h-11 buttons, h-12 primary, min-h-[48px] tabs)
- **Stats/assignments/route pages:** Wrapped in AppShell, tables overflow-x-auto, action bars responsive
- **Burger menu fix:** Removed `hidden lg:flex` wrapper on sidebar in AppShell
- **Bottom tabs reduced:** Map | List | Deliver; Dashboard/Insight moved to sidebar
- **DesktopFilterBar global:** Shown on all admin pages via AppShell
- **AppHeader restructured:** Two-row mobile layout with search + filter row
- **Update button animation:** Spinning icon during fetch, "Updated" checkmark for 2s
- **MobileFilterSheet:** Active filter count badge, backdrop blur, h-12 buttons
- **City selector — 6 steps:**
  1. `billing-store.ts` — `selectedCity` + `setCity()` with Zustand persist + `merge` for rehydration
  2. `CitySwitcher.tsx` — Gradient avatars (emerald=Sargodha, amber=Khushab, blue=Bhalwal, primary=All)
  3. `filter-panel.tsx` — Removed District/Tehsil accordions/dropdowns; UC options scoped by city
  4. `kpi-cards.tsx` — Passes `selectedCity` + tehsil to billing stats hook
  5. `assignments/` — Hook/API/page updated for city + tehsil filtering
  6. `routes/` — Hook/API/page updated for city + tehsil filtering
- **Bug fixes:**
  - Uppercase DB values: `SARGODHA` vs title case `Sargodha` — fixed `setCity`, `merge`, UC memos
  - Rehydration sync: replaced `onRehydrateStorage` with `merge` (synchronous, triggers re-render)
  - Duplicate UC keys: deduplicated by `value` in UC dropdown
  - 3-city district+tehsil mapping: CitySwitcher passes `(city, district, tehsil)`, UC memos match exact `{district}::{tehsil}` keys, all APIs updated for tehsil filter
  - Clear button: now calls `setFilters` (immediate apply) instead of `setPendingFilter` — no Cancel/Apply flash
  - Map flyTo: `CITY_CONFIG` includes `lat`/`lng`, `setCity` updates `mapCenter`, `MapFollower` component calls `map.flyTo()` with 1.2s duration
- **Phase D commit:** pushed to git (`f404b31`)
- **All changes:** `npx tsc --noEmit` passes with zero errors
**Key decisions:**
- 3-city mapping: Sargodha=SARGODHA::SARGODHA, Bhalwal=SARGODHA::BHALWAL, Khushab=KHUSHAB::KHUSHAB (not 2 district-level groups)
- City selector is persisted via Zustand persist (`selectedCity` only); filters not persisted
- `setCity` updates BOTH active and pending filters immediately (city is context, not pending)
- City change clears UC selection (prevents stale cross-city UC filters)
- "Clear" button immediately applies cleared state (no pending→apply gap)
- Map flyTo uses Leaflet's native `map.flyTo()` with 1.2s duration (smooth, not jerky)
- Data Insight already wired to global filters — no changes needed
**Next session:**
- Decide Phase order: Phase A (Admin Assignment UI) or Phase B (Field Staff Delivery UI) or pending fixes
- Remaining: Remove `.range(0, 1_000_000)` from remaining routes, fix `.in('tehsil', [])` edge case
- Backlog: Payment filter refetch trigger, `.eq('payment_status', ...)` for payment filter optimization

### ═══ SESSION CONTINUATION POINT ═══
### Start here on next session
### PaymentHistoryCard fix, amount_due→monthly_fee+arrears everywhere, KPI card redesign
### bill_items confirmed dropped from Supabase — all enrichment on survey_units
### Chronological sort fix for payment months (alpha sort was wrong)
### 24-month lookback for allMonths generation
### See Section 16 for future workflow streamlining proposal

### 2026-05-29 (Payment History Fix + amount_due → monthly_fee+arrears + KPI Redesign) — Location: Home
**Focus:** Fix payment history full timeline, replace amount_due with monthly_fee+arrears, compact KPI cards for dark mode
**Done:**
- **PaymentHistoryCard complete history fix** (`src/app/api/surveys/payments/route.ts`):
  - Removed Supabase `.order('bill_month')` — alphabetical sort was wrong ("APR" < "JAN" < "MAR")
  - Added `monthKey()` helper — converts `"MMMYYYY"` → `year*12 + monthIndex` for real chronological sort
  - Client-side `.sort()` by monthKey ensures correct oldest→newest ordering
  - 24-month lookback (`d.setMonth(d.getMonth() - 23)`) replaces `start_month` (bill_items was dropped, no start_month available)
  - `earliestMonth` = min(oldestPayment, lookback) so all months from 2yr ago to present are generated
- **amount_due → monthly_fee + arrears** across all surfaces (12 files):
  - Added `monthly_fee`, `arrears` to types: `UnitRow`, `RouteUnit`, `UnassignedBill`, `AssignmentItemUnit`
  - Added `monthly_fee, arrears` to API SELECTs: data-insight drill-down, assignments PSID_COLS, staff items query, routes ROUTE_UNIT_COLS
  - Changed UI displays: data-insight unit table "Current Bill" column, route page Amount cell, assignments page Amount cell, deliver-bottom-sheet/map/card-list bill display
  - Data Insight unit table: removed Status + old Due columns, added "Current Bill" (monthly_fee+arrears), renamed Paid header with blue "Current" badge
- **KPI cards compact redesign** (`src/components/data-insight.tsx`):
  - Before: CardHeader (label + badge with value) + CardContent (same value duplicated) — double values, broken in dark mode (`bg-blue-100`, `text-blue-600`)
  - After: Single-line compact divs — colored dot (bg-*-500) + label (text-muted-foreground) + single value (text-*-500 accent)
  - Dark mode safe: `.500` accent colors are saturated enough on both white/gray backgrounds; text uses CSS variables (auto-adapt)
  - Data KPIs: `grid-cols-2 sm:4 lg:7 gap-2` (was 3 cols with Card gap)
  - Delivery KPIs: same compact pattern — icon + label + single value
  - Loading skeleton updated to match compact layout
  - Removed unused `CardHeader`, `CardTitle` imports
- **MASTER.md updated:** bill_items references removed from sections 5, 6, 7, 9. Data model table updated. Pipeline renamed to enrich-survey-units.py. New Section 16 added (future workflow proposal).
**Key decisions:**
- No `start_month` available in database (bill_items was dropped). Using 24-month rolling lookback instead.
- amount_due column kept in DB unchanged — only display calculation changed to monthly_fee + arrears
- `.500` accent colors for dark mode compatibility (not `.600`/`.100` light-only colors)
- Supabase's `.order()` uses alphabetical sort, which is wrong for "MMMYYYY" — sort client-side with monthKey
- `bill_items` does NOT exist in this Supabase project — all enrichment targets `survey_units` directly

### 2026-05-24 (Architecture Reset) — Location: Home
**Focus:** MASTER.md rewrite with mobile-first field staff UX + reference table architecture + visual rehaul plan
**Done:**
- Completed full codebase audit (all API routes, hooks, components, stores, types, data flow)
- Identified root cause of all filter/hierarchy issues: PostgREST 1000-row limit on `.select()` queries
- Redesigned filter architecture: 3 reference tables (`hierarchy`, `surveyors`, `bill_months`) replace `SELECT DISTINCT` on 212K-row tables
- Defined two-mode UX: mobile-first field staff (`/deliver`) + desktop-first admin (`/map`)
- Built visual design system for both modes with specific color, typography, and touch target rules
- Restructured implementation phases with realistic hour-based estimates
- Added 4 new edge case decisions (reference table sync, offline photo, staff UC changes)
- Created `GET /api/bill-months` endpoint
- Created `useBillMonths` hook with 60min staleTime
- Updated hierarchy route: RPC-first with fallback to `.range(0, 999999)` (bypasses 1000 limit)
- Updated bill-months route: RPC-first with fallback to direct select
- Fixed level logic in Data Insight route — never drops to unit level (stays at UC)
- Fixed `get_survey_group_stats` RPC: `p_uc` is filter-only (no survey_id grouping)
- Fixed `get_billing_group_stats` RPC: same filter-only change
- Added bill month filter to FilterState + billing-store + filter-panel + passed to all API routes
- Added `get_hierarchy`, `get_surveyors`, `get_bill_months` RPCs to `007-data-insight-rpcs.sql`
**Key decisions:**
- Reference tables are the single source of truth for filter dropdowns — not RPCs, not DISTINCT queries
- Two separate UX modes with role-based routing (future: route guard)
- Visual rehaul deferred to Phase D (after core data + assignment + delivery work)
- Realistic estimates: ~20 hours total to complete all phases
**Next session:**
- Step 0d.1: Create `010-reference-tables.sql` migration — create + populate + trigger
- Step 0d.2: Update hierarchy & bill-months API routes to query reference tables

---
### 2026-05-27 (RBAC System Implementation) — Location: Office
**Focus:** Implement RBAC — roles table, username-based auth, admin user management, settings page
**Done:**
- **RBAC.1** — Created `scripts/sql/020-rbac-system.sql`: `roles` table (super_admin, admin, field_staff), username/role_id/suspended_at/deleted_at on profiles, drops legacy role/permissions columns, RLS policies
- **RBAC.2** — Updated `auth-store.ts`: renamed `role` → `roleName`, added `displayName`, `signIn` transforms username→email via `toEmail()`, checks suspended_at/deleted_at after login, signs out with message
- **RBAC.3** — Updated login page: field shows "Username or Email"
- **RBAC.4** — `POST /api/admin/users`: validates unique username, creates auth user with service_role key, creates profile row, returns password once
- **RBAC.5** — `GET /api/admin/users`: profiles + roles join, status badges
- **RBAC.6** — `PATCH/DELETE /api/admin/users/[id]`: edit role, reset password, freeze/unfreeze, soft-delete/restore
- **RBAC.7** — `/settings` page: tabs (Appearance/Account/Users), Users tab with data table, add user modal with password reveal, row actions (edit role, reset PW, freeze, delete)
- **RBAC.8** — AppHeader shows `displayName` from profile instead of email
- **RBAC.9** — All role references updated across 7 files: `role`→`roleName`, `'staff'`→`'field_staff'`, admin checks include super_admin
- **RBAC.10** — Applied migration via Supabase Management API (PAT), backfilled admin `kashifkhalil74@gmail.com` as super_admin, E2E tested: create staff user → freeze → login blocked → unfreeze → login works
- **Deleted** `.range(0, 1_000_000)` from 4 remaining routes (bill-months, routes, assignments, surveys)
- **Full app audit** documented 40+ issues in Section 15 (efficiency score 61/100, deferred to Phase Z)
**Key decisions:**
- Username-based auth: app transforms `input` → `input@billing.local` via `toEmail()` for Supabase Auth
- No `permissions` table or `user_roles` join table — `role_id` FK on profiles is sufficient for 3-role system
- Soft-delete (`deleted_at`) preserves performance history; hard delete only if GDPR required
- `roleId`→`roleName` join via `roles!inner(name)` on every profile lookup
**Next session:** Phase Z — App audit cleanup (10 steps, ~4 hrs) or feature work
**Supabase Access Token:** saved in `.env.local` as `SUPABASE_ACCESS_TOKEN`

---
### 2026-05-27 (Navigation Unification — Single Layout for All Users) — Location: Home
**Focus:** Eliminate dual-layout system, remove back-button navigation, give staff same search/filter as admin
**Done:**
- **Staff defaults to `/map`** — Removed staff redirect to `/deliver` from both `/page.tsx` (home) and `/map/page.tsx`. All users land on `/map`.
- **Deliver page flattened into AppShell** — Removed `fixed inset-0` overlay and its own `<AppHeader>`. Deliver page now renders inside standard AppShell layout. Offline/photo/cache indicators moved to a conditional status bar within the deliver page content.
- **Bottom tabs for everyone** — Removed `isAdmin` gate on bottom tabs. Map/List/Deliver always visible. Tabs now navigate to `/map` when clicked from other pages.
- **Back-button system fully removed** — Removed `forceBack`/`onBack` props, `navHistory` state, `goBack()` method from billing-store. AppHeader always shows burger menu (no dual burger/back). `house-detail-sheet.tsx` replaces `goBack()` with `selectHouse(null)`.
- **Search/filters for staff** — Removed `roleName !== 'field_staff'` gate on mobile search/filter row. Removed `isAdmin` gate on DesktopFilterBar. Staff gets full search + filter access on both mobile and desktop.
- **`staff-light-mode`** — Moved from deliver page container to AppShell container, applied automatically when `roleName === 'field_staff'`.
- **Cleaned up:** `isDeliverPage`, `isAdmin`, `isMapPage`, `navHistory`, `goBack`, `forceBack`, `onBack` — all eliminated. No role-based layout gating remains in AppShell or AppHeader.
- **Sidebar CSS** — Fixed `sidebarOpen` translate to use `max-lg:` prefix so desktop sidebar is always visible (no flash on initial load).
**Key decisions:**
- One unified layout for all users (AppShell). Only data access is role-gated, not the UI shell.
- Bottom tabs show on all pages including `/deliver` (creates two tab bars on deliver page: AppShell for page nav, deliver's own for view-mode switching — user accepted this tradeoff).
- Back-button system eliminated entirely — simpler UX with navigation handled by bottom tabs + sidebar.
- `selectHouse(null)` replaces `goBack()` — always returns to map view instead of restoring previous view.
**Edge Cases:**
- Staff on `/deliver` seeing two tab bars (AppShell + internal) is intentional — AppShell tabs navigate pages, internal tabs switch delivery view modes.
- `staff-light-mode` applied at AppShell level affects all pages for staff users.
- `navHistory` unbounded growth (L9 in audit) resolved by removing the feature entirely.

---

## 13. File Inventory (Phase 0)
Source files copied from `F:\qoder\billing-system\` + `F:\Routing-Station-Pro` into `scripts/`
```
scripts/ root (6 files, 86 KB):
  routingstation.py (46 KB) — Daily survey/payment injection into old Supabase
  migrate_to_supabase.py (23 KB) — Historical bulk migration engine (old project ref)
  migrate_life_cycle.py (10 KB) — Alternative single-month migration (old project ref)
  run_historical_migration.py (20 KB) — Phase 0b: migrates CSVs/XLSXs → billing Supabase
  config.py (2.5 KB) — Shared config
  geography.json (1 KB) — City→UC→MC mapping

scripts/ref/ (6 files + routing-station-src dir, ~1.5 MB):
  pdf-bill-printer.py (53 KB) — Blueprint for import-lifecycle-data.py
  requirements.txt (499 B) — Python dependencies reference
  .env.old-* (4 files) — Old Supabase credentials for reference
  routing-station-src/ (1.4 MB) — Old routing station source code reference

scripts/sql/ (17 active migration files, ~120 KB):
  005-bill-items-payment-history.sql — Core 2-table model (bill_items + payment_history)
  006-payment-summary.sql — Pre-computed monthly payment totals
  007-data-insight-rpcs.sql — 7 RPCs for admin aggregation
  008-add-tehsil-to-bill-items.sql — tehsil column + backfill
  009-triggers-and-automation.sql — tehsil + payment_summary triggers
  010-reference-tables.sql — hierarchy, surveyors, bill_months ref tables
  011-performance-indexes.sql — Missing indexes (status trigram, composite)
  012-add-psid-to-survey-units.sql — Phase 0f: psid column + backfill + index
  013-add-verification-tracking.sql — Phase 0f: last_verified_month column
  014-house-corrections-table.sql — Phase 0f: replaces verified_houses
  015-revise-rpcs.sql — Phase 0f: 5 RPCs updated for psid + ref tables
  016-delivery-tracking-tables.sql — Phase 0f: delivery infrastructure (4 tables + triggers)
scripts/sql/_old/ (17 files, 49 KB):
  schema_update_phase_a.sql + parts — Old schema migrations
  rpc_*.sql — Old RPC definitions (finance_metrics, retention_report, etc.)
scripts/archive/ (gitignored, created by archive-legacy-tables.py):

scripts/data/ (gitignored — 1.10 GB total, 110 files):
  excel_dumps/ (369 MB, 44 CSV) — Biller data per city per month
  scraped_data/ (209 MB, 10 CSV) — Survey + payment records
  processed_pdfs/ (439 MB, 30 files) — Combined + lifecycle XLSX + index JSON
  routing-station-pro-data/ (105 MB, 26 files) — PWA data JSON
```
---
## 14. Changelog
| Date | Version | Change |
|------|---------|--------|
| 2026-05-23 | 1.0 | Initial MASTER.md |
| 2026-05-23 | 1.1 | Updated Phase A with corrected pipeline |
| 2026-05-23 | 1.2 | Added Phase 0 file inventory |
| 2026-05-23 | 1.3 | Added Phase 0b plan, field mapping |
| 2026-05-23 | 1.4 | Added run_historical_migration.py, bug fixes |
| 2026-05-23 | 2.0 | Major redesign: 3-table core model (bill_items + payment_history), dropped old bills table |
| 2026-05-24 | 2.1 | Phase 0b complete — data fixes |
| 2026-05-24 | 2.2 | Phase 0c defined |
| 2026-05-24 | 3.0 | Phase 0c complete + routing app reference |
| 2026-05-24 | 3.1 | Filter panel + mobile UX revisions |
| 2026-05-24 | 3.2 | Navigation cleanup |
| 2026-05-24 | 3.3 | Data Insight + RPC decision |
| 2026-05-24 | 4.0 | Full SSR migration + triggers |
| 2026-05-24 | 5.0 | **Architecture reset:** Reference tables (hierarchy/surveyors/bill_months). Two-mode UX (mobile-first staff / desktop-first admin). Visual design system. Hour-based phase estimates. |
| 2026-05-25 | 5.1 | **Domain separation discovery:** Biller data (`bill_items`) ≠ payments (`payment_history`). Decoupled through `survey_units.psid`. `get_billing_summary` RPC rewritten to use `payment_history` as primary source. Performance indexes added (011). |
| 2026-05-25 | 5.2 | **Schema restructuring plan (Phase 0f):** 6 new SQL migrations (012-016) — `psid` on survey_units, `last_verified_month`, `house_corrections`, 4 delivery tables (daily_assignments, assignment_items, delivery_photos, staff_daily_stats), revised RPCs, archive legacy. Composite PK `(psid, bill_month)` for `bill_items`. 3 new edge cases (#13-#15). Phase estimates updated to 22.5 hrs total. |
| 2026-05-25 | 6.0 | **Phase 0f complete.** Steps 0f.1–0f.6 applied. Schema restructuring, domain decoupling, delivery tracking tables, legacy archive. DB at ~480MB (free tier). |
| 2026-05-26 | 7.0 | **Storage crisis → Lean schema redesign.** Dropped `bill_items` entirely (merged into `survey_units`). `payment_history` trimmed to 3 columns. Unused columns/indexes dropped. Hybrid DB/JSON architecture: current month on DB, history in `public/data/*.json`. 3 export scripts created. 4 API routes updated. DB stabilized at ~200MB with 2-year runway. |
| 2026-05-26 | 8.0 | **Option A nav fixes + aggregation RPCs + Apply/Update buttons.** 6 nav fixes (shared AppHeader, page titles, debounce, sidebar labels, bottom tabs, resize handler). `unit_type` column removed everywhere (never existed in DB). `.in(psid)` array chunking at 800 across all API routes. Discovered PostgREST cannot do aggregate functions (SUM/DISTINCT). Created `019-aggregation-rpcs.sql` with `get_billing_stats` + `get_hierarchy_stats` RPCs. Updated `billing-stats` and `data-insight` routes to use RPCs (eliminated silent row truncation at 1MB). Added `pendingFilters` store + Apply/Cancel/Update buttons in both AppHeader (mobile) and DesktopFilterBar (desktop). Fixed `psid` ambiguous column error in `get_hierarchy_stats` RPC. DesktopFilterBar reverted to auto-apply with `s.filters`; mobile sheet uses pending→apply pattern. |
| 2026-05-26 | 9.0 | **Phase D visual rehaul + city context selector.** Complete Phase D (D.1-D.6): staff route guard, staff mobile layout, sidebar review, filter bar polish, theme system, touch target audit. Stats/assignments/route pages wrapped in AppShell. Mobile bottom tabs reduced. DesktopFilterBar global + pending→apply pattern. **City selector:** Added `selectedCity` + `setCity()` with Zustand persist, `CitySwitcher` with gradient avatars, simplified filter panel (removed District/Tehsil), city-scoped KPI/assignments/routes. Fixed uppercase DB case mismatch (SARGODHA vs Sargodha). Implemented 3-city district+tehsil mapping (Sargodha=SARGODHA::SARGODHA, Bhalwal=SARGODHA::BHALWAL, Khushab=KHUSHAB::KHUSHAB). Fixed Clear button to immediate-apply (no Cancel/After flash). Added map flyTo animation on city switch. All hooks/APIs updated for tehsil filtering. |
| 2026-05-27 | 10.0 | **Full app audit + efficiency scoring.** Removed all 4 `.range(0, 1_000_000)` hacks, paginated psid fetch in surveys route, leaner route tree queries. Found and documented 40+ performance/code-quality issues. Efficiency score: **61/100**. Estimated monthly egress under 70-staff load: ~2.5GB of 5GB budget. Fixing HIGH+MEDIUM issues would bring score to **86/100** and egress under ~900MB. See Section 15. |
| 2026-05-27 | 11.0 | **RBAC system implementation.** Created `roles` table (super_admin/admin/field_staff), added username + role_id + suspension + soft-delete to profiles. Username-based auth for staff. `/settings` page with Users tab (CRUD, freeze, password reset, delete/restore). Sidebar shows admin-only items based on role. All role comparisons updated to use `roleName` with new role values. DB migration applied, admin backfilled as super_admin. |
| 2026-05-27 | 12.0 | **Navigation unification — single layout for all users.** Removed dual-layout system (staff `fixed inset-0` overlay). Delivered page rendered inside AppShell. Back-button system eliminated (`forceBack`/`onBack`/`navHistory`/`goBack` removed). Staff gets search/filter access on mobile and desktop. Bottom tabs for all users. Sidebar CSS fixed for desktop. |
| 2026-05-29 | 13.0 | **Payment history fix + amount_due→fee+arrears + KPI redesign.** Chronological sort fix for payment months (alpha sort broke allMonths). 24-month lookback replaces unavailable `start_month` (bill_items dropped). amount_due replaced by monthly_fee+arrears in all UI surfaces (12 files). KPI cards redesigned: compact single-line, single value, dark-mode safe .500 accent colors. Data model updated: bill_items removed from docs, enrich-survey-units.py replaces import-lifecycle-data.py. New Section 16: Future workflow proposal. |

---
## 15. Full App Audit Report (2026-05-27)

### 15.1 Efficiency Score: 61/100

| Category | Weight | Score | Rationale |
|----------|--------|-------|-----------|
| Data Egress Optimization | 40% | 55 | 4 unbounded queries, 1MB PostgREST risk on 3 routes, 5MB+ overhead per admin session |
| Query Pattern Quality | 25% | 65 | Explicit columns used everywhere ✅, but client-side grouping/aggregation instead of server-side ❌ |
| React Rendering | 20% | 60 | Good icon imports ✅, but un-memoized arrays, JSON.stringify in useMemo, volatile callback deps ❌ |
| Code Quality/Redundancy | 15% | 75 | No dead service files ✅, but duplicated functions, dead constants, bundle bloat ❌ |
| **Weighted Total** | **100%** | **61** | |

### 15.2 Egress Budget Assessment (Supabase Free Tier: 5GB/month)

**Assumptions:** 70 field staff + 5 admins, 30 days/month

| Scenario | Est. Monthly Egress | % of 5GB |
|----------|---------------------|----------|
| Current code, heavy use | ~2.5 GB | 50% |
| All fixes applied | ~900 MB | 18% |
| Staff-only light use | ~420 MB | 8.4% |

**Risk assessment:** Within budget currently, but 3 routes silently truncate at PostgREST's 1MB response limit — causing undetected data loss, not bandwidth issues. The primary concern is correctness, not cost.

### 15.3 High Severity Issues

| # | File | Issue | Impact |
|---|------|-------|--------|
| H1 | `src/app/api/surveys/route.ts:53-68` | **PSID pagination loop fetches ALL rows before paginating** when `paymentStatus !== 'all'`. 212K psids fetched in 71 sequential pages (3000/page) before serving page 1. **~5MB+ egress per admin session.** | 99.9% of fetched data discarded. Admin adds ~5MB overhead per survey browsing session. |
| H2 | `src/app/api/data-insight/route.ts:84-87` | **Fetches ALL assignment_items for last 90 days** with no `.limit()`. `id, status, assignment_id` columns × potentially 100K+ rows = ~5MB. **Silently truncated at 1MB PostgREST limit** — delivery KPIs silently wrong. | Undetected data corruption. |
| H3 | `src/app/api/staff/stats/route.ts:23-91` | **Fallback path fetches ALL assignments + ALL items + ALL staff** for date range when pre-computed stats missing. For busy multi-day periods, exceeds 1MB limit silently. | Silent data loss in staff stats. |
| H4 | `src/hooks/use-data-insight.ts:52` | **Query key uses object reference** (`['data-insight', filters, ...]`). New `filters` object every render → query refetches on every keystroke or unrelated state change. | Continuous refetches, wasted egress. |
| H5 | `src/hooks/use-survey-data.ts:8` | **Same object-reference query key issue** as H4. `['surveys', filters, ...]` refetches on every filter change render. | 20+ unnecessary refetches per admin session. |
| H6 | `src/hooks/use-survey-data.ts:41-42` | **`useSurveyById` has no `staleTime`** — defaults to 0 (always stale). Every mount refetches house detail even if just loaded. | ~50KB per house detail open, 10-20 opens/session = ~1MB wasted per admin session. |
| H7 | `src/components/delivery/deliver-bottom-sheet.tsx:346` + `src/components/photo-upload.tsx:105` | **Duplicated `compressImage` function** — same 40-line function inlined in two components. | Bundle bloat, maintenance duplication. |
| H8 | `src/components/filter-panel.tsx:520` + `src/components/layout/AppHeader.tsx:35` | **`JSON.stringify` in `useMemo` deps** — defeats memoization. `filters`/`pendingFilters` are new objects every render → stringify recomputes every time anyway. | Unnecessary computation on every render. |
| H9 | `src/components/filter-panel.tsx:525-534` | **`handleUpdate` depends on volatile `isFetching`** — `useIsFetching()` changes frequently, recreating the callback on every fetch status change. Closure in setTimeout captures stale value anyway. | Unnecessary re-render propagation. |
| H10 | `src/components/delivery/deliver-map.tsx:58-63` | **`PanTo` unmounts/remounts on every `panTo` change** — conditional rendering `{panTo && <PanTo />}` destroys and recreates the component. Map flyTo resets. | Navigation jank for staff. |
| H11 | `src/components/survey-list.tsx:27-35` | **Client-side `.filter()` on survey data** — violates AGENTS.md rule. Filters thousands of records in JS instead of pushing `search` param to API route for SQL ILIKE filter. | Wasted data transfer: fetches all results, filters to a few on client. |

### 15.4 Medium Severity Issues

| # | File | Issue | Impact |
|---|------|-------|--------|
| M1 | `src/app/api/data-insight/route.ts:90` | **Client-side status filter** — `.filter(a => a.status === 'delivered')` on all fetched assignment items. Add `.eq('status', 'delivered')` to the DB query. | ~60% data transfer reduction for this query. |
| M2 | `src/app/api/data-insight/route.ts:105-113` | **Separate query for staff count** — fetches `daily_assignments` staff_id after fetching items. Combine with join. | Extra round-trip, negligible egress. |
| M3 | `src/app/api/assignments/route.ts:47-57` | **Fetches 20K survey_units rows** just to count per-UC. Should use DB aggregation. | ~400KB egress per admin page load. |
| M4 | `src/app/api/assignments/route.ts:93-98` | **Client-side item status counting** — fetches all `assignment_items` then loops. Use `.select('assignment_id, status', { count: 'exact' })`. | Variable, potentially large. |
| M5 | `src/app/api/hierarchy/route.ts:35-52` | **Client-side deduplication** of reference table data — table should already be unique. | Negligible egress, fragile pattern. |
| M6 | `src/hooks/use-assignments.ts:46,61,111,138` | **`staleTime: 30s` is too aggressive** — AGENTS.md specifies 5min for billing data. 4 hooks use 30s. | 10× more refetches than necessary. |
| M7 | `src/hooks/use-assignments.ts:93-97` | **`useCreateAssignment` broad invalidation** — `['staff-assignment']` invalidates ALL staff's data. | Unnecessary refetches for all 70 staff. |
| M8 | `src/hooks/use-assignments.ts:153-157` | **`useRevokeAssignment` broad invalidation** — `['unassigned-bills']` invalidates all UCs. | Unnecessary refetches. |
| M9 | `src/hooks/use-staff-performance.ts:47` | **Broad invalidation on save** — `['staff-performance']` invalidates all staff performance records. | Unnecessary refetches. |
| M10 | `src/stores/billing-store.ts:91-93` | **`setFilters` overwrites `pendingFilters`** — desktop auto-apply shouldn't touch pending state. Bug can discard user's in-progress filter edits. | UX bug: lost edits on mobile. |
| M11 | `src/components/filter-panel.tsx:131 + 347` | **UC computation duplicated** — same dedup/sort logic in `FilterPanelInner` and `DesktopFilterBar`. | Maintenance duplication. |
| M12 | `src/components/survey-markers.tsx:53-71` | **New `L.divIcon` created every render** — inline `createIcon()` calls in JSX for every marker, every render. | Unnecessary GC pressure on map interactions. |
| M13 | `src/components/map-view.tsx:30-38` | **`MapFollower` flyTo on mount** — animates from default center to stored center on every page load. | Jarring UX per navigation. |
| M14 | `src/components/house-detail-sheet.tsx:29` | **`allImages` array not memoized** — concatenates two arrays on every render. | Unnecessary array allocation. |

### 15.5 Low Severity Issues

| # | File | Issue |
|---|------|-------|
| L1 | `src/app/api/billing-stats/route.ts:19` | Double JSON serialization (RPC returns `json` type → PostgREST double-encodes) |
| L2 | `src/app/api/staff/performance/route.ts:47` | `.select()` without explicit columns (violates AGENTS.md) |
| L3 | `src/lib/offline-cache.ts:28` | `clearAssignmentCache()` exported but never imported |
| L4 | `src/lib/photo-queue.ts:113` | `getAllQueued()` exported but never imported |
| L5 | `src/lib/photo-queue.ts:18-35` | IndexedDB connection opened per operation (not cached) |
| L6 | `src/components/filter-panel.tsx:325-334` | `PENDING_DEFAULTS` constant never referenced — dead code |
| L7 | `src/components/survey-markers.tsx:26-34` | Duplicate `getUcColor()` function (also in `mc-utils.ts:37`) |
| L8 | `src/components/delivery/deliver-bottom-sheet.tsx:253` | Inline SVG fallback string repeated across 3 components |
| L10 | `src/types/index.ts:30` | `RouteData` not exported (used by `SavedRoute` which IS exported) |

### 15.6 Estimated Impact After Fixes

| Metric | Current | After HIGH fixes | After ALL fixes |
|--------|---------|------------------|-----------------|
| Efficiency Score | 61/100 | 78/100 | 86/100 |
| Monthly Egress (70 staff) | ~2.5 GB | ~1.3 GB | ~900 MB |
| % of 5GB budget | 50% | 26% | 18% |
| Routes with silent truncation risk | 3 | 0 | 0 |
| Unnecessary refetches per session | 20+ | 3-5 | 1-2 |
| Duplicated code blocks | 4 | 2 | 0 |
| Dead exports | 3 | 3 | 0 |

### 15.7 When to Fix

> **Decision:** All audit items deferred to **final polish stage** (after all feature phases are complete). Fixing during feature work causes context switching that outweighs the benefit. The app is within 5GB egress budget and all data operates correctly — these are optimization wins, not blockers.

### 15.8 Final Polish Phase — Audit Cleanup

**Phase Z — App Audit Cleanup (~4 hrs)**
| Step | Time | Task |
|------|------|------|
| Z.1 | 45 min | Fix data correctness: add limits to data-insight (H2) and staff/stats (H3) |
| Z.2 | 30 min | Fix query keys: serialize `filters` in use-data-insight (H4) and use-survey-data (H5) |
| Z.3 | 15 min | Add staleTime to useSurveyById (H6) |
| Z.4 | 45 min | Replace PSID pagination loop with proper join/RPC (H1) |
| Z.5 | 30 min | Fix staleTimes: raise assignment hooks from 30s to 2min (M6) |
| Z.6 | 30 min | Fix render perf: memoize markers (M12), allImages (M14), compressImage dedup (H7) |
| Z.7 | 30 min | Push client-side .filter() to server for survey-list search (H11) |
| Z.8 | 15 min | Fix setFilters overwriting pendingFilters (M10) |
| Z.9 | 30 min | Cleanup: dead code (L6), dead exports (L3-L4), duplicate getUcColor (L7), inline SVGs (L8) |
| Z.10 | 15 min | Fix MapFollower initial flyTo jank (M13), PanTo remount bug (H10) |
