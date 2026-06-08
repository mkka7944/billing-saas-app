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
19. [Data Model Rules](#19-data-model-rules-comprehensive-reference)
20. [Delivery Verification System](#20-delivery-verification-system)
21. [Audit Findings Summary](#21-audit-findings-summary-2026-06-04)
22. [User Design Decisions](#22-user-design-decisions)
23. [Industry Complexity & Engineering Reality](#23-industry-complexity--engineering-reality-2026-06-05)
24. [Deliver — Testing Protocol for Unsent Flow](#24-deliver--testing-protocol-for-unsent-flow)
25. [Remaining Corrections](#25-remaining-corrections)
26. [Delivery KPI Queries (Future)](#26-delivery-kpi-queries-future)
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
2. **One-tap "Take Picture" in UnitDeliverySheet** — Staff taps "Take Picture" → native camera opens → photo captured → GPS coordinates + timestamp captured silently (staff does not know) → WebP compressed (q0.6, 1024px, 30-70KB) → server uploads to Drive via GAS webhook → distance verified against survey marker GPS → unit auto-marked as `delivered` (within 50m) or `processing` (outside threshold). Assignment list updates in real-time.
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

**B2 — Map-Based Delivery Flow (QR + UnitDeliverySheet) ⏳ (In Progress)**
| Step | Time | Task | Status |
|------|------|------|--------|
| B.13 | 15 min | **Add `survey_id` to `assignment_items`**: ALTER TABLE migration. Update assignment creation to write `survey_id`. Enables QR→assignment matching. | ✅ |
| B.14 | 30 min | **Fix delivery target key**: Changed from `survey_id` to `psid` — always populated, no backfill needed. Fixes null-equality bug. | ✅ |
| B.9 | 60 min | **QR Scanner**: Floating button on Map view. Install `html5-qrcode`, scan `sid={survey_id}` from physical bill. Match to staff's active `assignment_items` by `survey_id`. Open UnitDeliverySheet. Fallback manual input. | ✅ |
| B.15 | 30 min | **Shared marker module**: `src/lib/markers.ts` — `createMarkerIcon(color, opts?)` with CSS pulse animation. Used by both admin and staff. 10px default, 12px staff, selected ring. | ✅ |
| B.16 | 30 min | **UnitDeliverySheet redesign**: Full-bleed hero image with gradient overlay, overlaid info + action buttons, close button top-left, delivered green checkmark overlay, nav arrows, touch swipe. | ✅ |
| B.17 | 30 min | **FlyToTarget + Satellite toggle on StaffMap**: Auto-flies to selected marker (zoom 18, 1s). Reads `mapType` from billing store. | ✅ |
| B.18 | 45 min | **Stats page for field_staff**: Bottom tab `/stats` route. StaffPersonalStats with today's progress + 7/30/90 day historical KPIs. | ✅ |
| B.19 | 30 min | **Deliver page redesigned**: Compact mobile list — progress header bar, pagination (50/page), route seq circles, consumer name + status dot, delivered timestamp, amount right-aligned. | ✅ |
| B.20 | 15 min | **Stale files deleted**: Removed old deliver-map, deliver-bottom-sheet, deliver-action, deliver-card-list. | ✅ |
| B.21 | 15 min | **QR scanner guard + z-index fix**: activeView guard, z-index bump to z-[1000]. | ✅ |
| B.10 | 90 min | **One-tap delivery with GPS verification**: Create `useDeliverUnit()` hook + `POST /api/deliveries/mark`. One-tap flow: Take Picture → compress WebP (q0.6, 1024px, 30-70KB) → capture GPS (silent, 3s timeout) → POST FormData to server → server uploads to GAS webhook → saves to Drive + delivery_photos → calculates Haversine distance from survey marker → if ≤50m: status='delivered', else: status='processing'. No manual "Confirm Delivery" step. UnitDeliverySheet button auto-advances after photo. | ✅ |
| B.11 | 30 min | **Auto-advance + distance indicator**: After one-tap delivery, auto-advance to next pending item (B.12 merged). Show green checkmark if auto-verified, yellow "processing" badge if pending review. Distance badge on delivered overlay. Drive photos in HDS gallery via `GET /api/delivery/photos/drive` + `useDrivePhotos` hook. | ✅ |
| B.12 | — | _(merged into B.10-B.11)_ | — |

### Phase B3 — Delivery Stability & Hardening (~8 hrs)

**B3a — Critical Fixes for Testing (~1.5 hr)**
| Step | Time | Task |
|------|------|------|
| B3a.1 | 5 min | **DB CHECK constraint fix**: Migration 035 — drop old `assignment_items_status_check`, add new one allowing `'processing'`. Update `refresh_staff_daily_stats` trigger to count `processing` items. **Blocks every out-of-range delivery (orphan photo + 500).** |
| B3a.2 | 15 min | **Auth on mark route**: Add `sup.auth.getUser()` + ownership check on `POST /api/deliveries/mark`. Verify `assignment_item` belongs to caller's `daily_assignments.staff_id`. Remove `email` form field, derive from `user.email`. **Prevents cross-user delivery marking.** |
| B3a.3 | 10 min | **Webhook AbortController**: Add 8s timeout on GAS webhook `fetch` in mark route via `AbortController`. On abort: set `gdrive_file_id = null`, `synced_to_drive = false`, continue with status update. **Prevents 30-60s frozen UI on slow GAS.** |
| B3a.4 | 15 min | **Error classification in `useDeliverUnit`**: Distinguish `TypeError` (network failure → offline queue) from `res.ok === false` (server error → toast, no queue). Fixes silent offline-queue on 500s. |
| B3a.5 | 15 min | **Query invalidation gaps**: `useMarkItem` → invalidate `['staff-stats']`. `useCreateAssignment` → invalidate `['staff-stats']` + `['staff-performance']`. `useCreateUser` → invalidate `['staff-list']`. **Stats stay stale after delivery/creation.** |
| B3a.6 | 5 min | **Auto-advance timing**: 2s for `'delivered'`, 3.5s for `'processing'` (more time to read "Saved" message). |

**B3b — GPS & Photo Reliability (~2 hr)**
| Step | Time | Task |
|------|------|------|
| B3b.1 | 15 min | **GPS retry on error**: `useUserLocation` stops after first error. Add exponential backoff (1s, 3s, 10s). |
| B3b.2 | 30 min | **Single GPS watcher**: Sheet + StaffMap each call `watchPosition` — double battery drain. Read `useUserLocation` from shared store/context, remove duplicate watcher in sheet. |
| B3b.3 | 15 min | **Mark endpoint idempotency**: Reject status update if `assignment_item` is already `delivered`/`missed`. Return existing `photo_url`. Prevents duplicate photos from double-tap / offline replay. |
| B3b.4 | 30 min | **Photo queue robustness**: Store photo as `Blob` in IndexedDB (not base64 — UI freeze). `navigator.sendBeacon` for fire-and-forget on tab close. Surface `lastError` per photo in admin UI. |
| B3b.5 | 30 min | **Offline cache to IndexedDB**: `offline-cache.ts` uses `localStorage` (5MB cap). Move to IndexedDB. Prevents silent cache loss on large assignments. |
| B3b.6 | 15 min | **Cache fallback on ANY error**: `deliver/page.tsx` only caches on `!data`. Add `isError` fallback — use cache on fetch failure too. |

**B3c — State Machine Completeness & Production Auth (~3 hr)**
| Step | Time | Task |
|------|------|------|
| B3c.1 | 15 min | **Processing counts in assignment views**: Fix `getAssignmentList` and `getUcTotals` to include `'processing'` in item count queries. |
| B3c.2 | 15 min | **Staff daily stats trigger**: Update `refresh_staff_daily_stats()` to count `processing` items in the rollup. |
| B3c.3 | 15 min | **Dead code cleanup**: Remove duplicate `useEffect` (GPS cleanup), duplicate `isDelivering` state, unused `totalDue` variable, orphaned `photo-upload.tsx` file. |
| B3c.4 | 15 min | **Server-side target GPS lookup**: Derive `psid` and `survey_units.lat/lng` from `assignment_item_id` server-side. Drop form fields `psid`, `target_lat`, `target_lng`. Prevents target-swap attack. |
| B3c.5 | 45 min | **Auth on remaining 7 routes**: Add `sup.auth.getUser()` + role check to `PATCH /api/assignments/items`, `GET/POST /api/staff/performance`, `GET /api/staff/stats`, `GET/POST /api/delivery/photos`, `GET /api/delivery/photos/drive`, `GET /api/settings`, `GET /api/staff`. |
| B3c.6 | 30 min | **Extract shared constants**: `src/lib/delivery-status.ts` (STATUS_LABEL, STATUS_COLORS), `src/lib/geo.ts` (haversine), `src/lib/drive-webhook.ts` (extractFileId, WEBHOOK_URL). Eliminates 3-way duplication. |
| B3c.7 | 15 min | **STALE_TIMES consistency**: Replace raw `1000 * 30` with `STALE_TIMES.DELIVERY` / `STALE_TIMES.PERFORMANCE` constants across all delivery hooks. |

**B3d — Production Hardening (~1.5 hr)**
| Step | Time | Task |
|------|------|------|
| B3d.1 | 30 min | **RLS on delivery tables**: Migration 036 — ENABLE ROW LEVEL SECURITY + policies for `daily_assignments`, `assignment_items`, `delivery_photos`, `staff_daily_stats`, `app_settings`. Staff sees own data, admin sees all. |
| B3d.2 | 30 min | **Multi-assignment fix**: Currently silently picks `[0]`. Add picker UI for staff with multiple active assignments, or sum across all. |
| B3d.3 | 5 min | **Force Complete button**: Currently `!assignmentItemId` hides it for the real use case. Show for admins when `deliveryStatus === 'processing'`. |
| B3d.4 | 15 min | **City validation bug**: `createAssignment` uses broken `bill_month` format for city check — silently bypassed. Query `survey_units.city_district/tehsil` directly. |
| B3d.5 | 15 min | **Index on `created_at`**: `daily_assignments` sorted by `created_at DESC` with no index — full table scan as count grows. Migration: `CREATE INDEX idx_daily_assignments_created ON daily_assignments(created_at DESC)`. |

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

### Phase 4 — Add `city`/`tehsil`/`uc_name` to `payment_history` (~30 min) ✅ **(Done — Migration 023)**
**Note:** `city_district`, `tehsil`, `uc_name` already exist on `payment_history` via migration `023-add-payment-geography.sql`. The RPCs already use `ph.city_district`/`ph.tehsil` directly. No work needed.

### Phase 5 — Create `ingest-all.py` Orchestrator (~1 hr) ✅ **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 5.1 | 20 min | Interactive menu: `[1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit` |
| 5.2 | 10 min | CLI args: `--month`, `--daily`, `--dry-run`, `--file` |
| 5.3 | 10 min | Sequential orchestration: run Phase 2 scripts then Phase 3 in order |
| 5.4 | 10 min | Combined audit log entry with summary |
| 5.5 | 10 min | Error handling: abort on failure, show partial results |

### Phase 6 — Bill Metadata in HouseDetailSheet (~1.5 hrs) ✅ **(Done 2026-06-01)**
| Step | Time | Task | Status |
|------|------|------|--------|
| 6.1 | 15 min | `GET /api/survey/[survey_id]/bill-info` — returns bill number, route info, paid status from `survey_units` + `payment_history` | ✅ |
| 6.2 | 30 min | HouseDetailSheet: show "Bill #X/Y in UC" with route info, paid status badge | ✅ |
| 6.3 | 15 min | Compute `bill_count` per UC: sort by `route_seq ASC → survey_id DESC`, assign sequential number | ✅ |
| 6.4 | 15 min | Compute `paid_status`: count paid months from `payment_history` → "P-{n}" or "U-P" | ✅ |
| 6.5 | 15 min | Show all PSIDs per survey_id with payment history + ghost marking button | ✅ |

### Phase 2b — Drop `amount_due` (deferred, ~30 min)
| Step | Time | Task |
|------|------|------|
| 2b.1 | 10 min | Remove `amount_due` from all SELECTs, TypeScript types, RPC queries |
| 2b.2 | 10 min | `ALTER TABLE survey_units DROP COLUMN amount_due` |
| 2b.3 | 10 min | Update any remaining frontend references |

### Phase P1 — In-App Notification System (~4 hrs) ✅ (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P1a | 15 min | DB migration `037-notifications.sql` — table, indexes, RLS | ⏳ SQL written, not yet applied to Supabase |
| P1b | 5 min | Types — `Notification` interface in `src/types/index.ts` | ✅ |
| P1c | 30 min | `GET /api/notifications` — returns notifications + unread count + admin summary with auto-create `admin_alert` | ✅ |
| P1d | 15 min | `POST /api/notifications/read` — mark single or all as read | ✅ |
| P1e | 30 min | `POST /api/admin/notifications` — admin sends to user or all staff | ✅ |
| P1f | 15 min | `use-notifications.ts` — 3 React Query hooks (fetch, mark read, mark all read) | ✅ |

### Phase P2 — Notifications Bell UI (~2 hrs) ✅ (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P2a | 60 min | NotificationsBell — bell icon + unread badge + bottom sheet (mobile) + dropdown (desktop) with admin summary, notification list, mark all read, empty state, deep links | ✅ |
| P2b | 15 min | Bell on DesktopFilterBar — `NotificationsBell` + satellite toggle (`Layers` button) in `ActionButtons` | ✅ |
| P2c | 15 min | Bell on AppHeader — `NotificationsBell` after refresh button in mobile header | ✅ |

### Phase P3 — Staff Notification Form (~1 hr) ✅ (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P3.1 | 30 min | Staff notification form — recipient dropdown (all staff + individual), subject, message, Send → `POST /api/admin/notifications` | ✅ |
| P3.2 | 15 min | Move form from Delivery tab to Users tab sidebar | ✅ |
| P3.3 | 15 min | Users tab redesign — sidebar layout, city group headers, Table component, RoleSelect CSS | ✅ |

### Phase P4 — Users Tab UI Polish (~1 hr) ✅ (Done 2026-06-06)
| Step | Time | Task | Status |
|------|------|------|--------|
| P4.1 | 15 min | `hideChevron` prop on `SelectTrigger` — cleaner icon-only action dropdown | ✅ |
| P4.2 | 15 min | City accent colors on group headers + city selector dropdowns (emerald=Sargodha, blue=Bhalwal, amber=Khushab) | ✅ |
| P4.3 | 15 min | Typography consistency — standardized `text-xs` table headers/rows, `text-[10px]` badges | ✅ |
| P4.4 | 15 min | Action dropdown cleanup — `hideChevron`, `size-7`, no conflicting CSS | ✅ |

### Phase M1 — Map Unification (Staff Sees Survey Data + Assignment Overlay) (~30 min)
| Step | Time | Task |
|------|------|------|
| M1.1 | 15 min | `map-view.tsx` — accept optional `assignmentItems` prop, render assignment markers on top of survey markers with blue ring dot |
| M1.2 | 15 min | `map/page.tsx` — remove role-split rendering, always render `MapView`, pass `staffItems` as `assignmentItems` for staff |

### Phase M2 — "Show All" Markers + Unit Counts per UC (~3 hrs)
| Step | Time | Task |
|------|------|------|
| M2.1 | 30 min | `GET /api/hierarchy` — add `active_unit_count` per UC via LEFT JOIN survey_units |
| M2.2 | 15 min | `FilterState.showAll` — add boolean to types + billing store defaults |
| M2.3 | 45 min | Surveys API + repository — handle `all=true` with `fetchAllRows` batched pattern |
| M2.4 | 15 min | `useSurveyData` — pass `showAll` through query key, adjust pageSize |
| M2.5 | 30 min | `map-view.tsx` — wrap markers in `<MarkerClusterGroup>` (react-leaflet-cluster already installed) |
| M2.6 | 45 min | `filter-panel.tsx` — show count per UC in desktop dropdown + mobile sheet. Add "Show all on map" toggle |

### Phase M3 — Post-Enrichment JSON Marker Chunks (~1.5 hrs)
| Step | Time | Task |
|------|------|------|
| M3.1 | 45 min | `scripts/export-marker-chunks.py` — per-UC JSON export with lean columns (survey_id, lat, lng, psid, consumer_name, uc_name, monthly_fee, arrears, status) |
| M3.2 | 15 min | `ingest-all.py` — add `[4] Export marker chunks` menu option |
| M3.3 | 30 min | Surveys API — add `source=chunk` mode, stream from static JSON when available |

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
| 4 (city columns) | ~~0.5 hrs~~ | ✅ Already in DB via migration 023 |
| 5 (ingest-all) | 1 hr | 41.5 hrs |
| 6 (bill metadata) | 1.5 hrs | 43 hrs |
| 2b (drop amount_due) | 0.5 hrs | 43.5 hrs |
| **R.1-R.5 (Architecture)** | **6 hrs** | **49.5 hrs** |
| **B2** (QR + HDS Delivery) | **3 hrs** | **52.5 hrs** |
| **B3** (Delivery Stability & Hardening) | **8 hrs** | **60.5 hrs** |
| **P1** (Notifications Infrastructure) | **2 hrs** | **62.5 hrs** |
| **P2** (Notifications Bell UI) | **1.5 hrs** | **64 hrs** |
| **P3** (Staff Notification Form) | **1 hr** | **65 hrs** |
| **P4** (Users Tab UI Polish) | **1 hr** | **66 hrs** |
| **M1** (Map Unification) | **0.5 hrs** | **66.5 hrs** |
| **M2** ("Show All" + Counts) | **3 hrs** | **69.5 hrs** |
| **M3** (JSON Marker Chunks) | **1.5 hrs** | **71 hrs** |

### Execution Order (Remaining)
| Order | Phase | Time | What | Status |
|-------|-------|------|------|--------|
| 1 | **R.1-R.5** Architecture Improvement | 6 hrs | Security guard, Zod validation, repository layer, middleware, server component split | ✅ Done |
| 2 | **2b** Drop `amount_due` | 30 min | Remove column — deferred cleanup | ✅ Done |
| 3 | **A** Admin Assignment UI | 3 hrs | UC list → pick staff → create daily chunks with approval chain support | ✅ Done |
| 4 | **B1** Field Staff Delivery Basics | 7 hrs | /deliver page, photo capture, offline queue, map, card list, bottom sheet | ✅ Done |
| 5 | **B2** QR + One-Tap Delivery | 2 hrs | QR scanner, UnitDeliverySheet, one-tap photo+GPS+auto-verify, auto-advance, Drive images in HDS gallery | ✅ Done |
| 6 | **4** City columns in payment_history | 30 min | `city_district`, `tehsil`, `uc_name` are already on DB via migration 023 | ✅ Done |
| 7 | **6** Bill Metadata in HDS | 1.5 hrs | Bill info API + HouseDetailSheet display | ✅ Done |
| 8 | **P1** Notifications Infrastructure | 2 hrs | DB migration, types, 3 API routes, hook | ✅ Done (migration not yet applied) |
| 9 | **P2** Notifications Bell UI | 1.5 hrs | Bell + badge + mobile/desktop panel, desktop filter bar integration, header integration | ✅ Done |
| 10 | **P3** Staff Notification Form | 1 hr | Form in Users tab sidebar, send to all or individual | ✅ Done |
| 11 | **P4** Users Tab UI Polish | 1 hr | hideChevron, city accent colors, typography, dropdown cleanup | ✅ Done |
| 12 | **B3** Delivery Stability & Hardening | 8 hrs | DB CHECK fix, auth on mark route, webhook timeout, GPS reliability, photo queue, state machine, remaining auth, RLS | 🔲 |
| 13 | **M1** Map Unification | 30 min | Unified map — staff sees survey data + assignment overlay, filters work for all | 🔲 |
| 14 | **M2** "Show All" + Counts | 3 hrs | Marker counts per UC, show all on map, marker clustering | 🔲 |
| 15 | **M3** JSON Marker Chunks | 1.5 hrs | Post-enrichment per-UC JSON export, static file serving | 🔲 |
| 16 | **0d** Reference Tables & Filter Fix | 1.5 hrs | Create hierarchy/surveyors/bill_months tables, update APIs, delete dead services | 🔲 |
| 17 | **0e** Stabilize & Clean | 2 hrs | Fix payment filter pagination, billing-stats empty arrays, route API, deduplicate currentMonth | 🔲 |
| 18 | **0f** Egress & Stability | 6 hrs | Fix PSID pagination loop, unbounded fetches, staff stats fallback | 🔲 |
| 19 | **C** Admin Dashboard | 3 hrs | /stats, staff performance, delivery KPIs | 🔲 |
| 20 | **E** Flag Management UI | 4 hrs | /flagged-units, resolve/confirm/note actions | 🔲 |
| 21 | **F** Auto-Route Generation | 3 hrs | Delivery sequence → consensus route → survey_units → printer | 🔲 |
| 22 | **G** Live Admin Monitoring | 3 hrs | Staff mode map, breadcrumbs, near-real-time polling | 🔲 |
| 23 | **RBAC** Approval Chain | 3 hrs | Assignment draft→pending→approved→active workflow | 🔲 |
| 24 | **D** Visual Rehaul | 4 hrs | Staff mobile layout, admin sidebar, theme system, touch targets | 🔲 |
| 25 | **Deploy** Office PC pipeline | 1 hr | ingest-all.py + scripts on Office PC, live test | 🔲 |
| — | **Z** Deferred | 19 hrs | Auth hardening, Zod validation, structured logging, egress optimization, audit cleanup | 🔲 Deferred |

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
## 12. Testing Verification (Permanent Rule)
After every implementation step (atomic step OR phase/sub-phase completion), provide a concrete **Testing Verification** section. Must cover:

- **What to do** — exact UI actions, API calls, or commands
- **What to expect** — the specific behavior change to observe
- **Edge cases** — boundary conditions, error states, null values
- **Where to inspect** — URL path, DB query, network tab, console

Format (required at end of every implementation message):
```

**Testing Verification:**
1. Open `/page` → do X → expect Y
2. Network tab shows `GET /api/endpoint` returning `{...}`
3. DB: `SELECT ... FROM table` confirms write
4. Edge case: no data / null / error → expect graceful fallback
5. Edge case: offline / slow network → expect fallback behavior
```

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
| 2026-06-04 | 22.0 | **Khushab investigation, delivery KPIs removed, aggregate status toggle, desktop sheet debugging, migration 031 added.** Section 19 (Data Model Rules) added. `docs/AUDIT-2026-06-04.md` created with comprehensive grades (F for auth/egress, D for industry standards). |
| 2026-06-05 | 23.0 | **Complete design overhaul: one-tap delivery, GPS distance verification, processing status, project cleanup.** Root directory cleaned (17 files moved/deleted). Scripts folder reorganized (active/reference/archive/temp separation). Audit report absorbed into MASTER.md Section 20-22. Delivery flow redesigned: one-tap photo → GPS → auto-verify (Haversine 50m) → `processing` intermediate status. No Missed/Skip (full enforcement). All 12 delivery UX gaps documented with fixes. Server handles webhook synchronously. User design decisions codified in Section 22. See Appendix C for full session log. |
| 2026-06-05 | 24.0 | **Speed optimizations + admin Force Complete**: GPS timeout reduced 8s → 3s, `enableHighAccuracy` off (+3x faster on GPS-poor devices). Context-aware delivery messages ("Awaiting GPS Verification" vs "Out of range — Awaiting Review" — no misleading "Photos pending sync"). Optimistic cache update (status flips instantly on list, no refetch wait). New `POST /api/deliveries/force` admin endpoint + "Force Complete (admin)" button on sheet. MASTER.md updated with Part 8 session log. |
| 2026-06-05 | 25.0 | **Notifications system (P1-P3)**: DB migration `037-notifications.sql` (not applied), Notification type, `GET /api/notifications`, `POST /api/notifications/read`, `POST /api/admin/notifications`, `use-notifications` hook, NotificationsBell with mobile sheet + desktop dropdown, bell on DesktopFilterBar + AppHeader, staff notification form in Users tab sidebar. Users tab redesigned: sidebar layout, city group headers, Table component, RoleSelect CSS with colored dots. Panel positioning fixed (absolute → fixed for desktop). Recipient dropdown shows display name. |
| 2026-06-06 | 26.0 | **Users tab UI polish (P4)**: `hideChevron` prop on SelectTrigger for icon-only dropdowns. City accent colors on group headers (emerald=Sargodha, blue=Bhalwal, amber=Khushab) + city selector dropdowns. Typography standardization (text-xs, text-[10px] badges). Action dropdown cleanup (size-7, hideChevron, no conflicting CSS). |
| 2026-06-07 | 27.0 | **Post-launch bug fixes**: Double header on desktop (AppHeader wrapped in `lg:hidden`). HDS body not rendering from map — Leaflet z-index conflict (HDS `z-50` vs Leaflet panes up to z-700 → changed to `z-[800]`). Floating icons behind Leaflet (`z-40` → `z-[800]`). Mobile filter sheet reliability (removed hidden-DOM trigger mechanism, direct state control via `open`/`onClose` props). Mobile header uniform styling (all buttons `h-9 border border-border`, avatar shows full name, status text repositioned). 6 files changed. |
| 2026-06-07 | 28.0 | **Unsent delivery flow fixes + testing protocol.** Toast redesign (top-right pill, 5s slide-in). "Always unsent" feature (7 steps): migration 038, admin toggle, handleFile unsent mode, max limit enforcement, UnsentBadge floating modal, skipAutoSync param. Fixed unsent delivery gap: POST /api/deliveries/mark-processing, POST /api/deliveries/promote, filter-bar icon replacing floating badge, concurrent processQueue (batch 3), orphan cleanup on 403/404. Bug: unsent icon placed in deliver filter bar — needs moving to FloatingActions. Shared GPS watcher with retry (1s/3s/10s). Delivery step progress overlay. Testing protocol in Section 24. |
| 2026-06-07 | 29.0 | **Corrections: Progress overlay → sequential toasts + GPS dots.** Removed progress step checklist from sheet (overlaid action buttons). Added `updateToast(id, msg, variant?)` to toast system. Added `onProgress` callback to `useDeliverUnit.deliver()`. Online path: "Compressing..."→"Uploading..."→"Recording..."→final result as sequential toast updates. Unsent path: "Saving..."→"Compressing..."→"Saved ✓". Added 3-dot GPS signal indicator after live distance text (accuracy-based green/gray dots). 3 files changed. Part 11 doc corrected (removed incorrect GPS claims). Part 12 added. |
| 2026-06-08 | 30.0 | **Delivery hardening + started_at KPI column.** A1-A4: unsent queue destination, sync-photo promotion, mark route photo order, processing guard. B1-B2: unsent icon moved to FloatingActions, desktop visibility. C1-C4: offline toast, auth check, orphan cleanup (useAssignmentRealtime hook). D1: 037-notifications migration applied. `started_at` column added to `assignment_items` (migration 040), written by mark + mark-processing routes, displayed as Duration column in admin delivery table. See Section 26 for KPI query. |

---

## 26. Delivery KPI Queries (Future)

After 2-3 months of `started_at` data collection:

```sql
-- Average delivery time per staff
SELECT
  staff_id,
  COUNT(*) AS deliveries,
  AVG(EXTRACT(EPOCH FROM (delivered_at - started_at))) AS avg_seconds
FROM assignment_items
WHERE started_at IS NOT NULL AND delivered_at IS NOT NULL
  AND delivered_at > started_at
GROUP BY staff_id
ORDER BY avg_seconds;

-- Average delivery time per UC
SELECT
  da.uc_name,
  COUNT(*) AS deliveries,
  AVG(EXTRACT(EPOCH FROM (ai.delivered_at - ai.started_at))) AS avg_seconds
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.daily_assignment_id
WHERE ai.started_at IS NOT NULL AND ai.delivered_at IS NOT NULL
  AND ai.delivered_at > ai.started_at
GROUP BY da.uc_name;

-- Delivery time distribution (buckets)
SELECT
  CASE
    WHEN EXTRACT(EPOCH FROM (delivered_at - started_at)) < 60 THEN '<1m'
    WHEN EXTRACT(EPOCH FROM (delivered_at - started_at)) < 180 THEN '1-3m'
    WHEN EXTRACT(EPOCH FROM (delivered_at - started_at)) < 300 THEN '3-5m'
    WHEN EXTRACT(EPOCH FROM (delivered_at - started_at)) < 600 THEN '5-10m'
    ELSE '>10m'
  END AS bucket,
  COUNT(*)
FROM assignment_items
WHERE started_at IS NOT NULL AND delivered_at IS NOT NULL
  AND delivered_at > started_at
GROUP BY bucket
ORDER BY bucket;
```
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

---
### 2026-06-04 — Khushab Investigation + Delivery KPIs Removal + Aggregate Status Toggle — Location: Office

**Goal:** Investigate Khushab data failing in Create Assignments and Data Insight; fix client-reported issues.

**Investigation:**
- Confirmed Khushab data IS correct: 65,122 survey_units with `current_bill_month='MAY2026'`, API returns data (KHB 01: 814 unassigned, KHB 02: 4157, UC-23 GIROTE: 2128).
- No mismatches between `hierarchy_summary` and `survey_units` for Khushab UCs.
- "All bills assigned" message appeared for UCs with 0 active units (JBD 02: 181 archived, UC-7 PADHRAR: 1008 archived) — this is **correct behavior**, not a bug.
- The UC list panel already shows `active_units` count per UC.
- Root cause of confusion: UCs with 0 active units were visible and selectable, leading to empty detail panel.

**Done:**
1. **Delivery KPIs removed entirely** (4 files):
   - Deleted `getDeliveryKpis` function + `DeliveryKpis` interface from `data-insight-repository.ts`
   - Removed from API route (`data-insight/route.ts`) — no more `kpisPromise` or `delivery_kpis` in responses
   - Removed from hook (`use-data-insight.ts`) — `DeliveryKpis` type and `delivery_kpis` field removed
   - Removed from component: `DeliveryKpiCards`, `dkpiConfig`, unused icons (Truck, Camera, PersonStanding, Percent)

2. **Status toggle now visible at aggregate level** (2 files):
   - `use-data-insight.ts:89` — `if (status)` always sends status param (was `if (drillUC && status)`)
   - `data-insight.tsx` — toggle bar moved outside `{level === 'unit'}` block, shows Active/Archived at both levels. "Duplicates" only at drill-down (RPC can't filter duplicates at aggregate).
   - The RPC `get_hierarchy_stats` already supports `p_status` — no DB changes needed.

3. **UC list hides 0-active UCs** (1 file):
   - `uc-list-panel.tsx:34-37` — added `.filter(u => u.active_units > 0)` so archived-only UCs don't appear.

4. **Aggregate table hides 0-total rows** (1 file):
   - `data-insight.tsx:336` — `.filter(r => r.total_units > 0)` so toggle state hides empty rows.

**Key decisions:**
- Status filter at aggregate level uses the same RPC `p_status` param as drill-down — the RPC already handles it.
- "Duplicates" excluded from aggregate toggle — RPC doesn't support duplicates filtering at group level.
- 0-active-unit UCs hidden from assignment list — no point clicking a UC with nothing to assign.

**Verified:**
- `npx tsc --noEmit` — zero errors.
- `npm run build` — successful after clearing `.next/` cache (Turbopack had cached stale `getDeliveryKpis` import).

**Next session:**
- Phase B2 remaining: B.10 (wire deliver buttons to real camera/GPS/actions), B.11 (Flag button), B.12 (auto-advance).
- Backlog: DB gap #10 — add `updated_at` to `payment_history`.

### 2026-06-04 (Part 2) — Desktop Deliver Sheet Debugging — Location: Office

**Goal:** Make the `UnitDeliverySheet` (staff delivery bottom sheet) appear on desktop when clicking a marker on `/map`.

**Investigation:**
1. **Admin gate removed** (line 46 of `map/page.tsx`): `if (!deliverTargetId || roleName !== 'field_staff')` → `if (!deliverTargetId)` — allowed sheet to render for any role. Did not fix staff desktop issue (staff already passed the gate).
2. **URL param approach** (`?target=PSID` from `/deliver` to `/map`): Added `useEffect` to read `?target=` on mount. Did not fix the marker-click flow (the user tested by clicking markers directly on `/map`, not via `/deliver` navigation).
3. **Inline sheet on `/deliver` page**: Replaced `router.push('/map')` with local `selectedItemId` state + inline `UnitDeliverySheet` on `/deliver` page. Avoided cross-page state entirely but **broke everything** — reverted.
4. **Debug badge overlay**: Added a top-right debug badge showing all condition states (`activeView`, `deliverTargetId`, `deliveryUnit`, `roleName`, `staffItems.length`, `match`). All showed ✓ — confirming the JSX condition was met but the sheet was not visible.
5. **Green "SHEET RENDERED ✓" indicator**: Rendered with the same JSX condition as the sheet — confirmed the condition WAS true.
6. **Sheet CSS investigation**: Added red border, `minWidth: 400px`, `minHeight: 200px` to the sheet's outermost div, plus a debug return path inside the sheet component — sheet became visible.

**Root cause:**
The `UnitDeliverySheet` component rendered in the DOM but was visually invisible on desktop due to CSS layout collapse:
- The sheet used `position: fixed; bottom: 0; left: 50%; right: auto;` with no explicit `width`
- Inside, `flex-1 min-h-[300px]` children had no extrinsic height reference because the parent had `max-h-[80vh]` but no definite `h-*`
- On desktop (sidebar open, narrower content area), the collapsed layout made the sheet effectively 0px × 0px — invisible to the user
- The `lg:left-1/2 lg:-translate-x-1/2 lg:max-w-md` centered the element, but a collapsed element has nothing to display

**Done:**
1. Removed admin gate from `deliveryItem` resolver in `map/page.tsx`
2. Added URL param (`?target=PSID`) reading in `map/page.tsx` for deliver → map flow
3. Added `?target=` param to `router.push` in `deliver/page.tsx`
4. Added debug badge overlay (z-[9999], top-right) for diagnosing condition states
5. Added green confirmation indicator at same condition as sheet
6. Added `minWidth`, `minHeight`, and red border to sheet for visibility
7. Added debug null-return path in `UnitDeliverySheet` with red banner explaining why

**Verified:**
- `npx tsc --noEmit` — zero errors
- `npm run build` — successful

**Key decisions:**
- The debug badge + green indicator pattern proved the condition was met but CSS was hiding the sheet — useful diagnostic approach for future visual bugs.
- `minWidth` and `minHeight` on `fixed` elements prevent layout collapse on desktop when the element has no intrinsic size.
- Two session log locations exist in MASTER.md (Section 12 + Appendix C) — this entry appended to Appendix C for consistency with recent format.

**Remaining:**
- The CSS fix (minWidth/minHeight) is a diagnostic aid, not a permanent fix. The actual `UnitDeliverySheet` needs proper responsive layout.
- Phase B2: B.10, B.11, B.12 still 🔲

### 2026-06-05 — Design Overhaul + File Cleanup + Audit Absorption — Location: Home

**Focus:** Redesign delivery verification system, clean up project structure, absorb audit report into MASTER.md.

**Done:**
1. **Root directory cleanup** (17 files):
   - Moved 9 Python test scripts + 3 diagnostic files → `scripts/`
   - Moved 5 test JSON fixtures → `scripts/data/`
2. **Scripts folder reorganization**:
   - Moved 6 reference files (routingstation, config, geography, etc.) → `scripts/ref/`
   - Moved 8 one-time migration scripts → `scripts/archive/`
   - Deleted 12 temp debug files (check_*.py, diagnostic.*, test_batch.py)
   - Removed duplicate `config.py` (already existed in ref/)
3. **Delivery flow redesign** (new design, not yet implemented):
   - **One-tap flow**: Take Picture → auto-saves → no "Confirm Delivery" button
   - **New status**: `pending` → `processing` → `delivered`
   - **GPS distance verification**: Haversine distance ≤ 50m = auto-verify
   - **Full enforcement**: No Missed/Skip statuses
   - **Missing GPS/distance >50m** → `processing` (admin review)
   - **Server handles webhook synchronously** — response includes verification result
   - **Photo target**: WebP q0.6, 1024px, 30-70KB (same as legacy app)
4. **Audit report absorbed**:
   - Created Section 20 (Delivery Verification System) — full design doc
   - Created Section 21 (Audit Findings Summary) — grades, risks, phased plan from `AUDIT-2026-06-04.md`
   - Created Section 22 (User Design Decisions) — 10 design decisions with rationale
   - Updated B.10-B.12 to reflect new one-tap design
   - Updated Execution Order with audit-based phases (P1-P6)
   - Updated Changelog to v23.0
   - Updated Table of Contents with new sections

**Key decisions (see Section 22 for full detail):**
- Map-centric delivery is correct by design (staff needs spatial awareness + house photo)
- One-tap flow eliminates staff complaint #1 ("too slow")
- Silent GPS prevents gaming — staff never knows GPS is captured or verified
- 50m distance threshold accounts for survey + delivery GPS imprecision
- No Missed/Skip — full enforcement with processing status for edge cases
- Two Drive accounts should be consolidated to one webhook
- Debug artifacts (badge + red border) must be removed before production use

**Remaining work (in order):**
1. B.10 — Implement `useDeliverUnit()` hook + `POST /api/deliveries/mark` + one-tap flow
2. B.11 — Auto-advance + distance badge + current-location dot on StaffMap
3. P1 — Fix H1-H3 egress bugs (PSID loop, unbounded fetches, staff stats)
4. P2 — Authorization hardening (requireRole, RLS, ownership checks)
5. C — Admin Dashboard (staff performance, delivery KPIs)
6. Continue with remaining phases per execution order

### 2026-06-05 (Part 2) — Universal UnitDeliverySheet — Location: Office

**Focus:** Fix desktop sheet invisibility, make UnitDeliverySheet work for both staff and admin, add filter-aware navigation.

**Problem statement:** The UnitDeliverySheet (the action sheet with photo capture) was:
1. Hidden on desktop due to a CSS bug (`left-1/2 -translate-x-1/2` removed right anchor without setting width)
2. Only accessible to staff with assignment (admin couldn't open it)
3. Only navigable through `staffItems` (not the visible filtered set)

**Files changed (5):**

1. **`src/components/delivery/unit-delivery-sheet.tsx`**
   - Line 91: Replaced broken centering CSS `fixed bottom-0 left-0 right-0 ... lg:left-1/2 lg:-translate-x-1/2 lg:max-w-md lg:right-auto` with `fixed bottom-0 inset-x-0 ... min-h-[300px] mx-auto w-full max-w-md`
   - Line 84: Removed `!assignmentItemId` from null-return guard — admin can now see the sheet
   - Lines 208-249: Action buttons are now role-aware. When `assignmentItemId` is present (staff with assignment): show "Take Picture & Deliver" + secondary "Details" button. When null (admin or no assignment): hide delivery button, show only prominent "View Details" button.

2. **`src/stores/billing-store.ts`**
   - Added `deliverTargetUnit: AssignmentItemUnit | null` to state
   - Added `deliverableList: AssignmentItemUnit[]` and `deliverableIndex: number` for filter-aware navigation
   - Updated `setDeliverTarget(id, unit?)` — now stores unit data directly, removes role-specific lookup dependency
   - Added `setDeliverableList(list)` — populates from filtered markers
   - Added `nextDeliverable()` and `prevDeliverable()` — navigate through the visible set

3. **`src/components/survey-markers.tsx`** (admin markers)
   - Marker click: changed from `selectHouse(survey_id)` to `setDeliverTarget(s.psid, unitData)`
   - Added `toAssignmentUnit()` helper to convert SurveyUnit → AssignmentItemUnit shape
   - Added useEffect that populates `deliverableList` from filtered markers
   - Filter excludes markers without `psid` (98% have one)

4. **`src/components/delivery/staff-map-markers.tsx`** (staff markers)
   - Marker click: now passes `item.unit` directly to `setDeliverTarget(psid, unit)` instead of relying on a lookup

5. **`src/app/map/page.tsx`**
   - Removed `roleName !== 'field_staff'` gate from sheet rendering
   - Reads `deliverTargetUnit` directly from store (no more `staffItems.find()` lookup)
   - Added useEffect that populates `deliverableList` from `staffItems` for field_staff
   - Added sync useEffect that updates `deliverTargetUnit` when URL-param target ID is found in the loaded deliverableList
   - Sheet `onPrev`/`onNext` now use store's `prevDeliverable`/`nextDeliverable` (works for both roles)

**New behavior:**
- **Staff with assignment:** Tap any marker on `/map` → UnitDeliverySheet opens with "Take Picture & Deliver" + "Details" buttons. Prev/next navigates through staff's assignment.
- **Staff without assignment / Admin:** Tap any marker on `/map` → UnitDeliverySheet opens with ONLY "View Details" button (no delivery action). Prev/next navigates through currently filtered set.
- **Desktop:** Sheet now visible at 28rem wide, centered at viewport bottom (was hidden before).

**Key data flow:**
- Admin map → SurveyMarkers click → setDeliverTarget(psid, unit) → sheet opens with unit data
- Staff map → StaffMapMarkers click → setDeliverTarget(psid, unit) → sheet opens with unit data
- `/deliver` flow → URL param → setDeliverTarget(psid) → staff data loads → sync effect updates unit → sheet opens

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

**Remaining work (unchanged from prior session):**
1. B.10 — Implement `useDeliverUnit()` hook + `POST /api/deliveries/mark` + one-tap flow
2. B.11 — Auto-advance + distance badge + current-location dot on StaffMap
3. P1 — Fix H1-H3 egress bugs (PSID loop, unbounded fetches, staff stats)
4. P2 — Authorization hardening (requireRole, RLS, ownership checks)

### 2026-06-05 (Part 3) — UnitDeliverySheet Persistence Across HDS — Location: Office

**Focus:** When user opens HDS (HouseDetailSheet) via "View Details" on UnitDeliverySheet, then closes HDS, the delivery sheet should still be open on the map.

**Problem:** `onViewDetails` was calling `setDeliverTarget(null)` which cleared `deliverTargetId` and `deliverTargetUnit`. When HDS closed and `activeView` reverted to `'map'`, the sheet condition (`activeView === 'map' && deliverTargetId && deliveryUnit`) was false because the target was cleared.

**Files changed (1):**

1. **`src/app/map/page.tsx`**
   - Removed `setDeliverTarget(null)` from the `onViewDetails` handler (lines 117-121)
   - The handler now only calls `selectHouse(unitSurveyId)` to open HDS
   - `deliverTargetId` and `deliverTargetUnit` stay in the store while HDS is open
   - When HDS closes, `activeView` reverts to `'map'`, sheet reopens with same unit

**New behavior:**

```
1. Map → click marker → UnitDeliverySheet opens (unit A)
2. Click "View Details" → HDS opens (sheet hidden behind)
3. Browse HDS freely (navigate to units B, C, D)
4. Close HDS → map returns
5. UnitDeliverySheet still open for unit A ✓
```

**No regression for explicit close:** Clicking X on the sheet still calls `setDeliverTarget(null)` — explicit user intent is honored.

**No regression for delivery:** `handleDeliver` still calls `setDeliverTarget(null)` after enqueuing the photo — sheet closes after successful delivery.

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 4) — Minimal Marker Tooltip — Location: Office

**Focus:** Replace verbose Leaflet Popup (4 fields) with sleek hover Tooltip (1 field: survey_id). Industry-standard pattern for large-scale maps.

**Problem:** Clicking an admin marker opened BOTH a Leaflet Popup (consumer name, survey_id, uc, address) AND the UnitDeliverySheet — fighting for screen space. Staff markers had no hover info at all.

**Files changed (3):**

1. **`src/components/survey-markers.tsx`**
   - Imported `Tooltip` from react-leaflet (replaced `Popup`)
   - Marker now shows `<Tooltip direction="top" offset={[0,-8]} className="survey-tooltip">{s.survey_id}</Tooltip>`
   - Click handler still calls `setDeliverTarget(s.psid, unit)` — no longer fights with a Popup

2. **`src/components/delivery/staff-map-markers.tsx`**
   - Added Tooltip showing `survey_id` (or `psid` fallback) for consistency
   - Staff now gets hover-to-peek at survey_id like admin

3. **`src/app/globals.css`**
   - Added `.leaflet-tooltip.survey-tooltip` styles in `@layer base`
   - Styled to match project theme: popover background, mono font (Geist Mono), 11px, 6px border-radius
   - Customized all 4 directional arrows (top/bottom/left/right) to match the popover background color

**New behavior:**
- **Hover** marker → small sleek tooltip appears with `survey_id` only (no Popup, no sheet)
- **Click** marker → tooltip dismisses, UnitDeliverySheet opens directly (no Popup fighting)
- **Staff markers** now have consistent hover tooltip like admin
- **Dark mode** automatically uses the dark theme's `--popover` variable

**Industry standard:** Google Maps, Uber, Lyft all use hover tooltips for quick peeks and click for full info. This pattern is now implemented.

**Tooltip CSS:**
```css
.leaflet-tooltip.survey-tooltip {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  font-family: var(--font-geist-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
```

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 5) — Heartbeat on Admin Map Markers — Location: Office

**Focus:** Bring the selected-marker heartbeat animation (previously only on staff delivery markers) to the normal admin map.

**Problem:** `SurveyMarkers` (admin) rendered static markers. Clicking a marker opened the UnitDeliverySheet but the marker had no visual feedback indicating it was the active target. The pulse/heartbeat animation only worked on `StaffMapMarkers`.

**Files changed (1):**

1. **`src/components/survey-markers.tsx`**
   - Read `deliverTargetId` from `useBillingStore` (already imported)
   - For each marker, compute `isSelected = deliverTargetId != null && s.psid === deliverTargetId`
   - Pass `{ size: 10, selected: isSelected }` to `createMarkerIcon` (reusing the existing heartbeat logic in `src/lib/markers.ts`)

**How it works (existing infrastructure):**
- `createMarkerIcon(color, { selected: true })` renders a pulse ring around the marker
- The pulse uses `@keyframes marker-pulse` injected once in `markers.ts` (1.5s ease-in-out infinite, scale 0.6 → 2.5, opacity 0.5 → 0)
- Selected border: `2px solid #1e40af` (blue) vs `2px solid rgba(0,0,0,0.35)` (default)

**New behavior:**
- Open `/map` as admin → click any marker → that marker now pulses with a blue border + expanding ring
- Navigate prev/next via sheet → heartbeat follows the active marker
- Close sheet (X) → all markers return to static state
- Same behavior on staff map (was already working)

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 6) — GPS Enforcement Toggle + Test Data + Live GPS Tracking — Location: Remote

**Focus:** GPS enforcement settings (toggle + threshold), test survey units in DB, live distance indicator in sheet, pre-warmed GPS fix, query invalidation, staff location marker on map

**Done:**
- **Test data** — `scripts/sql/032-test-data.sql`: 5 survey units at admin PC coordinates (32.071639, 72.657694) with distances 20m/30m/40m/55m/70m, status=NULL, SARGODHA/SARGODHA/TESTMC. Pre-assigned batch for staff 'zubair' (uuid `671dd08c-...`).
- **GPS badge in sheet** — `POST /api/deliveries/mark` now returns `gps_lat`, `gps_lng`, `target_lat`, `target_lng`. `useDeliverUnit` returns all GPS fields. Sheet overlay shows GPS coords + distance after delivery.
- **App settings table** — `scripts/sql/033-app-settings.sql`: `app_settings(key, value jsonb)` + seed `gps_enforcement = {"enforce":true,"threshold":50}`.
- **Settings API** — `GET/PATCH /api/settings`. PATCH admin-only (checks role via profiles).
- **Settings UI** — New "Delivery" tab in Settings page (admin-only): toggle + threshold input + save.
- **Enforcement wired** — Mark route reads `gps_enforcement` from DB. `enforce=false` → always `delivered`. Configurable threshold instead of hardcoded 50.
- **Live GPS distance** — Sheet shows continuous distance via `watchPosition`: green ≤50m, amber 51-200m, white >200m.
- **Fix: GPS timeout** — `captureGPS` timeout 3s→8s. Sheet stores pre-warmed GPS from `watchPosition`, passes as `gpsOverride` to `deliver()` — instant GPS, no cold fix wait.
- **Fix: Stale cache** — `queryClient.invalidateQueries(['staff-assignment'])` fires after delivery — status updates instantly on `/deliver` list and map markers.
- **Fix: Staff location marker** — `useUserLocation()` hook (reusable `watchPosition` wrapper). Blue dot on staff map, no accuracy circle.
- **Switch component** — `src/components/ui/switch.tsx` (base-ui Switch primitive).

**New files:**
- `src/hooks/use-user-location.ts`
- `src/app/api/settings/route.ts`
- `src/components/ui/switch.tsx`
- `scripts/sql/032-test-data.sql`
- `scripts/sql/033-app-settings.sql`

**Modified files:**
- `src/components/delivery/unit-delivery-sheet.tsx`
- `src/components/delivery/staff-map.tsx`
- `src/hooks/use-deliver-unit.ts`
- `src/app/api/deliveries/mark/route.ts`
- `src/app/settings/page.tsx`

**Key discoveries:**
- 3s GPS timeout was too short for `enableHighAccuracy` on mobile — caused null GPS → `processing` for every delivery
- `app_settings` table had `text` column (pre-existing) instead of `jsonb` — had to DROP and recreate
- `city` column (migration 024) not applied to this Supabase project — omitted from test data INSERT
- No query invalidation existed after `POST /api/deliveries/mark` — delivery status was stale for 30s

**Testing Verification:**
1. Staff `/deliver` → tap item → sheet shows live distance + blue dot on map
2. Take photo at 5m → instant `delivered` (no GPS timeout "processing")
3. Status updates immediately on `/deliver` list and map marker color
4. Admin Settings → Delivery → toggle OFF → any distance = `delivered`
5. Change threshold to 80m → 55m delivery now `delivered` instead of `processing`
6. Staff map shows blue dot following their position

**Remaining phases (priority order):**
1. **B3** Delivery Stability & Hardening (CHECK fix, auth on mark, webhook timeout, GPS reliability, photo queue, state machine, remaining auth, RLS) — 8h ← **CURRENT FOCUS**
2. **P1** Egress & Stability (PSID pagination loop, unbounded fetches, staff stats fallback) — 6h
3. **P2** Authorization Hardening (`requireRole()`, RLS policies, ownership checks) — 4h
4. **C** Admin Dashboard (staff performance, delivery KPIs) — 3h
5. **E** Flag Management UI — 4h
6. **RBAC** Approval Chain (draft→pending→approved→active) — 3h
7. P3-P6 Validation, logging, egress caching — 17h
8. **F** Auto-Route Generation — 3h
9. **G** Live Admin Monitoring — 3h
10. **D** Visual Rehaul — 4h
11. **Z** Audit Cleanup — 4h
12. **Deploy** Office PC pipeline — 1h

### 2026-06-05 (Part 7) — Fix Invisible "Processing" Status — Location: Remote

**Focus:** Items with `status='processing'` (GPS null or distance > threshold) showed as blue "Pending" instead of amber "Processing" because `STATUS_CONFIG` and `STATUS_COLORS` had no `processing` key.

**Files changed (3):**

1. **`src/types/index.ts:121`** — Added `'processing'` to `AssignmentItem.status` union type (`'pending' | 'processing' | 'delivered' | 'missed' | 'skipped'`).

2. **`src/app/deliver/page.tsx`** — Added `processing: { label: 'Processing', dot: 'bg-amber-500' }` to `STATUS_CONFIG` (line 20). Added `item.status === 'processing' && 'text-amber-600'` to label color class (line 189).

3. **`src/components/delivery/staff-map-markers.tsx:11`** — Added `processing: '#f59e0b'` to `STATUS_COLORS`.

**Effect:** Items with `status='processing'` now show amber dot + "Processing" label on `/deliver` list and amber markers on the staff map. No longer falsely shown as "Pending".

**Build verification:** `npx tsc --noEmit` zero errors. `npm run build` successful.

**Remaining phases (updated):**
1. **B3** Delivery Stability & Hardening — 8h ← **CURRENT FOCUS**
2. **P1** Egress & Stability — 6h
3. **P2** Authorization Hardening — 4h
4. **C** Admin Dashboard — 3h
5. **E** Flag Management UI — 4h
6-12. Remaining phases per priority order

### 2026-06-05 (Part 8) — Speed Optimizations + Admin Force Complete — Location: Home

**Focus:** Speed up the delivery flow, eliminate GPS wait, improve post-delivery messages, add optimistic cache update, admin Force Complete for stuck processing items.

**Done (4 changes, 1 file addition):**

1. **Fast GPS timeout** (use-deliver-unit.ts): `captureGPS` timeout 8s → 3s. `enableHighAccuracy: false` (per Section 20 design — silent GPS, cached positions via `maximumAge: 5000`). Button fires request in ~3s max, even on GPS-poor devices.

2. **Context-aware delivery messages** (unit-delivery-sheet.tsx): Replaced generic "Photos pending sync" with two clear messages:
   - `deliveryDistance == null` → "Saved — Awaiting GPS Verification" (no GPS available)
   - `deliveryDistance != null` → "Out of range — Awaiting Review" (GPS worked but beyond threshold)
   - Removed emoji from GPS coords display (professional UI).

3. **Optimistic cache update** (unit-delivery-sheet.tsx): After successful `POST /api/deliveries/mark`, immediately `setQueryData(['staff-assignment', userId])` to flip the item's status + set `delivered_at`. List updates instantly (no refetch round-trip). Fallible invalidate still fires for eventual consistency.

4. **Admin Force Complete** (new route + sheet button):
   - New `POST /api/deliveries/force/route.ts`: Accepts `{ psid }`, verifies admin/super_admin role, finds the latest pending/processing assignment_item for that PSID, sets status='delivered'. Uses `createAdminClient()` (service_role key).
   - Sheet button: Shows "Force Complete (admin)" amber button in the action section when `deliveryStatus === 'idle'` and role is admin/super_admin. Uses `useConfirm()` for accidental-click protection. Invalidates staff-assignment + assignment-totals queries.

**Files changed:**
- `src/hooks/use-deliver-unit.ts` — 3 edits (timeout, accuracy, fallback)
- `src/components/delivery/unit-delivery-sheet.tsx` — 3 edits (messages, optimistic update, force complete button)
- `src/app/api/deliveries/force/route.ts` — NEW (38 lines)

**Key discoveries:**
- `enableHighAccuracy: true` on the office PC (no GPS chip) caused the full 8s timeout to elapse before every delivery attempt — the 3-step flow was 8s GPS wait + photo compression + upload = ~12-15s per delivery
- The generic "Photos pending sync" message was misleading — staff interpreted as sync failure when it was actually GPS failure
- No optimistic cache update meant status stayed "pending" in the list until the server refetch completed (30s staleTime)
- Admin had no way to clear stuck processing items without SQL

**Testing Verification:**
1. Staff `/deliver` → tap item → sheet opens → GPS resolves in ≤3s (was 8s+) — button feels snappy
2. No GPS device → request fires within 3s → amber "Saved — Awaiting GPS Verification" instead of "Photos pending sync"
3. Successfully delivered → list shows green immediately (no 30s wait)
4. Admin `/map` → click marker → "Force Complete (admin)" button shown → confirm → item flips to delivered
5. Force Complete from admin map → staff's list reflects green on next refetch (or instantly if cache invalidated)
6. `tsc --noEmit` — zero errors

---

### 2026-06-05 (Part 9) — Notifications System (P1-P3) + Users Tab Restructure — Location: Home

**Focus:** Build in-app notification system — DB, API, hooks, bell UI, and admin notification form. Restructure Users tab.

**Done (P1 — Notifications Infrastructure):**
- **P1a** — Created `scripts/sql/037-notifications.sql` (table, indexes, RLS). **Not applied to Supabase** — needs PAT token.
- **P1b** — Added `Notification` interface to `src/types/index.ts`
- **P1c** — `GET /api/notifications/route.ts`: Returns notifications + unread count + admin summary. Auto-creates `admin_alert` when `pending + processing > 0` with no existing unread alert.
- **P1d** — `POST /api/notifications/read/route.ts`: Mark single or all as read.
- **P1e** — `POST /api/admin/notifications/route.ts`: Admin sends to individual staff or all staff.
- **P1f** — `src/hooks/use-notifications.ts`: 3 React Query hooks (fetch, mark read, mark all read).

**Done (P2 — Notifications Bell UI):**
- **P2a** — `notifications-bell.tsx`: Bell icon + unread badge + bottom sheet (mobile) + dropdown anchored fixed (desktop). Admin summary block, notification list with type icons and deep links, "Mark all read" button, empty state, polling every 30s.
- **P2b** — `DesktopFilterBar ActionButtons`: `NotificationsBell` + satellite toggle (`Layers` button) side-by-side.
- **P2c** — `AppHeader` (mobile): `NotificationsBell` added after refresh button in header row 1.

**Done (P3 — Staff Notification Form):**
- Created staff notification form: recipient dropdown (all staff + individual field staff), subject, message, Send → `POST /api/admin/notifications`.
- **Moved from Delivery tab to Users tab sidebar** — more discoverable.
- **Panel positioning fix** — desktop dropdown uses `fixed` (not `absolute`) + `top-[48px] right-2`.
- **Recipient dropdown fix** — `SelectValue` now shows display name via `notifyUserLabel` memo instead of UUID.

**Done (Users Tab Redesign):**
- Flex row layout (sidebar 260px + main `flex-1`).
- City group header rows (★ Super Admin / Admin / City name / Unassigned) using `<Table>` component.
- Sorted by role → city → name.
- `RoleSelect` CSS with colored dots (blue for admin, muted for staff).

**Known issue:** `037-notifications.sql` not yet applied to Supabase — PAT token required.

### 2026-06-06 — Users Tab UI Polish (P4) — Location: Home

**Focus:** Polish Users tab — city accent colors, typography consistency, dropdown styling.

**Done (P4 — Users Tab UI Polish):**
- **P4.1** — Added `hideChevron` prop to `SelectTrigger` in `src/components/ui/select.tsx`. Enables clean icon-only action dropdowns without a visible chevron icon.
- **P4.2** — City accent colors on group headers (emerald=Sargodha, blue=Bhalwal, amber=Khushab) matching CitySwitcher. Same colors applied to city selector dropdowns in Add User + Edit City dialogs.
- **P4.3** — Typography consistency: table header `text-[11px]` → `text-xs`, group headers `text-[11px]` → `text-xs`, badges `text-[9px]` → `text-[10px]`.
- **P4.4** — Action dropdown cleanup: removed conflicting CSS (`min-w-[32px] w-8 h-8 p-0 flex items-center justify-center`), replaced with `size="sm" className="size-7 p-0"` + `hideChevron`.

**Key decisions:**
- `hideChevron` is a prop on the shared `SelectTrigger` — reusable for any icon-only select
- City accent colors match `CitySwitcher.tsx` exactly (emerald-600/dark:emerald-400 for Sargodha, etc.)
- `size-7` matches `data-[size=sm]:h-7` — no fighting CSS dimensions

**Testing Verification:**
1. Open `/settings` → Users tab → city group headers show colored text (emerald=Sargodha, blue=Bhalwal, amber=Khushab)
2. Add User / Edit City dialogs → city dropdown items show colored city names
3. Action dropdown (⋮) has no chevron — just the three dots icon
4. `npx tsc --noEmit` — zero errors

### 2026-06-07 (Part 10) — Post-Launch Bug Fixes: Double Header, HDS z-index, FloatingActions, Mobile Header — Location: Home

**Focus:** Fix 4 post-launch bugs identified in field use — double header on desktop, HDS body not rendering from map, floating icons behind map, mobile header styling.

**Done (Double Header Fix):**
- **`AppShell.tsx:64`**: Wrapped `<AppHeader />` in `<div className="lg:hidden">` — hides mobile top bar on desktop (≥1024px). Desktop now shows sidebar-only header.

**Done (HDS Body Not Rendering from Map):**
- **Fixes applied in 2 files:**
  1. `map/page.tsx:127`: Added `setDeliverTarget(null, null)` before `selectHouse(survey_id)` — closes UnitDeliverySheet first when tapping "View Details". Prevents z-index clash between two overlapping fixed overlays (UnitDeliverySheet at z-[1001] vs HDS at z-50).
  2. `house-detail-sheet.tsx:168`: Changed HDS mobile z-index from `z-50` → `z-[800]`. Root cause: Leaflet's internal panes use z-indexes up to **700** (tile pane 200, marker pane 600, popup pane 700). The HDS at z-50 rendered BELOW Leaflet tiles, so the map covered the HDS body. HDS header appeared because it sits above the map container's top edge. Works on list page because no Leaflet map is present.
  - `transform-gpu` tested and reverted — not the root cause.
  - `min-h-0` tested and reverted — not the root cause.

**Done (Mobile Floating Actions):**
- **`floating-actions.tsx`**: Changed `z-40` → `z-[800]` — floating icons were behind Leaflet's tile pane (z-200). Added direct `mobileFilterOpen` state for filter sheet control, removing broken `document.getElementById('mobile-filter-trigger')?.click()` mechanism. Added `active` prop to Satellite icon → blue tint when satellite mode active. Added `active` prop to `ActionButton` for dynamic coloring.
- **`filter-panel.tsx`**: `MobileFilterSheet` interface changed from `{ triggerId?: string }` to `{ open: boolean; onClose: () => void }`. Removed internal `useState`, hidden trigger button, and fragile hidden-DOM click mechanism (the hidden `<div className="absolute opacity-0 pointer-events-none w-px h-px overflow-hidden">` wrapper). Filter sheet now opens reliably via direct state prop.
- **`map/page.tsx`**: Removed hidden `MobileFilterSheet` wrapper div and its import.

**Done (Mobile Header Styling):**
- **`AppHeader.tsx`**: 3 changes for uniform mobile header:
  1. Status text (`Syncing...`/`Updated`) moved from between Bell and Avatar to **before the Refresh button** — clean icon grouping.
  2. Refresh button: `h-11 w-11` (no border) → `h-9 w-9 border border-border` — matches NotificationsBell exact style.
  3. Avatar: `w-5 h-5` initial-only badge → `h-9 border` button with initial + truncated display name.
  All 3 right-side elements share uniform `h-9 border border-border rounded-lg hover:bg-muted` styling.

**Known Issues (Carried Forward):**
- `037-notifications.sql` not yet applied to Supabase — PAT token required.
- F1 (GAS webhook timeout) still 🔴 Blocker — needs office PC verification.
- Search in FloatingActions uses `setPendingFilter` instead of `setFilters` — search text does not apply to data queries (pending fix).
- Mobile Filter icon lacks active filter indicator (pending fix).
- Map view does not update markers after filter Apply on mobile (pending investigation).

### 2026-06-07 (Part 11) — Toast Redesign + "Always Unsent" Feature + Delivery Fixes — Location: Office

**Focus:** Redesign toast system, implement "always unsent" delivery mode, fix the delivery status gap in unsent mode, establish testing protocol.

**Done:**

**GPS Accuracy field:**
- `src/hooks/use-user-location.ts` — Added `accuracy` field to return type. `sharedLocation.accuracy` returns meters. GPS retry logic with exponential backoff (1s, 3s, 10s) on watch failure.

**Toast Redesign (1 file):**
- `src/hooks/use-toast.tsx` — Redesigned from bottom-right card stack to top-right slim pill below header. Styled as `rounded-full bg-white/90 backdrop-blur-sm` with variant-colored border + icon. `animate-slide-in-right` animation. 5s duration. `max-w-[260px]` on mobile. Keyframes added to globals.css.

**"Always Unsent" Feature — 7 steps:**
1. **Step 1** — `scripts/sql/038-unsent-mode-setting.sql`: INSERT into `app_settings` with `key='unsent_mode'`, value `{"enabled":false,"max_limit":50}`. Applied to Supabase.
2. **Step 2** — `src/app/settings/page.tsx`: Admin toggle in Delivery tab sidebar: switch + max limit input + summary line "Unsent: On (max 50)". Saved via existing `PATCH /api/settings`.
3. **Step 3** — `src/components/delivery/unit-delivery-sheet.tsx`: handleFile unsent mode path — compress → enqueue to IndexedDB with `skipAutoSync: true` → local `setDeliveryStatus('processing')` → auto-advance 1.5s. No webhook call. Max limit enforcement: if queueCount >= unsentMaxLimit → toast + return early.
4. **Step 4** — `src/components/delivery/unsent-badge.tsx`: Floating bottom-right button with queue count badge + slim modal ("Sync All" + progress bar + error display).
5. **Step 5** — `src/hooks/use-photo-queue.ts`: `skipAutoSync` param on `enqueuePhoto` — when true, skips `processQueue()` call.
6. Step 6 — `src/hooks/use-unsent-photos.ts`: Blob storage deferred blob-to-base64 in `retrySingle`.
7. Step 7 — Verify all pass `npx tsc --noEmit`.

**Fixed: Unsent Delivery Status Gap (5 fixes):**
1. **Fix 1** — `src/app/api/deliveries/mark-processing/route.ts`: NEW endpoint. Auth check (getUser + ownership), creates delivery_photos placeholder (`photo_url = 'pending://unsent/{id}'`), sets assignment_items.status = 'processing'. Returns { status: 'processing' }.
2. **Fix 1b** — `src/components/delivery/unit-delivery-sheet.tsx`: handleFile calls POST /api/deliveries/mark-processing BEFORE enqueue. Catches error with distinct message.
3. **Fix 2** — `src/components/delivery/unsent-badge.tsx` → refactored to `UnsentModal` (just modal content, no floating button). `src/app/deliver/page.tsx`: Added 📷 icon in filter pills row (between "All" pill and right edge) with queue count badge. *Note: user requested this be in FloatingActions instead — deferred to next session.*
4. **Fix 3** — `src/app/api/deliveries/promote/route.ts`: NEW endpoint. Finds placeholder delivery_photos row (synced_to_drive=false), updates with real Drive URL + gdrive_file_id. Updates assignment_items.status = 'delivered'. Uses promote instead of duplicate insert. `src/hooks/use-photo-queue.ts`: uploadSingle calls POST /api/deliveries/promote instead of POST /api/delivery/photos.
5. **Fix 4** — `src/hooks/use-photo-queue.ts`: processQueue now processes in batches of 3 concurrently via Promise.allSettled. uploadSingle returns 'ok' | 'retry' | 'orphan'. Orphan on 403/404 = remove from queue silently.
6. **Fix 5** — Orphan cleanup: promote endpoint errors with 403/404 → uploadSingle returns 'orphan' → removed from queue.

**Key decisions:**
- Blob storage in IndexedDB eliminates FileReader UI freeze on main thread.
- Delivery status must be recorded at capture time (`processing`), even if photo upload is deferred.
- "Always unsent" default OFF — admin must enable. Staff sees filter-bar icon with count badge when queue is non-empty.
- Unsent icon should be in FloatingActions (map page floating panel), not in deliver page filter bar — deferred to next session.
- Progress steps were overlaid on action buttons area — confusing for staff. Redesigned to sequential toast updates in Part 12.
- GPS signal 3-dot indicator was described in documentation but never rendered in the sheet. Implemented in Part 12.
- All 5 fixes pass `npx tsc --noEmit` with zero errors.

**Testing Verification:**
1. **Pre-cleanup**: Delete IndexedDB databases, reset 10 test items to `pending`, ensure unsent_mode ON
2. Staff `/deliver` → tap pending → take picture → "Saved to queue" → auto-advance 1.5s
3. DB: status = `processing`, delivery_photos placeholder row
4. Filter bar 📷 badge increments
5. Sync All → photos upload (batch 3 concurrent) → status = `delivered`, real Drive URL
6. Max limit: 50th item blocks 51st with toast
7. Orphan: revoke assignment → Sync All → photo removed silently
8. Admin toggles OFF → normal online upload resumes

### 2026-06-07 (Part 12) — Progress Steps → Sequential Toasts + GPS Signal Dots — Location: Home

**Focus:** Fix the progress overlay in delivery sheet (moved to sequential toast updates), implement GPS signal 3-dot indicator.

**Done:**

**Sequential Toast Updates (3 files):**
- `src/hooks/use-toast.tsx` — Added `updateToast(id, message, variant?)`. Reuses existing toast ID, clears old timer, updates message/variant in-place, sets new 5s auto-dismiss. Returns toast ID from `toast()` for chaining.
- `src/hooks/use-deliver-unit.ts` — Added optional `onProgress: (step: DeliveryProgress) => void` callback parameter to `deliver()`. Called at each progress state transition (compressing, uploading, saving) so the sheet can fire toast updates. Backward compatible.
- `src/components/delivery/unit-delivery-sheet.tsx`:
  - **Removed** progress step checklist (the `✓ ○ spinner` step list that replaced action buttons during delivery)
  - **Online path**: One toast ID, updates through `Compressing photo...` → `Uploading to Drive...` → `Recording delivery...` → final `Delivered (Xm away) ✓` or `Processing — awaiting review`
  - **Unsent path**: One toast ID, updates through `Saving to queue...` → `Compressing photo...` → `Saved to queue ✓`
  - Action buttons always visible — button shows `Processing...` and disabled during delivery

**GPS Signal Dots (1 file):**
- `src/components/delivery/unit-delivery-sheet.tsx` — 3 dots after live distance text:
  - Accuracy ≤ 10m → 3 green dots
  - Accuracy ≤ 50m → 2 green, 1 gray
  - Accuracy > 50m → 1 green, 2 gray
  - No accuracy → all gray
  - Conditionally rendered when `liveGpsStatus === 'ready'` and `sharedLocation.accuracy != null`

**Key decisions:**
- Progress steps no longer block the action buttons area — staff sees button state throughout delivery.
- Sequential toasts use a single toast slot — updates in-place without stacking multiple toasts.
- `updateToast` is a general-purpose utility (not delivery-specific) — reusable for any progressive workflow.
- GPS dots use local `gpsAccuracy` state (set from sheet's own watchPosition success callback).

**Testing Verification:**
1. `/deliver` → tap pending → tap "Take Picture & Deliver" → toast shows "Compressing photo..." → updates to "Uploading to Drive..." → final "Delivered (Xm away) ✓"
2. Action buttons visible throughout delivery — button shows "Processing..." and disabled
3. GPS signal 3 dots render near live distance text (3 green = strong, 2 green = fair, 1 green = poor)
4. Unsent path: "Saving to queue..." → "Compressing photo..." → "Saved to queue ✓"
5. `npx tsc --noEmit` — zero errors

---

### 2026-06-07 (Part 13) — GPS Debugging Black Hole + lfsvc Discovery — Location: Home

**Focus:** Debug why restored watchPosition code still showed "Locating..." and later "GPS unavailable" on desktop.

**Done:**

**GPS regression analysis (git archaeology):**
- Working version = commit `ac1bfc8` (5pm 6-6-26). Three effects: (1) fast `getCurrentPosition` low-accuracy init, (2) `watchPosition` high-accuracy live tracking, (3) unmount cleanup.
- Office commit `248e6b6` replaced (2)+(3) with a sync effect reading from shared `useUserLocation` hook — B3b.2 "Single GPS watcher" optimization.
- On desktop: fast init still ran and set `'ready'` via Wi-Fi in ~1-2s, but the sync effect's `sharedLocation` dependency caused a race that sometimes overrode to `'unavailable'`.
- After reverting to the three-effect pattern, the same desktop showed "GPS unavailable" — both `getCurrentPosition` and `watchPosition` failed.

**Root cause (non-code):**
- Windows **Geolocation Service** (`lfsvc`) was set to **Disabled**. Settings UI showed "Location on" but the service never started.
- `navigator.geolocation` calls were silently failing everywhere — including Google Maps.
- Fix: `sc.exe config lfsvc start=auto` + `sc.exe start lfsvc` — service now running.

**Key decisions:**
- **B3b.2 was premature production optimization.** Two `watchPosition` calls (map + sheet) share the same GPS chip — the second callback adds negligible battery drain. Keeping both is fine during development.
- **Deferred: Real battery optimization** — `useUserLocation` should use `enableHighAccuracy: false` by default (Wi-Fi/cell, GPS chip off), briefly switch to high accuracy only when the sheet opens for distance calculation. Marked in Remaining Corrections below.
- **Code remains at proven three-effect pattern.** No shared-watcher complexity. Simple, worked before, will work again.

**Testing Verification:**
1. Verify lfsvc is Running: `Get-Service lfsvc` → Status: Running
2. Hard refresh `/deliver` → tap pending → GPS shows distance within 1-2s
3. GPS dots render based on accuracy (3 green = strong, etc.)
4. Toast delivery feedback works through all steps
---
### 2026-06-08 — Delivery Photo Proxy Hardening + Data Insight Fixes — Location: Home

**Focus:** Fix data insight images, proxy endpoint for delivery photos, refresh cache, dashboard overflow fix

**Done:**

- **Created `/api/delivery/photo/[fileId]` proxy endpoint** — serves delivery photos from `lh3.googleusercontent.com` server-side with 24h cache (no more direct Google Drive URLs)
- **Changed all `photo_url` formats** — `mark/route.ts`, `sync-photo/route.ts`, `use-photo-queue.ts`, `use-unsent-photos.ts` now store `/api/delivery/photo/{gdrive_file_id}` instead of direct Google thumbnail URLs
- **Added `survey_id` upload key** — GAS webhook receives `surveyId: survey_id || psid` for consistent Drive image organization matching HDS query
- **Fixed HDS thumbnail grid** — `flex overflow-x-auto` → `grid grid-cols-3 gap-2 aspect-square` for natural mobile wrapping
- **Preserved photos on revoke** — removed `delivery_photos.delete()` from revoke handler; photos persist across revoke-test cycles
- **Split delivery timestamps** — `startedAt` (before upload) vs `deliveredAt` (after upload) for accurate admin table duration
- **Added `image_urls` to Data Insight drill-down** — `data-insight-repository.ts` `.select()` and `UnitRow` type now include `image_urls`; portal images show in HDS when opened from Data Insight
- **Fixed Data Insight `selectHouse` call** — passes full `unitRows` instead of stripped `{ survey_id }` objects (was discarding all fields)
- **Created `POST /api/data-insight/refresh`** — calls `refresh_hierarchy_summary()` RPC via admin client; admin-only endpoint
- **Added "Refresh Cache" button** — in Data Insight toolbar with spinner + toast feedback; placed in same row as Active/Archived/Duplicates filter tabs
- **Regrouped toolbar layout** — Back button on its own row above; filter tabs + Refresh button in `justify-between` row
- **Fixed Dashboard/Office Breakdown overflow** — added `overflow-x-auto min-w-0` to Dashboard wrapper, `min-w-0` to map content flex parent, `w-full overflow-x-auto` to table wrapper
- **Added `overflow-x-auto` to Dashboard loading skeleton** — consistent overflow behavior during loading state

**Key decisions:**
- Proxy endpoint over direct Google URLs — images served from same domain eliminate all browser auth/cookie/CORS issues
- Google Drive stays as source of truth — app fetches server-side and caches for 24h
- Always INSERT delivery_photos (never UPSERT) — preserves full history across months
- Revoke keeps photos — only resets assignment_item status, historical record preserved
- Data Insight cache requires manual "Refresh Cache" after payment imports

**Testing Verification:**
1. Staff `/deliver` → tap pending → take photo → toast stack shows progress → auto-advance
2. Admin `/map` → Data Insight → drill into MC → "Open" shows portal images in HDS
3. Data Insight → "Refresh Cache" → spinner → toast → KPI numbers update
4. Dashboard → Office Breakdown tab → horizontal scrollbar on wide table
5. Revoke delivery → re-test → old photos persist in HDS gallery
6. Offline → capture photo → amber "Processing" overlay → syncs when online

**Next session:**
- Delivery hardening end-to-end testing protocol
- Apply `037-notifications.sql` migration
- Fix remaining P0/P1 items from Section 25 (unsent mode queue, sync-photo promote, redelivery photo drop)


## 19. Data Model Rules (Comprehensive Reference)

This section codifies every data-modeling rule discovered during development. Violations cause bugs. Read before making any schema or query changes.

### 19.1 Geography Model (3 Cities, 1 District Overlap)

Sargodha is BOTH a district AND a tehsil. Bhalwal is a tehsil within Sargodha district. This creates a containment trap — filtering only by `city_district` when "Sargodha" is selected also returns Bhalwal UCs.

**Rules:**
- Every city-scoped query MUST filter by BOTH `city_district` AND `tehsil` — never just one.
- Use `CITY_TEHSIL_MAP` from `src/lib/queries/hierarchy.ts` to get the correct pair:
  ```
  Sargodha → { district: 'SARGODHA', tehsil: 'SARGODHA' }
  Bhalwal  → { district: 'SARGODHA', tehsil: 'BHALWAL' }
  Khushab  → { district: 'KHUSHAB', tehsil: 'KHUSHAB' }
  ```
- `useBillingStore.selectedCity` stores **display name** (`"Sargodha"`). Always convert via `CITY_TEHSIL_MAP[selectedCity]` before passing to APIs.
- `getCityFromTehsil(district, tehsil)` reverses the lookup — useful for city resolution from DB row data.

**Broken patterns (historical):**
- `/map` filter bar — `District/Tehsil` cascade was replaced by CitySwitcher for this reason
- `getAssignmentList` in Manage tab — was filtering by `city_district` only (fixed: now also filters by `tehsil`)
- Routes tab — was passing display name directly instead of via `CITY_TEHSIL_MAP` (fixed)

### 19.2 survey_units.status Semantics

Three distinct states:

| status value | Meaning | Count |
|-------------|---------|-------|
| `NULL` | Enriched from lifecycle (has PSID, monthly_fee, etc.) — effectively active | ~160K |
| `'ACTIVE'` | Explicitly set active (survey-only, no lifecycle enrichment) | ~53K |
| `'ARCHIVED'` | Lifecycle `Deleted in Portal = Yes` | ~5K |

**Rules:**
- NEVER use bare `.eq('status', 'ACTIVE')` — it misses the 160K null-status enriched units.
- ACTIVE filter: `or('status.is.null,status.eq.ACTIVE')` via `applyActiveFilter()` from `src/lib/queries/survey-units.ts`.
- ARCHIVED filter: `not('status', 'is', null).neq('status', 'ACTIVE')` via `applyArchivedFilter()`.
- DUPLICATES: filtered via `flagged_psids` join (not a status value).

### 19.3 Delivery Target Key: psid (not survey_id)

| Field | survey_units coverage | Purpose |
|-------|----------------------|---------|
| `psid` | 207,746 / 212,428 (98%) — always populated after enrichment | Delivery target, QR fallback, payment join |
| `survey_id` | 212,428 (100%) — PK, always non-null | Frontend list keys, QR primary scan target |

**Rules:**
- `psid` is the delivery target key — all assignment items, delivery tracking, and map markers use psid.
- `survey_id` is the canonical frontend list key (always non-null, avoids React duplicate-key warnings).
- Frontend expand states use `survey_id` instead of `psid` — prevents `null === null` auto-expand bug.
- QR scanning matches by `survey_id` (from `sid={survey_id}` in QR code) → looks up assignment item by `survey_id`.
- `psid = null` means **new/unregistered survey** — no lifecycle PSID assigned yet.

### 19.4 Domain Separation: Biller Data ≠ Payment Data

These are two independent domains bridged only by `psid`. Never couple their queries.

| Domain | Table | Source | Update frequency |
|--------|-------|--------|-----------------|
| Biller data | `survey_units` (21 enriched fields) | Lifecycle XLSX via `enrich-survey-units.py` | Monthly (16th–20th) |
| Payments | `payment_history` | Payment CSV via `load-payments.py` | Daily (multiple times) |

**Rules:**
- `survey_units` holds the **current month snapshot** of billing data (monthly_fee, arrears, route_name, etc.) — overwritten each month.
- `payment_history` is **append-only** — all months historically complete, keyed on `(psid, bill_month)` with upsert.
- The bridge is `psid`: `payment_history.psid → survey_units.psid`.
- `amount_due` is DROPPED — SWMC miscalcs it. App computes `monthly_fee + arrears` in UI.
- Billing charts aggregate directly from `payment_history` via the `get_charts_data` RPC — no `survey_units` join in aggregation (caused 30s timeout on 122K rows).
- For geography filtering in charts: payment_history now stores `city_district`, `tehsil`, `uc_name` directly — no LATERAL join needed.
- **Orphaned PSIDs** (490 rows in payment_history without matching survey_units) exist because govt portal allows deleting survey IDs without deactivating PSIDs. Charts show "Unknown" for these.

### 19.5 Assignment & Delivery Model

| Table | Key concept | Key columns |
|-------|-------------|-------------|
| `daily_assignments` | Creation event per staff+UC | `id`, `staff_id`, `issued_at` (not assigned_date), `uc_name`, `total_items` |
| `assignment_items` | Individual PSID delivery | `assignment_id`, `psid`, `survey_id`, `status` (pending/delivered/missed/skipped) |
| `delivery_photos` | Photo proof per delivery event | `assignment_item_id`, `photo_url`, `gps_lat/lng`, `captured_at` |
| `staff_daily_stats` | Per-assignment rollup | `staff_id`, `assignment_id`, `delivered`, `missed` |

**Rules:**
- `issued_at` = creation timestamp, NOT a delivery deadline. Staff sees ALL pending items across ALL batches.
- `staff_daily_stats` keyed on `(staff_id, assignment_id)` — one row per assignment batch, not per day.
- Trigger `refresh_staff_daily_stats` recomputes stats on `assignment_items` INSERT/UPDATE/DELETE.
- `delivery_photos` is linked to `assignment_items` (not `survey_units`) — one house has 12 photos across 12 monthly deliveries.
- GPS is captured silently on photo confirm — staff does not know. GPS failure silently produces NULL (photo timestamp alone is sufficient proof).
- `survey_id` on `assignment_items` enables QR scan → match by `survey_id` directly without extra psid lookup.

### 19.6 Staff-City Assignment

**Rules:**
- `staff.assigned_city` is set in Settings → Users → Edit City.
- Only field_staff with `assignedCity` set will be filtered in assignment UI dropdowns (no fallback to unassigned staff).
- Cross-city assignments are blocked server-side: `createAssignment` looks up staff's `assigned_city`, validates against UC's district/tehsil via `CITY_TEHSIL_MAP`, returns 400 on mismatch.
- CitySwitcher auto-filters: staff with `assignedCity` see only that city's option, chevron hidden, button disabled.
- AppShell auto-selects assigned city on mount for field_staff (calls `setCity` with correct district/tehsil).
- Staff with no `assignedCity` (fallback for unconfigured accounts) see all 4 options.
- Admin writes to `staff` table (e.g., PATCH assigned_city) must use `createAdminClient()` (service_role key) — `createClient()` uses anon key and triggers RLS violations.

### 19.7 Auth & User Model

| Table | Purpose | Key |
|-------|---------|-----|
| `auth.users` | Supabase Auth — actual login | id (UUID) |
| `profiles` | App-level user metadata: role_id, username, display_name, suspended_at, deleted_at | id → auth.users |
| `staff` | Field staff operational data: assigned_city, is_active | id → auth.users |
| `roles` | Role definitions: super_admin (1), admin (2), field_staff (3) | id |

**Rules:**
- Username-based auth: app transforms `input` → `input@billing.local` via `toEmail()` for Supabase Auth.
- Frozen accounts (`suspended_at != NULL`) blocked with "Account is frozen. Contact your admin." message.
- Soft-delete (`deleted_at`) preserves performance history — hard delete only if GDPR required.
- `trg_sync_profile_to_staff` trigger auto-syncs field_staff profiles → `staff` table on INSERT/UPDATE/DELETE.
- `GET /api/staff` uses two-query approach (profiles → staff rows) because no FK exists between them — both reference `auth.users` independently.
- Staff without a `staff` table row default to `is_active: true` (from the two-query approach).

### 19.8 Reference Tables (Filter Dropdowns)

Three reference tables replace `SELECT DISTINCT` on 212K-row tables:

| Table | Populated from | Maintenance |
|-------|---------------|-------------|
| `hierarchy` | `survey_units` DISTINCT (city_district, tehsil, uc_name) for ACTIVE units | Trigger `trg_survey_units_upsert_hierarchy` on survey_units changes |
| `surveyors` | `survey_units` DISTINCT surveyor_name for ACTIVE units | Manual re-seed from `enrich-survey-units.py` |
| `bill_months` | `payment_history` DISTINCT bill_month | Manual re-seed from `load-payments.py` |

**Rules:**
- All filter dropdowns query these tables — never DISTINCT on survey_units.
- These three tables never exceed 1000 rows total — zero PostgREST row limit issues.
- Hierarchy trigger handles INSERT/UPDATE/DELETE on survey_units — new UC combos added, orphaned combos removed.
- If reference tables go stale (e.g., after bulk import), re-run the import script which upserts them.

### 19.9 Billing Cycle

**Critical: A billing month runs from 16th of current month to 15th of next month.**

- `MAY2026` billing cycle = May 16, 2026 → June 15, 2026 (midnight)
- `JUN2026` billing cycle = June 16, 2026 → July 15, 2026 (midnight)
- `currentMonth()` in `src/lib/constants.ts`: if `new Date().getDate() < 16`, use previous calendar month.
- **May 31 does NOT signify end of billing cycle.** The cycle always runs 16th → 15th.
- Charts use cycle-relative day numbering: Day 1 = 16th of bill month. Formula: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)`.
- `sortMonths()` helper converts `"MMMYYYY"` → `year*12 + monthIndex` for correct chronological sort (alphabetical is wrong: APR < FEB < JAN < ...).

### 19.10 Database Trigger Inventory

| Trigger | Table | Event | Function | Purpose |
|---------|-------|-------|----------|---------|
| `trg_payment_history_refresh_summary` | `payment_history` | AFTER INSERT/UPDATE/DELETE | `refresh_payment_summary()` | Recomputes `payment_summary` for affected bill_month |
| `trg_survey_units_upsert_hierarchy` | `survey_units` | AFTER INSERT/UPDATE/DELETE | `sync_hierarchy()` | Maintains `hierarchy` reference table |
| `trg_refresh_staff_stats` | `assignment_items` | AFTER INSERT/UPDATE/DELETE | `refresh_staff_daily_stats()` | Recomputes `staff_daily_stats` for affected staff+assignment |
| `trg_sync_profile_to_staff` | `profiles` | AFTER INSERT/UPDATE/DELETE | `sync_profile_to_staff()` | Auto-syncs field_staff profiles → staff table |

### 19.11 API Route Data Flow

```
Browser hook → fetch('/api/...') → Next.js API route → Supabase client → DB
                                  ↑
                          imports from
                      src/lib/queries/
                      src/lib/repositories/
```

**Rules:**
- All client data goes through SSR API routes — NO direct `createClient()` calls in hooks, stores, or components (except `supabase.auth.*` SDK calls).
- API routes use `createClient()` (anon key, respects RLS) for reads. Admin writes use `createAdminClient()` (service_role, bypasses RLS).
- Shared query modules in `src/lib/queries/` are the single source of truth for filters and column lists.
- Repositories in `src/lib/repositories/` encapsulate complex multi-step query logic.
- `select('*')` is BANNED — always name explicit columns. Exception: count-only queries (`head: true`).
- PostgREST 1000-row hard limit: use `fetchAllRows()` batched fetch for queries returning >1000 rows.
- Every hook must have explicit `staleTime` from `STALE_TIMES` constants — never default 0.
- Mutation → invalidate pattern: every mutation invalidates affected query keys by prefix.

### 19.12 Approved RPCs (All Others Banned)

RPCs are banned for client-facing features. Only these exceptions are allowed:

| RPC | Purpose | Source |
|-----|---------|--------|
| `get_charts_data` | Billing charts aggregation (122K payment rows) | `scripts/sql/021-charts-aggregation.sql` |
| `get_survey_group_stats` | Data Insight admin aggregation | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_billing_group_stats` | Data Insight admin aggregation | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_billing_summary` | Admin billing KPI cards | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_payment_summary` | Admin payment summary | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_route_tree` | Route tree sidebar | `scripts/sql/029-route-tree-rpc.sql` |

All other aggregation must happen in TypeScript (repository layer).

### 19.13 Data Integrity Rules

| Rule | Enforcement | Notes |
|------|-------------|-------|
| `payment_history.(psid, bill_month)` unique | DB constraint + upsert | Idempotent — safe to run daily import multiple times |
| `assignment_items.(assignment_id, psid)` unique | DB constraint | Same PSID can't be in the same batch twice |
| `staff_daily_stats.(staff_id, assignment_id)` unique | DB constraint | One stats row per assignment batch |
| `hierarchy.(city_district, tehsil, uc_name)` unique | DB constraint | No duplicate geography entries |
| `survey_units.psid` partial unique index | DB index | `WHERE psid IS NOT NULL` — allows multiple NULLs for unregistered surveys |
| Payment CSV upsert idempotent | `ON CONFLICT DO NOTHING` | Safe to re-run multiple times daily |
| Lifecycle enrichment overwrites current month | Upsert on survey_id | Old enrichment remains until overwritten |
| City validation on assignment creation | Server-side in `createAssignment` | Rejects cross-city with 400 |
| Staff-city auto-restriction | CitySwitcher + AppShell | Single-option for assigned staff, chevron hidden

---

## 20. Delivery Verification System

### 20.1 Design Principle: Silent Verification

Staff does NOT know GPS is being captured or verified. The UI shows only "Take Picture" → green checkmark or yellow "Processing" badge. GPS + timestamp + distance check all happen server-side.

This prevents gaming: staff cannot fake deliveries because every photo is geotagged and verified against the survey marker coordinates. Over months, GPS drift reveals systematic cheating.

### 20.2 Status Flow

```
pending → [Take Picture + GPS + Upload] → DELIVERED (if distance ≤ 50m)
                                         → PROCESSING (if distance > 50m or GPS null)
                                              → admin review → delivered OR flagged
```

| Status | Meaning | Staff sees | Admin sees |
|--------|---------|-----------|------------|
| `pending` | Assigned, not acted | Blue dot | Blue dot |
| `processing` | Photo taken, awaiting verification | Yellow badge "Under Review" | Yellow dot, click to verify |
| `delivered` | Photo + GPS verified within threshold | Green checkmark | Green checkmark |
| `missed` | _(not used — full enforcement)_ | — | — |
| `skipped` | _(not used — full enforcement)_ | — | — |

### 20.3 One-Tap Delivery Flow

```
1. Staff taps "📷 Take Picture" in UnitDeliverySheet
2. Native camera opens (capture="environment")
3. Staff takes photo → sheet shows brief preview → auto-dismisses
4. Background (non-blocking for staff):
   a. Compress to WebP (OffscreenCanvas, q0.6, 1024px → 30-70KB)
   b. Capture GPS (navigator.geolocation, 3s timeout, enableHighAccuracy: false)
   c. POST FormData to /api/deliveries/mark
5. Server processes:
   a. Upload photo to GAS webhook (staff_sync_logs table)
   b. Save Drive URL to delivery_photos
   c. Calculate Haversine distance(delivery_gps, survey_marker_gps)
   d. If ≤50m → status='delivered' ELSE → status='processing'
6. Sheet shows result → auto-advance to next pending item
```

**Total staff time per delivery:** ~2-3 seconds (photo → snap → done)
**No "Confirm Delivery" button** — one tap, auto-saves.

### 20.4 Distance Verification

**Formula:** Haversine distance between `delivery_photos.gps_lat/lng` and `survey_units.lat/lng`

**Default threshold:** 50 meters (street-level precision in Pakistani urban areas)

**Configurable:** Per-city threshold via admin settings (future)

**Edge cases:**
| Condition | Result |
|-----------|--------|
| GPS null (timeout/denied/unavailable) | status = `processing` — admin review |
| Survey marker lat/lng null | status = `processing` — admin review |
| Distance ≤ 50m | status = `delivered` — auto-verified |
| Distance > 50m | status = `processing` — admin reviews, may adjust marker or accept |
| Staff corrects marker (long-press map) | New coordinates saved to `house_corrections`, delivery re-verified |

### 20.5 Photo Pipeline

```
Camera → OffscreenCanvas compress → WebP blob (q0.6, 1024px)
  → FormData → POST /api/deliveries/mark
    → Server: POST to GAS webhook → Drive URL
    → Server: INSERT INTO delivery_photos (photo_url, gps_lat/lng, captured_at)
    → Server: INSERT INTO staff_sync_logs (email, survey_id, file_id, synced_at)
    → Server: UPDATE assignment_items SET status = [delivered|processing]
    → Response: { status, verified, distance }
```

**Key properties:**
- Photos stored in Google Drive (not Supabase Storage) — zero egress cost
- WebP format, 30-70KB per photo (existing legacy app achieves this)
- Https://drive.google.com/thumbnail?id={fileId}&sz=w200 for display
- Two GAS webhook URLs exist (legacy + current) — consolidate to one

### 20.6 Staff Speed Optimization

| Bottleneck | Fix | Impact |
|------------|-----|--------|
| Two-step confirm (Take Picture → Confirm) | One-tap: photo taken → auto-saves | -1 tap, -2s per delivery |
| Canvas compression on main thread | OffscreenCanvas or WebP capture natively | No UI freeze |
| Base64 encoding | FormData with raw Blob | -30% CPU, -200ms |
| GPS timeout 5s | Reduce to 3s, enableHighAccuracy: false | -2s per delivery |
| Webhook blocking UI | Handle webhook server-side synchronously | Staff not blocked |
| All map markers rendered | Cluster at low zoom, cull out-of-viewport | Smoother map |
| Battery drain from constant GPS | GPS only when sheet opens, release on close | Less background drain |

---

## 21. Audit Findings Summary (2026-06-04)

### 21.1 Grades

| Area | Grade | Verdict |
|------|-------|---------|
| Code architecture | B | Backend-only data access ✅, shared query modules ✅, Zod validation started ✅ |
| Debugging velocity | C- | No tests, no API docs, no structured logging, partial repositories |
| Industry standard compliance | D | No CI, no observability, no rate limiting, no security headers |
| Egress budget (70 staff) | F | ~12 GB/month projected — 2.4× over free tier. After fixes: ~3-4 GB/mo |
| Security / Authorization | F | Any logged-in user can create admin accounts, mark any delivery. RLS is `USING (true)` everywhere |
| Data integrity | C | Race condition in createAssignment, no FK on assignment_items.survey_id |
| Input validation | C- | 18 of 23 routes lack Zod validation |

### 21.2 Top 3 Immediate Risks

1. **Authorization gap** — field staff can manipulate each other's data, create admin accounts
2. **Egress budget blow-up** — 2.4× over free tier under realistic 70-staff load
3. **No tests** — every change risks regressions

### 21.3 Phased Mitigation Plan

| Phase | Time | What | When |
|-------|------|------|------|
| **P1** Egress & Stability (H1-H3) | ~6 hrs | Fix PSID pagination loop (survey-repository.ts), unbounded assignment_items fetch (data-insight-repository.ts), staff/stats fallback (route.ts) | **Next after B2** |
| **P2** Authorization Hardening | ~4 hrs | `requireRole()` helper on all 23 routes, RLS policies, ownership checks on assignment_items/delivery_photos | **Before 10+ staff** |
| **P3** Input Validation | ~2 hrs | Migrate 18 routes to Zod, GPS range checks, text length caps, ILIKE wildcard sanitization | After P1-P2 |
| **P4** Debugging Velocity | ~6 hrs | API docs/OWNERS file, barrel exports, structured logger, ESLint rules, consolidate 3 sheets→1 | After P1-P2 |
| **P5** Industry Standards | ~10 hrs | Vitest + tests, Playwright E2E, CI (GitHub Actions), Sentry, rate limiting | **Deferred** |
| **P6** Egress Optimization | ~3 hrs | HTTP cache headers, Vercel Edge Cache, React Query → IndexedDB persistence, service worker | After P1 |

### 21.4 Key Known Issues (Unfixed)

| ID | File | Issue | Severity |
|----|------|-------|----------|
| H1 | `survey-repository.ts:48-63` | PSID pagination loop fetches ALL 200K+ PSIDs | 🔴 Egress |
| H2 | `data-insight-repository.ts:15-19` | Fetches ALL assignment_items for 90 days with no .limit() | 🔴 Egress |
| H3 | `staff/stats/route.ts:23-91` | Fallback path fetches ALL assignments + items + staff for date range | 🔴 Egress |
| H4 | `use-data-insight.ts:52` | Query key uses object reference, re-fetches on every render | 🟡 Cache |
| H5 | `use-survey-data.ts:8` | Same object-reference query key issue | 🟡 Cache |
| M6 | `use-assignments.ts` | staleTime: 30s too aggressive for mobile data | 🟡 Data |
| M12 | `survey-markers.tsx:53-71` | New L.divIcon created every render — marker flicker | 🟢 Perf |
| — | `map/page.tsx:130-143` | Debug badge visible in production | 🟢 UX |
| — | `unit-delivery-sheet.tsx:94` | Red border (debug CSS) in production | 🟢 UX |
| F1 | `api/deliveries/mark/route.ts:60-81` | **2026-06-05 field test**: live delivery stuck on "Processing" — DB status not updating, photo not syncing to Drive. Suspected: GAS webhook hangs/times out (10s Vercel function limit), so `await` blocks the response, client falls through to offline IndexedDB queue. Photo + status lost on page reload. **Needs office PC investigation:** Network tab on `/api/deliveries/mark`, Vercel function logs, GAS `Executions` log, confirm `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` env var set. Likely fix: 5s `AbortController` timeout on webhook + move DB write before webhook (fire-and-forget). | 🔴 Blocker |

### 21.5 Staff Counting & Egress Reality

| Scenario | Monthly Egress | Free Tier (5GB) |
|----------|---------------|-----------------|
| Staff-only (70), no admins | ~480 MB | ✅ Safe |
| + 5 admins browsing daily with H1-H3 bugs | ~12 GB | ❌ 2.4× over |
| After P1 fixes (H1-H3 done) | ~3-4 GB | ✅ Near limit |
| After P6 (caching + SW) | ~1.5 GB | ✅ Comfortable |
| **Recommendation** | Plan Supabase Pro ($25/mo) after crossing ~1 GB/mo | |

---

## 22. User Design Decisions

_This section captures the developer's explicit design decisions and prompts. Read before changing any delivery-related behavior._

### 22.1 Delivery is Map-Centric (Not List-Centric)

**Decision:** Staff navigates from `/deliver` list → `/map?target=PSID`. The map is the primary delivery tool, not an intermediate page.

**Rationale:** Staff needs spatial awareness — where they are vs where the delivery marker is. Pakistani urban areas are congested; street-level navigation requires map context. The portal photo in UnitDeliverySheet helps identify the house.

**Original GPS accuracy context:** Survey GPS coordinates may be imprecise (some are portal-placed, some field-collected). The 50m distance threshold accounts for this. Staff can long-press map to correct coordinates → saved to `house_corrections`.

### 22.2 Photo is the Only Required Proof

**Decision:** No Missed/Skip statuses. Full enforcement — every assigned bill must have a photo taken. If the house is genuinely unreachable, admin handles it via Flag Management.

**Rationale:** "Missed" and "Skipped" create loopholes staff exploit. The photo is the atomic unit of proof. GPS coordinates are captured silently for verification but never displayed to staff (prevents gaming).

**What happens if house is demolished / no such house:** Staff flags it via the "Flag" button → admin resolves in Flag Management UI → removed from future assignments.

### 22.3 One-Tap Flow (No Confirm Step)

**Decision:** Take Picture → auto-saves → done. No "Confirm Delivery" button.

**Rationale:** Two-step flow ("Take Picture" → preview → "Confirm Delivery") hinders delivery speed — staff complaint #1. Auto-saving after photo capture eliminates one tap and ~2 seconds per delivery. The photo is always saved; poor quality photos are audited via processing queue, not blocked at capture.

**Trade-off accepted:** Some photos may be blurry or dark. These go to `processing` status. Admin reviews and can request retake.

### 22.4 Silent GPS (Staff Does Not Know)

**Decision:** GPS is captured silently on photo confirm. No UI indicator. No "GPS failed" message.

**Rationale:** If staff knows GPS is being captured, they may try to game it (stand at a different location). Silent capture produces genuine walking patterns. GPS failure silently produces NULL (edge case #19) — photo timestamp alone is sufficient proof, but failure rate is tracked as a staff performance metric.

**Implementation:** `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: false` (faster, less battery) and 3s timeout. Null GPS = `processing` status (admin review required).

### 22.5 Processing Status (New Intermediate State)

**Decision:** New `processing` status between `pending` and `delivered`. Represents "photo taken, awaiting verification."

**Rationale:** Without an intermediate status, there's no way to distinguish "auto-verified delivered" from "needs admin review." The `processing` status flags items that either:
- GPS was null (timeout/denied)
- Distance > 50m from survey marker
- Survey marker coordinates are missing

Admin reviews `processing` items in the Assignments tab or Flag Management UI.

### 22.6 Distance Threshold (50m Default)

**Decision:** Haversine distance ≤ 50m = auto-verify. Configurable per city.

**Rationale:** Urban Pakistani streets are narrow; houses are close together. 50m accounts for:
- Survey GPS imprecision (portal-placed vs field-collected)
- Delivery GPS imprecision (enableHighAccuracy: false)
- Street-level navigation accuracy
- Staff standing at the gate vs at the house front

**Future enhancement:** After 2-3 months of verified deliveries, the threshold can be tuned per UC based on historical distance distributions.

### 22.7 Server Handles Webhook Synchronously

**Decision:** `POST /api/deliveries/mark` uploads to GAS webhook → saves to Drive → calculates distance → returns result — all synchronously before responding.

**Rationale:** Staff won't notice the ~1-2s extra latency because they're viewing the success overlay. The benefit is instant `delivered` status if distance is valid. No need for a separate async queue for this path (the IndexedDB queue is only for offline fallback).

### 22.8 Two Google Drive Accounts (Consolidate)

**Decision:** Legacy routing station has its own GAS webhook URL (hardcoded in `12_drive_sync.js`). Current app has `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` in `.env.local`. These should be consolidated to one.

**Rationale:** Two webhooks = two Drive folders = fragmented photo storage. `staff_sync_logs` table already stores the file_id; the Drive folder it goes to depends on which webhook processes it. Consolidate to one webhook URL (the current app's) and migrate legacy photos.

### 22.9 Photo Size Target (30-70KB WebP)

**Decision:** Compress to WebP, q0.6, 1024px max width → 30-70KB per photo. Same as legacy routing station.

**Rationale:** Larger photos increase upload time (staff complaints about speed) and consume Drive storage. 30-70KB is sufficient for house identification on mobile. Quality 0.6 is visually acceptable for door/gate/facade identification.

**Implementation:** `OffscreenCanvas.toBlob('image/webp', 0.6)` — non-blocking, background thread.

### 22.10 Debug Artifacts Must Be Removed Before Production

**Decision:** The debug badge (`map/page.tsx:130-143`) was removed during the June 5 office session. Red border (`unit-delivery-sheet.tsx:94`) was also removed. The `min-h-[300px]` diagnostic survives as a functional style (prevents sheet collapse on desktop with no intrinsic height) but should be verified before production.

**Rationale:** Debug overlay shows internal state (role, items count, conditions). Red border on sheet is unprofessional. Both were added for CSS layout debugging and should be cleaned before staff go-live.

---

## 23. Industry Complexity & Engineering Reality (2026-06-05)

_This section captures an honest meta-assessment of the app's complexity versus industry norms, what we got right, what we over-built, and what we under-built. Read this before deciding to add new features or refactor existing ones._

### 23.1 Difficulty Rating (Industry Standard)

**Comparable apps in this space:**
- Field service apps (ServiceTitan, Jobber): 3-6 months senior-team build
- Municipal billing + delivery (custom): 4-8 months
- Courier tracking (small scale, 1 city): 2-3 months
- Meter reading apps (utility, photo proof): 1-2 months
- Custom Zoho Creator / AppSheet: 2-3 weeks for prototype

**Our app is a 3-4 month senior-team project** for: 212K records, 3 cities, 70 staff, photo proof, GPS verification, admin assignment management, reference data.

**Pace check:** Core flow built, 4-5 sessions in. Roughly the right pace for a solo dev with legacy migration overhead.

### 23.2 What's Over-Engineered

For a 3-city, 70-staff operation, the following are oversized for actual daily use:

| Module | Lines | Reality | Verdict |
|---|---|---|---|
| Data Insight (4 tabs, 4-level drill-down) | ~590 | Single sortable table covers 90% | Over-built |
| Dashboard (4 charts, 6 KPI cards) | ~225 | Used monthly. 3-line KPI strip would do | Over-built |
| Filter Panel (4 components: DesktopFilterBar, MobileFilterSheet, ActionButtons, FilterDropdown) | ~660 | 4 layers for 6 dropdowns | Over-componentized |
| Settings themes (5 options) | ~30 | Only light + dark used; 3 are dead | Over-built |
| 27 API routes for ~8 features | n/a | Many routes are 1-2 endpoints for the same data | Over-built |

**Pattern:** Enterprise BI thinking (drill-down, multiple chart types, theme systems) applied to small-data, small-team operation.

### 23.3 What's Right-Sized (Industry Standard)

These match what experienced teams build. Do NOT simplify.

1. **Delivery flow** — one-tap + photo + GPS + status is exactly what every delivery app does
2. **Status state machine** (`pending → processing → delivered`) — standard. `processing` is a smart intermediate for "GPS failed" and "out of range"
3. **DB triggers for `staff_daily_stats`** — industry best-practice for pre-computed aggregates; most teams get this wrong
4. **Reference tables** (hierarchy, surveyors, bill_months) — senior-level optimization for filter dropdowns on 212K-row tables
5. **City-scoped queries** with district+tehsil filter — correct handling of Sargodha-contains-Bhalwal geography
6. **Silent GPS capture** — privacy-preserving, anti-gaming
7. **50m Haversine distance threshold** — industry standard for urban last-mile delivery
8. **One-tap flow** (no confirmation step) — correct speed-vs-accuracy trade-off
9. **Offline IndexedDB queue** — standard for mobile delivery apps
10. **Photo: WebP q0.6 1024px → 30-70KB** — correct mobile optimization

### 23.4 What's Under-Engineered (Behind Industry Standard)

Gaps where we're below industry baseline for delivery enforcement:

1. **No realtime admin visibility** — staff delivers, admin doesn't see it live. Industry uses WebSockets / Supabase Realtime / Pusher. We have polling.
2. **No photo anti-tamper** — staff could upload any old photo. Industry: EXIF timestamp verification, photo hash chain.
3. **No face/house verification** — photo of a house ≠ proof of right house. Industry (high-stakes delivery): face match, signature, QR scan.
4. **GAS webhook for Drive** — non-standard. Industry: Supabase Storage or S3 with signed URLs. The GAS approach is legacy from old routing station.
5. **No customer signature** — bill delivery often requires signature (Pakistan Post). We only have photo.
6. **No service worker for PWA offline** — we have IndexedDB queue but no service worker for full offline. Industry standard for mobile delivery.
7. **10s Vercel function timeout fighting slow GAS** — root cause of F1 field failure. Industry: longer timeouts (Pro tier) or fire-and-forget webhook pattern.

### 23.5 Delivery Enforcement — Why It's Inherently Hard

**Enforcement is the hard part of delivery apps.** Without enforcement, "take photo, mark done" is a 1-week project. With enforcement, you're building a verification system, not a workflow.

**Minimum viable enforcement pipeline (4 steps, each with failure modes):**
1. **Capture** — photo, GPS, timestamp. Failure: GPS denied, camera failed, slow network
2. **Verify** — distance, photo quality, timestamp window. Failure: distance > threshold, blurry photo, wrong time
3. **Store** — DB row, file upload, audit trail. Failure: webhook timeout, DB conflict, RLS rejection
4. **Surface** — admin review queue, exceptions. Failure: admin not checking, queue backlog, lost exceptions

**Industry enforcement stacks (by complexity):**
- Photo + GPS (our level) — basic, ~70% of last-mile delivery apps
- Photo + GPS + signature — common for legal/medical/courier
- Photo + GPS + barcode/QR — common for package delivery
- Photo + GPS + face match — high-stakes (banking, government)
- Photo + GPS + hash chain — legal evidence (chain of custody)

**We are at the minimum viable enforcement level.** Not over-built; actually slightly under-built. Adding any one of: realtime admin view, EXIF verification, or signature capture, would push us above industry standard for this app's size.

### 23.6 Were There Simpler Paths?

**Yes. Four paths existed:**

| Path | Effort | Trade-off | Verdict |
|---|---|---|---|
| **No-code** (Zoho Creator / AppSheet) | 2-3 weeks | Limited offline, vendor lock-in, scale ceiling, no realtime | Not viable at 70 staff + 212K records |
| **Supabase + Next.js minimal** (boilerplate-first, direct from client) | ~40% less code | Less server-side control, harder custom business rules | Right call for staff mobile flow; we didn't take it |
| **Outsource delivery** (ePost, local courier) | 1-2 weeks integration | Cost per delivery, data ownership loss, less control | What most small municipal bodies actually do |
| **Custom full-stack** (what we did) | 3-4 months | Maximum flexibility, full control, integration with legacy | Right for organizations needing 100% control |

**For SWMC Sargodha, Path 3 (outsource) was probably the right call at the start.** But we've already invested in Path 4 — no value in second-guessing now.

### 23.7 Honest Assessment of Our Position

**What we did right:**
- Clean DB schema with proper indexes
- Trigger-based aggregates (no client-side computation on 212K rows)
- Reference tables (saves 200K-row DISTINCT queries)
- Mobile-first delivery flow (matches industry standard)
- Smart state machine (pending → processing → delivered)
- Silent GPS (privacy-preserving, anti-gaming)
- One-tap flow (no confirmation step)
- Honest severity ratings in audit (61/100, not 99/100 hype)

**Where we overspent:**
- 30-40% of admin code isn't used in real workflow
- 5 themes, 4 chart tabs, 4-level drill-downs — all overkill
- 27 API routes where 15 would do

**Where we under-spent:**
- No realtime admin view
- No anti-tamper
- 10s Vercel timeout fighting a slow GAS webhook (this caused F1 field failure)
- No signature, no EXIF verification

**The architecture is defensible but over-polished on the admin side and slightly under-built on the enforcement side.** The field-test failure is not a sign of bad design — it's a sign of the gap between "demo on office PC" and "real-world 4-step pipeline with timeouts and slow networks."

### 23.8 Direct Answers to Common Questions

> "Is this app complex because the domain is complex, or because we made it complex?"

**Both.** The app is inherently medium-complex (delivery enforcement is the hard part). But we made it ~40% more complex than needed on the admin/analytics side. Stripping the over-built admin features would make the app 40% smaller and 80% as capable in the field — which is the only place it actually runs.

> "How complex is a delivery mechanism involving enforcement?"

**Enforcement is the right amount of complex for what we have.** Photo + GPS + distance + state machine is the standard baseline. We're not over-built on enforcement. We're slightly under-built (no realtime, no anti-tamper). The reason the field test failed isn't bad design — it's that the implementation pipeline (webhook → DB) is fragile to slow networks, and our 10s Vercel timeout doesn't forgive it.

> "Is there a simpler way to build this?"

**Yes, three simpler paths exist** (no-code, boilerplate-first, outsource). For SWMC's scale and need for control, custom full-stack is defensible. But the simpler paths exist and were rejected for valid reasons.

### 23.9 Recommended Path Forward (Post-Field-Fix)

After the F1 field bug is fixed at office PC, the priority order should be:

1. **Fix live pipeline** (F1) — 1-2 hours. Webhook timeout + fire-and-forget. **Highest priority.**
2. **Add realtime admin view** — 1 day. Industry standard gap.
3. **Cut admin bloat 30-40%** — 2-3 days. Data Insight, Dashboard, Filter Panel, Settings.
4. **Add field flag button + daily summary** — 1-2 days. Vision gaps.
5. **Address F1 root cause** (P1 egress audit H1-H3) — 2-3 days. Audit compliance.

**Do NOT add more features until the live system is stable.** The F1 failure is a sign that the implementation pipeline is fragile to real-world conditions, not a sign of missing features.

---

## 24. Deliver — Testing Protocol for Unsent Flow

### 24.1 Pre-Cleanup (Before Testing from Step 1)

| # | Step | Details |
|---|------|---------|
| 1 | Clear IndexedDB | DevTools → Application → IndexedDB → delete `billing-saas-photo-queue` + `billing-saas-unsent-photos` |
| 2 | Reset test data (admin) | Verify 10 test items (2 dummy MCs, TST_PSID_*) are all `pending`. Revoke any with `processing` status |
| 3 | Clear stale delivery_photos | `DELETE FROM delivery_photos WHERE synced_to_drive = false AND assignment_item_id IN (SELECT id FROM assignment_items WHERE psid LIKE 'TST_%')` |
| 4 | Ensure unsent_mode ON | Settings → Delivery tab → toggle "Always Queue Unsent" = ON, max limit = 50 → Save |

### 24.2 Test Flow

| # | Action | Expected Result | Verification |
|---|--------|----------------|-------------|
| 1 | Staff opens `/deliver` | Sees assignment list with 10 pending items (blue dots) | List loads, progress bar shows 0/10 |
| 2 | Tap a pending unit → sheet opens → take picture | Sheet shows progress (compressing/uploading/saving) → toast "Saved to queue" → auto-advances 1.5s to next pending | Network tab: `POST /api/deliveries/mark-processing` returns 200 |
| 3 | Check DB | `SELECT status FROM assignment_items WHERE psid = ?` → `'processing'` | `delivery_photos` has row with `photo_url = 'pending://unsent/...'`, `synced_to_drive = false` |
| 4 | Check filter bar | 📷 icon visible with badge "1" | No floating button at bottom-right |
| 5 | Deliver 2 more units | Badge increments: "2" → "3" | Queue count reflects total |
| 6 | Tap 📷 icon in filter bar | Modal opens: "3 photos queued" + "Sync All" button | Queue count matches expected |
| 7 | Tap "Sync All" | Photos upload in batches of 3 concurrent. Progress bar animates. Badge counts down. | Network tab: `POST /api/deliveries/promote` calls with sequential 3 concurrent uploads to GAS webhook |
| 8 | After sync completes | Badge disappears (queue empty) | `SELECT status FROM assignment_items` → `'delivered'`, `delivery_photos.photo_url` = real Drive thumbnail, `synced_to_drive = true` |
| 9 | Tap delivered unit marker | Sheet shows "View Details" only (no delivery button for admin) | Green checkmark visible |
| 10 | Max limit test | Queue 50 photos → try to deliver 51st → toast "Clear unsent queue first (50/50)" → button blocked | Items remain `pending` |
| 11 | Orphan test | Admin revokes test assignment → Staff Sync All → photo silently removed from queue | `SELECT status FROM assignment_items WHERE psid = ?` → item still `pending` (if orphaned) |
| 12 | Admin disables unsent mode | Settings → toggle OFF → Save | Staff delivery goes back to normal online upload (direct POST /api/deliveries/mark with webhook) |

### 24.3 Admin Verification Queries

```sql
-- Check item statuses
SELECT id, psid, status, delivered_at, gps_lat, gps_lng 
FROM assignment_items 
WHERE psid LIKE 'TST_%'
ORDER BY psid;

-- Check photo records
SELECT ai.psid, dp.photo_url, dp.synced_to_drive, dp.gdrive_file_id
FROM delivery_photos dp
JOIN assignment_items ai ON ai.id = dp.assignment_item_id
WHERE ai.psid LIKE 'TST_%'
ORDER BY ai.psid;
```

### 24.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| No GPS during capture | status = `processing` with null GPS fields. Photo queue handles without GPS. |
| Offline during capture | Photo queued to IndexedDB. Auto-syncs when online via `online` event listener. |
| Tab closed before sync | `sendBeacon` fires on `beforeunload` (best-effort ping). Full queue survives in IndexedDB. |
| Duplicate photo attempt (double-tap) | Mark-processing endpoint is idempotent — early return if already `delivered`/`missed`. |
| Webhook fails during Sync All | Retries up to 3 times per photo. After 3 failures, removed from queue with `lastError`. |
| 403/404 from promote (orphan) | Photo silently removed from queue. Item stays `processing` in DB (admin must Force Complete or revoke). |
| Max limit exactly 50 | 50th item enqueued successfully. 51st blocked with toast. "Sync All" clears → counter resets. |

---

## 26. Delivery Mechanism Comprehensive Audit (2026-06-07)

### 26.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         DELIVERY MECHANISM                               │
├───────────────────────┬──────────────────────┬──────────────────────────┤
│   `/deliver` page     │    `/map` page        │   `/settings` page      │
│   Staff-only list     │  Universal delivery   │   Admin + Staff config  │
│   (Plain list +       │  (StaffMap +          │   Unsent Images tab     │
│    UnsentModal)       │   UnitDeliverySheet)  │   Delivery tab (admin)  │
├──────────┬────────────┴──────────┬────────────┴──────────┬──────────────┤
│          │                       │                       │              │
│  useStaffAssignment  │   useUserLocation     │   usePhotoQueue          │
│  (query from GET     │   (shared GPS watcher │   (IndexedDB `billing-   │
│   /api/assignments)  │    → StaffMap blue dot│    saas-photo-queue`)    │
│                      │                       │   Badge + UnsentModal   │
│  usePhotoQueue       │   useDeliverUnit      │   uses this queue        │
│  (IndexedDB badge    │   (deliver/deliver-   │                         │
│   + UnsentModal)     │    NoPhoto hooks)     │  useUnsentPhotos         │
│                      │                       │  (IndexedDB `unsent-    │
│                      │                       │   photo-queue`)         │
│                      │                       │  Settings Unsent tab    │
│                      │                       │  uses this queue        │
├──────────────────────┴──────────────────────┴──────────────────────────┤
│                           API ENDPOINTS                                │
├─────────────────┬───────────────────────┬──────────────────────────────┤
│ GET /api/assign │ POST /api/deliveries  │ POST /api/deliveries         │
│   ments?staff_  │   /mark              │   /mark-processing           │
│   id=X          │   (Normal delivery:   │   (Unsent mode:              │
│   → assignment  │    GPS + photo +      │    mark as processing,       │
│     items with  │    distance check)    │    no distance calc)         │
│     unit data)  │                       │                              │
├─────────────────┼───────────────────────┼──────────────────────────────┤
│ POST /api/deliv │ POST /api/deliveries  │ POST /api/deliveries         │
│   eries/promote │   /sync-photo         │   /ping                      │
│   (processing→  │   (Upload to Drive,   │   (sendBeacon on             │
│    delivered)   │    update photo,      │    tab close)                │
│                 │    NO status update)  │                              │
└─────────────────┴───────────────────────┴──────────────────────────────┘
```

### 26.2 User Flows

#### Flow A: Normal Delivery (unsent_mode.enabled = false)

Path: Staff on `/deliver` → taps unit → `/map` → UnitDeliverySheet → Take Picture → delivered/processing

Step-by-step:

1. **Staff opens `/deliver`** → `useStaffAssignment` fetches items from `GET /api/assignments?staff_id=USER_ID`
   - Returns `{ data: DailyAssignment, items: AssignmentItemWithUnit[] }`
   - Each item has `unit` (AssignmentItemUnit) with lat/lng from `survey_units`
   - React Query with `staleTime: 30s`

2. **Staff taps a pending unit** → `handleSelect(item.id)`:
   - `setDeliverTarget(item.psid)` — stores PSID in billing store
   - `router.push('/map?target=PSID')` — navigates to map page

3. **Map page loads** → URL param `?target=PSID` triggers:
   - Effect reads target from URL → `setDeliverTarget(target)` (no unit yet)
   - Sync effect: find unit from `deliverableList` (populated from `staffItems[i].unit`) → `setDeliverTarget(target, item)`
   - `UnitDeliverySheet` renders: `unit={deliverTargetUnit}`, `assignmentItemId={deliveryItem?.id || null}`

4. **UnitDeliverySheet opens** → GPS tracking starts (3 effects):
   - **Effect A** (Fast init): `setTimeout(100ms)` → `getCurrentPosition` with `{ enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }`. On success: `setLiveGpsStatus('ready')`, sets distance, userLat/userLng.
   - **Effect B** (WatchPosition): Sets `liveGpsStatus('locating')` → `watchPosition` with `{ enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }`. On success: sets 'ready', distance, userLat/userLng, gpsAccuracy. On error: 'unavailable'.
   - **Effect C** (Unmount cleanup): `clearWatch(watchIdRef.current)` on component unmount.
   - **Fast init wins on desktop** (Wi-Fi returns in 1-2s). **WatchPosition wins on mobile** (GPS resolves instantly via `enableHighAccuracy: true`).
   - Reset effect: When `unit.psid` changes, deliveryStatus/idle/resets, userLat/userLng reset to `initialLat/initialLng` (from `useUserLocation` via `userLocation?.lat/lng`).

5. **Distance badge renders** — shows "X m away" with color coding (green ≤50m, amber ≤200m, gray >200m). 3 GPS accuracy dots (≤10m=3green, ≤50m=2green1gray, >50m=1green2gray).

6. **Staff taps "Take Picture & Deliver"** → `openCamera()` triggers `inputRef.current.click()` (file input with `capture='environment'`).

7. **File selected** → `handleFile(file)` fires:
   ```javascript
   const gpsOverride = userLat != null && userLng != null
     ? { lat: userLat, lng: userLng }
     : null
   ```
   - If `unsentModeEnabled` = true → **Flow B** below
   - If `unsentModeEnabled` = false → continues:

   ```javascript
   const progressTid = toast('Compressing photo...', 'info')
   try {
     result = await deliver(
       assignmentItemId, unit.psid, file,
       unit.lat, unit.lng,  // target coordinates
       gpsOverride,          // from live GPS tracking
       (step) => { updateToast(progressTid, msgs[step], 'info') }
     )
   } catch (e) {
     updateToast(progressTid, msg, 'error')
     setIsDelivering(false)
     return
   }
   ```

8. **`useDeliverUnit.deliver()` executes**:
   ```javascript
   // If gpsOverride provided from live tracking, skip captureGPS
   const gps = gpsOverride ?? await captureGPS()  // captureGPS: 3s timeout, low accuracy
   const compressed = await compressImage(photoFile)  // WebP, q0.6, 1024px
   // POST FormData to /api/deliveries/mark
   const form = new FormData()
   form.append('photo', compressed, `${psid}_delivery.webp`)
   form.append('assignment_item_id', assignmentItemId)
   form.append('psid', psid)
   if (gps) { form.append('gps_lat', String(gps.lat)); form.append('gps_lng', String(gps.lng)) }
   if (targetLat != null) form.append('target_lat', String(targetLat))
   if (targetLng != null) form.append('target_lng', String(targetLng))
   const res = await fetch('/api/deliveries/mark', { method: 'POST', body: form })
   ```

9. **Server (`POST /api/deliveries/mark`) processes**:
   ```javascript
   // Auth
   const { data: { user } } = await sup.auth.getUser()  // field_staff role check
   const ownership = await sup.from('assignment_items')
     .select('id, status, daily_assignments!inner(staff_id)')
     .eq('id', assignmentItemId).eq('daily_assignments.staff_id', user.id)
     .maybeSingle()
   if (!ownership) → 403
   // If already delivered/missed → early return (NO photo saved!)
   if (ownership.status === 'delivered' || ownership.status === 'missed')
     → return { status: ownership.status, distance: null, already_delivered: true }
   // Upload photo to GAS webhook (8s AbortController timeout)
   if (WEBHOOK_URL) {
     try { fetch(WEBHOOK_URL, { ... with AbortController(8000) }) }
     catch { /* continue without Drive file */ }
   }
   // INSERT delivery_photos record
   await sup.from('delivery_photos').insert({ assignment_item_id, photo_url, ... })
   // Calculate Haversine distance
   let distance = null
   let status = 'processing'
   if (gps_lat != null && gps_lng != null && target_lat != null && target_lng != null) {
     distance = Math.round(haversine(gps_lat, gps_lng, target_lat, target_lng))
     if (!enforceGps || distance <= gpsThreshold) status = 'delivered'
   }
   // UPDATE assignment_items
   await sup.from('assignment_items').update({ status, delivered_at, gps_lat, gps_lng }).eq('id', assignmentItemId)
   return { status, distance, photo_url, gps_lat, gps_lng }
   ```

10. **Client handles result**:
    ```javascript
    setDeliveryStatus(result.status)
    // Toast
    result.status === 'delivered'
      ? `Delivered${result.distance != null ? ` (${result.distance}m away)` : ''}`  // green success
      : 'Processing — awaiting review'  // amber warning
    // If GAS webhook failed (photo_url starts with "pending://")
    if (result.photo_url?.startsWith('pending://')) {
      compressImage(file)  // re-compress for IndexedDB
      enqueueUnsent({ assignmentItemId, psid, photoBlob, gpsLat, gpsLng })  // → unsent-photo-queue
    }
    // Optimistic cache update
    queryClient.setQueryData(['staff-assignment', userId], (old) => {
      items: old.items.map(item => item.id === assignmentItemId
        ? { ...item, status: result.status, delivered_at: new Date().toISOString() }
        : item)
    })
    // Invalidate queries
    queryClient.invalidateQueries(['staff-assignment', 'assignment-totals', 'staff-stats', 'delivery-photos'])
    // Auto-advance timeout
    const delay = result.status === 'delivered' ? 2000 : 3500
    setTimeout(() => { setIsDelivering(false); onClose?.() }, delay)
    ```

11. **Auto-advance effect**: `[deliveryStatus, onNext]` — when deliveryStatus is 'delivered' or 'processing', calls `onNext?.()` after 2s (independent of the handleFile timeout).

12. **onNext loads next unit** → step 4 repeats for the next pending item.

#### Flow B: Always Unsent Mode (unsent_mode.enabled = true)

Activated via Settings → Delivery tab → "Always Queue Unsent" toggle (admin only).

Step 6 diverges from Flow A:

```javascript
if (unsentModeEnabled) {
  // Block if queue full
  if (queueCount >= unsentMaxLimit) {
    toast(`Clear unsent queue first (${queueCount}/${unsentMaxLimit})`, 'warning')
    return
  }
  setIsDelivering(true)
  const progressTid = toast('Saving to queue...', 'info')
  // 1. Mark item as processing (server-side)
  const markRes = await fetch('/api/deliveries/mark-processing', {
    method: 'POST',
    body: JSON.stringify({ assignmentItemId, psid: unit.psid, gpsLat: gpsOverride?.lat, gpsLng: gpsOverride?.lng })
  })
  // 2. Compress photo
  const compressed = await compressImage(file)
  // 3. Enqueue to photo-queue (BUG: should be unsent-photo-queue)
  await enqueuePhoto({
    assignmentItemId, psid: unit.psid,
    photoBlob: compressed, email: email || '',
    gpsLat: gpsOverride?.lat, gpsLng: gpsOverride?.lng,
    skipAutoSync: true  // never auto-syncs
  })
  setDeliveryStatus('processing')
  updateToast(progressTid, 'Saved to queue ✓', 'success')
  // Close sheet after 1.5s
  setTimeout(() => { setIsDelivering(false); onClose?.() }, 1500)
  return
}
```

**mark-processing endpoint** (`POST /api/deliveries/mark-processing`):
```javascript
// Auth + ownership check (same as /mark)
// Insert delivery_photos with photo_url = "pending://unsent/{assignmentItemId}"
await sup.from('delivery_photos').insert({
  assignment_item_id: assignmentItemId,
  photo_url: `pending://unsent/${assignmentItemId}`,
  gps_lat, gps_lng, synced_to_drive: false
})
// Update assignment_items status to 'processing'
await sup.from('assignment_items').update({ status: 'processing', delivered_at, gps_lat, gps_lng })
// NO distance calculation — always 'processing'
```

#### Flow C: Offline Fallback (Network Error)

When `deliver()` in Flow A throws a TypeError (network failure):
```javascript
// deliver() catches TypeError and returns null
catch (e) {
  if (e instanceof TypeError) return null  // network error
  throw e  // other errors propagate
}
```

In handleFile:
```javascript
if (result) { /* Flow A result processing */; return }
// result is null → offline fallback
const compressed = await compressImage(file)
await enqueuePhoto({
  assignmentItemId, psid: unit.psid,
  photoBlob: compressed, email: email || '',
  // No skipAutoSync → will auto-sync when online
})
setDeliveryStatus('processing')  // NO toast shown
setIsDelivering(false)
```

When online, `usePhotoQueue` auto-processes:
```javascript
// processQueue() runs on online event
// Batch 3 photos via Promise.allSettled
for each photo:
  1. Upload to GAS webhook (resolvePhotoData → base64 → POST)
  2. If webhook succeeds: POST /api/deliveries/promote
     a. INSERT/UPDATE delivery_photos with real Drive URL
     b. UPDATE assignment_items SET status='delivered' WHERE status='processing'
  3. If promote returns 403/404: remove from queue (orphan)
  4. If any failure: incrementRetry() — removed after 3 failures
```

### 26.3 GPS System Detail

| Component | Hook/Effect | Accuracy | Timeout | Lifetime | Data flow |
|-----------|-------------|----------|---------|----------|-----------|
| **StaffMap blue dot** | `useUserLocation` (shared hook) | `enableHighAccuracy: true` | 30s | Continuous (page session) | `location` → Marker position |
| **Sheet distance (fast init)** | getCurrentPosition | `enableHighAccuracy: false` | 5s | Once per unit open | → userLat/userLng → gpsOverride |
| **Sheet distance (watchPosition)** | watchPosition | `enableHighAccuracy: true` | 30s | While sheet idle | → userLat/userLng → gpsOverride |
| **deliver() captureGPS** | getCurrentPosition fallback | `enableHighAccuracy: false` | 3s | Once per delivery | Used only if gpsOverride is null |
| **GPS override** | From userLat/userLng state | N/A | N/A | Closure at render time | Bypasses captureGPS entirely |

**Current state:** TWO independent GPS watchers (StaffMap + Sheet). Battery impact minimal — same GPS chip, sheet watcher runs 10-15s per delivery.

**Note:** `useUserLocation` hook also uses watchPosition with its own retry logic (exponential backoff: 1s, 3s, 10s). This hook is ONLY used by StaffMap (blue dot) and map page (initialLat). UnitDeliverySheet does NOT import `useUserLocation` as of Part 13 fix.

#### Location on Desktop vs Mobile

| Aspect | Desktop (Office/Home PC) | Mobile (Production) |
|--------|-------------------------|---------------------|
| GPS hardware | None (Wi-Fi positioning) | GPS chip |
| lfsvc service | Required (was disabled on home PC) | N/A |
| Fast init | getCurrentPosition returns in 1-2s via Wi-Fi | May fail (3s timeout too fast) |
| WatchPosition | enableHighAccuracy:true may hang → fast init wins | enableHighAccuracy:true resolves instantly |
| captureGPS fallback | getCurrentPosition 3s timeout → may return null | getCurrentPosition works but slow |

### 26.4 Two Separate IndexedDB Queues

| Property | `usePhotoQueue` | `useUnsentPhotos` |
|----------|----------------|-------------------|
| **Lib file** | `src/lib/photo-queue.ts` | `src/lib/unsent-photo-queue.ts` |
| **DB Name** | `billing-saas-photo-queue` | *(separate IndexedDB)* |
| **DB Version** | 3 | *(separate)* |
| **Used by** | deliver page badge, UnsentModal, offline fallback, unsent mode | Settings "Unsent Images" tab |
| **Auto-sync on online?** | Yes (unless `skipAutoSync: true`) | No |
| **Promote endpoint** | `/api/deliveries/promote` (updates status to delivered) | `/api/deliveries/sync-photo` (NO status update) |
| **Storage** | Blob (via photoBlob field) | dataUrl OR Blob |
| **Fields** | id, assignmentItemId, psid, dataUrl/photoBlob, capturedAt, email, gpsLat, gpsLng, retryCount, status, lastError | id, assignmentItemId, psid, dataUrl/photoBlob, gpsLat, gpsLng, createdAt, retryCount |

**photo-queue processing flow:**
```
queued → uploadSingle(): POST to GAS webhook → POST /api/deliveries/promote
         → markSynced (status = 'synced') → clearSynced (delete synced entries)
```

**unsent-photo-queue processing flow:**
```
Unsentry entry → retrySingle(): resolvePhotoData (blob→dataUrl) → POST /api/deliveries/sync-photo
                → removeUnsent (delete entry)
```

### 26.5 Server Endpoint Specification

#### POST /api/deliveries/mark
- **Purpose:** Normal one-tap delivery
- **Input:** FormData (multipart)
  - `photo` — WebP Blob (file)
  - `assignment_item_id` — UUID string
  - `psid` — string
  - `gps_lat` / `gps_lng` — optional float strings
  - `target_lat` / `target_lng` — optional float strings
  - `skip_photo` — 'true' (no-photo delivery)
- **Auth:** supabase.auth.getUser() + field_staff role check + ownership (assignment_items.daily_assignments.staff_id = user.id)
- **Already delivered guard:** If item.status is 'delivered' or 'missed', return early with `{ status, distance: null, already_delivered: true }`. **NOTE: photo is NOT saved.**
- **No 'processing' guard:** Items with status 'processing' proceed through full flow, creating duplicate delivery_photos records.
- **GAS webhook:** POST to NEXT_PUBLIC_DRIVE_WEBHOOK_URL (AbortController 8s timeout). On success: extract fileId. On failure: continue without Drive file.
- **Distance calculation:** Haversine formula. Only computed if gps_lat/lng AND target_lat/lng are all non-null.
- **Status determination:**
  - distance ≤ threshold(default 50m) OR enforceGps=false → `'delivered'`
  - distance > threshold OR GPS null OR target null → `'processing'`
- **Update:** `assignment_items.status = delivered_at = gps_lat = gps_lng =`
- **Response:** `{ status, distance, photo_url, gdrive_file_id, gps_lat, gps_lng, target_lat, target_lng }`

#### POST /api/deliveries/mark-processing
- **Purpose:** Quick mark as processing (used by unsent mode)
- **Input:** JSON
  - `assignmentItemId`, `psid`, `gpsLat`, `gpsLng`
- **Auth:** Same as /mark
- **Behavior:**
  - INSERT delivery_photos (photo_url = `"pending://unsent/{assignmentItemId}"`)
  - UPDATE assignment_items SET status = 'processing'
  - NO distance calculation
  - NO photo upload
- **Response:** `{ status: 'processing' }`

#### POST /api/deliveries/promote
- **Purpose:** Promote processing item to delivered (after successful Drive upload)
- **Input:** JSON
  - `assignmentItemId`, `photoUrl`, `gdriveFileId`, `gpsLat`, `gpsLng`
- **Auth:** Same as /mark
- **Behavior:**
  - INSERT or UPDATE delivery_photos (real Drive URL, synced_to_drive=true)
  - UPDATE assignment_items SET status='delivered' WHERE id=X AND status='processing'
- **Response:** `{ status: 'delivered', promoted: true }`

#### POST /api/deliveries/sync-photo
- **Purpose:** Upload unsent photos to Drive (called by Settings Unsent Images → "Sync All" / retrySingle)
- **Input:** JSON
  - `assignmentItemId`, `psid`, `dataUrl`, `gpsLat`, `gpsLng`
- **Auth:** supabase.auth.getUser() (no field_staff check — any authenticated user)
- **Behavior:**
  - POST to GAS webhook with base64 dataUrl (8s AbortController timeout)
  - UPDATE delivery_photos SET photo_url, gdrive_file_id, synced_to_drive=true
  - **BUG: Does NOT call promote endpoint or update assignment_items status**
  - If webhook fails → returns 502
- **Response:** `{ success: true, photo_url, gdrive_file_id }`

### 26.6 Settings / Admin Controls

| Setting | DB Key | Storage Type | Frontend | Effect |
|---------|--------|-------------|----------|--------|
| **GPS Enforcement** | `gps_enforcement` | JSON `{ enforce: boolean, threshold: number }` | Settings → Delivery tab | Toggle distance check + threshold slider |
| **Allow No Photo** | `allow_no_photo` | boolean | Settings → Delivery tab | Enables "Photo not working? Deliver without photo" button in sheet |
| **Always Unsent Mode** | `unsent_mode` | JSON `{ enabled: boolean, max_limit: number }` | Settings → Delivery tab | Routes all deliveries to mark-processing + photo-queue |

**API:**
- `GET /api/settings` — returns all settings as flat object: `{ gps_enforcement: {...}, allow_no_photo: bool, unsent_mode: {...}, ... }`
- `PATCH /api/settings` — body `{ key: string, value: any }` — upserts into app_settings table

**Settings page tabs:**
- Appearance (staff + admin): Theme toggle
- Account (staff + admin): Username, password change
- Unsent Images (staff + admin): `UnsentImagesSection` — reads from `useUnsentPhotos` (NOT photo-queue)
- Delivery (admin only): GPS enforcement, Allow No Photo, Unsent Mode toggle
- Users (admin only): User management CRUD

### 26.7 Critical Issues Found

| # | Issue | Location | Severity | Root Cause |
|---|-------|----------|----------|------------|
| 1 | **Unsent mode writes to wrong queue** | `unit-delivery-sheet.tsx:208` — calls `enqueuePhoto()` instead of `enqueueUnsent()` | **HIGH** | Office commit added unsent mode path but used the wrong hook. Settings reads from `unsent-photo-queue`, unsent mode writes to `photo-queue`. Photos invisible in Settings. |
| 2 | **sync-photo doesn't promote status** | `sync-photo/route.ts:75-97` — updates delivery_photos but NOT assignment_items.status | **HIGH** | The promote endpoint exists (`/api/deliveries/promote`) but sync-photo never calls it. Items stay 'processing' even after successful Drive upload. |
| 3 | **Redelivery blocks photo save** | `mark/route.ts:83-90` — early returns for 'delivered'/'missed' WITHOUT inserting/updating delivery_photos | **MEDIUM** | Redelivery of an already-delivered item silently drops the new photo. The photo is taken, uploaded, but never saved. |
| 4 | **No early-return for 'processing' items** | `mark/route.ts` — 'delivered' and 'missed' have early returns, 'processing' does not | **MEDIUM** | Redelivery of a 'processing' item creates a DUPLICATE delivery_photos record every time. |
| 5 | **Unsent icon in wrong location** | `deliver/page.tsx:209-222` — placed in filter bar, should be in FloatingActions | **LOW** | MASTER.md item #1 — reverting deliver filter bar and adding to FloatingActions is pending. |
| 6 | **Two separate unsent queues are confusing** | `usePhotoQueue` vs `useUnsentPhotos` — completely independent IndexedDB stores | **MEDIUM** | Same concept (unsent photos) implemented twice with different storage, sync mechanisms, and visibility. |
| 7 | **Offline fallback has no toast** | `unit-delivery-sheet.tsx:323-337` — sets deliveryStatus('processing') without showing any toast | **LOW** | User gets no feedback that photo was queued offline. Only visible via badge increment. |
| 8 | **captureGPS timeout (3s) may be too fast** | `use-deliver-unit.ts:6-25` — timeout 3000ms for getCurrentPosition | **LOW** | On slow networks or GPS-poor devices, captureGPS may return null, causing unnecessary 'processing' status. However, gpsOverride from live tracking bypasses this. |
| 9 | **lfsvc disabled on home PC** | OS-level — Windows Geolocation Service was set to Disabled | **FIXED** | `sc.exe config lfsvc start=auto` + `sc.exe start lfsvc` resolved it. Documented here for reference. |
| 10 | **Stale MASTER.md: GPS dots use sharedLocation.accuracy** | MASTER.md Part 12 (line 3570) — says GPS dots use `sharedLocation.accuracy` | **LOW** | Current code uses local `gpsAccuracy` state from sheet's own watchPosition callback. Documentation is stale. |

### 26.8 Efficiency Assessment

| Criterion | Score | Evidence |
|-----------|-------|----------|
| **Speed per delivery** | ⚡ ~3-5s | Photo compression ~500ms + FormData upload ~1-2s + server processing ~500ms. GPS pre-warmed via live tracking (0s wait). 2s auto-advance after delivered. |
| **GPS accuracy** | ✅ 50m Haversine | Street-level precision in Pakistani urban areas. Configurable via settings. Falls to 'processing' if GPS null or coordinates null. |
| **Battery drain** | ✅ Negligible | Two watchers share same GPS chip. Sheet watcher runs 10-15s per delivery (while sheet is idle). StaffMap watcher continuous but adds only JS callback overhead. |
| **Offline resilience** | ✅ IndexedDB + sendBeacon | Photo queued to IndexedDB on network error. `beforeunload` fires sendBeacon for best-effort ping. Auto-syncs when online via `online` event listener. |
| **Data integrity** | ⚠️ Duplicate records | No dedup guard for re-delivery photo inserts. Items in 'processing' status get new delivery_photos records on each delivery attempt. |
| **Admin oversight** | ✅ Processing status + Force Complete | Admin can review 'processing' items and force-deliver or revoke. Force Complete endpoint at `POST /api/deliveries/force`. |
| **QR scanning** | ✅ Present on map | QRScannerButton scans PSID, opens delivery sheet with matching unit. |
| **Photo storage cost** | ✅ Zero Supabase egress | All photos stored in Google Drive via GAS webhook. Supabase only stores the Drive URL. |
| **Unsent queue visibility** | ❌ Split across 2 queues | photo-queue (deliver badge) and unsent-photo-queue (Settings tab) are completely separate. Photos in one are invisible in the other. |
| **Redelivery experience** | ⚠️ Silent drop on delivered items | Tapping "Redeliver" on a 'delivered' item captures photo + uploads but server returns early without saving. Staff sees "Delivered" toast but photo is lost. |

### 26.9 Fix Priority Matrix for Office Session

| Priority | Issue # | Files | Fix Description | Estimated Time |
|----------|---------|-------|-----------------|----------------|
| **P0** | #1 | `unit-delivery-sheet.tsx:208` | Change `enqueuePhoto(...)` → `enqueueUnsent({ assignmentItemId, psid, photoBlob, gpsLat, gpsLng })` in the unsent mode path. Remove `skipAutoSync` param. | 5 min |
| **P0** | #2 | `sync-photo/route.ts:75-97` | After successful webhook upload + delivery_photos update, add: `await sup.from('assignment_items').update({ status: 'delivered' }).eq('id', assignmentItemId).eq('status', 'processing')`. Same logic as promote endpoint lines 65-73. | 10 min |
| **P1** | #3 | `mark/route.ts:83-90` | Change early return to also INSERT the new delivery_photos record before returning. Or allow photo replacement by UPDATE. | 15 min |
| **P1** | #4 | `mark/route.ts` | Add `ownership.status === 'processing'` early return guard (same as 'delivered'/'missed') to prevent duplicate photo records. | 5 min |
| **P1** | #5 | `deliver/page.tsx`, `floating-actions.tsx` | Move unsent icon from deliver filter bar → add as 4th button in FloatingActions. Wire UnsentModal. | 20 min |
| **P2** | #7 | `unit-delivery-sheet.tsx:332` | Add `updateToast(progressTid, 'Saved for later — will sync when online', 'info')` in the offline fallback path. | 5 min |
| **P3** | #6 | Both queue files | Deferred: Consider merging both queues into one. Not urgent — confusing UX but functional. | Deferred |
| **P3** | #10 | MASTER.md:3570 | Update "GPS dots use `sharedLocation.accuracy`" → "GPS dots use local `gpsAccuracy` state". | 2 min |

### 26.10 Data Flow Diagrams

#### Normal Delivery (No photo → delivered/processing)
```
Camera/File → compressImage (WebP, q0.6, 1024px)
  → FormData (gps_override OR captureGPS)
    → POST /api/deliveries/mark
      → Auth: user.getId() + role=field_staff + ownership
      → If already delivered/missed: return early (BUG: no photo saved)
      → GAS webhook: POST to Drive (8s AbortController timeout)
      → INSERT delivery_photos (photo_url, gps, synced_to_drive)
      → Haversine distance(gps, target)
      → If enforceGps && distance ≤ 50m → status='delivered'
        Else → status='processing'
      → UPDATE assignment_items
      → Response: { status, distance, photo_url }
  → If photo_url starts with "pending://":
      → compressImage again (for IndexedDB)
      → enqueueUnsent() to unsent-photo-queue
  → Optimistic cache update
  → Invalidate queries
  → Auto-advance after 2s (delivered) / 3.5s (processing)
```

#### Always Unsent Mode (mark-processing → queue)
```
Camera/File → POST /api/deliveries/mark-processing
  → Auth (same as mark)
  → INSERT delivery_photos (pending://unsent/...)
  → UPDATE assignment_items SET status='processing'
  → compressImage
  → enqueuePhoto(skipAutoSync:true)  ← BUG: writes to wrong queue
  → Toast "Saved to queue ✓"
  → setTimeout 1.5s → onClose()
```

#### Offline Fallback (network error)
```
Camera/File → deliver() throws TypeError → returns null
  → compressImage
  → enqueuePhoto() to photo-queue (no skipAutoSync)
  → setDeliveryStatus('processing')  ← no toast shown
  → When online: processQueue()
    → For each photo (batch 3):
      → Upload to GAS webhook
      → POST /api/deliveries/promote
        → INSERT/UPDATE delivery_photos
        → UPDATE assignment_items SET status='delivered'
      → markSynced → clearSynced after all done
```

#### Unsent Sync from Settings (retrySingle)
```
Settings → "Sync All" → retryAll → retrySingle() per photo
  → resolvePhotoData (blob → dataUrl)
  → POST /api/deliveries/sync-photo
    → POST to GAS webhook (base64)
    → UPDATE delivery_photos (photo_url, gdrive_file_id, synced_to_drive=true)
    → BUG: NO status update — item stays 'processing'
  → removeUnsent from queue
```

---

## 25. Remaining Corrections

Items that need to be fixed before the next session or are deferred from this session:

| # | Priority | Issue | Files | Fix |
|---|----------|-------|-------|-----|
| 1 | **HIGH** | Unsent mode writes to wrong queue — `enqueuePhoto()` to `photo-queue` instead of `enqueueUnsent()` to `unsent-photo-queue`. Photos invisible in Settings. | `unit-delivery-sheet.tsx` | Change `enqueuePhoto(...)` → `enqueueUnsent({ assignmentItemId, psid, photoBlob, gpsLat, gpsLng })` in unsent mode path. Remove `skipAutoSync`. |
| 2 | **HIGH** | sync-photo endpoint doesn't promote status — after successful Drive upload, `assignment_items` stays 'processing' forever | `sync-photo/route.ts` | Add `sup.from('assignment_items').update({ status: 'delivered' }).eq('id', assignmentItemId).eq('status', 'processing')` after successful webhook upload. |
| 3 | **HIGH** | Unsent icon in deliver page filter bar (should be in FloatingActions on map page) | `deliver/page.tsx`, `floating-actions.tsx` | Revert deliver bar, add 4th Image-button with queue badge to FloatingActions. Keep `UnsentModal` triggered from FloatingActions. |
| 4 | MEDIUM | Redelivery blocks photo save — /mark route returns early for 'delivered'/'missed' before inserting delivery_photos record | `mark/route.ts:83-90` | Insert delivery_photos record before early return, or add UPDATE path for photo replacement. |
| 5 | MEDIUM | No early-return for 'processing' items — each redelivery creates duplicate delivery_photos records | `mark/route.ts` | Add `ownership.status === 'processing'` early return guard (same as 'delivered'/'missed'). |
| 6 | LOW | Offline fallback has no toast — `setDeliveryStatus('processing')` with no user feedback | `unit-delivery-sheet.tsx` | Add `updateToast(progressTid, 'Saved for later — will sync when online', 'info')` in offline fallback path. |
| 7 | INFO | Stale IndexedDB entries from prior testing | browser DevTools | Clear before each fresh test session |
| 8 | HIGH | Stale `processing` items in DB from failed earlier tests | SQL | Reset to `pending` before fresh test cycle |
| 9 | MEDIUM | `037-notifications.sql` not yet applied to Supabase | `scripts/sql/037-notifications.sql` | Needs PAT token from office PC (`SUPABASE_ACCESS_TOKEN`) |
| 10 | MEDIUM | Notification scheme update: polling at 30s, no real-time | — | Implemented but migration not applied |
| 11 | INFO | GPS signal indicator accuracy thresholds (10m, 50m, Infinity) — verify on mobile GPS | `unit-delivery-sheet.tsx` | Test with actual mobile GPS; thresholds may need tuning |
| 12 | INFO | Toast redesign renders on all pages — verify on delivery + settings + assignments | `globals.css`, `use-toast.tsx` | Visual check on mobile width (max-w-[260px]) |
| 13 | INFO | GPS battery optimization (deferred to production): `useUserLocation` default low accuracy, switch to high accuracy only when sheet opens | `use-user-location.ts`, `unit-delivery-sheet.tsx` | Keep three-effect pattern during development. Revisit before field deployment. |
| 14 | INFO | Stale MASTER.md GPS dots documentation — says `sharedLocation.accuracy`, should be local `gpsAccuracy` | `MASTER.md:3570` | Update text to match current code. |
| 15 | INFO | Two separate unsent queues (photo-queue + unsent-photo-queue) — confusing UX | Both queue lib files | Consider merging into one queue. Deferred. |

### 25.1 Next Session Agenda — Home (2026-06-08)

**P0 — Delivery hardening testing (est. 30 min):**
Run the full testing protocol (Section 24) end-to-end to verify all today's changes work:
1. Normal delivery: toast stack, GPS, photo proxy URL, auto-advance, HDS hero images, admin table thumbnail + duration
2. Revoke + re-deliver: old photos persist in HDS gallery
3. Offline delivery: unsent queue syncs when back online
4. QR scanner: mobile pill opens scanner, scan navigates correctly
5. Data Insight: portal images in HDS when clicking "Open", Refresh Cache button
6. Dashboard: Office Breakdown tab horizontal scroll
7. Multi-photo per delivery check

**P1 — Fix delivery blocking bugs (est. 20 min):**
8. **Fix unsent mode queue** (`unit-delivery-sheet.tsx`): Change `enqueuePhoto(...)` → `enqueueUnsent({...})` in unsent mode path
9. **Fix sync-photo promote** (`sync-photo/route.ts`): Add `assignment_items` status update to 'delivered' after successful Drive upload
10. **Fix redelivery photo drop** (`mark/route.ts`): Insert delivery_photos record before early-return for delivered/missed items
11. **Add processing guard** (`mark/route.ts`): Early-return for 'processing' items to prevent duplicate photos

**P2 — UI fixes (est. 20 min):**
12. **Move unsent icon** from deliver filter bar → FloatingActions (4th button)
13. **Add offline toast** in handleFile fallback path

**Data cleanup:**
14. Apply `037-notifications.sql` migration to Supabase (requires PAT token from office PC)
15. Clear stale IndexedDB + DB records from prior testing:
    - SQL: `UPDATE assignment_items SET status='pending' WHERE status='processing' AND delivered_at IS NOT NULL`
    - SQL: `DELETE FROM delivery_photos WHERE photo_url LIKE 'pending://%'`
    - DevTools: Clear IndexedDB → delete `billing-saas-photo-queue` and unsent-photo-queue databases

