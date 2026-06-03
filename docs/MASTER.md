# Billing & Recovery — Master Plan
**Generated:** 2026-05-24 | **Stack:** Next.js 16 + Supabase + Tailwind v4 + Zustand + TanStack Query  
**Project:** Billing SaaS App — Field staff bill delivery & verification system  
**Scale:** ~350K households, ~70 field staff, 3 cities (Bhalwal/Khushab/Sargodha)
> This file is the single source of truth. All prior plan documents are archived to `docs/archive/`.  
> Every session **starts** by reading this file and **ends** by appending to the Session Log.

**Schema & Supabase:**
- Full schema reference: `docs/SCHEMA.md` (tables, RPCs, triggers, indexes, known issues)
- Direct DB access: read `SUPABASE_ACCESS_TOKEN` from `.env.local`, POST to Management API
  ```
  POST https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query
  Authorization: Bearer <token>
  Content-Type: application/json
  Body: {"query": "SQL here"}
  ```
- Project ref: `qrxbsoqepfaryolwcedk`

**Working DB execution pattern (always use this — it works):**
  1. Write SQL to a file using the Write tool
  2. Create JSON payload: `python -c "import json; json.dump({'query': open('path.sql').read()}, open('payload.json', 'w'))"`
  3. Execute: `curl.exe -s -X POST "https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "@payload.json"`
  (Extract token from `.env.local` via regex in PowerShell if needed.)
  **Avoid:** inline Python `urllib` (SSL 403), inline PowerShell SQL (quoting conflicts), heredocs (newline issues).

