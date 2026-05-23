# Billing & Recovery — Master Plan
**Generated:** 2026-05-23 | **Stack:** Next.js 16 + Supabase + Tailwind v4 + Zustand + TanStack Query  
**Project:** Billing SaaS App — Field staff bill delivery & verification system  
**Scale:** ~350K households, ~70 field staff, 3 cities (Bhalwal/Khushab/Sargodha)
> This file is the single source of truth. All prior plan documents are archived to `docs/archive/`.  
> Every session **starts** by reading this file and **ends** by appending to the Session Log.
---
## Table of Contents
1. [Project Identity & Architecture](#1-project-identity--architecture)
2. [Lifecycle Data Pipeline](#2-lifecycle-data-pipeline)
3. [Billing Module — Done](#3-billing-module--done)
4. [Billing Module — Remaining (Phases A–E)](#4-billing-module--remaining-phases-a-e)
5. [Data Model](#5-data-model)
6. [Monthly Data Workflow](#6-monthly-data-workflow)
7. [Performance Rules (Must Follow)](#7-performance-rules-must-follow)
8. [Session Log](#8-session-log)
9. [Changelog](#9-changelog)
---
## 1. Project Identity & Architecture
### 1.1 The Core Mission
Replace paper-based bill delivery with a digital system: lifecycle data → PDF generation → staff assignment → GPS-tracked delivery with photo proof → performance tracking.
### 1.2 Scale
- **Households:** ~350K across 3 cities
- **Field Staff:** ~70 delivery staff
- **Monthly Bills:** ~30K–70K printed per month
- **Free Tier Commitment:** Optimized for Supabase (500MB DB, 1GB Storage) and Vercel (100GB Bandwidth) free tiers
### 1.3 Technology Stack
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
### 1.4 Route Structure
/                          → redirects /map
/map                       → leaflet map with survey markers
/list                      → survey list view (future)
/route                     → route management — loads from saved_routes table
/stats                     → delivery statistics (future)
/login                     → auth
/settings                  → appearance + account
### 1.5 Key Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| **Standalone app** | Separate Supabase project (not HR), separate Vercel deploy |
| **Google Maps tiles** | Internal office tool, not commercial SaaS — better satellite resolution than MapTiler |
| **Photos via GAS webhook** | Reuse proven routing station endpoint. Zero Supabase Storage egress costs |
| **No RPCs** | All aggregation in TypeScript services (matching HR app rule) |
| **Explicit column selects** | Never `select('*')` — egress cost control |
| **Manual monthly processing** | pdf-bill-printer.py runs manually on 19-20th each month (handles PDF gen) |
| **import-lifecycle-data.py** | Separate script replicating pdf-bill-printer's data pipeline, saves to DB instead of generating PDFs |
| **Offline photo queue** | Photos stored in IndexedDB when offline, upload when online |
| **pdf-bill-printer.py untouched** | Original script NOT modified — a separate DB-only script handles data import |
### 1.6 Maps
- **Streets:** `https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`
- **Satellite hybrid:** `https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}`
- **Subdomains:** `mt0,mt1,mt2,mt3` | **MaxZoom:** 20
---
## 2. Lifecycle Data Pipeline
### 2.1 Overview
The core data flow starts at the **Government Portal** which provides monthly lifecycle XLSX files. These contain every household's billing data. The pipeline processes this data for two purposes: (1) printing physical bills, and (2) populating the database for digital tracking.
### 2.2 Source Data Locations
| Path | Purpose |
|------|---------|
| `F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs\` | Lifecycle XLSX files (18 city/month files + 5 combined masters) |
| `F:\Original_pdfs\{city_code}\{month}\` | Source A4 PDFs from gov portal — scanned for PSID extraction |
| `F:\qoder\billing-system\01_Local_Engine\inputs\Batch_Routes_Export_2026-02-25.csv` | Route definition CSV (used for route totals) |
| `F:\Final_print\{Month}-Final-Print\` | Output of pdf-bill-printer.py — generated A5 print PDFs |
### 2.3 Lifecycle XLSX Files
**Pattern:** `test_lifecycle_Biller_{City}_{Month}.xlsx` (e.g. `test_lifecycle_Biller_Sargodha_May2026.xlsx`)
- **3 cities:** Sargodha (sgd), Khushab (ksb), Bhalwal (bhl)
- **6 months:** Dec 2025 → May 2026
- **18 files total** + 5 combined master XLSX (~17MB → ~42MB, grows monthly)
- **~57+ columns** per file including: `Biller PSID`, `Survey ID`, `Deleted in Portal`, `Route Segment`, `Route Seq`, `Route Total`, `Monthly Fee`, `Arrears`, `Total Payable`, `Surveyor Name`, `Survey Date`, `Survey Time`, `UC`, `District`, `Tehsil`, and per-month `PDF Issued` columns
### 2.4 pdf-bill-printer.py Pipeline (Original Script — 1305 lines)
Located at: `F:\qoder\billing-system\01_Local_Engine\scripts\pdf-bill-printer.py`
**Flow (step by step):**
1. **City selection** (interactive menu: All / Sargodha / Khushab / Bhalwal) or CLI args
2. **Find latest XLSX** for selected city + month using `find_latest_city_excel()` — matches `test_lifecycle_Biller_{City}_{Month}*.xlsx`
3. **Map source PDFs** via `map_source_pdfs()`:
   - Scans `F:\Original_pdfs\{city_code}\{month}\` for all PDFs
   - Opens each PDF with PyMuPDF (fitz)
   - Finds solid divider lines (`find_solid_divider()`) at ~5.85 inches (splits A4 into top/bottom halves)
   - Extracts 20-digit PSIDs using regex `\b(\d{20})\b` from each half-page
   - Builds `psid_map`: `{psid: {path, page, rect, split_y, pos}}`
   - Caches to JSON index file for faster subsequent runs
4. **Filter:** `Deleted in Portal != 'Yes'` — removes records the gov portal has deleted
5. **Group by UC** (Union Council column, auto-detected via `smart_find_uc_column()`)
6. **Sort** by Route Segment (numeric) → Route Seq → Survey ID
   - Route number extracted from "MC-1_Route_17_RafiPark" → 17
   - Unrouted gets priority 999999 so they sort last
7. **Process each UC:** For each PSID in lifecycle data:
   - Check if PSID exists in `psid_map` — if not, log as "Missing" and skip
   - If found, increment `bill_count` and build metadata
   - **Bill#** = `#{bill_count}/{total_bills_in_uc}` (print sequence per UC)
   - Build `batch_items[{psid, survey_id, left_meta, right_meta, lat, lng, source}]`
8. **Optimize batches** via `optimize_batches()` — small UCs (< 200 bills) are merged into batch folders
9. **Generate merged PDFs** via `generate_merged_pdf()`:
   - Creates A5 pages (595×421 pts) from source A4
   - Applies overlays via `apply_bill_overlays()`:
     - Survey metadata text (SID, surveyor, date, status, print seq)
     - Route metadata text
     - Barcode (PSID — Code128)
     - QR code (survey_id → scanner URL)
10. **Save Final_Run_Report.xlsx** with multi-tab stats
### 2.5 The Two-Filter System
A bill only gets a bill# (print sequence) if it passes **both** checks:
1. `Deleted in Portal != 'Yes'` — not marked as deleted by the gov portal
2. `psid in psid_map` — PSID was found in a source A4 PDF (verifies the physical bill exists)
### 2.6 import-lifecycle-data.py (New Script — Phase A2)
Located at: `C:\billing-saas-app\scripts\import-lifecycle-data.py`
**Purpose:** Mirrors pdf-bill-printer.py's data pipeline but saves to DB instead of generating PDFs.
**Full pipeline (same as pdf-bill-printer except where noted):**
| Step | pdf-bill-printer.py | import-lifecycle-data.py |
|------|-------------------|------------------------|
| City selection | Interactive menu + CLI | Same |
| Read lifecycle XLSX | `find_latest_city_excel()` | Same |
| Map source PDFs | `map_source_pdfs()` → psid_map | Same (needed for bill#) |
| Filter Deleted in Portal | `Deleted in Portal != 'Yes'` | Same |
| Group by UC | `df_active.groupby(uc_col)` | Same |
| Sort by route | Route Segment → Route Seq → Survey ID | Same |
| Build batch_items + metadata | ✅ | ✅ |
| optimize_batches() | ✅ | ✅ (for batch_folder name) |
| Generate merged PDFs | ✅ | ❌ SKIP |
| Save Final_Run_Report | ✅ | ❌ SKIP |
| Insert bill_documents | ❌ | ✅ |
| Upsert bills table | ❌ | ✅ |
| Save routes to saved_routes | ❌ | ✅ |
| Print summary | Report XLSX | Console summary only |
**CLI interface:**
```bash
# Interactive mode (same as pdf-bill-printer)
python scripts/import-lifecycle-data.py
# CLI mode
python scripts/import-lifecycle-data.py --city Sargodha --month May-2026 --dry-run
Dependencies: PyMuPDF (fitz), pandas, openpyxl, python-dotenv, supabase-py
Credentials: Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local
2.7 Route Data from Lifecycle Files
Routes are embedded in the lifecycle XLSX as Route Segment and Route Seq columns. Not all MCs/UCs have routes defined. Routes are saved to the saved_routes table:
{
  "uc_name": "MC-1",
  "city": "Sargodha",
  "bill_month": "May-2026",
  "route_segment": "MC-1_Route_17_RafiPark",
  "psid_list": ["PSID1", "PSID2", "..."]   // ordered by Route Seq
}
The Route tab (/route) loads from saved_routes, grouped by city → UC → route.
3. Billing Module — Done
3.1 Infrastructure & Setup
- Supabase project initialized (qrxbsoqepfaryolwcedk) — 8 tables, indexes, RLS
- Next.js project initialized at C:\billing-saas-app
- GitHub repo: github.com/mkka7944/billing-saas-app
- Vercel deployment: billing-saas-app.vercel.app
- Supabase Auth configured with admin-created accounts
- Superadmin created: kashifkhalil74@gmail.com (ID: ace31830-1476-4acd-9c19-5e7054d6584a)
- .env.local configured with API keys
- Shadcn UI components installed
- AGENTS.md with performance rules
3.2 Visual Harmonization (HR App Sync)
- globals.css synced with HR's Neutral-based theme tokens (:root/.dark)
- Vercel themes (.vercel/.vercel-dark) CSS blocks added
- Typography base layer: text-caption, text-secondary, text-mono-data
- Card shadow removal (flat design)
- Fonts: Plus Jakarta Sans + Outfit + Geist Mono (next/font/google)
- ThemeProvider wrapping root layout with 4 themes (light/dark/vercel/vercel-dark)
- Skeleton loading states replacing "Loading..." text
- Page animations: animate-in fade-in duration-500
- Login skeleton + Loader2 spinner
3.3 Responsive Layout
- AppShell: Responsive layout with sidebar (lg+) / bottom tabs (mobile)
- BillingSidebar: Collapsible (icon-only mode), nav groups (Map/List/Route/Stats + Settings)
- User profile card in sidebar: avatar initials + email + logout
- Theme toggle in sidebar (light/dark only)
- Version footer in sidebar
- Hamburger menu for mobile overlay
- Satellite view toggle in top bar (Layers button)
3.4 State Management
- billing-ui-store: Zustand + persist for sidebar state (open/collapsed/pageIdentity)
- billing-store: mapType toggle (streets/satellite)
3.5 Pages Built
- /map — Leaflet map with Google tiles, auth guard, AppShell wrapper
- /login — Auth form with skeleton pre-auth + spinner
- /settings — Appearance card (5-button theme grid), Account card with user info, collapsible sections
- / — Redirects to /map
3.6 Data Sources Analyzed
- Lifecycle XLSX files cataloged: 18 files (3 cities × 6 months: Dec 2025 → May 2026)
- Combined master XLSX files: 5 files growing ~17MB → ~42MB month-over-month
- pdf-bill-printer.py analyzed (1305 lines): generates PDFs with QR/barcode/metadata overlays
- migrate_to_supabase.py analyzed: chunked upsert (500/batch), dedup by PSID
- migrate_life_cycle.py analyzed: reads Combined XLSX + survey + payment CSVs
3.7 Documentation
- docs/MASTER.md — single source of truth (this file)
- docs/archive/ — plans/, sql/, reports/ subdirectories
- AGENTS.md — development rules with workflow context
4. Billing Module — Remaining (Phases 0b, A–E)
4.0 Phase 0b: Historical Data Migration
**Purpose:** Populate empty survey_units + bills tables from local CSV/XLSX dumps (Oct 2025 → May 2026)
**Script:** scripts/run_historical_migration.py (new, ~300 lines)

**Data sources (4 total):**
| # | Source | Authority |
|---|--------|-----------|
| 1 | Survey CSVs (3 files in scripts/data/scraped_data/) | Household identity, GPS, images |
| 2 | Biller CSVs (18 files in scripts/data/excel_dumps/Biller_{City}_{Month}.csv) | PSID, financial snapshot, Survey ID linkage |
| 3 | Payment History CSV (scripts/data/scraped_data/COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv) | Per-PSID per-month payment details (amounts, dates, methods) |
| 4 | Lifecycle XLSX (18 files in scripts/data/processed_pdfs/) | Enrichment: is_issued, arrears, deleted_in_portal |

**Merge order:** Survey CSVs (base record) → Biller CSVs (enrich financials via Survey ID) → Payment CSV (per-PSID monthly records) → Lifecycle XLSX (enrich is_issued, arrears, deleted_in_portal)

**Key decisions:**
- Payment CSV is authoritative for payment data; lifecycle per-month Paid columns are Yes/No flags only — ignored
- `Biller_{City}_{Month}.csv` is the correct biller source; `biller_data_*` files lack PSID — not used
- Lifecycle XLSX used only for enrichment (is_issued per month PDF Issued column, arrears, deleted_in_portal)
- Uses SUPABASE_SERVICE_ROLE_KEY from .env.local for bulk upsert (bypass RLS)

**CLI:**
```bash
python scripts/run_historical_migration.py              # Full migration
python scripts/run_historical_migration.py --fast        # Incremental (skip existing IDs)
python scripts/run_historical_migration.py --reset       # Purge tables first
```
4.1 Phase A: Data Model + Lifecycle Import Script
#	Task
A1	SQL migration: 5 new tables (bill_documents, bill_assignments, bill_assignment_items, staff_daily_stats, staff_performance_logs)
A2	Create scripts/import-lifecycle-data.py — full pipeline matching pdf-bill-printer: reads lifecycle XLSX, maps source PDFs (PSID matching via PyMuPDF), filters Deleted in Portal != 'Yes', groups by UC, sorts by route, assigns print seq #{n}/{total}, then saves to bill_documents, upserts bills, saves routes to saved_routes. Does NOT generate output PDFs.
A3	Route tab (/route) loads from saved_routes table (grouped by city → UC → route, shows name + bill count + created date)
4.2 Phase B: Admin Assignment UI
#	Task
B1	UC Bills page at /assignments — list UCs with total/assigned/remaining counts
B2	Assign flow: select UC → see sorted unassigned bills → pick staff → set count N → first N unassigned bills auto-assigned → creates bill_assignments + items
B3	Assignment management: view active assignments per staff, revoke
4.3 Phase C: Field Staff Delivery
#	Task	Est.	Status
C1	Staff dashboard at /deliver — today's assigned bills, progress bar, timer	2h	⏳
C2	Navigation: house-to-house routing via saved route order or sequential	2h	⏳
C3	Photo capture: camera → WebP compress → IndexedDB queue (offline) → GAS webhook → Drive URL	4h	⏳
C4	Status marking: delivered (photo+GPS) or missed (photo+reason+GPS) — both require photo	2h	⏳
C5	Photo list view: timestamps, GPS coords, clickable Drive links, spoof reference	2h	⏳
4.4 Phase D: Performance Dashboard
#	Task	Est.	Status
D1	Staff daily stats auto-calculated from bill_assignment_items (assigned vs delivered vs missed)	2h	⏳
D2	Admin performance logs: filter by staff/date, add notes + rating (1–5)	2h	⏳
D3	Delivery completion dashboard at /stats	2h	⏳
4.5 Phase E: PDF Bill Number Display
#	Task	Est.	Status
E1	Display bill_documents metadata in house detail sheet (map click on /map page)	1h	⏳
5. Data Model
5.1 Current Tables (8)
Table	Key	Purpose
app_settings	key	Key-value config store
survey_units	survey_id	Household survey data (name, address, GPS, images)
bills	psid + bill_month	Monthly bill records (due, paid, arrears, issued status)
profiles	id (auth.users)	User profiles with role + permissions
staff	id (auth.users)	Field staff metadata (city, UC assignment, status)
saved_routes	id	Saved route data (JSON) for navigation
verified_houses	id	GPS-verified house locations (can track deliveries)
staff_sync_logs	id	Staff photo sync logging
5.2 New Tables (Phase A — 004-bill-verification-system.sql)
bill_documents — Metadata from lifecycle processing (populated by import-lifecycle-data.py)
CREATE TABLE public.bill_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  psid text NOT NULL,
  bill_month text NOT NULL,
  survey_id text REFERENCES survey_units(survey_id),
  uc_name text,
  city text,
  pdf_filename text,
  route_name text,
  route_seq integer DEFAULT 0,
  print_seq text,                 -- e.g. "#1/50"
  left_meta text,                 -- PDF metadata text from printer
  right_meta text,
  batch_folder text,              -- optimized folder name it would go into
  deleted_in_portal text,         -- raw value from lifecycle
  generated_at timestamptz DEFAULT now()
);
bill_assignments — Admin creates per-staff-per-day
CREATE TABLE public.bill_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid REFERENCES staff(id),
  uc_name text NOT NULL,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  bill_count integer NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
bill_assignment_items — Individual PSIDs within an assignment
CREATE TABLE public.bill_assignment_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES bill_assignments(id) ON DELETE CASCADE,
  psid text NOT NULL,
  bill_month text NOT NULL,
  sequence_no integer,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'missed')),
  photo_urls text[],
  photo_timestamps timestamptz[],
  gps_lat numeric,
  gps_lng numeric,
  delivered_at timestamptz,
  reason text                     -- null for delivered, dropdown reason for missed
);
staff_daily_stats — Auto-calculated counters
CREATE TABLE public.staff_daily_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid REFERENCES staff(id),
  date date NOT NULL,
  assigned_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  missed_count integer DEFAULT 0,
  total_negative_marks integer DEFAULT 0,
  UNIQUE (staff_id, date)
);
staff_performance_logs — Admin notes + ratings
CREATE TABLE public.staff_performance_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid REFERENCES staff(id),
  date date NOT NULL,
  notes text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  reviewer_id uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);
Indexes: All tables get indexes on filtered columns (psid+bill_month, assignment_id, staff_id+date, uc_name, etc.)
RLS: All 5 tables get select_all policy (SELECT for all authenticated users) — same pattern as existing 8 tables.
5.3 Bill# Generation
The bill# is the print sequence number assigned per UC during processing:
seq_text = f"#{bill_count}/{total_bills_in_uc}"
Where bill_count resets to 0 for each UC. So bill# = #1/50, #2/50, etc. within a UC.
This is NOT a globally unique bill number — it's a human-readable print sequence. The globally unique identifier is the PSID (20-digit number).
5.4 Pipeline Summary: import-lifecycle-data.py
- Input: test_lifecycle_Biller_{City}_{Month}.xlsx from processed_pdfs/
- Source PDF mapping: map_source_pdfs() → scans F:\Original_pdfs\{city_code}\{month}\ for 20-digit PSIDs
- Filter: Deleted in Portal != 'Yes' + PSID must be in psid_map
- Group/sort: By UC → Route Segment → Route Seq → Survey ID
- Bill#: #{n}/{total_in_uc} print sequence per UC
- DB outputs: bill_documents rows (one per PSID), bills upserts, saved_routes entries
- Does NOT: Generate A5 PDFs, add barcodes/QR, modify original pdf-bill-printer.py
### 5.5 Historical Data Sources — Field Mapping
#### Source 1: Survey CSVs (scripts/data/scraped_data/)
| CSV column | DB column |
|---|---|
| Survey ID | survey_units.survey_id |
| Name | survey_units.consumer_name |
| Address | survey_units.address |
| Latitude / Longitude | survey_units.lat / lng |
| District / Tehsil / Union Council | survey_units.city_district / tehsil / uc_name |
| UC Type | survey_units.uc_type |
| Surveyor Name / Date / Time | survey_units.surveyor_name / survey_date / survey_time |
| House Type | survey_units.house_type |
| Consumer Type | survey_units.unit_type |
| Image URL 1–4 | survey_units.image_urls[] |
#### Source 2: Biller CSVs (scripts/data/excel_dumps/Biller_{City}_{Month}.csv)
| CSV column | DB column |
|---|---|
| Survey ID | → joins survey_units → bills |
| Biller PSID | bills.psid |
| Monthly Fee | survey_units.monthly_fee |
| Billing Category | survey_units.billing_category |
| Current Bill / Balance / Total Payable | bills.current_bill / bills.amount_due / bills.total_payable |
| **Note:** `biller_data_*` files (lowercase) lack PSID — NOT used. |
#### Source 3: Payment History CSV (scripts/data/scraped_data/COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv)
| CSV column | DB column |
|---|---|
| PSID | bills.psid |
| Month | bills.bill_month |
| Paid Amount | bills.amount_paid |
| Paid Date | bills.paid_date |
| Channel | bills.payment_method |
| Status | bills.payment_status |
| **Note:** Lifecycle XLSX per-month Paid columns are Yes/No only. Payment CSV is the sole truth for payment records. |
#### Source 4: Lifecycle XLSX (scripts/data/processed_pdfs/)
| XLSX column | DB column |
|---|---|
| Biller PSID + per-month PDF Issued columns | bills.is_issued (for each month) |
| Arrears | bills.arrears |
| Deleted in Portal | bills.deleted_in_portal |
| Start Month | bills.start_month |
| Route Segment / Route Seq / Route Total | → saved_routes (used in A2 import-lifecycle-data.py) |
6. Monthly Data Workflow
Monthly (19-20th) — Manual
1. Gov portal → lifecycle XLSX downloaded to processed_pdfs/
2. Admin runs python pdf-bill-printer.py (original script, untouched) — generates A5 print PDFs with overlays
3. Admin runs python scripts/import-lifecycle-data.py --city <city> --month <Month-YYYY> — reads same lifecycle XLSX + maps source PDFs → saves to DB
4. Script inserts into bill_documents + upserts bills + saves routes to saved_routes
5. Both scripts are independent — can run in any order (import is idempotent: upserts by psid+bill_month)
Daily — Admin
1. Opens app → /assignments → sees UCs with remaining bill counts
2. Selects UC → sees sorted unassigned bill list (by route)
3. Creates assignment: pick staff → set count N → first N unassigned bills auto-assigned
4. Creates bill_assignments + bill_assignment_items
Daily — Field Staff
1. Opens app → /deliver → sees today's assigned bills
2. Navigates house-to-house (saved route order or sequential)
3. For each bill:
- Captures photo → WebP compress → IndexedDB (offline) or GAS webhook (online)
- GPS captured automatically
- Marks delivered (or missed + reason — photo required for both)
- Status saved to bill_assignment_items
4. Photos sync when internet returns (IndexedDB queue)
7. Performance Rules (Must Follow)
 1. Never select('*') — name explicit columns (egress cost)
 2. Push filters to the server — .eq(), .in(), .gte(), not JS .filter()
 3. No N+1 sequential queries — use Promise.all for independent queries
 4. No RPCs — all aggregation in TypeScript server-side services
 5. staleTime > 0 — 5min for billing data (daily updates), 10min for static
 6. gcTime > staleTime — keep cached data for back-navigation
 7. Explicit column selects on every query
 8. Index every filtered column in Supabase
 9. No client-side .filter() / .find() / .sort() on large datasets (use server-side)
10. useMemo on all derived data in render components
8. Session Log
Each session appends a log entry here. Format:
### YYYY-MM-DD (HH:MM-HH:MM) — Location: [Home/Office]
**Focus:** [short description]
**Done:**
- [task 1]
- [task 2]
**Started but not finished:**
- [task]
**Next session:**
- [next task 1]
- [next task 2]
2026-05-23 (Morning) — Location: Home
Focus: Visual harmonization + sidebar + theme system + Google Maps tiles
Done:
- Synced globals.css with HR's Neutral-based theme tokens
- Added Plus Jakarta Sans + Outfit fonts to layout.tsx
- Added typography base layer (text-caption, text-secondary, text-mono-data)
- Removed card shadows throughout
- Created AppShell responsive layout (desktop sidebar + mobile bottom tabs)
- Created BillingSidebar: collapsible, nav groups, user profile card, theme toggle, logout
- Installed next-themes, created ThemeProvider with 4 themes
- Created billing-ui-store (Zustand + persist for sidebar state)
- Created /settings page with Appearance + Account cards, 5-button theme grid
- Fixed logout redirect (router.push → window.location.href)
- Added satellite view toggle (Layers button, mapType in billing-store)
- Switched from MapTiler to Google Maps tiles (mt0-mt3 subdomains, maxZoom 20)
- Updated map-view.tsx with dynamic tile URL from store
- Added skeleton loading states to kpi-cards and survey-list
- Added login skeleton + Loader2 spinner
- Created docs/MASTER.md + docs/archive/ structure (mirrors HR app pattern)
- Updated AGENTS.md with full workflow context and MASTER.md reference
- Created shadcn Skeleton component
Key decisions:
- Google Maps over MapTiler: internal tool, not commercial SaaS
- Sidebar theme toggle = light/dark only; Vercel themes in Settings
- Bill verification system: assignment by UC/MC with remaining-bill pool
- Photos via existing GAS webhook; offline IndexedDB queue
Next session:
- Phase A: SQL migration for bill verification tables
- Phase A: import-lifecycle-data.py script
2026-05-23 (Afternoon) — Location: Home
Focus: Phase A planning refinements + lifecycle pipeline analysis
Done:
- Analyzed pdf-bill-printer.py pipeline (1305 lines) — city selection, source PDF mapping, two-filter system, UC grouping, route sorting, print seq# generation, batch optimization, PDF generation with overlays
- Corrected Phase A scope: import-lifecycle-data.py must replicate the full pipeline including source PDF mapping and PSID matching, but skip the PDF generation step
- Clarified two-filter system: Deleted in Portal != 'Yes' + psid in psid_map — both must pass for a bill to get a bill#
- Documented bill# mechanism: sequential counter per UC (#{n}/{total_in_uc})
- Routes from lifecycle XLSX (Route Segment, Route Seq columns) saved to saved_routes table
- Determined Python dependencies: PyMuPDF (fitz), pandas, openpyxl, python-dotenv, supabase-py
- Created scripts/IMPLEMENTATION_PLAN.md with full Phase A breakdown
- Created docs/ structure mirroring HR app (MASTER.md + archive/plans/ + archive/sql/ + archive/reports/)
- Updated AGENTS.md with workflow context
- Updated MASTER.md with full pipeline docs (Section 2) + detailed schema (Section 5)
Key decisions:
- import-lifecycle-data.py mirrors pdf-bill-printer data pipeline exactly (same XLSX, same source PDF scan, same filters, same grouping, same sorting, same print seq) — only skips generate_merged_pdf() + report XLSX
- pdf-bill-printer.py remains completely untouched (no modifications)
- import-lifecycle-data.py inserts into bill_documents, upserts bills, saves routes to saved_routes
- Route tab (/route) loads from saved_routes table grouped by city → UC → route
- Script is idempotent — re-running upserts by psid+bill_month
Next session:
- Phase 0b: Repoint migrate_to_supabase.py to billing Supabase and run historical migration (after verifying schema)
- Implement Phase A1: SQL migration file (scripts/sql/004-bill-verification-system.sql)
- Implement Phase A2: import-lifecycle-data.py
2026-05-23 (Evening) — Location: Home
Focus: Phase 0b data source analysis + migration planning
Done:
- Analyzed all 4 data sources: Survey CSVs, Biller CSVs, Payment History CSV, Lifecycle XLSX
- Mapped all fields to survey_units + bills columns
- Confirmed Payment CSV as authoritative for payment data (lifecycle per-month Paid columns are Yes/No only)
- Identified Biller_{City}_{Month}.csv as correct biller source (biller_data_* files lack PSID)
- Lifecycle XLSX is superset but used only for enrichment (is_issued, arrears, deleted_in_portal)
- Decided on new migration script (run_historical_migration.py) rather than patching originals
- Updated MASTER.md with field mapping and Phase 0b plan
- Installed supabase-py
 - Created scripts/run_historical_migration.py (dry-run: 212K survey_units, 1.19M bills)
Key decisions:
 - Payment CSV is truth for payments; lifecycle paid columns are flags only
 - biller_data_* files skipped; Biller_* files used
 - Service role key for bulk upsert
Next session:
 - Phase A1: SQL migration file (scripts/sql/004-bill-verification-system.sql)
 - Phase A2: import-lifecycle-data.py
2026-05-23 (Night) — Location: Office
Focus: Phase 0b build + bug fixes
Done:
 - Wrote scripts/run_historical_migration.py (570 lines) — loads Survey CSVs + Biller CSVs + Payment CSV + Lifecycle XLSX, upserts to billing Supabase
 - Fixed Testing_Biller_* causing duplicate (psid, bill_month) → ON CONFLICT errors; excluded them
 - Fixed empty string "" in survey_time → DB type time rejects; added clean_time() → None
 - Fixed "nan" string in paid_date → DB type date rejects; cleaned NaN in pandas datetime conversion
 - Fixed purge timeout (192K rows) → chunked delete (10K at a time)
 - Fixed duplicate survey_id key in archived records dict
 - Dedup logic added to bills upload to prevent chunk-level duplicate PKs
 - Added --skip-lifecycle flag for faster runs (lifecycle enrichment deferred to Phase A2)
 - Added --dry-run, --quick, --fast, --reset flags
 - Dry-run: 40 biller files → 1,189,313 bill records, 3 survey CSVs → 172,480 + 39,948 archived = 212,428 survey units
 - Partial upload completed: 192,428 survey units uploaded, bills partially uploaded before abort
 - DB state: survey_units=192,428 rows, bills=0 rows (purged successfully mid-fix)
Bugs found & fixed:
 - purge_tables: Supabase 30s statement timeout on bulk DELETE → chunked with .limit(10000)
 - survey_time: CSV empty strings → DB time type error → clean_time() returns None
 - paid_date: pd.to_datetime + .dt.strftime() produced "nan" string → DB date type error → explicit pd.notna() check
 - (psid, bill_month) duplicates: Testing_Biller_* files were overlapping Biller_* files for same months → exclude by filename prefix
 - Archived record dict had duplicate survey_id key → removed duplicate
Next session (at home):
 1. python scripts/run_historical_migration.py --reset --skip-lifecycle  (full upload)
 2. Phase A1: scripts/sql/004-bill-verification-system.sql
 3. Phase A2: scripts/import-lifecycle-data.py
9. File Inventory (Phase 0)
Source files copied from F:\qoder\billing-system\ + F:\Routing-Station-Pro into C:\billing-saas-app\scripts\
scripts/ root (6 files, 86 KB):
  routingstation.py (46 KB) — Daily survey/payment injection into old Supabase
  migrate_to_supabase.py (23 KB) — Historical bulk migration engine (old project ref)
  migrate_life_cycle.py (10 KB) — Alternative single-month migration (old project ref)
  run_historical_migration.py (20 KB) — Phase 0b: migrates CSVs/XLSXs → billing Supabase
  config.py (2.5 KB) — Shared config (needs repointing to billing Supabase)
  geography.json (1 KB) — City→UC→MC mapping
scripts/ref/ (6 files + routing-station-src dir, ~1.5 MB):
  pdf-bill-printer.py (53 KB) — Blueprint for import-lifecycle-data.py
  requirements.txt (499 B) — Python dependencies reference
  .env.old-* (4 files) — Old Supabase credentials for reference
  routing-station-src/ (1.4 MB) — Old routing station source code reference
scripts/sql/_old/ (17 files, 49 KB):
  schema_update_phase_a.sql + parts — Old schema migrations
  rpc_*.sql — Old RPC definitions (finance_metrics, retention_report, etc.)
scripts/data/ (gitignored — 1.10 GB total, 110 files):
  excel_dumps/ (369 MB, 44 CSV) — Biller data per city per month
  scraped_data/ (209 MB, 10 CSV) — Survey + payment records
  processed_pdfs/ (439 MB, 30 files) — Combined + lifecycle XLSX + index JSON
  routing-station-pro-data/ (105 MB, 26 files) — PWA data JSON (paid_data, routes, hierarchy, etc.)
10. Changelog
Date	Version	Change
2026-05-23	1.0	Initial MASTER.md created — full project documentation
2026-05-23	1.1	Updated Phase A with corrected pipeline (import-lifecycle-data.py), full lifecycle pipeline doc, detailed schema
2026-05-23	1.2	Added Phase 0 file inventory
2026-05-23	1.3	Added Phase 0b plan, Section 5.5 data source field mapping, data merge order
2026-05-23	1.4	Added scripts/run_historical_migration.py (570 lines), 5 bug fixes (time/nan/dedup/purge/archive), --skip-lifecycle flag