**DB cleanup procedure (run when size approaches 500MB free tier limit):**
  Credentials: `SUPABASE_ACCESS_TOKEN` from `.env.local` (PAT token `sbp_...`)
  1. **Check DB size:** `SELECT pg_size_pretty(pg_database_size(current_database()));`
  2. **Find duplicate/unused indexes:** Query `pg_stat_user_indexes` for `idx_scan = 0` or duplicate column patterns. Common suspects: old `idx_survey_*` naming vs new `idx_survey_units_*` naming.
  3. **Drop duplicate indexes** (reclaims space immediately — indexes are separate files):
     ```sql
     DROP INDEX IF EXISTS idx_old_name;
     ```
     Run DROP INDEX statements in a single batch via the Management API (works inside transaction).
  4. **VACUUM FULL** (reclaims dead tuple space from table bloat — must run OUTSIDE transaction, separate curl call):
     ```sql
     VACUUM FULL survey_units;
     ```
     Note: VACUUM FULL requires ACCESS EXCLUSIVE lock (brief downtime). Cannot run in same batch as DROP INDEX.
  5. **Update stats:** `ANALYZE;` (runs inside transaction, can be in same batch as DROP INDEX).
  6. **Verify:** Re-check DB size. Expect ~50% reduction if duplicates existed.
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
15. [Full App Audit Report](#15-full-app-audit-report-2026-05-27)
16. [Database Gaps Report](#16-database-gaps-report-2026-05-31)
17. [Architecture Improvement Plan](#17-architecture-improvement-plan)
18. [Delivery Workflow Detail](#18-delivery-workflow-detail)
---
## App Vision — Daily Reference

### The Goal
A digital system that forces accountability across the entire billing lifecycle: SWMC portal data → PDF generation → staff assignment → GPS-tracked delivery with mandatory photo proof → performance tracking → auto-route optimization. Break staff dependency by making every delivery verifiable and every route reproducible.

### The Core Bottleneck
**Delivery is the biggest operational problem.** Staff performance is poor, houses in congested Pakistani areas are hard to identify, and there is no accountability. The legacy Routing Station app could not solve this because it lacked:
- Segmented assignments (staff saw everything)
- Photo capture linked to specific deliveries
- Silent GPS verification
- Auto-route generation from actual walking patterns

### How the App Solves It

#### For Staff (Field Operations)
1. **QR scan from physical bill** — Every printed bill has a QR code containing `sid={survey_id}`. Staff opens the app, taps a floating QR scan button (available on both the Map view and the `/deliver` page), scans the physical bill → HouseDetailSheet opens for that exact unit.
2. **One-button "Take Picture" in HouseDetailSheet** — Staff taps "Take Picture" → native camera opens → photo captured → on confirm, GPS coordinates and timestamp are captured silently (staff does not know) → unit marked as delivered → assignment list updates in real-time.
3. **No sequential binding in the first 1-2 months** — Staff walks their natural route. GPS timestamps capture the actual walking order. After 2 months, the delivery sequence is sorted by timestamp → becomes the permanent route.
4. **"Navigate" button** — Shows staff their current GPS location vs the house marker on the map. Helps locate houses in congested areas. Manual pin drop option for correcting house coordinates.
5. **Flag option** — Staff can mark issues (wrong address, duplicate PSID, no such house) with notes. These feed into the admin Flag Management UI.
6. **Auto-advance** — After marking delivered, the same view stays open. Staff scans the next bill without navigating back to the list.

#### For Staff (Overview Page)
- **`/deliver` page** shows the day's assignment list with progress bar (Delivered X/Y, delivery rate percentage).
- Three tabs: Map (assigned markers), List (card view with status), Stats (today's numbers).
- Progress updates in real-time as deliveries are marked from the HouseDetailSheet.

#### For Admins
1. **Map with MC/UC filtering** — Essential. All survey markers colored by MC/UC. Filter by MC/UC, city, bill month.
2. **Live monitoring** — Toggle a staff member to see their today's delivered/pending/missed dots on the map in near-real-time.
3. **Auto-route generation** — After 2 billing cycles of GPS-tracked deliveries, admin runs a tool that:
   - Groups assignment_items by PSID across last 2 months
   - Orders by delivered_at consensus within each UC
   - Writes the permanent route_seq to survey_units
   - Paper bills are then printed in this order each month
   - New staff can replace old staff and follow the same route immediately
4. **RBAC approval chain** — Field supervisor creates assignments → Admin approves → Super admin gives final approval. Staff sees only `active` assignments.
5. **Flag Management UI** — Resolve ghost PSIDs, confirm keepers for duplicates, acknowledge portal deletions.

#### Staff Performance Measurement
- Photo count vs number of assigned units (rate)
- Delivery time per unit (avg time between consecutive deliveries)
- GPS accuracy (distance between house coordinates and delivery GPS)
- These metrics become the basis for staff evaluation and replacement decisions.

### Data Model for Deliveries (Permanent vs Monthly)
- **`survey_units.route_seq`** — PERMANENT. The official walking order after stabilization.
- **`assignment_items.route_seq`** — MONTHLY. The actual order the staff walked this month.
- **`assignment_items.delivered_at` / `gps_lat` / `gps_lng`** — PER-DELIVERY. Variable each month.
- **`delivery_photos`** — PER-PHOTO. One row per photo, linked to `assignment_items`, not to `survey_units`. This means one house can have 12 photos across 12 different monthly deliveries, each linked to that specific month's delivery event.
- **`daily_assignments.assigned_date`** — Partitions deliveries by month. Query `WHERE assigned_date BETWEEN '2026-06-01' AND '2026-06-30'` for any month's complete delivery data.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **QR-first delivery** | Staff taps "Deliver" → scans bill → app matches scanned `survey_id` to assignment item. Prevents delivering wrong house. No need to scroll and tap a specific row. |
| **Deliver button on HouseDetailSheet (not per-row)** | Staff naturally memorizes their list. QR scan identifies the unit automatically. The same deliver logic works from both the Map (QR scan → HDS) and the `/deliver` page (list → HDS). |
| **Silent GPS capture** | GPS captured on photo confirm, not shown to staff. Prevents gaming. Over months, GPS drift reveals systematic cheating. |
| **No sequential lock initially** | First 1-2 months are free-form. Staff walks natural route. GPS sequence becomes permanent after. Then paper bills are printed in that order. |
| **Floating QR scan button** | Available on Map view and Deliver page. Same pattern as legacy Routing Station's floating QR control. |
| **survey_id on assignment_items** | Added via ALTER TABLE. Enables QR scan → match by survey_id directly, without extra lookup through psid. |

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
| **DB triggers for data integrity** | `payment_summary` auto-refreshed on payment_history changes. Hierarchy reference table upserted on survey_units changes. Staff auto-synced from profiles via trigger. |
| **Explicit column selects** | Never `select('*')` — egress cost control |
| **Manual monthly processing** | pdf-bill-printer.py runs manually on 19-20th each month (handles PDF gen) |
| **Offline photo queue** | Photos stored in IndexedDB when offline, upload when online |

### 1.6 Data Layer Architecture
The data layer follows a strict 3-tier pattern with **shared query modules** as the single source of truth:

```
Browser (TanStack Query hook)
        ↓ fetch('/api/...')
Next.js API Route (server-side Supabase client)
        ↓ imports shared query builders
src/lib/queries/  ← single source of truth for filters, columns, pagination
        ↓ creates Supabase query
Supabase DB
```

**Shared query modules** (`src/lib/queries/`):
- `constants.ts` — `SURVEY_UNIT_COLS` (shared column list), `STALE_TIMES` constants
- `survey-units.ts` — `applyActiveFilter()`, `applyArchivedFilter()`, `selectUnitCols()`
- `pagination.ts` — `parsePagination()`, `applyPagination()`

**Critical rule:** `survey_units.status` must never be filtered with bare `.eq('status', 'ACTIVE')`. Enriched units (those with PSIDs and lifecycle data) have `status = NULL`, not `status = 'ACTIVE'`. The correct filter is `or('status.is.null,status.eq.ACTIVE')` via `applyActiveFilter()`.

All API routes import from these shared modules. Hooks never import `createClient()` — they only call `fetch('/api/...')`. The only exception is `supabase.auth.*` SDK calls (signInWithPassword, getSession, signOut).

### 1.7 Authentication System (RBAC)
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

**Two entry points for delivery:**

1. **`/deliver` page** — Shows today's assignment list. Staff sees only their assigned PSIDs.
   - Three tabs: **Map** (assigned markers on Leaflet), **List** (card view with status badges), **Stats** (today's progress).
   - Floating QR scan button (bottom-right) on all tabs.
   - Persistent progress bar: "12/25 delivered, 48%" at top.
   - Tap a card → navigates to map centered on that marker → HouseDetailSheet opens.

2. **Map view** — Full-screen Leaflet with assigned markers only. Floating QR scan button.
   - Markers colored by delivery status: green=delivered, blue=pending, red=missed.
   - Tap marker → HouseDetailSheet opens for that unit.

**Delivery flow (same from both entry points):**
```
Floating QR button → tap → camera opens → scan physical bill's QR code
  → QR contains sid={survey_id}
  → App matches survey_id to staff's active assignment_items
  → HouseDetailSheet opens for that unit

In HouseDetailSheet:
  ├── "Take Picture" → native camera → photo captured → on confirm:
  │     ├── GPS captured silently (staff does not know)
  │     ├── Timestamp captured from server
  │     ├── assignment_item.status = 'delivered'
  │     ├── delivery_photos row created (photo_url, gps_lat/lng, captured_at)
  │     └── Progress bar updates in real-time
  ├── "Navigate" → shows staff GPS vs house marker on map, distance, Google Maps deep link
  ├── "Flag" → text notes, creates staff_flagged entry in flagged_psids
  ├── "Skip/Missed" → reason input, marks as missed with GPS
  └── After marking: same view stays open. Staff scans next bill without navigating back.
```

| Element | Design |
|---------|--------|
| **Home screen** | Map fills screen. Bottom sheet shows daily progress (Delivered X/Y) + next house name. |
| **Map** | Full-screen Leaflet. Markers for today's assigned bills only. Green=delivered, blue=pending, red=missed. |
| **List** | Swipeable card list. Each card: house name, address snippet, delivery status badge, photo count. Pull-to-refresh. |
| **Photo capture** | One-tap from HouseDetailSheet. Native camera via `capture="environment"`. Auto-compress to WebP 1024px. Queued in IndexedDB if offline. GPS + timestamp captured on photo confirm. |
| **QR scanner** | Floating button on both Map and Deliver page. Uses `html5-qrcode` library. Scans `sid={survey_id}` from physical bill. Falls back to manual survey_id input. |
| **House-to-marker navigation** | HouseDetailSheet "Navigate" button: shows staff GPS location vs target marker on map. Google Maps directions deep link fallback. Manual pin drop for GPS correction. |
| **Progress** | Persistent progress bar at top: "12/25 delivered today". Updates live as HouseDetailSheet marks deliveries. |
| **No sequential lock** | First 1-2 months are free-form. Staff walks natural route. GPS sequence becomes permanent route after stabilization. |
| **Theme** | Light mode only (sunlight readability). High contrast. Huge touch targets (48px+). Bold sans-serif font. |
| **Bottom nav** | Map \| List \| Today's Stats |
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
| `/map` | All | Full map with survey markers + filters. Staff sees only assigned markers. QR scan floating button. |
| `/deliver` | Staff | Mobile delivery dashboard: assigned bills list, map with markers, progress stats. QR scan floating button. |
| `/assignments` | Admin | UC list → staff assignment creation + approval chain (draft/pending/approved/active) |
| `/flagged-units` | Admin | Flag management: resolve ghost PSIDs, confirm keepers, acknowledge deletions |
| `/route` | Admin | Route management from `saved_routes` |
| `/stats` | Admin | Performance dashboard, staff tracking, delivery stats |
| `/settings` | All | Theme, account info, **Users tab** (admin only — user CRUD, freeze, password reset) |

**Note:** Map, Survey Units (Data Insight), and Dashboard are views on the `/map` page, accessed via sidebar navigation. `/list` and `/data-insight` are NOT separate routes — they are `activeView` toggles within `/map`.

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

### 5.5 Ingest Pipeline: Source Scripts → CSV/XLSX → Supabase

The following table shows every CSV/XLSX file produced by the local scripts and how it flows into Supabase:

| # | Source Script | File Produced | Supabase Destination | Frequency |
|---|--------------|---------------|---------------------|-----------|
| 1 | `survey_filtered.py` (portal) | `outputs/scraped_data/{DISTRICT}_{TEHSIL}_SURVEY_DATA.csv` | Merged into lifecycle XLSX by pdf-psid-extractor, then upserted via enrich-survey-units.py | Monthly / on-demand |
| 2 | `bill-extractor-v4.py` (portal) | `outputs/scraped_data/Biller_{City}_{Month}_Full.csv` | Merged into lifecycle XLSX by pdf-psid-extractor | Monthly |
| 3 | `bill-extractor-v4.py --status PAID` (portal) | `outputs/scraped_data/COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` | **Directly to `payment_history`** via `load-payments.py` | Daily (multiple times) |
| 4 | `generate_category_fallbacks.py` | `outputs/scraped_data/biller_data_{city}_{month}.csv` | Merged into lifecycle XLSX by pdf-psid-extractor | Monthly |
| 5 | `pdf-psid-extractor.py --mode 3` | `outputs/processed_pdfs/test_lifecycle_Biller_{City}_{Month}.xlsx` | **Directly to `survey_units`** via `enrich-survey-units.py` | Monthly |
| 6 | `pdf-bill-printer.py` | `outputs/processed_pdfs/index_cache_{city}_{month}.json` | **Kept locally** (Office PC only, not loaded to Supabase) | Monthly |

**Only 3 inputs to Supabase:**
1. **Lifecycle XLSX** → `survey_units` (21 fields, monthly after pdf-psid-extractor)
2. **Combined payment CSV** → `payment_history` (daily/on-demand)
3. **Index cache JSON** → NOT loaded (local reference only)

### 5.6 `enrich-survey-units.py` (Phase 2)
**Purpose:** Reads lifecycle XLSX and upserts **21 columns** to `survey_units`.

**Lifecycle XLSX → survey_units field mapping:**

| Lifecycle Column | survey_units Column | Status |
|-----------------|-------------------|--------|
| `Survey ID` | `survey_id` (PK) | ✅ existing |
| `Biller PSID` | `psid` | ✅ existing |
| `Monthly Fee` | `monthly_fee` | ✅ existing |
| `Billing Category` | `billing_category` | ✅ existing |
| `Arrears` | `arrears` | ✅ existing |
| `Route Segment` | `route_name` | ✅ existing |
| `Route Seq` | `route_seq` | ✅ existing |
| `Current Bill` | `current_bill_month` | ✅ existing |
| `Name` | `consumer_name` | **NEW in Phase 2** |
| `Address` | `address` | **NEW in Phase 2** |
| `City Name` | `city_district` | **NEW in Phase 2** |
| `Tehsil` | `tehsil` | **NEW in Phase 2** |
| `UC` | `uc_name` | **NEW in Phase 2** |
| `Surveyor Name` | `surveyor_name` | **NEW in Phase 2** |
| `Survey Date` | `survey_date` | **NEW in Phase 2** |
| `Survey Time` | `survey_time` | **NEW in Phase 2** |
| `Lat` | `lat` | **NEW in Phase 2** |
| `Lng` | `lng` | **NEW in Phase 2** |
| `Start Month` | `start_month` | **NEW in Phase 2** |
| `Deleted in Portal` | `status` | **NEW** → "Yes" sets `status='ARCHIVED'` |
| `Total Payable` | ~~`amount_due`~~ | **SKIPPED** (dropped in Phase 2b) |

### 5.7 `load-payments.py` (Phase 3)
**Purpose:** Reads combined payment CSV and upserts to `payment_history`.

**CSV → payment_history field mapping:**

| CSV Column | payment_history Column | Notes |
|-----------|----------------------|-------|
| `PSID` | `psid` | |
| `Month` | `bill_month` | Already `MAY2026` format |
| `Paid Amount` | `amount_paid` | |
| `Paid Date` | `paid_date` | Parse `"Jun 01, 2026"` → ISO date |
| `Channel` | `payment_method` | |
| `Status` | `payment_status` | |
| `Fine` | `fine` | |
| `City` | `city_district` | Uppercase |
| `Tehsil` | `tehsil` | Uppercase |
| `UC` | `uc_name` | Raw CSV value |

**Key:** Idempotent upsert on `(psid, bill_month)` — safe to run multiple times daily.

### 5.8 `ingest-all.py` (Phase 5 — Orchestrator)
**Purpose:** Interactive wrapper that runs Phase 2 + Phase 3 in sequence.

```bash
# Interactive menu (recommended)
python scripts/ingest-all.py

# CLI mode
python scripts/ingest-all.py --month May2026    # Full monthly import
python scripts/ingest-all.py --daily             # Payments only (daily)
python scripts/ingest-all.py --month May2026 --dry-run  # Preview only
```

**Menu:**
```
=== Ingest to Supabase ===
[1] Full Monthly Import (lifecycle + payments)
[2] Daily Update (payments only)
[3] Quick Survey Sync (new records only)
[q] Quit
```

### 5.9 Bill Metadata in HouseDetailSheet (Phase 6)
**Purpose:** Reconstruct the printer's `left_meta`/`right_meta` strings from `survey_units` + `payment_history` data and display in HouseDetailSheet.

**Sorting logic (mirrors pdf-bill-printer.py):**
1. Group by `uc_name`
2. Sort: `route_seq ASC → survey_id DESC`
3. Assign sequential `bill_count` within UC
4. Compute `paid_status`: count paid months from payment_history → `P-{n}` or `U-P`

**No printer cache JSON needed** — all metadata is already in Supabase after Phase 2 + 3.

---
## 6. Data Model
### 6.1 Tables

| Table | Key | Purpose | Size |
|-------|-----|---------|------|
| `survey_units` | survey_id | Household identity, GPS, images, monthly_fee, billing_category, psid (stable biller ID), arrears, amount_due, current_bill_month, start_month, route_name/seq, last_verified_month, city | ~212K |
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

**Dropped:** `bills`, `bill_items` (merged into `survey_units` columns), `verified_houses` (replaced by `house_corrections`), `staff_sync_logs` (replaced by `delivery_photos` + `assignment_items`)

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

-- bill_months: Month filter dropdown. Populated from payment_history.
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

-- NOTE: bill_items table was dropped in storage crisis (v7.0).
-- All billing columns are now on survey_units: monthly_fee, arrears, billing_category, route_name, route_seq, current_bill_month.
-- Payment lookup uses survey_units.psid → payment_history.psid (no intermediate table).

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
  survey_id text REFERENCES survey_units(survey_id),  -- Enables QR scan matching
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
| Start Month | survey_units.start_month (added via migration 028) |
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

### CRITICAL: Billing Cycle Definition
A billing month runs from the **16th of the current month to the 15th of the next month** (midnight).
- **MAY2026** billing cycle = May 16, 2026 → June 15, 2026 (midnight)
- **JUN2026** billing cycle = June 16, 2026 → July 15, 2026 (midnight)
- The `currentMonth()` helper in `src/lib/constants.ts` implements this: if `d.getDate() < 16`, use previous calendar month.
- **May 31 does NOT signify end of billing cycle.** The cycle always runs 16th → 15th.

### Output File Paths (Ingest Scripts Read from Office PC)
Ingest scripts (`load-payments.py`, `enrich-survey-units.py`) read directly from the Office PC output folders:
- **Lifecycle XLSX**: `F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs\` (monthly)
- **Payment CSV**: `F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data\COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` (daily)
With local fallback to `scripts/data/` when Office PC folder is unavailable.

### Monthly (16th–20th)
1. **16th:** SWMC portal provides biller list CSV + original A4 PDFs
2. **16th–18th:** `pdf-psid-extractor.py` reads PDFs, extracts PSIDs, matches with biller list + survey data → generates `test_lifecycle_Biller_{City}_{Month}.xlsx`
3. **19th–20th:** `pdf-bill-printer.py` runs → generates A5 print PDFs with overlays + `index_cache_{city}_{month}.json`
4. **18th–20th:** `python scripts/ingest-all.py` → select option `[1]` (Full Monthly Import)
   - Runs `enrich-survey-units.py` → reads lifecycle XLSX → upserts 21 fields to `survey_units`
   - Runs `load-payments.py` → reads combined payment CSV → upserts `payment_history`
   - Writes audit log to `ingest_log`

### Daily
1. **Admin:** Runs `bill-extractor-v4.py --status PAID` → fetches updated payment CSV
2. **Admin:** Runs `python scripts/ingest-all.py` → select option `[2]` (Daily Update)
   - Runs `load-payments.py` → reads latest payment CSV → upserts new records to `payment_history`
   - Idempotent: safe to run multiple times per day
3. **Admin (optional):** After `survey_filtered.py`, can run option `[3]` for quick survey sync
4. **Admin:** Opens `/settings` → Users tab → creates/manages staff accounts (username + password, role assignment, freeze/delete)
5. **Admin:** Opens `/assignments` → picks UC → sees unassigned bills → picks staff → sets count → creates daily chunk
   - Creates `daily_assignments` + `assignment_items` rows (with `survey_id` for QR matching)
6. **Field Staff:** Opens `/deliver` → sees today's assigned bills (from `assignment_items` joined to `daily_assignments`)
7. **Staff delivery flow (QR-first):**
   a. Staff taps floating QR scan button (on Map or Deliver page) → camera opens
   b. Scans QR code on physical bill → QR contains `sid={survey_id}`
   c. App matches `survey_id` to staff's active `assignment_items`
   d. HouseDetailSheet opens for that unit
   e. Staff taps "Take Picture" → native camera opens → photo captured
   f. On photo confirm: GPS + timestamp captured silently → `assignment_items.status = 'delivered'` → `delivery_photos` row created
   g. Staff scans next bill (no navigation back to list needed)
   h. If house not found: staff can mark "Missed" with reason + GPS, or "Flag" with notes
8. **Navigate aid:** Staff taps "Navigate" in HouseDetailSheet → map shows their GPS location vs house marker with distance. Manual pin drop for GPS correction → saved to `house_corrections`.
9. **Photo sync:** IndexedDB queue → GAS webhook → Drive URL → saved to `delivery_photos`
10. **Route stabilization:** After 2 billing cycles, `assignment_items.delivered_at` timestamps sorted per PSID → consensus order → written to `survey_units.route_seq`. Paper bills printed in this order each subsequent month.

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
| 16 | `survey_units.psid = null` — survey exists in the field but has no lifecycle PSID | **New/unregistered survey.** Units surveyed by field staff but not yet assigned a PSID from the SWMC billing lifecycle. These have `survey_id` but no matching entry in `payment_history` or `bills.json`. No payment history, no current bill. Frontend keys and expand states use `survey_id` (always non-null) instead of `psid` to avoid React duplicate-key warnings and auto-expand bugs (`null === null`). |
| 17 | `payment_history` PSID doesn't match any `survey_units.psid` (orphaned) | **Orphaned PSID from deleted survey ID.** The govt survey app created duplicate PSIDs, then survey IDs were deleted on portal but PSIDs remain in biller list (~20K). `payment_history` lacks a `city`/`tehsil` column — the RPC joins to `survey_units` which returns NULL for orphans → "Unknown" in charts. **Short-term fix:** Add `city`/`tehsil` columns to `payment_history` so chart geography is independent of `survey_units` match. **Long-term fix:** Staff marking system over 2-3 billing cycles to identify and filter ghost PSIDs. |
| 18 | QR scan returns `survey_id` not in staff's active assignment | Show toast: "This bill is not in your today's assignment." Do NOT open HouseDetailSheet. Staff can still open HDS manually from the map/list if they need to view. |
| 19 | GPS capture fails during delivery (timeout, denied, unavailable) | Deliver silently without GPS — mark delivered with `gps_lat = null, gps_lng = null`. The photo timestamp alone is sufficient proof. GPS failure rate tracked as a staff performance metric (excessive failures = suspicion). |
| 20 | Staff takes photo offline → assignment marked offline → photo syncs later | Photo queued in IndexedDB with `assignment_item_id`. On sync, GAS webhook uploads to Drive → URL saved to `delivery_photos`. Count reflects synced count, not taken count. Assignment status updated when photo successfully uploaded. |
| 21 | Staff is replaced mid-cycle — new staff inherits partial assignment | New staff gets new `daily_assignments` for remaining units. Previous staff's deliveries stay under their name. No transfer of partial completion. Both staff's stats are tracked independently. |
| 22 | Route stabilization detects conflict (Month 1 order ≠ Month 2 order) | System flags the conflict with a warning percentage. Admin manually reviews and chooses or reorders. Only sequences with >80% consensus auto-commit. |

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

### Phase B — Field Staff Delivery UI (~10 hrs)

**B1 — Assignment Overview (`/deliver` page) ✅ (Done 2026-06-02)**
| Step | Time | Task | Status |
|------|------|------|--------|
| B.1 | 60 min | `/deliver` page: full-screen mobile map with assigned bill markers, bottom sheet with progress bar | ✅ |
| B.2 | 30 min | Deliver bottom sheet: name, address, bill amount, delivery status, photo button | ✅ |
| B.3 | 60 min | Photo capture: camera API → WebP compress → IndexedDB queue → GAS webhook → Drive URL | ✅ |
| B.4 | 30 min | Status marking: delivered (photo+GPS) or missed (photo+reason+GPS) | ✅ |
| B.5 | 30 min | Live progress: "Delivered X/Y" from assignment_items | ✅ |
| B.6 | 60 min | Swipeable card list view: pull-to-refresh, sorted by route sequence | ✅ |
| B.7 | 30 min | Offline support: cached assignment + IndexedDB photo queue + sync indicator | ✅ |
| B.8 | 30 min | Advance to next pending | ✅ |

**B2 — Map-Based Delivery Flow (QR + HouseDetailSheet) ⏳ (In Progress)**
| Step | Time | Task |
|------|------|------|
| B.13 | 15 min | **Add `survey_id` to `assignment_items`**: ALTER TABLE migration. Update assignment creation to write `survey_id`. Enables QR→assignment matching. | ✅ |
| B.14 | 30 min | **Fix delivery target key**: Changed from `survey_id` to `psid` — always populated, no backfill needed. Fixes null-equality bug. | ✅ |
| B.9 | 60 min | **QR Scanner**: Floating button on Map view + Deliver page. Install `html5-qrcode`, scan `sid={survey_id}` from physical bill. Match to staff's active `assignment_items` by `survey_id`. Open HouseDetailSheet. Fallback manual input. | ✅ |
| B.15 | 30 min | **Shared marker module**: `src/lib/markers.ts` — `createMarkerIcon(color, opts?)` with CSS pulse animation. Used by both admin (`survey-markers.tsx`) and staff (`staff-map-markers.tsx`). 10px default, 12px staff, selected ring. | ✅ |
| B.16 | 30 min | **UnitDeliverySheet redesign**: Full-bleed hero image with gradient overlay, overlaid info + action buttons, close button top-left, delivered green checkmark overlay, nav arrows (`top-1/3`), touch swipe (50px threshold). | ✅ |
| B.17 | 30 min | **FlyToTarget + Satellite toggle on StaffMap**: Auto-flies to selected marker (zoom 18, 1s). Reads `mapType` from billing store same as admin MapView. | ✅ |
| B.18 | 45 min | **Stats page for field_staff**: Bottom tab `/stats` route. `StaffPersonalStats` — today's progress cards + progress bar + 7/30/90 day historical KPIs. Uses `useStaffAssignment` + `useStaffStats` hooks. | ✅ |
| B.19 | 30 min | **Deliver page redesigned**: Compact mobile list — progress header bar, pagination (50/page), route seq circles, consumer name + status dot, delivered timestamp, amount right-aligned. Removed per-row camera icons. | ✅ |
| B.20 | 15 min | **Stale files deleted**: `deliver-map.tsx`, `deliver-bottom-sheet.tsx`, `deliver-action.tsx`, `deliver-card-list.tsx`. | ✅ |
| B.21 | 15 min | **QR scanner guard + z-index fix**: Added `activeView === 'map'` guard; z-index `z-[100]` → `z-[1000]`; overlay also `z-[1000]`. | ✅ |
| B.10 | 60 min | **HouseDetailSheet Deliver Button**: "Take Picture" button in HDS → native camera → photo confirm → GPS + timestamp captured silently → mark `assignment_items.status='delivered'` → create `delivery_photos` row. Use shared `useDeliverUnit()` hook (also used by DeliverBottomSheet). | 🔲 |
| B.11 | 30 min | **HouseDetailSheet Navigate + Flag + Missed**: "Navigate" button → staff GPS vs house marker on map, distance. "Flag" → text notes → POST to `flagged_psids`. "Missed" → reason input + GPS → mark status. | 🔲 |
| B.12 | 15 min | **Auto-advance from HDS**: After marking delivered in HDS, keep view open for next QR scan. Deliver page progress updates in real-time via query invalidation. | 🔲 |

### Phase C — Admin Dashboard (~3 hrs)
| Step | Time | Task |
|------|------|------|
| C.1 | 60 min | `/stats` page: daily delivery stats per staff (assigned/delivered/missed/rate) |
| C.2 | 60 min | Staff performance tracking: filter by staff, date range. Add notes + rating (1-5) |
| C.3 | 60 min | Data Insight enhancement: add delivery KPIs (delivery rate, photos per staff, avg time per delivery) |

### Phase E — Flag Management UI (~4 hrs) **← NEW**
| Step | Time | Task |
|------|------|------|
| E.1 | 45 min | `GET /api/admin/flagged-psids` — paginated, filterable by reason type, UC, tehsil, date range |
| E.2 | 30 min | `PATCH /api/admin/flagged-psids/[id]` — resolve (`resolved_at=now()`), update notes, change reason |
| E.3 | 60 min | `/flagged-units` page layout + filter bar + table with action badges |
| E.4 | 45 min | Row actions: Resolve button, Add/Edit Note modal, Confirm Keeper (for duplicate PSIDs — radio list of PSIDs + resolve surplus) |
| E.5 | 20 min | `GET /api/admin/flagged-psids/stats` — count by reason type for summary KPIs |
| E.6 | 20 min | "Flag for Review" button on HouseDetailSheet → creates `staff_flagged` entry in `flagged_psids` |
| E.7 | 20 min | Add `staff_flagged` support to enrichment pipeline (noted in Phase 2, handled in ingest menu) |

**What this enables:**
- Admin reviews all flagged entries before each monthly cycle
- Confirms keeper PSIDs for duplicates (resolves the surplus)
- Acknowledges portal/field deletions
- Staff can flag issues during delivery → admin resolves via this page
- Keeps `flagged_psids` table lean (~50K today, growing ~1K/month)

### Phase F — Auto-Route Generation (~3 hrs)
| Step | Time | Task |
|------|------|------|
| F.1 | 30 min | Delivery sequence query: `assignment_items` ordered by `delivered_at` per PSID, grouped by staff + UC. Generate consensus route from last 2 months' delivery order. |
| F.2 | 30 min | Admin UI: view auto-generated delivery sequence for a staff's last X deliveries. Drag-reorder if needed before committing. |
| F.3 | 60 min | Write route to `survey_units`: update `route_name`/`route_seq` from delivery-based consensus order. Flag conflicts (staff walked different order in month 1 vs month 2). |
| F.4 | 30 min | Printer integration: paper bills sorted by `survey_units.route_seq ASC` within each UC for subsequent months. Update bill-numbering logic to reflect new sequence. |
| F.5 | 30 min | New staff onboarding: when staff is replaced, inherit the previous staff's delivery-derived route for that UC. New staff follows sorted paper bills from day 1. |

### Phase G — Live Admin Monitoring (~3 hrs)
| Step | Time | Task |
|------|------|------|
| G.1 | 30 min | Database: verify `assignment_items` has gps_lat/gps_lng + `delivery_photos` has captured_at. These are the data sources for live view. |
| G.2 | 60 min | Admin Map: "Staff Mode" toggle layer. Shows selected staff's today's assignment markers color-coded by status (green=delivered, blue=pending, red=missed). |
| G.3 | 60 min | Staff breadcrumbs: select a staff → show their last N delivery locations on the map as connected dots (polyline). Show the sequence of today's deliveries. |
| G.4 | 30 min | Near-real-time (polling): poll `assignment_items` every 10s for the selected staff. Highlight new deliveries since last poll with animation marker. |
| G.5 | 30 min | Admin Quick View: click a staff's delivery dot → show house name, status, photo thumbnail, timestamp in a tooltip/info card. |

### Phase D — Visual Rehaul (~4 hrs)
| Step | Time | Task |
|------|------|------|
| D.1 | 60 min | Staff mode route guard: `/deliver` is default for staff role, no admin nav access |
| D.2 | 60 min | Staff mobile layout: map fills screen, bottom sheet for detail, progress bar in header, bottom tab nav (Map/List/Progress) |
| D.3 | 60 min | Admin desktop sidebar: collapsed/expanded, nav groups (Map/List/Assignments/Stats/Insight/Settings) |
| D.4 | 30 min | Admin filter bar: inline chips for desktop, bottom sheet for mobile |
| D.5 | 30 min | Theme system: Vercel light/dark defaults, staff forced to light mode |
| D.6 | 30 min | Touch target audit: all interactive elements 44px+ on mobile, 48px+ for primary actions |

### Phase RBAC — User Management & Auth System (~3 hrs)
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
| RBAC.11 | 20 min | **Assignment approval chain**: Add `status` enum to `daily_assignments` (`draft` → `pending_approval` → `approved` → `active`). Field supervisor creates in draft, admin approves, super admin final. Staff sees only `active`. |
| RBAC.12 | 20 min | **Approval UI in `/assignments`**: Approval queue tab showing draft/pending assignments. Approve/reject buttons role-gated by admin/super_admin. |
| RBAC.13 | 15 min | **Route protection**: Super admin bypasses approval chain. Admin approves pending. Staff only sees active assignments in `/deliver`. |
| RBAC.14 | 10 min | **Audit log**: Log assignment status changes (who approved/rejected, when) to `ingest_log` or new `assignment_audit` table. |

### Phase 1 — Copy Reference Scripts from Office PC (~30 min) ✅ **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 1.1 | 5 min | Copy `bill-extractor-v4.py`, `pdf-psid-extractor.py`, `pdf-bill-printer.py`, `survey_filtered.py`, `generate_category_fallbacks.py` to `scripts/ref/` |
| 1.2 | 5 min | Copy any shared lib files (e.g. `config.py`, `geography.json`) to `scripts/ref/` |
| 1.3 | 10 min | Copy the biller list CSVs and lifecycle XLSX sample files (1 city × 1 month) for test fixtures |
| 1.4 | 10 min | Verify all scripts parse without import errors on office PC Python |

### Phase 2 — Rewrite `enrich-survey-units.py` (~2 hrs) ✅ **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 2.1 | 20 min | Add all 13 new fields to the upsert: `consumer_name`, `address`, `city_district`, `tehsil`, `uc_name`, `surveyor_name`, `survey_date`, `survey_time`, `lat`, `lng`, `start_month`, `status` (ARCHIVED if Deleted=Yes) |
| 2.2 | 15 min | Add `--dry-run` flag: preview changes without writing to DB |
| 2.3 | 15 min | Add `--exclude-ghosts` flag: skip PSIDs in `flagged_psids` table |
| 2.4 | 15 min | Add diff report: show count of new/updated/skipped/error rows |
| 2.5 | 20 min | Upsert reference tables: `hierarchy`, `surveyors`, `bill_months` from lifecycle data |
| 2.6 | 15 min | Write audit log to `ingest_log` |
| 2.7 | 20 min | Refactor: move shared (DB connection, config, logging) to `scripts/lib/` utils |

### Phase 3 — Create `load-payments.py` (~1 hr) ✅ **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 3.1 | 20 min | Write script: read combined payment CSV, parse all 12 columns, upsert to `payment_history` with `(psid, bill_month)` as upsert key |
| 3.2 | 10 min | Add `--dry-run`, `--file` flags |
| 3.3 | 10 min | Write audit log to `ingest_log` |
| 3.4 | 15 min | Report: inserted/skipped/error counts with sample of bad rows |
| 3.5 | 5 min | Add city/tehsil/uc_name upsert to payment_history (fixes "Unknown" chart cities) |

### Phase 4 — Add `city`/`tehsil`/`uc_name` to `payment_history` (~30 min)
| Step | Time | Task |
|------|------|------|
| 4.1 | 5 min | SQL migration `029-add-payment-history-city.sql`: `ALTER TABLE payment_history ADD COLUMN city_district text, ADD COLUMN tehsil text, ADD COLUMN uc_name text` |
| 4.2 | 10 min | Update `get_charts_data` RPC to use `ph.city_district`/`ph.tehsil` instead of LATERAL join |
| 4.3 | 5 min | Update `get_billing_stats` RPC to use `ph.city_district`/`ph.tehsil` |
| 4.4 | 5 min | Backfill existing rows from lifecycle data via temporary mapping |
| 4.5 | 5 min | Verify: "Unknown" entries in charts drop to zero |

### Phase 5 — Create `ingest-all.py` Orchestrator (~1 hr) ✅ **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 5.1 | 20 min | Interactive menu: `[1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit` |
| 5.2 | 10 min | CLI args: `--month`, `--daily`, `--dry-run`, `--file` |
| 5.3 | 10 min | Sequential orchestration: run Phase 2 scripts then Phase 3 in order |
| 5.4 | 10 min | Combined audit log entry with summary |
| 5.5 | 10 min | Error handling: abort on failure, show partial results |

### Phase 6 — Bill Metadata in HouseDetailSheet (~1.5 hrs)
| Step | Time | Task |
|------|------|------|
| 6.1 | 15 min | `GET /api/survey/[survey_id]/bill-info` — returns bill number, route info, paid status from `survey_units` + `payment_history` |
| 6.2 | 30 min | HouseDetailSheet: show "Bill #X/Y in UC" with route info, paid status badge |
| 6.3 | 15 min | Compute `bill_count` per UC: sort by `route_seq ASC → survey_id DESC`, assign sequential number |
| 6.4 | 15 min | Compute `paid_status`: count paid months from `payment_history` → "P-{n}" or "U-P" |
| 6.5 | 15 min | Show all PSIDs per survey_id with payment history + ghost marking button |

### Phase 2b — Drop `amount_due` (deferred, ~30 min)
| Step | Time | Task |
|------|------|------|
| 2b.1 | 10 min | Remove `amount_due` from all SELECTs, TypeScript types, RPC queries |
| 2b.2 | 10 min | `ALTER TABLE survey_units DROP COLUMN amount_due` |
| 2b.3 | 10 min | Update any remaining frontend references |

### Total Estimate Breakdown
| Phase | Time | Cumulative |
|-------|------|------------|
| 0d | 1.5 hrs | 1.5 hrs |
| 0e | 2 hrs | 3.5 hrs |
| 0f | 3 hrs | 6.5 hrs |
| A | 3 hrs | 9.5 hrs |
| B1 | 7 hrs | 16.5 hrs |
| C | 3 hrs | 19.5 hrs |
| E | 4 hrs | 23.5 hrs |
| F | 3 hrs | 26.5 hrs |
| G | 3 hrs | 29.5 hrs |
| D | 4 hrs | 33.5 hrs |
| RBAC | 3 hrs | 36.5 hrs |
| 1 (Copy ref scripts) | 0.5 hrs | 37 hrs |
| 2 (enrich-survey-units) | 2 hrs | 39 hrs |
| 3 (load-payments) | 1 hr | 40 hrs |
| 4 (city columns) | 0.5 hrs | 40.5 hrs |
| 5 (ingest-all) | 1 hr | 41.5 hrs |
| 6 (bill metadata) | 1.5 hrs | 43 hrs |
| 2b (drop amount_due) | 0.5 hrs | 43.5 hrs |
| **R.1-R.5 (Architecture)** | **6 hrs** | **49.5 hrs** |
| **B2** (QR + HDS Delivery) | **3 hrs** | **52.5 hrs** |

### Execution Order (Remaining)
| Order | Phase | Time | What | Status |
|-------|-------|------|------|--------|
| 1 | **R.1-R.5** Architecture Improvement | 6 hrs | Security guard, Zod validation, repository layer, middleware, server component split | ✅ Done |
| 2 | **2b** Drop `amount_due` | 30 min | Remove column — deferred cleanup | ✅ Done |
| 3 | **A** Admin Assignment UI | 3 hrs | UC list → pick staff → create daily chunks with approval chain support | ✅ Done |
| 4 | **B1** Field Staff Delivery Basics | 7 hrs | /deliver page, photo capture, offline queue, map, card list, bottom sheet | ✅ Done |
| 5 | **B2** QR + HDS Delivery Flow | 3 hrs | QR scanner, HouseDetailSheet deliver/navigate/missed buttons, auto-advance | ⏳ In Progress |
| 6 | **C** Admin Dashboard | 3 hrs | `/stats`, staff performance, delivery KPIs | 🔲 |
| 7 | **E** Flag Management UI | 4 hrs | `/flagged-units`, resolve/confirm/note actions | 🔲 |
| 8 | **F** Auto-Route Generation | 3 hrs | Delivery sequence → consensus route → write to survey_units → printer integration | 🔲 |
| 9 | **G** Live Admin Monitoring | 3 hrs | Staff mode on map, breadcrumbs, near-real-time polling | 🔲 |
| 10 | **RBAC** Approval Chain | 3 hrs | User management + assignment approval chain (draft→pending→approved→active) | 🔲 |
| 11 | **D** Visual Rehaul | 4 hrs | Staff mobile layout, admin sidebar, theme system, touch targets | 🔲 |
| 12 | **Z** App Audit Cleanup | 4 hrs | 10 items from Section 15.8 | 🔲 |
| 13 | **Deploy** Office PC pipeline | 1 hr | `ingest-all.py` + scripts on Office PC, live test | 🔲 |

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
## 16. Pipeline Reference

### 16.1 Data Flow

```
Office PC (local Python, manual triggers)
│
├── pdf-psid-extractor.py (monthly, 16th–18th)
│     A4 PDFs + Biller CSVs → lifecycle XLSX
│     Output: test_lifecycle_Biller_{City}_{Month}.xlsx (57 cols)
│
├── bill-extractor-v4.py (daily, multiple times)
│     SWMC portal → combined payment CSV
│     Output: COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv (19 cols)
│
├── survey_filtered.py (monthly/on-demand)
│     Portal survey data → survey CSV
│     Output: {DISTRICT}_{TEHSIL}_SURVEY_DATA.csv
│
├── pdf-bill-printer.py (monthly, 19th–20th)
│     Lifecycle XLSX + A4 PDFs → sorted A5 print PDFs
│     Output: F:\Final_print\{Month}\*.pdf + index_cache_{city}_{month}.json
│
└── generate_category_fallbacks.py (monthly)
      Biller CSV → fallback mapping CSV
      Output: biller_data_{city}_{month}.csv
```

**Supabase ingest (desktop, same machine or nearby):**

```
python scripts/ingest-all.py
  ├── Option [1] Full Monthly
  │     ├── enrich-survey-units.py → survey_units (21 fields, Phase 2)
  │     ├── load-payments.py       → payment_history (12 fields, Phase 3)
  │     └── Write audit log        → ingest_log
  ├── Option [2] Daily Update
  │     └── load-payments.py       → payment_history (idempotent upsert)
  └── Option [3] Quick Sync
        └── enrich-survey-units.py --quick → new records only
```

### 16.2 CLI Reference

```bash
# Phase 2 - Lifecycle enrichment
python scripts/enrich-survey-units.py                    # auto-detect latest XLSX
python scripts/enrich-survey-units.py --month May2026    # specific month
python scripts/enrich-survey-units.py --dry-run          # preview only
python scripts/enrich-survey-units.py --exclude-ghosts   # skip flagged PSIDs
python scripts/enrich-survey-units.py --quick            # new records only

# Phase 3 - Payment upsert
python scripts/load-payments.py                          # auto-detect latest CSV
python scripts/load-payments.py --file path/to/file.csv  # specific file
python scripts/load-payments.py --dry-run                # preview only

# Phase 5 - Orchestrator (wraps Phase 2 + Phase 3)
python scripts/ingest-all.py                             # interactive menu
python scripts/ingest-all.py --month May2026             # full monthly
python scripts/ingest-all.py --daily                     # payments only
python scripts/ingest-all.py --month May2026 --dry-run   # preview
```

### 16.3 Scripts Map

| Script | Location | Purpose |
|--------|----------|---------|
| `pdf-psid-extractor.py` | Office PC: `F:\qoder\billing-system\01_Local_Engine\scripts\` | Monthly: A4 PDFs → lifecycle XLSX |
| `bill-extractor-v4.py` | Office PC (same path) | Daily: payment CSV from SWMC portal |
| `survey_filtered.py` | Office PC (same path) | Monthly/on-demand: survey data from portal |
| `pdf-bill-printer.py` | Office PC (same path) | Monthly: A4→A5 print PDFs |
| `generate_category_fallbacks.py` | Office PC (same path) | Monthly: category fallback CSV |
| `enrich-survey-units.py` | `scripts/enrich-survey-units.py` | Supabase upsert: lifecycle XLSX → survey_units |
| `load-payments.py` | `scripts/load-payments.py` (Phase 3) | Supabase upsert: payment CSV → payment_history |
| `ingest-all.py` | `scripts/ingest-all.py` (Phase 5) | Orchestrator with interactive menu |
| `config.py` | Office PC copy + `scripts/lib/config.py` (Phase 2.7) | Centralized paths, DB connection, logging |

### 16.4 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Lifecycle XLSX is single source for `survey_units` | Contains all 21 fields; Biller CSVs are redundant intermediate |
| Payment CSV is single source for `payment_history` | Contains city/tehsil/uc — fixes "Unknown" chart cities |
| `amount_due` dropped in Phase 2b | SWMC miscalc, not reliable; app computes `monthly_fee + arrears` |
| Printer cache JSON stays local | Bill metadata reconstructable from `survey_units` + `payment_history` |
| `ingest_log` tracks every import run | PSID count, inserted/skipped/error, duration, file hash, exit status |
| No server-side pipeline | Govt portal blocks external IPs — all scripts run on Office PC |
| Idempotent upserts on `(psid, bill_month)` | Daily payment imports safe to run multiple times

### 16.8 Billing Charts Architecture — Established Pattern (2026-05-30)

**Problem:** Dashboard charts need to aggregate 122K+ `payment_history` rows. Cannot fit through REST API (1MB limit, 1000-row limit). Client-side aggregation is impossible.

**Solution:** One PL/pgSQL RPC (`get_charts_data`) does all aggregation at DB level. SSR API route (`/api/billing-charts`) calls the RPC and adds display-level transforms in TypeScript.

**Architecture:**
```
payment_history (122K rows)
  ↓
  PL/pgSQL RPC: get_charts_data() ←─ City/tehsil filter params
  ↓ (single JSON response)
  /api/billing-charts/route.ts
    ├── Calls sup.rpc('get_charts_data', ...)
    ├── Transforms: adds day_label from paid_date (display logic only)
    └── Returns BillingChartsData
  ↓
  useBillingCharts() hook (React Query, staleTime: 5min)
  ↓
  Dashboard component renders 5 charts
```

**Key Rules for Future Chart Work:**

| Rule | Details |
|------|---------|
| **No SQL changes for display** | `day_label`, formatting, sorting — all in `route.ts` TypeScript. Only edit SQL for new metrics or filter params. |
| **One RPC call** | All chart data comes from a single `get_charts_data()` call. No separate queries per chart. |
| **No survey_units join in aggregation** | Join causes timeout even with index. Use `EXISTS` for filtering, LATERAL only for display enrichment on filtered subset. |
| **No client-side aggregation** | RPC does all summing/counting/windowing. Chart components only reshape (pivot) the data for recharts. |
| **Month sort: chronological** | Use `to_date(bill_month, 'MonYYYY')` in SQL ORDER BY. Use `sortMonths()` helper on client if re-sorting. Never use alphabetical `.sort()`. |
| **Cycle day = 16th→15th** | Day 1 = 16th of bill month. Formula: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)::int`. Display label computed from `paid_date.getDate()` in route.ts. |
| **Tooltip: daily, not cumulative** | Curves chart shows cumulative lines but tooltip shows daily_amount per month in table format. |
| **Re-run SQL** | `CREATE OR REPLACE FUNCTION get_charts_data(...)` — only when aggregation logic changes. |

**Approved RPCs for client-facing charts:** This is a second exception (beyond admin-only Data Insight RPCs in `007-data-insight-rpcs.sql`). Rationale: 122K payment rows physically cannot be fetched through REST API for aggregation.

**File map:**
| File | Purpose |
|------|---------|
| `scripts/sql/021-charts-aggregation.sql` | PL/pgSQL RPC definition (final, run once) |
| `src/app/api/billing-charts/route.ts` | SSR endpoint: RPC caller + display transforms |
| `src/hooks/use-billing-charts.ts` | React Query hook |
| `src/components/dashboard.tsx` | Dashboard layout with tabs + KPI cards |
| `src/components/charts/monthly-curves.tsx` | Cumulative curve chart with table tooltip |
| `src/components/charts/office-breakdown.tsx` | Tehsil × month bar chart |
| `src/components/charts/monthly-trend.tsx` | Monthly bar trend |
| `src/components/charts/category-breakdown.tsx` | Category pie/bar |
| `src/types/index.ts` | `MonthlyCurveRow` (includes `day_label`), `BillingChartsData`, etc. |

### 16.9 Data Quality & Cleanup Strategy (2026-05-30 Planning)

#### 16.9.1 The Real Data Problem

The govt survey app has two fundamental bugs that create data chaos:

| Bug | Result | Scale |
|-----|--------|-------|
| Network issues → survey goes to "unsent" → user clears queue → re-submits | Multiple survey IDs created for the same house | Unknown, several thousand |
| Same survey ID saved multiple times | Multiple PSIDs generated against one survey ID | ~20K+ orphaned PSIDs |
| Portal has no "deactivate PSID" option | Stale PSIDs live forever in biller list | ~20K+ |
| Only option: delete the survey ID on portal | PSID disconnected from survey record but still in payment history + lifecycle files | ~20K+ |

**Result in the app:**
- `payment_history` has records for PSIDs whose `survey_id` was deleted on the portal
- `LEFT JOIN LATERAL` to `survey_units` in the RPC returns NULL for these → `coalesce(tehsil, 'Unknown')` → "2 unknown cities" in Office Breakdown chart
- One house can have multiple PSIDs (staff manually picks the one with payment history)
- One house can have multiple survey IDs (different names, same address)

#### 16.9.2 Strategy: 2-3 Billing Cycle Cleanup

Not a one-time fix. An **iterative cleanup over 2-3 monthly billing cycles** using the app as the data quality tool:

```
Cycle 1: Display → Staff marks → Export → Filter next import
Cycle 2: Remaining ghosts identified → Mark → Export → Filter
Cycle 3: Verification pass
```

**Staff workflow in the app:**
1. HouseDetailSheet shows ALL PSIDs for a house (from payment_history + lifecycle)
2. Each PSID shows: payment history, current bill amount, "Deleted in Portal" flag if available
3. Staff taps "Mark as Ghost" → PSID is flagged for exclusion
4. Flagged PSIDs are collected into an exportable list
5. Next month's `enrich-survey-units.py` reads the flagged list and excludes those PSIDs during enrichment

#### 16.9.3 Bill-Printer Metadata Integration

`pdf-bill-printer.py` currently generates sorted A5 PDFs with survey_id printed in the metadata/page. This metadata should be:

1. **Stored per PSID** — link each printed bill (PDF page number, print date) to the PSID
2. **Displayed in HouseDetailSheet** — staff sees which physical bill corresponds to which PSID
3. **Used for duplicate bill printing** — if a customer loses their bill, staff can find it by survey_id/PSID and re-print

**Implementation:**
- `pdf-bill-printer.py` already outputs a mapping file (PSID → survey_id → PDF page number)
- This mapping JSON gets imported via an API endpoint or stored alongside the lifecycle data
- HouseDetailSheet reads this mapping and shows: "Bill #42 in May-2026 print batch"

#### 16.9.4 Immediate Schema Fix: Add City to payment_history

**Problem:** `payment_history` has no `city` or `tehsil` column. The RPC must join to `survey_units` for geography, which fails for orphaned PSIDs.

**Fix:** Add `city` and `tehsil` columns to `payment_history` and populate from the source payment CSV (which already contains city info — `bill-extractor-v4.py` drops it during upsert).

```sql
ALTER TABLE payment_history ADD COLUMN city text;
ALTER TABLE payment_history ADD COLUMN tehsil text;
```

**Impact:**
- `get_charts_data` RPC can use `ph.city`/`ph.tehsil` directly — no LATERAL join needed
- "Unknown" cities disappear — every payment has its source city
- Chart geography is independent of survey_units completeness
- 30-minute fix, but a prerequisite for correct chart data

#### 16.9.5 Pipeline Architecture

Since govt portal blocks external IPs (no GitHub Actions, no Vercel Cron), the pipeline architecture must be:

```
┌─────────────────────────────────────────────┐
│ Office PC (local)                           │
│                                             │
│  bill-extractor-v4.py  ← daily, manual     │
│  enrich-survey-units.py ← monthly, manual  │
│  pdf-bill-printer.py   ← monthly, manual   │
│                                             │
│  All write to: scripts/data/ + Supabase DB  │
│  via service_role key (API routes)          │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│ App (Next.js SSR)                           │
│                                             │
│  - Ingestion endpoints (/api/ingest/*)      │
│  - Staff marking UI (HouseDetailSheet)      │
│  - Ghost PSID export (/api/export/ghosts)   │
│  - Dashboard + charts (already built)       │
└─────────────────────────────────────────────┘
```

**Local scripts run on office PC; app provides:**
- API endpoints for data ingestion (CSV upload, XLSX upload)
- Staff-facing UI for marking ghost PSIDs
- Export endpoints for flagged data
- Dashboard for monitoring data quality

#### 16.9.6 Future Work Items (Data Quality)

| # | Item | Time | Depends On |
|---|------|------|------------|
| DQ.1 | Add `city`/`tehsil` to `payment_history` (SQL migration) | 15m | None |
| DQ.2 | Update `bill-extractor-v4.py` to write city/tehsil into payment_history | 30m | DQ.1 |
| DQ.3 | Update `get_charts_data` RPC to use `ph.city`/`ph.tehsil` instead of LATERAL join | 15m | DQ.1 |
| DQ.4 | Add `flagged_psids` table (psid, staff_id, note, flagged_at) | 15m | None |
| DQ.5 | HouseDetailSheet: show all PSIDs per survey_id, ghost marking button | 1.5h | DQ.4 |
| DQ.6 | API endpoint: POST /api/psids/flag, GET /api/psids/flagged, GET /api/export/ghosts | 1h | DQ.4 |
| DQ.7 | Update enrich-survey-units.py to accept/exclude flagged PSIDs list | 30m | DQ.6 |
| DQ.8 | pdf-bill-printer metadata: store mapping JSON, import to DB | 1h | None |
| DQ.9 | HouseDetailSheet: show bill print metadata per PSID | 1h | DQ.8 |
| DQ.10 | 022-add-payment-history-city.sql migration | 15m | None |

**Total data quality cleanup: ~6 hrs (spread across 2-3 billing cycles)**

### 16.10 Pipeline Streamlining Report (2026-05-30 Analysis)

#### 16.10.1 Current Data Landscape

What exists in the repo:

| Source | File Pattern | Key Columns | Location |
|--------|-------------|-------------|----------|
| Payment history | `COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` (33MB) | PSID, **City**, **Tehsil**, **UC**, District, Month, Amount, Fine, Paid Date, Paid Amount, Status, Channel | `scripts/data/scraped_data/` |
| Lifecycle XLSX | `test_lifecycle_Biller_{City}_{Month}.xlsx` (41 cols) | **Biller PSID**, **Survey ID**, **City Name**, Tehsil, UC, Monthly Fee, Arrears, Total Payable, Start Month, Billing Category, Deleted in Portal, monthly PDF issued flags, monthly payment flags, Surveyor Name | `scripts/data/processed_pdfs/` |
| Biller CSVs | `Biller_{City}_{Month}.csv` | Monthly Fee, Current Bill, Biller PSID, Tehsil, Office, UC, Name, Total Payable, Survey ID | `scripts/data/excel_dumps/` |

What's missing from repo (on office PC only):

| Script | Purpose | Input → Output |
|--------|---------|----------------|
| `bill-extractor-v4.py` | Daily: downloads payment CSV from SWMC portal, cleans, upserts to DB | Portal CSV → `COMBINED_...csv` + `payment_history` upsert |
| `pdf-psid-extractor.py` | Monthly: reads A4 PDFs from govt, extracts PSIDs, links to survey data | A4 PDFs → `test_lifecycle_Biller_*.xlsx` |
| `pdf-bill-printer.py` | Monthly: sorts lifecycle data MC/UC, cuts A4→A5, prints metadata on each bill | Lifecycle XLSX + A4 PDFs → sorted A5 PDFs + print mapping |

**Critical finding:** The payment CSV already has **City, Tehsil, UC, District** columns for every row, but `payment_history` stores none of these. The `enrich-survey-units.py` script reads the lifecycle XLSX and writes to `survey_units`, but the payment ingestion script only upserts core columns. City data is discarded during CSV→DB upsert.

#### 16.10.2 Proposed Workflow

```
MONTHLY (18th-20th):
  Govt A4 PDFs → pdf-psid-extractor.py
    ├──→ test_lifecycle_Biller_{City}_{Month}.xlsx (41 cols)
    │
    ├──→ enrich-survey-units.py → Supabase: survey_units
    │    (upserts psid, monthly_fee, arrears, route_name,
    │     current_bill_month, billing_category, city, tehsil)
    │
    └──→ pdf-bill-printer.py → Sorted A5 PDFs + mapping JSON
         (future: import mapping to DB for HouseDetailSheet)

DAILY:
  SWMC Portal → CSV download (manual) → bill-extractor-v4.py
    ├──→ COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv
    └──→ Supabase: payment_history (psid, city, tehsil, uc, amount, ...)
```

#### 16.10.3 Required Changes

| # | Change | Est. | Impact |
|---|--------|------|--------|
| 1 | **Copy 3 major scripts** into repo from office PC | 10m | Foundation — everything depends on having them in version control |
| 2 | **Add `city`/`tehsil`/`uc_name` to `payment_history`** (SQL migration 022) + update bill-extractor-v4.py | 30m | Fixes "Unknown" cities in charts. Every future dashboard feature depends on correct geography |
| 3 | **Update `enrich-survey-units.py`** to write `city_district`/`tehsil` to `survey_units` | 20m | Makes enrichment complete — current month records get geography |
| 4 | **Update `get_charts_data` RPC** to use `ph.city`/`ph.tehsil` instead of LATERAL join | 15m | Eliminates survey_units join entirely for chart data |
| 5 | **Add `flagged_psids` table** + staff marking UI (DQ.4-DQ.6) | 2h | Enables the 2-3 cycle cleanup workflow |
| 6 | **Centralize data paths** to `config.py` | 15m | Prevents path fragmentation across scripts |
| 7 | **Build `ingest-payments.py` + `ingest-lifecycle.py`** wrappers | 2h | Standardized CLI interface for all scripts |

#### 16.10.4 New Pipeline Scripts (To Create)

##### P.1 — `scripts/ingest-payments.py`
```bash
python scripts/ingest-payments.py                          # processes latest CSV
python scripts/ingest-payments.py --file path/to/file.csv  # specific file
python scripts/ingest-payments.py --upload                 # sends to /api/ingest/payments
```
- Reads payment CSV, validates columns, logs bad rows
- Upserts to `payment_history` INCLUDING `city`, `tehsil`, `uc_name`
- Reports: inserted count, skipped, errors
- Optionally uploads to app's ingest API endpoint

##### P.2 — `scripts/ingest-lifecycle.py`
```bash
python scripts/ingest-lifecycle.py                          # auto-detect latest XLSX
python scripts/ingest-lifecycle.py --month May2026          # specific month
python scripts/ingest-lifecycle.py --exclude-ghosts         # skip flagged PSIDs
python scripts/ingest-lifecycle.py --dry-run                # preview only
```
- Reads lifecycle XLSX, enriches `survey_units`
- Upserts reference tables (`hierarchy`, `surveyors`, `bill_months`)
- Skips PSIDs in `flagged_psids` table (if `--exclude-ghosts`)
- Writes `city`, `tehsil` to `survey_units`
- Produces diff report (what changed vs previous month)

##### P.3 — `scripts/export-bill-mapping.py`
```bash
python scripts/export-bill-mapping.py --month May2026
```
- Reads PDF print mapping output from pdf-bill-printer.py
- Creates `bill_print_log` linking PSID → survey_id → PDF page number → print batch
- Feeds HouseDetailSheet: "Bill #42 in May-2026 print batch"

#### 16.10.5 App-Controlled Pipeline (Future Phase)

Once scripts are stable, app controls them via:

```
App (Next.js SSR)                     Local Server (office PC)
  /api/ingest/payments ──POST──→     Node.js/Python Flask
  /api/ingest/lifecycle ──POST──→     → triggers Python scripts
  /api/ingest/status    ──GET──→      → returns result report
  /api/export/ghosts    ──GET──→      → exports flagged PSIDs
```

#### 16.10.6 Priority Order

| Priority | Action | Est. |
|----------|--------|------|
| **P0** | Copy the 3 major scripts into `scripts/` from office PC | 10m |
| **P1** | Add `city`/`tehsil`/`uc_name` to `payment_history` + update extractor | 30m |
| **P2** | Update `enrich-survey-units.py` to write city/tehsil | 20m |
| **P3** | Update `get_charts_data` RPC to use `ph.city`/`ph.tehsil` | 15m |
| **P4** | Add `flagged_psids` table + staff marking UI | 2h |
| **P5** | Centralize paths to `config.py` | 15m |
| **P6** | Build wrapper scripts (ingest-payments, ingest-lifecycle) | 2h |

**Total: ~6 hrs for full pipeline streamlining.** This is additive to the DQ items in 16.9.6. The first 3 items (P0-P3, ~1 hr) are the critical path — everything else can be done incrementally.

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

### 2026-06-01 (Data Pipeline Overhaul — Phases 1-6 Defined + Migrations 026-028) — Location: Home
**Focus:** Complete pipeline analysis, create staff sync trigger, pipeline tables, start_month migration, define Phases 1-6
**Done:**
- **Migration 026** `026-staff-sync-trigger.sql` — `trg_sync_profile_to_staff` on `profiles` INSERT/UPDATE/DELETE: auto-creates/updates/deactivates `staff` rows for `field_staff` profiles
- **Migration 027** `027-pipeline-tables.sql` — created `flagged_psids`, `bill_print_log`, `ingest_log` with indexes + RLS
- **Migration 028** `028-start-month.sql` — added `start_month text` + index to `survey_units`
- Verified `/api/staff` returns both existing + synced field_staff rows
- **Data pipeline deep research (4 Office PC scripts):**
  - `bill-extractor-v4.py` (daily) — fetches payment CSV, drops city/tehsil/uc during upsert → "Unknown" chart cities
  - `pdf-psid-extractor.py` (monthly) — reads A4 PDFs → lifecycle XLSX with 57+ columns (10 "PDF Issued" booleans, paid flags, etc.)
  - `pdf-bill-printer.py` (monthly) — generates sorted A5 PDFs, bill numbers per UC from route_seq sort
  - `survey_filtered.py` — survey data from portal
  - Printer cache JSON has psid_map (~105K entries per city) but is NOT loaded to DB
  - Critical: `survey_units` needs 13 new columns from lifecycle (consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status/ARCHIVED)
- **Phases 1-6 defined** for pipeline overhaul:
  - Phase 1: Copy reference scripts from Office PC
  - Phase 2: Rewrite `enrich-survey-units.py` (21-field upsert)
  - Phase 3: Create `load-payments.py` (payment CSV → payment_history)
  - Phase 4: Add city/tehsil/uc_name columns to `payment_history` + update RPCs
  - Phase 5: Create `ingest-all.py` orchestrator (interactive menu)
  - Phase 6: Bill metadata display in HouseDetailSheet
  - Phase 2b (deferred): Drop `amount_due` column
- **`SUPABASE_ACCESS_TOKEN` saved to `.env.local`** — Management API now accessible (PAT token `sbp_...`)
- Updated `docs/SCHEMA.md` with all new tables, columns, migration 026-028
- Updated `docs/MASTER.md` Section 5 (pipeline flow), Section 7 (monthly workflow), Section 10 (Phases 1-6), Section 16 (pipeline reference replacing aspirational future workflow)
- Updated `AGENTS.md` with new monthly workflow, Supabase access methods, scripts reference
**Key decisions:**
- Lifecycle XLSX is single source of truth for survey_units (21 fields)
- `amount_due` to be dropped — SWMC miscalc, app uses `monthly_fee + arrears`
- Payment CSV geography (city_district, tehsil, uc_name) already in source — store directly in `payment_history` to eliminate "Unknown" chart cities
- Printer cache JSON stays local — bill metadata reconstructable from DB data
- Bill numbering replicable in app: `route_number ASC → route_seq ASC → survey_id DESC` within each UC
- Daily payment upsert keyed on `(psid, bill_month)` — idempotent
**Implementation (same session):**
- **Phase 1 executed** — Copied 5 scripts + config.py from Office PC to `scripts/ref/`, verified Python syntax
- **Phase 2 executed** — Rewrote `enrich-survey-units.py`:
  - Added 12 new fields: consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status (ARCHIVED if Deleted=Yes)
  - Added `--exclude-ghosts` flag — skips PSIDs in `flagged_psids` table
  - Added diff report (new vs updated vs skipped counts via pre-query of existing survey_ids)
  - Added reference table sync (surveyors, bill_months)
  - Added audit log write to `ingest_log`
- **Phase 3 executed** — Created `load-payments.py`:
  - Reads combined payment CSV, upserts to `payment_history` on `(psid, bill_month)` conflict key
  - Includes city_district, tehsil, uc_name from CSV columns (already in DB)
  - Idempotent, batch upsert (500), audit log
- **Phase 4 verified** — RPC `get_charts_data` already uses `ph.city_district`/`ph.tehsil` directly — no changes needed
- **Phase 5 executed** — Created `ingest-all.py` orchestrator:
  - Interactive menu: [1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit
  - CLI: `--month`, `--daily`, `--file`, `--dry-run`
- **Phase 6 executed** — Bill metadata in HouseDetailSheet:
  - Created `GET /api/surveys/[survey_id]/bill-info` — returns bill number within UC, route info, paid months, start_month
  - Added `BillInfo` type to `src/types/index.ts`
  - Added `useSurveyBillInfo` hook to `use-survey-data.ts`
  - Replaced "Coming soon" placeholder with live Bill Summary section showing Bill #N/M, route name, paid months, current month
- `npx tsc --noEmit` passes with zero errors
**Next session:**
- Phase 2b (deferred): Drop `amount_due` column
- Deploy ingest scripts to Office PC and test with live data

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



### 2026-05-30 (Audit Cleanup + Data Insight Sorting + UI Fixes) — Location: Office
**Focus:** Complete audit cleanup items, add global sort system, fix payment history layout and data insight bugs
**Done:**

#### Audit Cleanup (from Phase Z):
- **3 empty `catch {}` blocks** → Added `console.warn()` in `auth-store.ts:110`, `settings/page.tsx:120`, `payments/route.ts:68`
- **3 unused icon imports** → Removed `RotateCw` (`deliver-card-list.tsx`), `PanelLeftOpen` (`BillingSidebar.tsx`), `ArrowRight` (`deliver/page.tsx`)
- **`chunkArray` and `toEmail`** → Extracted to `src/lib/utils.ts`, updated imports in 3 route files (`surveys`, `data-insight`, `admin/users`). Redundant inline definitions removed.
- **Month array consolidation** → 4 redundant `['JAN','FEB',...]` arrays in `payments/route.ts` consolidated into single `MONTHS` export in `constants.ts`. Also used by `currentMonth()` function.
- **`import * as React`** → Replaced with `import type { ReactNode }` in `query-provider.tsx`
- **Dead SQL files archived** → `007-data-insight-rpcs.sql` and `015-revise-rpcs.sql` moved to `scripts/sql/_old/`
- **StaleTime named constants** → `STALE_BILLING` (5min), `STALE_HIERARCHY` (30min), `STALE_ASSIGNMENT` (2min) in `constants.ts`. `query-provider.tsx` updated to use `STALE_BILLING`.

#### Payment History UI Fixes:
- **Column header** → Empty expand chevron column renamed to "History" with `w-8`
- **Repositioned** → History column moved from position 1 to position 7 (just before Action column)
- **Desktop spacing** → Removed `justify-between` from `PaymentHistoryCard` rows (caused month/amount to spread edge-to-edge on wide screens). Replaced with `gap-3`.
- **Right-aligned expanded content** → Expanded row uses `colSpan={8}` with `ml-auto w-fit max-w-[220px]` wrapper so payment info sits under History/Action area
- **Sep 2025 cap** → `allMonths` range in `payments/route.ts` now clamped to `SEP2025` minimum (no unpaid months shown before Sep 2025)

#### House Detail Sheet Improvements:
- **PSID display** → Removed "PSID:" label, shows just `mono bold blue` value + copy button
- **Current Bill badge** → Added below PSID: emerald pill "Current Bill" badge + `monthly_fee + arrears` amount

#### Data Insight State Persistence:
- **CSS hide instead of conditional render** → `DataInsight` component now stays mounted in DOM (hidden via `className`) when switching to detail view. Preserves `drillUC`, `page`, `expandedId` state when returning from house detail sheet.
- One-line change in `map/page.tsx`: `{activeView === 'data-insight' && <DataInsight />}` → `<div className={activeView !== 'data-insight' ? 'hidden' : 'absolute inset-0'}><DataInsight /></div>`

#### MC/UC Sorting Fix:
- **Grouped sort** → MCs sort first (by first numeric value), then UCs, then others. Uses `match(/\d+/)?.[0]` (first number only) instead of `replace(/\D/g, '')` (all digits concatenated). Fixes "MC-17, Block 5/11" sorting as 17 instead of 17511.
- Applied in `data-insight/route.ts` UC sort function.

#### Global Sort System:
- **Types** → Added `SortConfig`, `SortField` (`survey_id`/`surveyor_name`/`survey_date`/`survey_time`), `SortDirection` to `types/index.ts`. Included `sort: SortConfig` in `FilterState`.
- **Store** → Added `setSortConfig` action to `billing-store.ts`. Default sort: `{ field: 'survey_id', direction: 'desc' }` (latest first for drill-down). Sort preserved across filter resets.
- **API routes** — Both `surveys/route.ts` and `data-insight/route.ts` accept `sortField`/`sortDirection` query params. Replace hardcoded `.order('consumer_name')` / `.order('psid')` with dynamic sort. Default `survey_id desc` for data insight, `consumer_name` for survey list.
- **Hooks** → `use-survey-data.ts` and `use-data-insight.ts` pass `filters.sort` to API calls.
- **SortSelector component** → `src/components/sort-selector.tsx` — reusable dropdown + direction toggle. Field select (Survey ID / Surveyor / Date / Time) + asc/desc arrow button. Placed in `DesktopFilterBar` before ActionButtons.
- **House detail sheet inheritance** → `nextHouse`/`prevHouse` navigation order inherits sort via `houseList` (which is sorted by the same API query).

#### Bug Fix: Duplicate null keys + auto-expand
- **Root cause:** Survey rows with `psid = null` caused `key={row.psid}` to produce duplicate `null` keys. Also `expandedId === row.psid` → `null === null` → `true` for every null-psid row, auto-expanding all of them.
- **Fix:** Changed all keys and expand state to use `row.survey_id` (always unique, non-null) instead of `row.psid`.
- **Note:** Survey records with `psid = null` are **new/unregistered surveys** — units surveyed in the field but not yet assigned a PSID from the billing lifecycle system. These have `survey_id` but no matching entry in `payment_history` or `bills.json`.

**Key decisions:**
- `survey_id` as canonical key for frontend lists (not `psid`) — it's always unique and non-null
- MC/UC sort grouped: MCs first by first number, then UCs, then others — prevents "MC-17, Block 5/11" from sorting after UC-17511
- Sort state lives in `FilterState` and flows through existing filter pipeline (no new mechanism needed)
- CSS hide over Zustand for DataInsight state persistence — avoids new store fields, component tree is idle when hidden
- `justify-between` removed from PaymentHistoryCard rows — items cluster naturally via `gap-3` at all widths

**Next session:**
- Re-run `019-aggregation-rpcs.sql` to fix `psid` ambiguity in `get_hierarchy_stats` (Data Insight broken until done)
- Phase A: Admin Assignment API (`GET/POST /api/assignments`) + `/assignments` page UI
- Phase B: Field Staff Delivery UI
- Backlog: `.range(0, 1_000_000)` already removed from all routes ✅
- Backlog: Refactor audit items from Phase Z as scheduled

### 2026-05-30 (Billing Charts Dashboard — RPC Aggregation + Full Data) — Location: Home
**Focus:** Build billing charts API with 122K-row aggregation, connect to dashboard, fix month sorting + cycle-relative day labels
**Done:**
- **Created `021-charts-aggregation.sql`** — `get_charts_data` PL/pgSQL RPC that aggregates ALL paid `payment_history` rows at DB level:
  - Returns: `monthly_trend`, `daily_detail`, `category_summary`, `tehsil_breakdown`, `monthly_curves`, `kpi`
  - City/tehsil filtering via `EXISTS (SELECT 1 FROM survey_units WHERE psid = ph.psid AND ...)` — uses psid index, short-circuits when no filter
  - LATERAL join only for display enrichment (tehsil, billing_category) on the filtered subset
  - Month sorting via `ORDER BY to_date(bill_month, 'MonYYYY')` — chronological (Sep → Oct → ... → May)
  - Day calculation: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)::int` — Day 1 = 16th of bill month
  - Cumulative sum via window function `sum(sum(amount_paid)) OVER (PARTITION BY bill_month ORDER BY paid_date)`
- **Rewrote `/api/billing-charts/route.ts`** — 30-line RPC caller + adds `day_label` (from `paid_date.getDate()`) via TypeScript transform. All future display logic lives here, not SQL.
- **Connected Dashboard UI** — KPI cards, Monthly Trend, Category Breakdown, Daily Collection Comparison, Office Breakdown all pull from `useBillingCharts`. Removed broken `useBillingStore` dependency. Removed `useBillingStats` dependency.
- **Fixed month sort in chart components** — Added `sortMonths()` helper (`year*12 + monthIndex`) to `MonthlyCurvesChart` and `OfficeBreakdownChart`, replacing alphabetical `.sort()` which gave wrong order (APR before FEB).
- **Fixed cycle-relative day display** — X-axis tickFormatter shows `16, 17, ...31, 1, ...15` cycle labels. Tooltip shows daily amount in table format (not cumulative). Tooltip `labelMap` uses exact `day_label` from paid_date per row.
- **Removed broken survey_units LATERAL join** (first version timed out on 122K rows). Replaced with EXISTS-based filtering.
- **Dashboard file changes:** `dashboard.tsx`, `monthly-curves.tsx`, `office-breakdown.tsx`, `route.ts`, `types/index.ts`, `021-charts-aggregation.sql`
- **All changes pass `npx tsc --noEmit` with zero errors**.
**Key decisions:**
- Charts aggregation RPC is the **only RPC exception for client-facing features** (beyond admin-only Data Insight). Rationale: 122K payment rows cannot fit through REST API (1MB limit, 1000-row PostgREST limit).
- **Display logic lives in route.ts (TypeScript)**, not SQL. Day labels, formatting, any future presentation tweaks — edit `route.ts`, no SQL re-run.
- `+ 15` for cycle offset (16th = Day 1). Month has 30-31 days; X-axis uses approximate labels (16→31, 1→15), tooltip shows exact `paid_date` via `day_label`.
- **No survey_units join in main aggregation** — the join caused 30s timeout even with psid index. EXISTS + LATERAL on filtered subset is the fastest approach.
- SQL is `CREATE OR REPLACE FUNCTION` — re-run SQL only when aggregation logic changes (new metric, filter field, grouping). Chart display changes need only TS edits + server restart.
**Confirmed working:**
- API returns 9 months (SEP2025–MAY2026), ₹75.7M collected, 60.9K unique units, 228 curve days
- Dashboard renders all 5 charts with full data
- `/map` page loads with dashboard tab (200 OK)
**Next session:**
- Connect city filter bar to billing-charts API
- Any pending chart styling/polish
- Phase A: Admin Assignment UI or other pending feature work

### 2026-05-30 (Strategic Planning: Data Accuracy + Pipeline Architecture) — Location: Home
**Focus:** Deep discussion on real data quality problems, pipeline constraints, and 2-3 cycle cleanup strategy
**Done:**
- **Root cause of "Unknown" cities in Office Breakdown chart identified:**
  - `payment_history` has NO `city` or `tehsil` column — RPC must LEFT JOIN LATERAL to `survey_units`
  - Orphaned PSIDs (survey ID deleted on govt portal, ~20K+ of them) have no matching `survey_units` record
  - `coalesce(tehsil, 'Unknown')` in RPC creates the phantom "Unknown" bars
  - When specific city filter is selected, EXISTS clause filters them out — only "All Cities" reveals them
- **Real data problem documented:**
  - The govt survey app creates duplicate survey IDs and PSIDs (network issues → unsent queue → re-submit)
  - Portal refuses to deactivate stale PSIDs — only option was deleting the survey ID
  - Deleting survey ID removes the record but the PSID remains in biller list forever (~20K orphans)
  - One survey ID can have multiple PSIDs; one house can have multiple survey IDs
  - Currently dealt with manually by field staff
- **Pipeline constraint clarified:**
  - GitHub Actions / Vercel Cron blocked — govt portal firewalls external IPs
  - Local Python scripts + app-controlled orchestration is the only viable path
- **AGENTS.md updated:** Removed `bill_items.tehsil` trigger reference, changed `import-lifecycle-data.py` to `enrich-survey-units.py`, removed stale trigger listing
**Key decisions:**
- `payment_history` needs `city` and `tehsil` columns to decouple chart geography from `survey_units` match (quick structural fix)
- 2-3 billing cycle cleanup: staff marks ghost PSIDs from app → export list → next month's enrichment uses it as filter
- pdf-bill-printer metadata (survey_id on each bill PDF) should be integrated into HouseDetailSheet for staff reference
- Pipeline remains local scripts + app control; no cloud automation for data fetching
- Edge case #17 added (orphaned PSIDs in payment_history)
- Strategic deep-planning deferred to next session
**Next session:**
- Continue strategic deep-planning for data pipeline + cleanup workflow
- Implement quick fixes (add city/tehsil to payment_history, update RPC)
- Evaluate Section 16 (Data Cleanup Strategy) and AGENTS.md updates
- Phase A/B feature work deferred until data strategy is finalized

### 2026-05-31 (Database Gaps Analysis + Schema Documentation) — Location: Home
**Focus:** Comprehensive database schema documentation, real Supabase verification, gap analysis for pipeline streamlining
**Done:**
- Created `docs/SCHEMA.md` — full schema reference with all 15 tables, 10 RPCs, 5 trigger functions, 4 live triggers, migration history, key queries, and 5 known issues (no secrets)
- Verified all DB objects directly via Supabase Management API (PAT from `.env.local`)
- Confirmed `flagged_psids`, `bill_print_log`, `payment_summary` tables do NOT exist
- Confirmed `trg_payment_history_refresh_summary` trigger + `refresh_payment_summary()` function exist but target table missing — production blocker
- Confirmed `get_billing_summary` and `get_billing_group_stats` RPCs reference dropped `bill_items`
- Discovered 490 orphaned PSIDs in payment_history (no matching survey_units)
- Discovered 39,948 survey_units with blank city_district (legacy import data)
- Confirmed `staff` and `profiles` both have 1 field_staff row each
- Added Schema & Supabase reference block to MASTER.md header
- Added `docs/MASTER.md` pointer for future session access
- AGENTS.md updated: removed `bill_items.tehsil` trigger reference, changed `import-lifecycle-data.py` to `enrich-survey-units.py`, removed stale trigger listing
**Key discoveries:**
- Geography suppressed at 2 boundaries: payment CSV→payment_history drops city/tehsil/uc, lifecycle XLSX→survey_units never refreshes geography during enrichment
- Source data is correct — the database implementation is what's lacking
- The broken trigger on payment_history is a production blocker (needs DROP before any other work)
- 3-city geography needs a computed `city` dimension: SARGODHA=SARGODHA::SARGODHA, BHALWAL=SARGODHA::BHALWAL, KHUSHAB=KHUSHAB::KHUSHAB
- Office PC has 3 scripts not in repo: `bill-extractor-v4.py`, `pdf-psid-extractor.py`, `pdf-bill-printer.py`
**Next session (in office):**
- Drop broken trigger on payment_history (#1 — production blocker, 10min)
- Start SQL migrations 022–024 for geography + pipeline tables
- Fix staff sync so assignments page works
- MC-17 test run if time permits: sync staff, verify enrichment, create assignment, test delivery flow

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
| 2026-05-30 | 14.0 | **Audit cleanup + global sort system + Data Insight/History UI fixes.** Audit: 3 empty catches, 3 unused icon imports, chunkArray/toEmail extraction, month array consolidation, `import * as React` removed, 2 dead SQL files archived, staleTime constants created. Payment History: column renamed "History", repositioned before Action, desktop spacing fixed (`justify-between` removed), right-aligned expanded content. Sep 2025 cap for unpaid months. HouseDetailSheet: PSID value-only (no label), Current Bill badge. DataInsight: CSS hide preserves drill-down state across view switches. MC/UC grouped numeric sort (MCs first). Global sort system: SortConfig type in FilterState, setSortConfig in billing-store, parseSort in both API routes, SortSelector component in DesktopFilterBar. Bug fix: `key={survey_id}` replaces `key={psid}` — fixes null-key warning + auto-expand bug. Note: `psid = null` = new/unregistered surveys. |
| 2026-05-30 | 15.0 | **Billing charts dashboard — RPC aggregation for 122K payment rows.** Created `get_charts_data` RPC in `021-charts-aggregation.sql` (EXISTS-based city/tehsil filtering, cumulative curves, cycle-relative day labels from 16th). Rewrote `/api/billing-charts` route to add `day_label` in TypeScript (display logic in TS, not SQL). Connected Dashboard to `useBillingCharts`. Fixed month sort (chronological via `sortMonths` helper). Fixed tooltip: daily amounts in table format. Removed broken `useBillingStats` dependency. All chart display changes now require only TS edits + server restart — no SQL changes needed. |
| 2026-05-30 | 16.0 | **Strategic planning: data accuracy + pipeline architecture.** Identified root cause of "Unknown" cities in Office Breakdown (payment_history lacks city/tehsil column → orphaned PSIDs → NULL in RPC join). Documented real data problem: govt survey app creates 20K+ orphaned PSIDs from deleted survey IDs. Strategy: 2-3 cycle cleanup via staff marking system + bill-printer metadata. Pipeline constraint: local scripts + app control (govt portal blocks external IPs). Added edge case #17. Updated Section 16 with DQ cleanup plan. AGENTS.md updated. |
| 2026-05-31 | 17.0 | **Database gaps report — 8 gaps blocking pipeline streamlining.** Payment_history lacks city/tehsil/uc_name (forces LATERAL join → "Unknown" bars). Dead trigger on payment_history (calls non-existent table). No computed city dimension for 3 cities. start_month never written. 0 pipeline tables (flagged_psids, bill_print_log, ingest_log). Dead RPCs referencing dropped bill_items. Staff/profiles disconnect. Enrich script doesn't write geography. docs/SCHEMA.md created. AGENTS.md updated to remove stale references. See Section 16. |
| 2026-06-01 | 18.0 | **Office: Pipeline overhaul — migrations 022-028 applied, geography fixed, scripts enriched, charts polished. Home: Mobile responsiveness fixes.** Office: Phase 1 reference scripts copied, enrich-survey-units/load-payments/ingest-all rewritten, dead trigger+RPCs dropped, payment_history+city geography added, pipeline tables created, charts polished (5 components), bill-info API created, HouseDetailSheet bill summary. Home: page scroll chain (map/page.tsx `min-h-0 h-full`), tab bar overflow (dashboard.tsx `overflow-x-auto`), city filter wrapping (office-breakdown.tsx). |
| 2026-06-02 | 19.0 | **MASTER.md overhaul — Vision section, comprehensive data model, edge cases, stale reference cleanup.** Added detailed Vision section (S1) with app overview, UX modes, monthly workflow, pipeline, DQ strategy. Expanded Data Model (S3, S6) with complete survey_units columns, payment_history, house_corrections, delivery tables, pipeline tables, `updated_at` columns. Replaced stale bill_items references throughout. Added 5 new edge cases (#18-#22): QR mismatch, silent GPS failure, offline photo sync, mid-cycle staff replacement, route conflict. Updated DB triggers, bill_months source, survey_units column listing. Changelog updated to v19.0. |
| 2026-06-03 | 20.0 | **Architecture Improvement Plan (R.1–R.5) complete.** Security guard (`server-only`), Zod validation layer (9 schemas, 5 routes), repository layer (4 repos, 6 routes slimmed 80%), Supabase SSR middleware (7 protected routes), stats server component split. Phase B1 marked done. Phase B2 (QR + HDS delivery) is next. Build verified: `tsc` zero errors, `build` successful. |
| 2026-06-03 | 21.0 | **Phase B2 delivery flow — unified mobile UI, shared markers, UnitDeliverySheet, staff stats.** Delivery key changed from `survey_id` to `psid`. Shared `createMarkerIcon` in `src/lib/markers.ts` used by admin + staff maps. UnitDeliverySheet redesigned: full-bleed hero, overlaid info+buttons, nav arrows, touch swipe. FlyToTarget + satellite toggle on StaffMap. Stats page for field_staff (`/stats`). Deliver page redesigned: compact paginated list. QR scanner z-index + guard fix. 4 stale files deleted. B2 steps B.13-B.21 marked ✅; B.10-B.12 remain 🔲. Build verified: `tsc` zero errors, `build` successful. |

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

---
## 16. Database Gaps Report (2026-05-31)

**Context:** 3 cities — SARGODHA (district+tehsil), KHUSHAB (district+tehsil), BHALWAL (tehsil under SARGODHA district). Source data from SWMC portal is correct; the implementation to Supabase is where design and logic fall short.

### Verified DB State

| Metric | Value |
|--------|-------|
| survey_units total rows | 212,428 |
| survey_units distinct PSIDs | 207,746 |
| survey_units NULL psid (new/unregistered surveys) | 4,682 |
| survey_units blank city_district / UNKNOWN tehsil | 39,948 |
| payment_history rows | 122,199 |
| payment_history distinct PSIDs | 60,908 |
| Orphaned PSIDs (payment_history only, no survey_units match) | 490 |
| field_staff in profiles (role_id=3) | 1 |
| staff table rows | 1 |

### Gap #1: Broken Trigger on payment_history (PRODUCTION BLOCKER)

`trg_payment_history_refresh_summary` fires on every INSERT/UPDATE/DELETE on `payment_history`, calling `refresh_payment_summary()` function. The `payment_summary` table **does not exist** — any mutation on payment_history throws error.
**Fix:** DROP the trigger and function immediately.

### Gap #2: Missing Geography Columns on payment_history

Payment CSV has City, Tehsil, UC, District, but `bill-extractor-v4.py` only upserts (psid, bill_month, amount_paid, paid_date, payment_method, status, fine). Geography is dropped on import.
**Consequence:** Charts RPC must LEFT JOIN LATERAL to survey_units via psid. Orphaned PSIDs (490) produce NULL tehsil → "Unknown" bars in Office Breakdown.
**Fix:** Migration 022: add `city`, `tehsil`, `uc_name` to `payment_history`. Update `bill-extractor-v4.py` to include them. Update `get_charts_data` RPC to use `ph.tehsil` directly, eliminating the LATERAL join.

### Gap #3: No Computed `city` Dimension (3-Value Normalization)

`survey_units.city_district` + `tehsil` encode 3 cities but every query must replicate the derivation logic. The app hardcodes `CITY_CONFIG` mapping. 39,948 rows have blank/UNKNOWN geography.
**Fix:** Add a `city` column (computed or enriched) to `survey_units` and `payment_history`:
| city_district | tehsil | → city |
|---|---|---|
| SARGODHA | SARGODHA | SARGODHA |
| SARGODHA | BHALWAL | BHALWAL |
| KHUSHAB | KHUSHAB | KHUSHAB |
| (other) | UNKNOWN | UNKNOWN |

### Gap #4: `start_month` Never Written to survey_units

Lifecycle XLSX has "Start Month" column. `enrich-survey-units.py` ignores it. App uses 24-month rolling lookback as fallback.
**Fix:** Add `start_month` column to `survey_units`. Update enrich script to upsert it. PaymentHistoryCard can use it instead of the fallback.

### Gap #5: Zero Pipeline Orchestration Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `flagged_psids` | Staff marks ghost/duplicate PSIDs for 2-3 cycle cleanup | **Does not exist** |
| `bill_print_log` | pdf-bill-printer metadata (PSID→survey_id→PDF page mapping) | **Does not exist** |
| `ingest_log` | Pipeline audit trail (files processed, row counts, errors per run) | **Does not exist** |

### Gap #6: Dead RPCs Referencing Dropped `bill_items`

| Object | Issue |
|--------|-------|
| `get_billing_summary()` RPC | References `bill_items` — dropped in storage crisis (v7.0) |
| `get_billing_group_stats()` RPC | References `bill_items` — same issue |
| `set_bill_items_tehsil()` function | References `bill_items` — may still exist as dead code |

### Gap #7: Staff Table / Profiles Disconnect

RBAC creates users in `profiles` (role_id=3). Staff table has 2022-2023 data with different columns. `/api/staff` and `/api/assignments` query `staff` → incomplete/empty results. **Decision needed:** retire `staff` and use `profiles` directly, or keep `staff` synced as a view.

### Gap #8: Enrich Script Doesn't Refresh Geography

`enrich-survey-units.py` writes: psid, monthly_fee, billing_category, amount_due, arrears, route_name, route_seq, current_bill_month. It does NOT write: city_district, tehsil, uc_name, consumer_name, address — even though lifecycle XLSX likely has these. This means geography is set once during initial survey import and never refreshed. The 39,948 UNKNOWN rows are a symptom.

### Summary — Priority-Ordered Fix List (as of 2026-06-01)

| # | Area | Fix | Est. | Status |
|---|---|---|---|---|
| 1 | **Dead trigger** (CRITICAL) | DROP `trg_payment_history_refresh_summary` + `refresh_payment_summary()` | 10min | ✅ Done (022) |
| 2 | **Payment geography** | Migration 023: add city/tehsil/uc_name to payment_history + update RPC + update script | 30min | ✅ Done (023) |
| 3 | **City dimension** | Add `city` column to survey_units + payment_history (computed 3-value) | 15min | ✅ Done (024) |
| 4 | **Start month** | Add `start_month` to survey_units + enrich script | 20min | ✅ Done (028) |
| 5 | **Dead RPCs** | DROP dead RPCs referencing bill_items | 10min | ✅ Done (025) |
| 6 | **Staff sync** | Sync staff from profiles via trigger | 30min | ✅ Done (026) |
| 7 | **Pipeline tables** | CREATE flagged_psids, bill_print_log, ingest_log | 20min | ✅ Done (027) |
| 8 | **Enrich script** | Update enrich-survey-units.py to write full 21 fields including geography | 30min | ✅ Done |
| 9 | **Payment script** | Update bill-extractor-v4.py to include city/tehsil/uc_name | 20min | ⏳ Pending |
| 10 | **updated_at** | Add updated_at column to payment_history | 5min | ⏳ Pending |
| | **Total** | | ~3 hrs | **~2.5 hrs done** |

**Core insight:** The source data is correct, but the database schema suppresses geography at two boundaries: (1) payment CSV → payment_history drops city/tehsil/uc on import, (2) lifecycle XLSX → survey_units never refreshes geography during enrichment. Adding these columns and normalizing the 3-city dimension makes the geography pipeline self-correcting with every monthly import.

### 2026-06-01 (First Session — Data Insight Timeout Fix)
**Focus:** Fix `get_hierarchy_stats` RPC timeout on 212K-row scan
**Done:**
- Created indexes: `idx_survey_units_psid`, `idx_payment_history_month_psid`, `idx_survey_units_curr_month`, `idx_survey_units_lower_uc`, `idx_survey_units_status`
- Removed `AND ph.psid IN (SELECT psid FROM base)` from `pays` CTE — caused a correlated subquery evaluating 125K payment rows × 212K base rows
- RPC returned in <3s
- Standardized DB execution pattern documented

### 2026-06-01 (Second Session — Complete Pipeline Fix)
**Focus:** Fix data accuracy (status bug) + rebuild RPC with pre-computed cache
**Data verification:** Traced MC-1 Sargodha counts across all sources:
- Survey master (`ALL_DISTRICTS_TEHSILS_MASTER.xlsx`): **6,965** active survey IDs (ground truth)
- Lifecycle XLSX (deleted=NO): 6,566 active
- `survey_units` DB (before fix): 6,293 active — **582 missing, plus stuck ARCHIVED statuses**
- `survey_units` DB (after fix): 6,293 active (status fix applied, but lifecycle-only records persist)

**Enrich script bug found:** Line 262 — `if data["status"]:` guard prevented clearing ARCHIVED status when a record was re-activated. Fixed: always set `rec["status"]`, even when None.

**RPC rewrites:**
- Created `hierarchy_summary` table (~300 rows pre-computed UC-level aggregates per month)
- Created `refresh_hierarchy_summary()` function (populates cache in ~13s)
- Rewrote `get_hierarchy_stats` to read from cache → **0.98s response** (14x improvement over 14s full scan)
- Fixed enrich script diff query batch size (5000→1000 to avoid "JSON could not be generated" error)
- Updated `scripts/sql/019-aggregation-rpcs.sql` with new cache table + functions
- Buildup: Fixed enrich script → re-ran enrichment → created cache → rewrote RPC → verified MC-1
- KPI results: 212,428 total, 164,606 active, 47,822 archived, 40,517 no_coords, 115 surveyors, 2,966 paid, $1,999,908 total collected

**Known issue:** `unique_surveyors` KPI is SUM of per-UC counts (1,253) instead of DISTINCT (115). Per-UC row-level surveyor counts are accurate. Full DISTINCT count would require scanning 212K rows, defeating the cache. Acceptable trade-off for <1s response.

### 2026-06-01 (Third Session — DB Size Crisis + Cleanup)
**Focus:** DB jumped from 252 MB → 408 MB (approaching 500 MB free tier limit)
**Root cause:** Years of duplicate indexes from migrations that created new indexes without dropping old ones. Also MVCC bloat from the 207K-row enrichment upsert.
**diagnosis:**
- `survey_units`: 315 MB (202 MB table + 113 MB indexes) — 7 duplicate/unused indexes identified
- `payment_history`: 81 MB (32 MB table + 49 MB indexes) — 1 duplicate index identified
- TOAST tables negligibly small (8 KB each)

**Dropped 9 indexes:**
| Index | Size | Why |
|---|---|---|
| `idx_survey_psid_unique` | 16 MB | 3rd psid index, 2 scans ever |
| `idx_survey_psid` | 16 MB | Duplicate of `idx_survey_units_psid` |
| `idx_survey_tehsil` | 6.3 MB | Duplicate of `idx_survey_units_tehsil` |
| `idx_survey_district` | 6 MB | Duplicate of `idx_survey_units_city_district` |
| `idx_survey_status` | 6.2 MB | Duplicate of `idx_survey_units_status` |
| `idx_survey_uc` | 6.1 MB | Replaced by `idx_survey_units_lower_uc` |
| `idx_survey_units_curr_month` | 3.8 MB | 0 scans (RPC now uses hierarchy_summary cache) |
| `idx_survey_units_surveyor_name` | 1.5 MB | 1 scan (created for removed subquery) |
| `idx_payment_psid_month` | 12 MB | Duplicate of UNIQUE key + `idx_payment_history_month_psid` |
| **Total** | **~74 MB** | |

**VACUUM FULL** `survey_units` — reclaimed dead tuple space from the upsert (separate curl call, outside transaction).

**Result: 408 MB → 199 MB** (209 MB reclaimed, 301 MB headroom on 500 MB limit)

### 2026-06-01 (Fourth Session — Data Insight Drill-Down Fix + More VACUUM FULL)
**Focus:** Fix UC name casing in Data Insight drill-down and reclaim remaining MVCC bloat from earlier UPDATEs

**Problems fixed:**
- **Drill-down returning 0 records** — UC names in DB are UPPERCASE (converted from earlier session) but `data-insight/route.ts:38` lowercased drill param with `.toLowerCase()`. Unit-level query `.eq('uc_name', drillUC)` searched for lowercase against UPPERCASE — 0 matches.
- **No index on raw `uc_name`** — seq scan of 212K rows took 9.7s. Existing `idx_survey_units_lower_uc` (functional index on `lower(TRIM(BOTH FROM uc_name))`) works but `supabase-js .filter()` can't pass SQL expressions to PostgREST.

**Done:**
1. **Removed `.toLowerCase()`** from route.ts:38 — drillUC preserves UPPERCASE from RPC, matches DB values
2. **VACUUM FULL survey_units** — reclaimed 105 MB of MVCC bloat from earlier 212K UPPERCASE conversion UPDATE. Table went 202 MB → 97 MB (96% live data)
3. **VACUUM FULL payment_history** — reclaimed 44 MB bloat. 85 MB → 41 MB
4. **DB total: 343 MB → 170 MB** (saved 173 MB)

**Remaining issue:** Seq scan on `.eq('uc_name', drillUC)` takes 3.9s for largest UC (MC-2, 5,851 rows). Could add RPC `get_units_for_drilldown` to use functional index for sub-second performance if needed.

**Key lesson:** Management API wraps queries in transactions — VACUUM FULL must be a SINGLE statement curl call. `VACUUM FULL survey_units; VACUUM FULL payment_history;` (two statements) fails. Two separate calls succeed.

### 2026-06-01 (Office Session — Pipeline Overhaul + Geography Fix + Charts Polish) — Location: Office
**Focus:** Run migrations 022-028, fix geography pipeline, copy source scripts, polish charts UI, create bill-info API
**Done:**

**Phase 1 — Copy reference scripts from Office PC (5 scripts):**
- `scripts/ref/bill-extractor-v4.py` (489 lines) — daily payment CSV fetcher from SWMC portal
- `scripts/ref/pdf-psid-extractor.py` (850 lines) — monthly A4 PDF → lifecycle XLSX extractor
- `scripts/ref/survey_filtered.py` (830 lines) — survey data from portal
- `scripts/ref/pdf-bill-printer.py` — updated A5 print PDF generator
- `scripts/ref/config.py` (78 lines) + `scripts/ref/generate_category_fallbacks.py` (116 lines)
- All 5 reference scripts verified with commit `c19c87f`

**SQL Migrations 022-028 — Applied to Supabase:**
- `022-drop-dead-payment-trigger.sql` — DROP `trg_payment_history_refresh_summary` + `refresh_payment_summary()` function (production blocker fixed)
- `023-add-payment-geography.sql` — `ALTER TABLE payment_history ADD COLUMN city_district text, tehsil text, uc_name text`. Backfilled 122K rows from `survey_units` via psid join. Created `idx_payment_city`, `idx_payment_tehsil` indexes
- `024-add-city-dimension.sql` — `ALTER TABLE survey_units ADD COLUMN city text`, `ALTER TABLE payment_history ADD COLUMN city text`. Backfilled computed 3-value dimension (SARGODHA=SARGODHA::SARGODHA, BHALWAL=SARGODHA::BHALWAL, KHUSHAB=KHUSHAB::KHUSHAB, else UNKNOWN). Created `idx_payment_city_v2`, `idx_survey_city` indexes. Geography pipeline now self-correcting with every monthly import
- `025-drop-dead-rpcs.sql` — DROP `get_billing_summary`, `get_billing_group_stats`, `set_bill_items_tehsil` (all referenced dropped `bill_items`)
- `026-staff-sync-trigger.sql` — `trg_sync_profile_to_staff` on `profiles` INSERT/UPDATE/DELETE: auto-creates/updates/deactivates `staff` rows for `field_staff` profiles
- `027-pipeline-tables.sql` — created `flagged_psids` (ghost marking), `bill_print_log` (printer metadata), `ingest_log` (audit trail) with indexes + RLS
- `028-start-month.sql` — `ALTER TABLE survey_units ADD COLUMN start_month text`. Indexed. Enables precise billing history display

**Pipeline scripts updated (Phases 2/3/5):**
- `enrich-survey-units.py` — 12 new fields added: consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status (ARCHIVED if Deleted=Yes). Includes `--exclude-ghosts` flag, diff report, reference table sync, audit log
- `load-payments.py` — reads combined payment CSV, upserts to `payment_history` on `(psid, bill_month)` conflict key. Includes city_district, tehsil, uc_name from CSV columns. Idempotent, batch upsert (500), audit log
- `ingest-all.py` — interactive menu: [1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit. CLI: `--month`, `--daily`, `--file`, `--dry-run`. Sequential orchestration, error handling, combined audit log

**Charts dashboard polish:**
- `chart-stats-panel.tsx` — new reusable component for chart stat badges (replaces inlined HTML in all chart files)
- `category-breakdown.tsx` — refactored with chart-stats-panel, codelen icons, bottom total row, legend formatter
- `monthly-curves.tsx` — refactored with chart-stats-panel, tooltip as separate CustomTooltip, Brush at bottom, legend with color dots
- `monthly-trend.tsx` — refactored with chart-stats-panel, month-axis tick rotation, ResponsiveContainer height
- `office-breakdown.tsx` — major refactor: chart-stats-panel, city filter buttons, sticky first column with left-0 bg-card z-10, overflow-x-auto table scroll, month label bars
- `dashboard.tsx` — refactored with chart-stats-panel, tab bar responsive, KPI cards with compact grid

**Frontend additions:**
- `GET /api/surveys/[survey_id]/bill-info` — new endpoint returning bill number within UC, route info, paid months, current month status
- `src/types/index.ts` — `BillInfo`, `ChartStatsPanelItem` types added
- `src/hooks/use-survey-data.ts` — `useSurveyBillInfo` hook added
- `src/components/house-detail-sheet.tsx` — Bill Summary section with live data (bill #N/M, route name, paid months, current month badge)
- `src/lib/constants.ts` — `CHART_COLORS`, `MONTHS`, `MONTH_COLORS` consolidated
- All changes pass `npx tsc --noEmit` with zero errors

**Key decisions:**
- `payment_history` now has independent geography (city_district, tehsil, uc_name, city) — no LATERAL join needed for charts
- 3-value city dimension is a computed column — normalized on every migration/import
- Dead trigger + 3 dead RPCs finally removed — no more PAYMENT_HISTORY mutation errors
- Pipeline pipeline complete: source scripts copied, ingest scripts written, orchestrator built
- Remaining work: Phase 2b (drop amount_due), Phase A (Admin Assignment UI), Phase B (Field Staff Delivery UI), Phase C (Admin Dashboard), **Phase E (Flag Management UI)**, Phase Z (Audit Cleanup)

### 2026-06-01 (Mobile Responsiveness Fixes) — Location: Home
**Focus:** Fix page scrolling, tab overflow, and city filter wrapping on mobile
**Done:**
- Fixed page scroll: Added `min-h-0 h-full` to `div.flex-1.relative` in `map/page.tsx:34` — constrains Dashboard height so `overflow-y-auto` activates
- Fixed tab overflow: Added `overflow-x-auto` to tab bar in `dashboard.tsx:175` — 4 tabs (~500px) now scrollable on iPhone SE (375px)
- Fixed filter wrapping: Removed `overflow-hidden` from city filter container in `office-breakdown.tsx:115` — `flex-wrap` now works without clipping wrapped button rows
- All 3 changes pass `npx tsc --noEmit` with zero errors

### 2026-06-02 (Flagged Data Pipeline + Active/Archived/Duplicates Toggle + Phase E Planning) — Location: Remote
**Focus:** Fix Active toggle (was showing all units instead of active-only), add Duplicates toggle, add flagged_entries to API, plan Phase E

**Done:**

**Active/Archived toggle fix:**
- Replaced `archived` boolean with `status` string param (`'active' | 'archived' | 'duplicates'`) in Data Insight hook, route, and component
- Default is `'active'` — unit table now correctly filters to only active units (was showing all)
- `get_hierarchy_stats` RPC: added `status_filter` CTE and `p_status = 'ARCHIVED'` handling for KPI calculations
- Unit query filter changed from `.eq('status', 'ARCHIVED')` to `.not('status', 'is', null).neq('status', 'ACTIVE')` to match cache's archive definition
- RPC applied to Supabase via Management API

**Duplicates toggle (third button in Data Insight):**
- `src/app/api/data-insight/route.ts` — when `status = 'duplicates'`, filters unit query to only `survey_id` values present in `flagged_psids` with `psid_duplicate_*` reasons
- `src/components/data-insight.tsx` — third toggle button `[Active | Archived | Duplicates]`, Flag column shown in both Archived and Duplicates views via `showFlag` prop
- Flagged data now fetched for both archived AND duplicates views

**Flagged data API response:**
- Added `flagged_entries` array to each unit row in Data Insight API response (all entries, not just the summary)
- `src/components/data-insight.tsx` — Flag badge is now a clickable button that expands/collapses to show the other PSIDs list (same design as HouseDetailSheet)

**Phase E added to MASTER.md:**
- Added Phase E (Flag Management UI, ~4 hrs) to Section 10 — `/flagged-units` page, resolve/confirm/note actions
- Added to Total Estimate Breakdown and Execution Order
- E.6: "Flag for Review" button on HouseDetailSheet
- E.7: `staff_flagged` support in enrichment pipeline

**Key decisions:**
- Flag Management UI is Phase E, ordered after Phase C (Dashboard) and before Phase Z (Cleanup)
- Phase 2b (drop amount_due) is still deferred — quick, independent step that can be done anytime
- All changes pass `npx tsc --noEmit` and `npm run build` with zero errors

**Next session:**
- Phase 2b (drop amount_due, ~30 min) or Phase R.1 (Security Guard, 15 min)

---

### 2026-06-02 (Phase E Complete + Data Layer Audit + Architecture Plan) — Location: Remote
**Focus:** Complete flag management UI, audit data layer, fix status filter bugs, propose architecture improvements
**Done:**

**Phase E complete (E.1–E.6):**
- `GET /api/admin/flagged-psids` — paginated, filterable by reason/city/date/search, `?stats=true` for KPIs
- `POST /api/admin/flagged-psids` — create new flagged entry
- `PATCH /api/admin/flagged-psids/[id]` — resolve, update notes, change reason, set resolution
- `/flagged-units` page — KPI bar by reason type, filter bar, table with action badges, Resolve/Note/Keeper modals, PaginationBar
- "Flag for Review" button on HouseDetailSheet — creates `staff_flagged` entry
- `src/hooks/use-admin-flagged-psids.ts` — `useFlaggedPsids`, `useFlaggedPsidsStats`, `useResolveFlagged`
- E.7 cancelled — `staff_flagged` entries created in-app, not via pipeline

**Data layer audit and fixes:**
- Created `src/lib/queries/` shared modules: `constants.ts` (SURVEY_UNIT_COLS, STALE_TIMES), `survey-units.ts` (applyActiveFilter, applyArchivedFilter, selectUnitCols), `pagination.ts` (parsePagination, applyPagination)
- Fixed status filter in 3 route files: changed `.eq('status', 'ACTIVE')` to `applyActiveFilter()` — now includes 159K null-status enriched units
- Fixed `select('*')` violations in 3 route files (flagged-psids routes, staff performance) — explicit column constants
- Fixed auth-store: removed direct `supabase.from('profiles')`, created `GET /api/auth/profile` endpoint
- Fixed `roles` data shape bug in auth/profile route (was typed as array but returned as object — caused all users to get `'staff'` role)
- Fixed `useSurveyById` — added `staleTime: 5 * 60 * 1000`
- Fixed assignments Mode 1: replaced broken `.select('uc_name').limit(20000)` with `hierarchy_summary` — returns all 226 UCs correctly
- Updated AGENTS.md with 8 Data Layer Rules
- Updated MASTER.md section 1.6 (Data Layer Architecture)

**Architecture research:** Analyzed industry standard backend-only data access pattern. Documented current assessment and 5-phase improvement plan (R.1–R.5).

**Key decisions:**
- Repository layer will prevent duplicate query bugs (3 real bugs found in Phase E)
- `server-only` guard is the highest priority (15 min, zero risk)
- Phase E.7 cancelled — no pipeline changes needed for staff_flagged
- All changes pass `npx tsc --noEmit` with zero errors

---

## 17. Architecture Improvement Plan

**Goal:** Adopt industry-standard backend-only data access, repository layer, and Zod validation. Prevent the bug class that caused 3+ data layer bugs in Phase E (wrong status filter, `select('*')`, assignments Mode 1 broken).

**Current architecture assessment:**

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Backend-only data access** | ✅ Already in place | All 22 API routes use server-side Supabase client. Zero direct `supabase.from()` in client code. |
| **Service_role isolation** | ✅ `admin.ts` exists | `createAdminClient()` with service_role key, auto-refresh/persistence disabled. |
| **Shared query modules** | ✅ `src/lib/queries/` | `constants.ts`, `survey-units.ts`, `pagination.ts` — started but not used by all routes. |
| **Explicit staleTime** | ✅ All 15 hooks | Using `STALE_TIMES` constants from `constants.ts`. |
| **Column constants** | ✅ In all routes | No `select('*')` anywhere (after Phase E fixes). |
| **Build-time guard** | ❌ Missing | No `server-only` import guard on `admin.ts` / `server.ts`. |
| **Validation layer** | ❌ Missing | All validation is manual `if (!x) return error`. No Zod. |
| **Repository layer** | ❌ Missing | Query logic duplicated across routes. 3 real bugs caused by this. |
| **Server Components** | ❌ Not used | All 9 pages are `'use client'`. Read-only pages fetch via hooks unnecessarily. |
| **Middleware** | ❌ Missing | Route protection done inline in every page, no session refresh middleware. |

### Phase R.1 — Security Guard (15 min)

Add `server-only` package to prevent accidental service_role key imports in client bundles.

**Changes:**
- `npm install server-only`
- Add `import 'server-only'` to `src/lib/supabase/admin.ts` and `src/lib/supabase/server.ts`
- Produces **build-time error** if any client component imports these files

**Files:** `package.json`, 2 supabase files  
**Risk:** None — zero behavior change, build-time only

### Phase R.2 — Zod Validation Layer (1 hr)

Install Zod, create shared validation schemas, add `validateQuery()` helper to every API route.

**Changes:**
- `npm install zod`
- Create `src/lib/validation/schemas.ts` — `paginationSchema`, `statusFilterSchema`, `dateRangeSchema`, `hierarchyFilterSchema`
- Create `validateQuery(request, schema)` — returns typed params or `NextResponse.json({ error }, 400)`
- Update 5 high-traffic routes: `surveys`, `assignments`, `data-insight`, `admin/flagged-psids`, `billing-stats`

**Pattern:**
```typescript
const params = validateQuery(request, z.object({
  district: z.string().optional(),
  status: statusFilterSchema.optional(),
  page: paginationSchema.shape.page,
}))
if (params instanceof NextResponse) return params
// params is now typed, validated — use in query
```

### Phase R.3 — Repository Layer (2 hr)

Extract inline query logic into domain-specific repository files. Each exports pure functions accepting `SupabaseClient<Database>`.

**Why:** Every bug we fixed in Phase E (status filter wrong in 3 routes, `select('*')` in 2 routes, assignments Mode 1 broken) was caused by **duplicate inline query logic**. A repository layer means **one function** per query pattern used by every API route.

**New files in `src/lib/repositories/`:**

| File | Functions | Migrates inline logic from |
|------|-----------|---------------------------|
| `survey-repository.ts` | `getSurveys()`, `getSurveyById()`, `getSurveyPayments()`, `getSurveyBillInfo()` | `surveys/route.ts`, `surveys/payments/route.ts`, `surveys/[id]/bill-info/route.ts` |
| `assignment-repository.ts` | `getUcTotals()`, `getStaffList()`, `getUnassignedBills()`, `getStaffAssignment()`, `createAssignment()`, `markItem()` | `assignments/route.ts`, `assignments/items/route.ts` |
| `data-insight-repository.ts` | `getHierarchyStats()`, `getDeliveryKpis()`, `getFlaggedBreakdown()` | `data-insight/route.ts` |
| `flagged-psids-repository.ts` | `getFlaggedPsids()`, `getFlaggedPsidsStats()`, `createFlagged()`, `updateFlagged()` | `admin/flagged-psids/route.ts`, `admin/flagged-psids/[id]/route.ts`, `flagged-psids/route.ts` |

**Route files become thin HTTP wrappers:**
```typescript
// Before: 60+ lines of inline query + chunking + filtering
// After:
export async function GET(request: NextRequest) {
  const sup = await createClient()
  const params = validateQuery(request, surveyFilterSchema)
  if (params instanceof NextResponse) return params
  const result = await getSurveys(sup, params)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
```

**Risk:** Medium — each route must be converted one at a time and verified. Route tests recommended before/after.

### Phase R.4 — Server Component Conversion (2 hr)

Convert read-heavy pages to Server Components. Interactive parts (maps, forms, charts) stay client-side.

**Conversion candidates:**

| Page | Strategy | Effort |
|------|----------|--------|
| `/stats` | Page shell → Server Component. Fetch data server-side, pass to chart components via props. Filters/charts remain client. | 45 min |
| `/route` | If read-only tree view, convert entirely. | 15 min |
| `/settings` | Stays client (form-heavy). | Skip |
| `/map`, `/deliver`, `/assignments`, `/flagged-units` | Add `<Suspense>` boundaries. Move initial fetch to server data props. | Low priority |

**Pattern:**
```typescript
// src/app/stats/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { getHierarchyStats } from '@/lib/repositories/data-insight-repository'
import { StatsClient } from './stats-client'

export default async function StatsPage() {
  const sup = await createClient()
  const initialData = await getHierarchyStats(sup, { billMonth: currentMonth() })
  return <StatsClient initialData={initialData} />
}
```

### Phase R.5 — Middleware & Route Protection (1 hr)

Add `src/middleware.ts` for:
1. **Session refresh** — Supabase SSR middleware pattern (refreshes auth cookies on every request)
2. **Route protection** — redirect unauthenticated users from protected routes to `/login`
3. **Role-based redirect** — redirect `field_staff` away from admin-only pages (`/assignments`, `/flagged-units`)

**Files:** 1 new file + remove inline auth checks from page components  
**Risk:** Low — middleware is additive, inline auth checks removed gradually

### Summary

| Phase | Time | Value | Risk |
|-------|------|-------|------|
| R.1 Security Guard | 15 min | 🔒 Build-time safety | None |
| R.2 Zod Validation | 1 hr | 🛡️ Type safety, consistent 400 errors | Low |
| R.3 Repository Layer | 2 hr | 🎯 **Prevents entire bug class** | Medium |
| R.4 Server Components | 2 hr | ⚡ Smaller client bundles, less JS | Low-Medium |
| R.5 Middleware | 1 hr | 🔐 Auth consistency, cleaner pages | Low |
| **Total** | **~6 hrs** | | |

**Recommendation:** Do R.1 first (15 min, zero risk). Then R.2+R.3 together (one domain at a time, starting with flagged-psids). Then R.5. Then R.4 last.

---

## 18. Delivery Workflow Detail

### 18.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ OFFICE PC (Monthly 16th-20th)                                   │
│                                                                 │
│  pdf-psid-extractor.py → lifecycle XLSX (57 cols)              │
│  pdf-bill-printer.py → A5 printed bills with QR codes          │
│       QR contains: sid={survey_id}                              │
│  enrich-survey-units.py → survey_units (21 fields)             │
│  load-payments.py → payment_history                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼  Staff picks up printed bills, sorted by UC
         │
┌─────────────────────────────────────────────────────────────────┐
│ STAFF DEVICE (Daily)                                            │
│                                                                 │
│  Open /deliver → sees assignment list for today                 │
│    ├─ Tap QR scan button (floating, bottom-right)               │
│    │    → Camera opens → scan QR on physical bill               │
│    │    → QR contains sid={survey_id}                           │
│    │    → App matches survey_id to assignment_items             │
│    │    → HouseDetailSheet opens for that unit                  │
│    │                                                             │
│    ├─ "Take Picture" in HouseDetailSheet                        │
│    │    → Native camera opens                                   │
│    │    → Staff takes photo → presses OK                        │
│    │    → On confirm:                                            │
│    │         GPS captured (navigator.geolocation)               │
│    │         Timestamp captured (server-side)                   │
│    │         POST /api/deliveries/mark                          │
│    │         assignment_items.status = 'delivered'              │
│    │         delivery_photos row created                        │
│    │         Progress bar updates in /deliver                   │
│    │    → Same view stays open for next scan                    │
│    │                                                             │
│    ├─ "Navigate" in HouseDetailSheet                            │
│    │    → Shows staff GPS vs house marker on map                │
│    │    → Distance displayed                                    │
│    │    → Google Maps directions deep link                      │
│    │    → Manual pin drop: corrects house coordinates            │
│    │       Saved to house_corrections                           │
│    │                                                             │
│    ├─ "Flag" in HouseDetailSheet                                │
│    │    → Text notes field                                      │
│    │    → POST /api/flagged-psids (reason='staff_flagged')      │
│    │    → Admin resolves via Flag Management UI                 │
│    │                                                             │
│    └─ "Missed" in HouseDetailSheet                              │
│         → Reason input                                          │
│         → GPS captured                                          │
│         → assignment_items.status = 'missed'                    │
│                                                                 │
│  Progress bar: Delivered X / Y                                  │
│  List view: card list with status badges                        │
│  Stats view: today's delivery rate, pending units               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼  After 2 billing cycles
         │
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN (Route Stabilization)                                     │
│                                                                 │
│  Run "Stabilize Routes":                                        │
│    1. Query assignment_items ordered by delivered_at            │
│       → Per-staff, per-UC delivery sequence                    │
│    2. Compare month 1 vs month 2 sequences                      │
│       → Consensus = stable route order                          │
│    3. Write route_seq to survey_units                           │
│    4. Next month's paper bills sorted by route_seq              │
│    5. New staff inherits existing route — immediate onboarding  │
└─────────────────────────────────────────────────────────────────┘
```

### 18.2 Component Ownership

| Component | Role | Deliver Button? |
|-----------|------|----------------|
| **HouseDetailSheet** (`house-detail-sheet.tsx`) | Shows unit details. Owns the "Take Picture" deliver flow. Has "Navigate", "Flag", "Missed" buttons. | ✅ Yes |
| **DeliverBottomSheet** (`deliver-bottom-sheet.tsx`) | On /deliver page. Shows unit in assignment context. Also has camera + mark delivered (secondary path). | ✅ Yes |
| **DeliverMap** (`deliver-map.tsx`) | Map view of assigned markers on /deliver page. | ❌ (opens HDS on tap) |
| **DeliverCardList** (`deliver-card-list.tsx`) | Card list on /deliver page. | ❌ (opens HDS on tap) |
| **QR Scanner** (new: `qr-scanner-modal.tsx`) | Floating button → camera viewfinder → scan → open HDS. | ❌ (scanner only) |
| **Map View** (`map-view.tsx`) | Admin/staff map. QR scan floating button. | ❌ (scan opens HDS) |

### 18.3 The `useDeliverUnit()` Hook (Shared)

To avoid duplicating the deliver logic, create a shared hook used by both HouseDetailSheet and DeliverBottomSheet:

```typescript
// Returns: { capturePhoto, markDelivered, markMissed, isUploading, isMarking }
function useDeliverUnit() {
  // 1. Open native camera → capture photo
  // 2. Compress to WebP 1024px
  // 3. Capture GPS (silent, enableHighAccuracy)
  // 4. POST /api/deliveries/mark with:
  //    { assignment_item_id, survey_id, psid, photo, gps_lat, gps_lng, status }
  // 5. Invalidate query keys: ['staff-assignment'], ['assignment-items']
  // 6. If offline: enqueue to IndexedDB photo queue
}
```

### 18.4 API Endpoints

| Endpoint | Method | Purpose | Called By |
|----------|--------|---------|-----------|
| `/api/deliveries/mark` | POST | Mark unit delivered/missed with photo + GPS | `useDeliverUnit()` hook |
| `/api/delivery/photos` | GET | Fetch delivery photos for a PSID | HouseDetailSheet |
| `/api/delivery/photos` | POST | Upload photo from GAS webhook | GAS webhook |
| `/api/hierarchy` | GET | MC/UC filter options | Filter panel |
| `/api/bill-months` | GET | Month filter options | Filter panel |
| `/api/surveys/[survey_id]/bill-info` | GET | Bill number, route, paid status | HouseDetailSheet |

### 18.5 Database Schema Changes (Required)

Add `survey_id` to `assignment_items` so QR scanning can match directly:

```sql
ALTER TABLE public.assignment_items
  ADD COLUMN survey_id text REFERENCES survey_units(survey_id);

CREATE INDEX IF NOT EXISTS idx_assignment_items_survey_id
  ON public.assignment_items(survey_id);
```

This enables the QR scan flow: scan `sid={survey_id}` → `SELECT * FROM assignment_items WHERE survey_id = ? AND status = 'pending'` → open HDS.

### 18.6 Stealth GPS + Timestamp Capture

**Design principle:** Staff does NOT know GPS is being captured. The UI shows only "Take Picture" → "Photo captured" → unit marked delivered. GPS + timestamp are captured in the same API call as the photo upload.

Implementation:
```typescript
async function captureDelivery(assignmentItemId: string, photoBlob: Blob) {
  // 1. Capture GPS (silent — no UI indicator)
  const gps = await new Promise<{lat: number; lng: number} | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),  // silent fail — don't block delivery
      { timeout: 5000, enableHighAccuracy: true }
    )
  })

  // 2. POST to API (server adds timestamp)
  const formData = new FormData()
  formData.append('photo', photoBlob)
  formData.append('assignment_item_id', assignmentItemId)
  if (gps) {
    formData.append('gps_lat', String(gps.lat))
    formData.append('gps_lng', String(gps.lng))
  }

  await fetch('/api/deliveries/mark', { method: 'POST', body: formData })
}
```

### 18.7 No Sequential Lock — Free-Form for First 1-2 Months

Staff is NOT forced to deliver in any specific order for the first 1-2 billing cycles. They walk their natural route. Their delivery timestamps (`assignment_items.delivered_at`) capture the actual walking sequence.

After 2 months:
1. Admin clicks "Stabilize Routes" in the app
2. System groups assignment_items by PSID across last 2 months
3. Orders by delivered_at consensus (the order they MOST OFTEN visited each house)
4. Writes the consensus sequence to `survey_units.route_seq`
5. Subsequent paper bills are printed in this route_seq order
6. Staff follows the sorted paper bill stack naturally

**Edge case:** If staff walks completely different routes in month 1 vs month 2, the system detects the conflict and asks admin to choose or manually reorder.

### 18.8 Key Database Queries

**Staff's today's assignment:**
```sql
SELECT ai.*, su.consumer_name, su.address, su.lat, su.lng
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
LEFT JOIN survey_units su ON su.survey_id = ai.survey_id
WHERE da.staff_id = ? AND da.assigned_date = CURRENT_DATE
ORDER BY ai.route_seq;
```

**Match QR scan to assignment:**
```sql
SELECT ai.* FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
WHERE ai.survey_id = ? AND da.staff_id = ? AND da.assigned_date = CURRENT_DATE
LIMIT 1;
```

**Route stabilization query:**
```sql
SELECT ai.survey_id, ai.psid, ai.gps_lat, ai.gps_lng,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ai.delivered_at)) as median_delivery_ts
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
WHERE da.assigned_date BETWEEN ? AND ?
  AND ai.status = 'delivered'
GROUP BY ai.survey_id, ai.psid, ai.gps_lat, ai.gps_lng
ORDER BY median_delivery_ts;
```

---
## Appendix C: Session Log

### 2026-06-02 — MASTER.md Overhaul (v19.0)

**Goal:** Update MASTER.md to reflect current state after 18 versions of development. Fix stale info, add missing sections, ensure accuracy as single source of truth.

**Changes:**
- **Section 1 (Vision):** Added comprehensive vision document with app overview, UX modes, monthly workflow, architecture principles, pipeline, DQ strategy, roadmap placeholder.
- **Section 3 (Data Model):** Expanded table listing with all survey_units columns, payment_history, house_corrections, delivery tables, pipeline tables. Added `updated_at` columns throughout.
- **Section 6 (Data Model DDL):** Added complete DDL for survey_units (including city, division, tehsil, current_bill_month, start_month), payment_history, house_corrections, daily_assignments, assignment_items, delivery_photos, staff_daily_stats, flagged_psids, bill_print_log, ingest_log. Created Subsection 6.3 (Delivery Tables) and 6.4 (Pipeline Tables).
- **Section 6.6 (Performance Indexes):** Created new subsection with all indexes from migrations 011-028.
- **Section 6.7 (Python Upsert):** Created new subsection documenting service_role pattern.
- **Section 8 (Performance Rules):** Updated to 11 rules covering `or()` filter pattern, explicit columns, `staleTime`, mutate-invalidate, column constants.
- **Section 9 (Edge Cases):** Added 5 new decisions: QR mismatch (#18), silent GPS failure (#19), offline photo sync (#20), mid-cycle staff replacement (#21), route conflict (#22).
- **Section 14 (Changelog):** Added v19.0 entry.
- **Stale reference cleanup:** Replaced all bill_items references with current state. Fixed "bill_months populated from bill_items" → payment_history. Fixed "bill_items.tehsil trigger" → removed. Fixed "start_month not stored" → stored since 028. Removed bill_items DDL, replaced with deprecation note. Added survey_id to assignment_items DDL.

**Key decisions:**
- QR scanner should silently record survey_id on assignment_items (enables staff to scan → deliver without manual PSID lookup)
- GPS failure during delivery = silent null GPS (photo timestamp is sufficient proof, but tracked as staff performance metric)
- Offline photos queued in IndexedDB, synced via GAS webhook
- Mid-cycle staff replacement = fresh assignments for remaining units, no transfer of partial completion
- Route conflict >20% = flagged for admin review, not auto-committed

### 2026-06-03 — Routes Tab Rewrite + 1000-Limit Fix — Location: Home

**Goal:** Fix route tree truncation (20K limit), build route-based assignment workflow, fix 1000-row PostgREST limit in tables.

**Done:**
1. **RPC `get_route_tree`** — `scripts/sql/029-route-tree-rpc.sql`. Returns distinct routes per city/UC with counts + `is_unrouted` flag. Replaces old `SELECT ... LIMIT 20000` approach (truncated routes past row 20K).
2. **`GET /api/routes` rewrite** — Mode 1 (route detail): batched PostgREST fetch, `surveyor_name/date/time` columns added. Mode 2 (tree): RPC with natural sort fallback.
3. **`GET /api/assignments` Mode 3** — Added `route_name` filter param. Sort: `survey_id DESC` for Create tab (no routeName), `route_seq ASC` for Routes tab (with routeName). Batched PostgREST to bypass 1000 max-rows.
4. **`confirm-dialog.tsx`** — Created global `ConfirmProvider` + `useConfirm()` promise-based hook. Added ESLint `no-restricted-globals` ban on native `confirm()`.
5. **Routes tab** — Two-panel layout: left sidebar (UC groups with collapsible route tree, Unrouted count, hide unrouted-only UCs), right panel reuses `UCDetailPanel` with `routeName` prop.
6. **UCDetailPanel** — Replaced PSID column with Address column. Accepts optional `routeName` prop. Pagination properly handles large datasets now.
7. **1000 PostgREST limit fix** — Discovered PostgREST max-rows=1000 is a Supabase configuration limit (can't be overridden by `.range()`). Created `fetchAllRows()` helper that fetches in pages of 1000 and concatenates server-side. Applied to both `GET /api/assignments` and `GET /api/routes`.
8. **Hooks** — Added `useRouteTree()`, `useRouteUnits()`, modified `useUnassignedBills()` to accept `routeName`.

**Key fixes:**
- `selectedCity` stores display name ("Sargodha") but RPC expects DB district ("SARGODHA") — fixed via `CITY_TEHSIL_MAP`
- Route sort: alphabetical (`Route_1, Route_10, Route_2`) → natural (`Route_1, Route_2, ..., Route_10`)
- PSID column removed from create table, Address column added (visible on all screen sizes)
- Create tab sort regressed from `survey_id DESC` to `route_seq ASC` when Mode 3 was unified — fixed by branching on `routeName`

**Key decisions:**
- PostgREST max-rows=1000 is a Supabase project config — cannot override via headers. All large-table queries must use `fetchAllRows()` batched pattern.
- `fetchAllRows()` pattern: raw REST fetch with `Range` header, fetched in 1000-row pages, concatenated server-side. Defined in `src/app/api/assignments/route.ts` and `src/app/api/routes/route.ts`.
- Route tree RPC approach preferred over raw row fetch: bounded result (~300 rows vs 212K), fast, no limit issues.
- `get_route_tree` RPC returns "Unrouted" rows with `is_unrouted=true` flag — frontend hides them from tree but shows count.

**Remaining:**
- DB gap #10: add `updated_at` column to `payment_history` (needs migration SQL + trigger)
- Optional: move `fetchAllRows()` to shared utility (`src/lib/queries/` or `src/lib/supabase/`) for reuse across all API routes
- The `uc-stats` API still uses `selectedCity` display name but does `CITY_TEHSIL_MAP[city]` lookup internally — working correctly

### 2026-06-03 (Part 2) — Architecture Improvement Plan (R.1–R.5) — Location: Office

**Goal:** Execute 5-phase Architecture Improvement Plan to harden the codebase before feature work.

**Done:**
1. **R.1 — Security Guard (15 min):** Installed `server-only` package. Added `import 'server-only'` to `src/lib/supabase/admin.ts` + `server.ts` — build-time protection against service_role key leaks.
2. **R.2 — Zod Validation Layer (1 hr):** Created `src/lib/validation/schemas.ts` (9 shared Zod schemas) + `src/lib/validation/validate-query.ts` helper. Updated 5 routes (billing-stats, flagged-psids, data-insight, assignments, surveys) to use typed validation.
3. **R.3 — Repository Layer (2 hr):** Created 4 repository files in `src/lib/repositories/` — `flagged-psids-repository.ts` (6 fns), `survey-repository.ts` (2 fns), `assignment-repository.ts` (6 fns), `data-insight-repository.ts` (2 fns). Rewrote 6 API routes as thin HTTP wrappers (~80% code reduction).
4. **R.5 — Middleware (1 hr):** Created `src/middleware.ts` — Supabase SSR session refresh + auth guard for 7 protected routes. Removed inline `useEffect` auth guards from 6 pages (`/`, `/map`, `/assignments`, `/stats`, `/route`, `/flagged-units`). `/deliver` retains `field_staff` role guard; `/flagged-units` retains admin role check client-side.
5. **R.4a — Stats Server Component (30 min):** Split `/stats/page.tsx` into server component (fetches staff list from Supabase) + `stats-client.tsx` (filters, table, KPI cards, performance modal).
6. **R.4b — Route page (abandoned):** Skipped as impractical — depends on Zustand `useBillingStore` (client-only); server pre-fetching all cities yields marginal benefit.

**Key decisions:**
- Route page stays `'use client'` — interactive expand/collapse + city-selection + route-units fetch make Server Component split counterproductive.
- Stats page uses `placeholderData` pattern: server fetches initial staff list, client shows it while React Query refreshes.
- `html5-qrcode` chosen for QR scanner, single HouseDetailSheet with `mode` prop, floating QR button on Map view (confirmed in planning discussion).

**Verified:**
- `npx tsc --noEmit` — zero errors
- `npm run build` — successful. `/stats` changed from `○` (Static) to `ƒ` (Dynamic) — correct since server component now fetches from Supabase. Middleware shows as `ƒ Proxy (Middleware)`.
- Build output shows 23 API routes, 7 pages, middleware registered correctly.

**Updated in MASTER.md:**
- Execution Order table: Orders 1-4 (R.1-R.5, 2b, A, B1) marked ✅ Done. B2 moved to Order 5.
- Phase B section: B1 marked ✅ with status per step. B2 marked as current with ⏳.
- Changelog v20.0 added.

**Next step:**
- Phase B2 — Step B.13: Add `survey_id` to `assignment_items` (DB migration + code update)

### 2026-06-03 (Part 3) — Phase B2 Delivery Flow Implementation — Location: Office

**Goal:** Complete Phase B2 delivery flow: unified mobile UI with QR scanning, marker-based map navigation, delivery bottom sheet, and staff stats.

**Done:**
1. **Delivery target key changed from `survey_id` to `psid`** — Fixes null-equality bug where all markers appeared selected. `deliver/page.tsx`, `map/page.tsx`, `staff-map-markers.tsx`, `qr-scanner-button.tsx` all use `psid`.
2. **QR scanner fixed** — Added `activeView === 'map'` guard; z-index bumped `z-[100]` → `z-[1000]`; passes `psid` not `id`; overlay z-index also `z-[1000]`.
3. **`src/lib/markers.ts` created** — Shared `createMarkerIcon(color, opts?)` — 12px default size, `2px solid rgba(0,0,0,0.35)` border, no shadow. Selected markers get `2px solid #1e40af` border + CSS pulse ring. Keyframes injected once into `<head>`.
4. **`survey-markers.tsx` updated** — Uses shared `createMarkerIcon` with `{ size: 10 }`.
5. **`staff-map-markers.tsx` updated** — Uses shared `createMarkerIcon` with `{ selected }`. Removed `<Popup>` (sheet replaces it). Selection compares `psid` with `deliverTargetId != null` guard.
6. **`FlyToTarget` on StaffMap** — Flies to selected marker (zoom 18, 1s) when `deliverTargetId` changes.
7. **Satellite toggle on StaffMap** — Reads `mapType` from billing store same as `MapView`.
8. **UnitDeliverySheet redesigned** — Full-bleed hero image with gradient overlay, all info + action buttons overlaid on image, close button top-left (white X on dark bg). Delivered state shows centered green checkmark overlay. Navigation arrows (`z-20`, `top-1/3`) + touch swipe (50px threshold, `onTouchStart`/`onTouchEnd`). Arrow buttons have `onTouchEnd` with `stopPropagation` + ref clear to prevent swipe conflict. Photo preview replaces portal image in-place.
9. **`AssignmentItemUnit` type expanded** — Added `survey_id: string | null` and `image_urls: string[]`. API query in `assignment-repository.ts` updated to select them. `UnitDeliverySheet` uses proper types (removed `as any` casts). `onViewDetails` uses `unit.survey_id`.
10. **Stats page for field_staff** — Bottom tab now goes to `/stats` route. `StatsClient` shows `StaffPersonalStats` component for non-admin users — today's assignment progress (delivered/missed/pending cards + progress bar) + 7/30/90 day historical performance KPIs. Uses `useStaffAssignment` + `useStaffStats` hooks.
11. **Deliver page redesigned** — Compact mobile list — progress header bar with thin progress meter, pagination (50/page with prev/next), route seq circles, consumer name + status dot, delivered timestamp, amount right-aligned. Removed camera icon per row, border-left accent cards.
12. **Stale files deleted** — `deliver-map.tsx`, `deliver-bottom-sheet.tsx`, `deliver-action.tsx`, `deliver-card-list.tsx`.
13. **Arrow buttons moved higher** — `top-1/2` → `top-1/3` to avoid overlapping bottom info text.

**Verified:**
- `npx tsc --noEmit` — zero errors
- `npm run build` — successful (all 23 API routes, 7 pages, middleware)

**Key decisions:**
- `psid` used as delivery target key instead of `survey_id` — always populated, no backfill needed for existing assignments.
- `createMarkerIcon` lives in `src/lib/markers.ts` — single source of truth for all map markers (admin + staff), with size and selected-state options.
- UnitDeliverySheet uses full-bleed hero image with overlaid buttons — more compact, shows more of the portal image, matches modern mobile UI patterns.
- Stats tab on mobile navigates to `/stats` route — staff see personal progress, admins see full dashboard.

**Remaining (from home):**
- **B.10 — Wire HDS toolbar Deliver/Missed buttons to real camera + GPS + mark actions via shared `useDeliverUnit()` hook.** Currently buttons are present but not wired to real actions. Need to:
  1. Create or reuse `useDeliverUnit()` hook that captures photo via native camera, gets GPS via Geolocation API, creates `delivery_photos` row, marks `assignment_items.status='delivered'`.
  2. Wire "Take Picture" button → opens native camera → photo confirm → GPS + timestamp captured silently → mark delivered.
  3. Wire "Missed" button → reason dialog → GPS → mark missed.
  4. Wire "Navigate" button → show distance/direction to house marker.
  5. After marking delivered/missed, auto-advance to next pending unit (or show overlay confirming action).
- **B.11 — "Flag" button** → text notes → POST to `flagged_psids`.
- **B.12 — Auto-advance**: After marking delivered in HDS, keep view open for next QR scan. Deliver page progress updates in real-time via query invalidation.

**Updated in MASTER.md:**
- Phase B2 section: B.13, B.14, B.9, B.15, B.16, B.17, B.18, B.19, B.20, B.21 marked ✅. B.10, B.11, B.12 remain 🔲.
- Execution Order: B2 changed from ⏳ Next to ⏳ In Progress.
- Changelog v21.0 added.

### Next Session (From Home)
Start with **B.10**:
1. Create a shared `useDeliverUnit()` hook in `src/hooks/use-deliver-unit.ts` that:
   - Accepts photo capture (via file input or native camera)
   - Captures GPS via `navigator.geolocation.getCurrentPosition()`
   - POSTs to `POST /api/deliver/unit` which creates `delivery_photos` row + marks `assignment_items.status='delivered'`
   - Returns mutation state for loading/error display
2. Wire the "Take Picture" button in `UnitDeliverySheet` to this hook
3. Wire "Missed" button → reason dialog → GPS → POST with status='missed'
4. Run `npx tsc --noEmit` and `npm run build` to verify
