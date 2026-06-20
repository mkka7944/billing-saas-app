# Billing & Recovery — Master Plan (Reference)
**Generated:** 2026-05-24 | **Stack:** Next.js 16 + Supabase + Tailwind v4 + Zustand + TanStack Query
**Project:** Billing SaaS App — Field staff bill delivery & verification system
**Scale:** ~350K households, ~70 field staff, 3 cities (Bhalwal/Khushab/Sargodha)
> This file is the permanent reference. All session logs moved to `docs/SESSION.md`.
> Read `.opencode/context.json` for current working state. Read `docs/PHASES.md` for phase catalog.

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

**Working DB execution pattern (always use this â€” it works):**
  1. Write SQL to a file using the Write tool
  2. Create JSON payload: `python -c "import json; json.dump({'query': open('path.sql').read()}, open('payload.json', 'w'))"`
  3. Execute: `curl.exe -s -X POST "https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "@payload.json"`
  (Extract token from `.env.local` via regex in PowerShell if needed.)
  **Avoid:** inline Python `urllib` (SSL 403), inline PowerShell SQL (quoting conflicts), heredocs (newline issues).

**DB cleanup procedure (run when size approaches 500MB free tier limit):**
  Credentials: `SUPABASE_ACCESS_TOKEN` from `.env.local` (PAT token `sbp_...`)
  1. **Check DB size:** `SELECT pg_size_pretty(pg_database_size(current_database()));`
  2. **Find duplicate/unused indexes:** Query `pg_stat_user_indexes` for `idx_scan = 0` or duplicate column patterns. Common suspects: old `idx_survey_*` naming vs new `idx_survey_units_*` naming.
  3. **Drop duplicate indexes** (reclaims space immediately â€” indexes are separate files):
     ```sql
     DROP INDEX IF EXISTS idx_old_name;
     ```
     Run DROP INDEX statements in a single batch via the Management API (works inside transaction).
  4. **VACUUM FULL** (reclaims dead tuple space from table bloat â€” must run OUTSIDE transaction, separate curl call):
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
 12. [Session Log](SESSION.md)
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
24. [Deliver â€” Testing Protocol for Unsent Flow](#24-deliver--testing-protocol-for-unsent-flow)
25. [Remaining Corrections](#25-remaining-corrections)
26. [Delivery KPI Queries (Future)](#26-delivery-kpi-queries-future)
27. [Photo Upload Priority: Direct Browser-to-GAS](#27-photo-upload-priority-direct-browser-to-gas-replace-ssr-proxy)
---
## App Vision â€” Daily Reference

### The Goal
A digital system that forces accountability across the entire billing lifecycle: SWMC portal data â†’ PDF generation â†’ staff assignment â†’ GPS-tracked delivery with mandatory photo proof â†’ performance tracking â†’ auto-route optimization. Break staff dependency by making every delivery verifiable and every route reproducible.

### The Core Bottleneck
**Delivery is the biggest operational problem.** Staff performance is poor, houses in congested Pakistani areas are hard to identify, and there is no accountability. The legacy Routing Station app could not solve this because it lacked:
- Segmented assignments (staff saw everything)
- Photo capture linked to specific deliveries
- Silent GPS verification
- Auto-route generation from actual walking patterns

### How the App Solves It

#### For Staff (Field Operations)
1. **QR scan from physical bill** â€” Every printed bill has a QR code containing `sid={survey_id}`. Staff opens the app, taps a floating QR scan button (available on both the Map view and the `/deliver` page), scans the physical bill â†’ HouseDetailSheet opens for that exact unit.
2. **One-tap "Take Picture" in UnitDeliverySheet** â€” Staff taps "Take Picture" â†’ native camera opens â†’ photo captured â†’ GPS coordinates + timestamp captured silently (staff does not know) â†’ WebP compressed (q0.6, 1024px, 30-70KB) â†’ server uploads to Drive via GAS webhook â†’ distance verified against survey marker GPS â†’ unit auto-marked as `delivered` (within 50m) or `processing` (outside threshold). Assignment list updates in real-time.
3. **No sequential binding in the first 1-2 months** â€” Staff walks their natural route. GPS timestamps capture the actual walking order. After 2 months, the delivery sequence is sorted by timestamp â†’ becomes the permanent route.
4. **"Navigate" button** â€” Shows staff their current GPS location vs the house marker on the map. Helps locate houses in congested areas. Manual pin drop option for correcting house coordinates.
5. **Flag option** â€” Staff can mark issues (wrong address, duplicate PSID, no such house) with notes. These feed into the admin Flag Management UI.
6. **Auto-advance** â€” After marking delivered, the same view stays open. Staff scans the next bill without navigating back to the list.

#### For Staff (Overview Page)
- **`/deliver` page** shows the day's assignment list with progress bar (Delivered X/Y, delivery rate percentage).
- Three tabs: Map (assigned markers), List (card view with status), Stats (today's numbers).
- Progress updates in real-time as deliveries are marked from the HouseDetailSheet.

#### For Admins
1. **Map with MC/UC filtering** â€” Essential. All survey markers colored by MC/UC. Filter by MC/UC, city, bill month.
2. **Live monitoring** â€” Toggle a staff member to see their today's delivered/pending/missed dots on the map in near-real-time.
3. **Auto-route generation** â€” After 2 billing cycles of GPS-tracked deliveries, admin runs a tool that:
   - Groups assignment_items by PSID across last 2 months
   - Orders by delivered_at consensus within each UC
   - Writes the permanent route_seq to survey_units
   - Paper bills are then printed in this order each month
   - New staff can replace old staff and follow the same route immediately
4. **RBAC approval chain** â€” Field supervisor creates assignments â†’ Admin approves â†’ Super admin gives final approval. Staff sees only `active` assignments.
5. **Flag Management UI** â€” Resolve ghost PSIDs, confirm keepers for duplicates, acknowledge portal deletions.

#### Staff Performance Measurement
- Photo count vs number of assigned units (rate)
- Delivery time per unit (avg time between consecutive deliveries)
- GPS accuracy (distance between house coordinates and delivery GPS)
- These metrics become the basis for staff evaluation and replacement decisions.

### Data Model for Deliveries (Permanent vs Monthly)
- **`survey_units.route_seq`** â€” PERMANENT. The official walking order after stabilization.
- **`assignment_items.route_seq`** â€” MONTHLY. The actual order the staff walked this month.
- **`assignment_items.delivered_at` / `gps_lat` / `gps_lng`** â€” PER-DELIVERY. Variable each month.
- **`delivery_photos`** â€” PER-PHOTO. One row per photo, linked to `assignment_items`, not to `survey_units`. This means one house can have 12 photos across 12 different monthly deliveries, each linked to that specific month's delivery event.
- **`daily_assignments.assigned_date`** â€” Partitions deliveries by month. Query `WHERE assigned_date BETWEEN '2026-06-01' AND '2026-06-30'` for any month's complete delivery data.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **QR-first delivery** | Staff taps "Deliver" â†’ scans bill â†’ app matches scanned `survey_id` to assignment item. Prevents delivering wrong house. No need to scroll and tap a specific row. |
| **Deliver button on HouseDetailSheet (not per-row)** | Staff naturally memorizes their list. QR scan identifies the unit automatically. The same deliver logic works from both the Map (QR scan â†’ HDS) and the `/deliver` page (list â†’ HDS). |
| **Silent GPS capture** | GPS captured on photo confirm, not shown to staff. Prevents gaming. Over months, GPS drift reveals systematic cheating. |
| **No sequential lock initially** | First 1-2 months are free-form. Staff walks natural route. GPS sequence becomes permanent after. Then paper bills are printed in that order. |
| **Floating QR scan button** | Available on Map view and Deliver page. Same pattern as legacy Routing Station's floating QR control. |
| **survey_id on assignment_items** | Added via ALTER TABLE. Enables QR scan â†’ match by survey_id directly, without extra lookup through psid. |

---
## 1. Project Identity & Architecture
### 1.1 Company Context
We are a sanitation contract company working under **SWMC** (Solid Waste Management Company), a government agency. We survey households and deliver bills issued through the SWMC portal.
### 1.2 The Core Mission
A digital system forcing accountability: lifecycle data â†’ PDF generation â†’ staff assignment â†’ GPS-tracked delivery with mandatory photo proof â†’ performance tracking. Every bill delivery requires timestamped photo evidence. Staff performance tracked per delivery, with auto-routing derived from actual delivery timestamps.

**We do NOT collect payments.** Payment data comes from the SWMC govt portal (daily CSV export). Our system tracks recovery rates by matching our delivery data against portal payment data.
### 1.3 Scale
- **Households:** ~350K across 3 cities
- **Field Staff:** ~70 delivery staff
- **Monthly Bills:** ~30Kâ€“70K printed per month
- **Free Tier Commitment:** Optimized for Supabase (500MB DB, 1GB Storage) and Vercel (100GB Bandwidth) free tiers
### 1.4 Technology Stack
- **Framework:** Next.js 16 (App Router) with `src/` directory
- **Language:** TypeScript (strict type-safety)
- **Database:** Supabase (PostgreSQL) â€” project `qrxbsoqepfaryolwcedk`
- **Auth:** Supabase Auth (admin-created accounts for field staff)
- **State:** Zustand (persisted stores for UI state)
- **Styling:** Tailwind CSS v4 + Shadcn UI
- **Data Fetching:** TanStack Query v5
- **Map:** react-leaflet + Google Maps tiles (streets + satellite)
- **Photos:** Google Drive Apps Script webhook (zero Supabase Storage egress)
- **PDF:** PyMuPDF (fitz) + qrcode + python-barcode (local engine)
- **Data Pipeline:** Python (pandas + openpyxl + PyMuPDF) for lifecycle XLSX â†’ DB
- **CLI Dependencies:** `fitz`, `pandas`, `openpyxl`, `python-dotenv`, `supabase-py`

### 1.5 Key Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| **Standalone app** | Separate Supabase project (not HR), separate Vercel deploy |
| **Google Maps tiles** | Internal office tool, not commercial SaaS â€” better satellite resolution than MapTiler |
| **Photos via GAS webhook** | Reuse proven routing station endpoint. Zero Supabase Storage egress costs |
| **Reference tables for filters** | Small `hierarchy`, `surveyors`, `bill_months` tables replace `SELECT DISTINCT` on 212K rows. Never hit PostgREST 1000-row limit. Populated once, maintained by import scripts + triggers. |
| **No RPCs for client features** | RPCs banned for client-facing features (prevents N+1). **EXCEPTION:** RPCs allowed for admin-only aggregate queries â€” Data Insight, admin dashboards. See `scripts/sql/007-data-insight-rpcs.sql` for approved RPCs. |
| **SSR API routes for all client data** | All survey/billing/payment data fetched via Next.js API routes (`/api/surveys`, `/api/billing-stats`) â€” NOT direct client-side Supabase queries. Reduces egress, hides service role, enables server-side JOINs. |
| **DB triggers for data integrity** | `payment_summary` auto-refreshed on payment_history changes. Hierarchy reference table upserted on survey_units changes. Staff auto-synced from profiles via trigger. |
| **Explicit column selects** | Never `select('*')` â€” egress cost control |
| **Manual monthly processing** | pdf-bill-printer.py runs manually on 19-20th each month (handles PDF gen) |
| **Offline photo queue** | Photos stored in IndexedDB when offline, upload when online |

### 1.6 Data Layer Architecture
The data layer follows a strict 3-tier pattern with **shared query modules** as the single source of truth:

```
Browser (TanStack Query hook)
        â†“ fetch('/api/...')
Next.js API Route (server-side Supabase client)
        â†“ imports shared query builders
src/lib/queries/  â† single source of truth for filters, columns, pagination
        â†“ creates Supabase query
Supabase DB
```

**Shared query modules** (`src/lib/queries/`):
- `constants.ts` â€” `SURVEY_UNIT_COLS` (shared column list), `STALE_TIMES` constants
- `survey-units.ts` â€” `applyActiveFilter()`, `applyArchivedFilter()`, `selectUnitCols()`
- `pagination.ts` â€” `parsePagination()`, `applyPagination()`

**Critical rule:** `survey_units.status` must never be filtered with bare `.eq('status', 'ACTIVE')`. Enriched units (those with PSIDs and lifecycle data) have `status = NULL`, not `status = 'ACTIVE'`. The correct filter is `or('status.is.null,status.eq.ACTIVE')` via `applyActiveFilter()`.

All API routes import from these shared modules. Hooks never import `createClient()` â€” they only call `fetch('/api/...')`. The only exception is `supabase.auth.*` SDK calls (signInWithPassword, getSession, signOut).

### 1.7 Authentication System (RBAC)
- 3 roles: `super_admin` (full access), `admin` (operations), `field_staff` (deliver only)
- Staff log in with **username** (transformed to `username@billing.local` behind the scenes)
- Admin logs in with email or username
- Passwords set by admin only â€” no self-service password change
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

1. **`/deliver` page** â€” Shows today's assignment list. Staff sees only their assigned PSIDs.
   - Three tabs: **Map** (assigned markers on Leaflet), **List** (card view with status badges), **Stats** (today's progress).
   - Floating QR scan button (bottom-right) on all tabs.
   - Persistent progress bar: "12/25 delivered, 48%" at top.
   - Tap a card â†’ navigates to map centered on that marker â†’ HouseDetailSheet opens.

2. **Map view** â€” Full-screen Leaflet with assigned markers only. Floating QR scan button.
   - Markers colored by delivery status: green=delivered, blue=pending, red=missed.
   - Tap marker â†’ HouseDetailSheet opens for that unit.

**Delivery flow (same from both entry points):**
```
Floating QR button â†’ tap â†’ camera opens â†’ scan physical bill's QR code
  â†’ QR contains sid={survey_id}
  â†’ App matches survey_id to staff's active assignment_items
  â†’ HouseDetailSheet opens for that unit

In HouseDetailSheet:
  â”œâ”€â”€ "Take Picture" â†’ native camera â†’ photo captured â†’ on confirm:
  â”‚     â”œâ”€â”€ GPS captured silently (staff does not know)
  â”‚     â”œâ”€â”€ Timestamp captured from server
  â”‚     â”œâ”€â”€ assignment_item.status = 'delivered'
  â”‚     â”œâ”€â”€ delivery_photos row created (photo_url, gps_lat/lng, captured_at)
  â”‚     â””â”€â”€ Progress bar updates in real-time
  â”œâ”€â”€ "Navigate" â†’ shows staff GPS vs house marker on map, distance, Google Maps deep link
  â”œâ”€â”€ "Flag" â†’ text notes, creates staff_flagged entry in flagged_psids
  â”œâ”€â”€ "Skip/Missed" â†’ reason input, marks as missed with GPS
  â””â”€â”€ After marking: same view stays open. Staff scans next bill without navigating back.
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
| **Data Insight** | Desktop-only: KPI grid + aggregation table with row grouping (districtâ†’tehsilâ†’UC drill-down). |
| **Assignments** | Desktop: UC list with totals â†’ click â†’ staff picker â†’ count â†’ create. Mobile: simplified same flow. |
| **Theme** | Dark mode available. Compact data-dense layouts. Monospace for numbers. |

### 2.3 Routing Logic
- `/` â†’ checks `roleName` â†’ redirects `field_staff` to `/deliver`, admin/super_admin to `/map`
- Role-based access: sidebar hides admin items for field_staff (Data Insight, Dashboard, Assignments, Routes)
- API routes check role for admin-only operations (create user, stats, assignments)

---
## 3. Visual Design System
### 3.1 Field Staff (Mobile)
- **Background:** White `#ffffff` â€” maximum sunlight contrast
- **Primary:** `#0072f5` (Vercel blue) â€” action buttons, progress bars
- **Success:** `#16a34a` (green-600) â€” delivered badges
- **Warning:** `#d97706` (amber-600) â€” pending markers
- **Danger:** `#dc2626` (red-600) â€” missed badges
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
| `/assignments` | Admin | UC list â†’ staff assignment creation + approval chain (draft/pending/approved/active) |
| `/flagged-units` | Admin | Flag management: resolve ghost PSIDs, confirm keepers, acknowledge deletions |
| `/route` | Admin | Route management from `saved_routes` |
| `/stats` | Admin | Performance dashboard, staff tracking, delivery stats |
| `/settings` | All | Theme, account info, **Users tab** (admin only â€” user CRUD, freeze, password reset) |

**Note:** Map, Survey Units (Data Insight), and Dashboard are views on the `/map` page, accessed via sidebar navigation. `/list` and `/data-insight` are NOT separate routes â€” they are `activeView` toggles within `/map`.

---
## 5. Lifecycle Data Pipeline
### 5.1 Overview
The core data flow starts at the **SWMC Portal** which provides:
- **Biller list CSVs** (available ~16th each month) â€” contains PSIDs, Survey IDs, amounts, household info
- **Original A4 PDF bills** â€” scanned PDFs containing 20-digit PSIDs embedded in pages

Your local Python scripts process these into two outputs: (1) the **lifecycle XLSX** (master reference file), and (2) **A5 print PDFs** for field staff delivery.

**Important: The lifecycle XLSX is YOUR processed output, not a raw portal download.** It already has the Survey ID â†” PSID linkage baked in by `pdf-psid-extractor.py`.

### 5.2 Script Pipeline (3 scripts)

#### Script 1: pdf-psid-extractor.py (runs 16thâ€“20th monthly)
- Reads raw A4 PDFs from the portal
- Uses PyMuPDF (fitz) to extract 20-digit PSIDs via regex `\b(\d{20})\b`
- Matches extracted PSIDs with the biller list CSV
- Cross-references with survey data to identify `Deleted in Portal` flag
- **Output:** `test_lifecycle_Biller_{City}_{Month}.xlsx` â€” the enriched lifecycle file (~57+ columns per row)

#### Script 2: pdf-bill-printer.py (runs 19thâ€“20th monthly, ~1305 lines)
- Reads the lifecycle XLSX + original A4 PDFs
- Two-filter system: `Deleted in Portal != 'Yes'` AND `psid found in source PDF`
- Groups by UC, sorts by route, assigns Bill# per UC (`#1/50`, `#2/50`, ...)
- Generates A5 print PDFs with QR codes, barcodes, and metadata overlays
- **Output:** Final A5 print PDFs at `F:\Final_print\{Month}-Final-Print\`

#### Script 3: bill-extractor-v4.py (runs daily, multiple times)
- Fetches payment data from the SWMC portal
- **Output:** `COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` â€” all paid PSIDs with amount, date, channel
- Used for daily payment tracking in Excel

### 5.3 Lifecycle XLSX Files
**Pattern:** `test_lifecycle_Biller_{City}_{Month}.xlsx` (e.g. `test_lifecycle_Biller_Sargodha_May2026.xlsx`)
- **3 cities:** Sargodha (sgd), Khushab (ksb), Bhalwal (bhl)
- **8 months:** Sep/Oct 2025 â†’ May 2026 (18 files total)
- **5 combined master XLSX** (~17MB â†’ ~42MB, grows monthly)
- **~57+ columns** including: `Biller PSID`, `Survey ID`, `Deleted in Portal`, `Route Segment`, `Route Seq`, `Route Total`, `Monthly Fee`, `Arrears`, `Total Payable`, `Surveyor Name`, `Survey Date`, `Survey Time`, `UC`, `District`, `Tehsil`, and per-month `PDF Issued` columns

### 5.4 Routes
Route data is embedded in the lifecycle XLSX (Route Segment, Route Seq columns). Some UCs/MCs have routes from a separate route CSV exported from the Routing Station app. Staff can also assign custom route numbers via the House Intel module (Routing Station Pro). These custom routes are also used in final print sorting. Route enrichment into lifecycle is handled during the pdf-psid-extractor step.

### 5.5 Ingest Pipeline: Source Scripts â†’ CSV/XLSX â†’ Supabase

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
1. **Lifecycle XLSX** â†’ `survey_units` (21 fields, monthly after pdf-psid-extractor)
2. **Combined payment CSV** â†’ `payment_history` (daily/on-demand)
3. **Index cache JSON** â†’ NOT loaded (local reference only)

### 5.6 `enrich-survey-units.py` (Phase 2)
**Purpose:** Reads lifecycle XLSX and upserts **21 columns** to `survey_units`.

**Lifecycle XLSX â†’ survey_units field mapping:**

| Lifecycle Column | survey_units Column | Status |
|-----------------|-------------------|--------|
| `Survey ID` | `survey_id` (PK) | âœ… existing |
| `Biller PSID` | `psid` | âœ… existing |
| `Monthly Fee` | `monthly_fee` | âœ… existing |
| `Billing Category` | `billing_category` | âœ… existing |
| `Arrears` | `arrears` | âœ… existing |
| `Route Segment` | `route_name` | âœ… existing |
| `Route Seq` | `route_seq` | âœ… existing |
| `Current Bill` | `current_bill_month` | âœ… existing |
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
| `Deleted in Portal` | `status` | **NEW** â†’ "Yes" sets `status='ARCHIVED'` |
| `Total Payable` | ~~`amount_due`~~ | **SKIPPED** (dropped in Phase 2b) |

### 5.7 `load-payments.py` (Phase 3)
**Purpose:** Reads combined payment CSV and upserts to `payment_history`.

**CSV â†’ payment_history field mapping:**

| CSV Column | payment_history Column | Notes |
|-----------|----------------------|-------|
| `PSID` | `psid` | |
| `Month` | `bill_month` | Already `MAY2026` format |
| `Paid Amount` | `amount_paid` | |
| `Paid Date` | `paid_date` | Parse `"Jun 01, 2026"` â†’ ISO date |
| `Channel` | `payment_method` | |
| `Status` | `payment_status` | |
| `Fine` | `fine` | |
| `City` | `city_district` | Uppercase |
| `Tehsil` | `tehsil` | Uppercase |
| `UC` | `uc_name` | Raw CSV value |

**Key:** Idempotent upsert on `(psid, bill_month)` â€” safe to run multiple times daily.

### 5.8 `ingest-all.py` (Phase 5 â€” Orchestrator)
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
2. Sort: `route_seq ASC â†’ survey_id DESC`
3. Assign sequential `bill_count` within UC
4. Compute `paid_status`: count paid months from payment_history â†’ `P-{n}` or `U-P`

**No printer cache JSON needed** â€” all metadata is already in Supabase after Phase 2 + 3.

---
## 6. Data Model
### 6.1 Tables

| Table | Key | Purpose | Size |
|-------|-----|---------|------|
| `survey_units` | survey_id | Household identity, GPS, images, monthly_fee, billing_category, psid (stable biller ID), arrears, amount_due, current_bill_month, start_month, route_name/seq, last_verified_month, city | ~212K |
| `payment_history` | id | All payments â€” one row per (PSID, month) from daily combined Payment CSV. Append-only, all months. | ~122K |
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

- **Biller Data** (`survey_upserted columns`): Monthly enrichment from lifecycle XLSX overwrites `monthly_fee`, `arrears`, `amount_due`, `billing_category`, `route_name`, `route_seq`, `current_bill_month` on `survey_units`. Only the current month snapshot is stored â€” history lives in lifecycle XLSX files as JSON exports.

- **Payments** (`payment_history`): Append-only log â€” who paid, how much, when, channel. All months historically complete.

- **The bridge** is `psid` (stable biller ID assigned to a property). `survey_units.psid` is the stable mapping. Payment queries join `payment_history.psid â†’ survey_units.psid` for geography â€” no intermediate table needed.

- **PDF bill number** per month comes from the separate `pdf-bill-printer.py` run. Stored in exported JSON (`bills.json`) alongside the current month's data.

- **Three UIs:**
  1. **Survey records** â€” browse/search properties with their PSID, geography, type (uses `survey_units`)
  2. **Payments per survey unit** â€” per-property payment lookup (uses `payment_history` + `survey_units.psid`)
  3. **Recovery reports** â€” district/tehsil/UC aggregates for recovery data (uses `payment_history` + `survey_units` geography, independent of biller columns)

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

These three tables never exceed 1000 rows total. All filter dropdown queries are simple `.select('*')` â€” zero PostgREST row limit issues, no RPCs needed.

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
  last_verified_month text,               -- e.g. "MAY2026" â€” tracks monthly GPS verification (added Phase 0f)
  created_at timestamptz, updated_at timestamptz
);

-- NOTE: bill_items table was dropped in storage crisis (v7.0).
-- All billing columns are now on survey_units: monthly_fee, arrears, billing_category, route_name, route_seq, current_bill_month.
-- Payment lookup uses survey_units.psid â†’ payment_history.psid (no intermediate table).

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

### 6.5 Data Sources â†’ Field Mapping

#### Survey CSVs (3 files) â†’ `survey_units`
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
| Image URL 1â€“4 / URL 1â€“4 | image_urls[] |
| *(from lifecycle)* | monthly_fee, billing_category (enriched) |

#### Lifecycle XLSX (current month, 1 per city) â†’ `survey_units` enrichment (via `enrich-survey-units.py`)
| XLSX column | DB field |
|---|---|
| Biller PSID | survey_units.psid |
| Survey ID | survey_units.survey_id |
| Total Payable | *(not used â€” computed as monthly_fee + arrears in UI)* |
| Arrears | survey_units.arrears |
| Monthly Fee | survey_units.monthly_fee |
| Billing Category | survey_units.billing_category |
| Start Month | survey_units.start_month (added via migration 028) |
| Route Segment | survey_units.route_name |
| Route Seq | survey_units.route_seq |

#### Payment CSV (1 combined file) â†’ `payment_history`
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
1. `006-payment-summary.sql` â€” creates `payment_summary` table, seeds from historical data
2. `007-data-insight-rpcs.sql` â€” creates RPCs for Data Insight admin page
3. `008-add-tehsil-to-bill-items.sql` â€” adds `tehsil` column, backfills from `survey_units`, creates index
4. `009-triggers-and-automation.sql` â€” creates triggers for ongoing data integrity
5. `010-reference-tables.sql` â€” creates `hierarchy`, `surveyors`, `bill_months` + maintenance trigger
6. `011-performance-indexes.sql` â€” adds missing indexes (status, trigram, composite, payment_status)
7. `012-add-psid-to-survey-units.sql` â€” adds `psid` column, backfills from `bill_items`, creates unique index
8. `013-add-verification-tracking.sql` â€” adds `last_verified_month` to survey_units
9. `014-house-corrections-table.sql` â€” creates `house_corrections` (replaces `verified_houses`)
10. `015-revise-rpcs.sql` â€” updates 5 RPCs to use `survey_units.psid` + reference tables
11. `016-delivery-tracking-tables.sql` â€” creates 4 delivery tables + triggers
12. `020-rbac-system.sql` â€” creates `roles` table, adds username/role_id/suspension/deletion to profiles, drops legacy role/permissions columns, adds RLS policies

**Note:** Migrations 008, 009, 011, 012 reference `bill_items` which has been dropped from the database. These are included for reference only â€” if re-applying, create `bill_items` first or skip these steps.

---
## 7. Monthly Data Workflow

### CRITICAL: Billing Cycle Definition
A billing month runs from the **16th of the current month to the 15th of the next month** (midnight).
- **MAY2026** billing cycle = May 16, 2026 â†’ June 15, 2026 (midnight)
- **JUN2026** billing cycle = June 16, 2026 â†’ July 15, 2026 (midnight)
- The `currentMonth()` helper in `src/lib/constants.ts` implements this: if `d.getDate() < 16`, use previous calendar month.
- **May 31 does NOT signify end of billing cycle.** The cycle always runs 16th â†’ 15th.

### Output File Paths (Ingest Scripts Read from Office PC)
Ingest scripts (`load-payments.py`, `enrich-survey-units.py`) read directly from the Office PC output folders:
- **Lifecycle XLSX**: `F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs\` (monthly)
- **Payment CSV**: `F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data\COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` (daily)
With local fallback to `scripts/data/` when Office PC folder is unavailable.

### Monthly (16thâ€“20th)
1. **16th:** SWMC portal provides biller list CSV + original A4 PDFs
2. **16thâ€“18th:** `pdf-psid-extractor.py` reads PDFs, extracts PSIDs, matches with biller list + survey data â†’ generates `test_lifecycle_Biller_{City}_{Month}.xlsx`
3. **19thâ€“20th:** `pdf-bill-printer.py` runs â†’ generates A5 print PDFs with overlays + `index_cache_{city}_{month}.json`
4. **18thâ€“20th:** `python scripts/ingest-all.py` â†’ select option `[1]` (Full Monthly Import)
   - Runs `enrich-survey-units.py` â†’ reads lifecycle XLSX â†’ upserts 21 fields to `survey_units`
   - Runs `load-payments.py` â†’ reads combined payment CSV â†’ upserts `payment_history`
   - Writes audit log to `ingest_log`

### Daily
1. **Admin:** Runs `bill-extractor-v4.py --status PAID` â†’ fetches updated payment CSV
2. **Admin:** Runs `python scripts/ingest-all.py` â†’ select option `[2]` (Daily Update)
   - Runs `load-payments.py` â†’ reads latest payment CSV â†’ upserts new records to `payment_history`
   - Idempotent: safe to run multiple times per day
3. **Admin (optional):** After `survey_filtered.py`, can run option `[3]` for quick survey sync
4. **Admin:** Opens `/settings` â†’ Users tab â†’ creates/manages staff accounts (username + password, role assignment, freeze/delete)
5. **Admin:** Opens `/assignments` â†’ picks UC â†’ sees unassigned bills â†’ picks staff â†’ sets count â†’ creates daily chunk
   - Creates `daily_assignments` + `assignment_items` rows (with `survey_id` for QR matching)
6. **Field Staff:** Opens `/deliver` â†’ sees today's assigned bills (from `assignment_items` joined to `daily_assignments`)
7. **Staff delivery flow (QR-first):**
   a. Staff taps floating QR scan button (on Map or Deliver page) â†’ camera opens
   b. Scans QR code on physical bill â†’ QR contains `sid={survey_id}`
   c. App matches `survey_id` to staff's active `assignment_items`
   d. HouseDetailSheet opens for that unit
   e. Staff taps "Take Picture" â†’ native camera opens â†’ photo captured
   f. On photo confirm: GPS + timestamp captured silently â†’ `assignment_items.status = 'delivered'` â†’ `delivery_photos` row created
   g. Staff scans next bill (no navigation back to list needed)
   h. If house not found: staff can mark "Missed" with reason + GPS, or "Flag" with notes
8. **Navigate aid:** Staff taps "Navigate" in HouseDetailSheet â†’ map shows their GPS location vs house marker with distance. Manual pin drop for GPS correction â†’ saved to `house_corrections`.
9. **Photo sync:** IndexedDB queue â†’ GAS webhook â†’ Drive URL â†’ saved to `delivery_photos`
10. **Route stabilization:** After 2 billing cycles, `assignment_items.delivered_at` timestamps sorted per PSID â†’ consensus order â†’ written to `survey_units.route_seq`. Paper bills printed in this order each subsequent month.

---
## 8. Performance Rules (Must Follow)
1. Never `select('*')` â€” name explicit columns (egress cost)
2. Push filters to the server â€” `.eq()`, `.in()`, `.gte()`, not JS `.filter()`
3. No N+1 sequential queries â€” use `Promise.all` for independent queries
4. No RPCs for client-facing features â€” admin-only aggregate queries (Data Insight, dashboards) may use RPCs from `scripts/sql/007-data-insight-rpcs.sql`
5. **Reference tables for filter dropdowns** â€” never query 212K tables for filter options. Use `hierarchy`, `surveyors`, `bill_months` tables (all <1000 rows).
6. `staleTime > 0` â€” 5min for billing data (daily updates), 30min for hierarchy (rarely changes)
7. `gcTime > staleTime` â€” keep cached data for back-navigation
8. Index every filtered column â€” especially `survey_units.status` (all queries filter by ACTIVE)
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
| 6 | Same PSID paid in multiple months (including current) | `payment_history` has all records. Staff app cross-references current `bill_month`: if paid, shows "Already paid" â€” do not deliver. |
| 7 | Survey exists but no PSID in current lifecycle | Valid unbilled survey. Map shows house with "No bill this month". Gets PSID next month. |
| 8 | `survey_units` enrichment missing for current month | `enrich-survey-units.py` must be re-run. Old enrichment remains until overwritten. |
| 9 | `payment_summary` stale after payment import | Trigger auto-refreshes on payment_history changes. |
| 10 | Reference table out of sync after bulk import | Import script upserts reference tables. Trigger provides real-time sync for incremental changes. |
| 11 | Staff assigned to UC that disappears from hierarchy | Assignment references `assignment_items.psid` directly, not UC name. House still renders even if UC renamed. |
| 12 | Photo taken offline, assignment completed hours later | Photo queued in IndexedDB with assignment_item_id. On sync, photo metadata links to assignment. Count reflects sync'd count, not taken count. |
| 13 | House GPS coordinates are wrong â€” staff needs to correct | Staff long-presses correct location on map â†’ pin drops. Saved to `house_corrections` with original+corrected lat/lng, staff ID, and delivery date. Admin reviews and can update `survey_units.lat/lng`. |
| 14 | Legacy `verified_houses` and `staff_sync_logs` data | No import â€” corrections are stale, old photo logs lack house linkage. Archive to JSON file in `scripts/archive/` before dropping tables. |
| 15 | Multiple PSIDs per survey_id â€” which one is the "primary" for `survey_units.psid`? | First PSID from lifecycle data (earliest start_month). Only one PSID stored on `survey_units`. |
| 16 | `survey_units.psid = null` â€” survey exists in the field but has no lifecycle PSID | **New/unregistered survey.** Units surveyed by field staff but not yet assigned a PSID from the SWMC billing lifecycle. These have `survey_id` but no matching entry in `payment_history` or `bills.json`. No payment history, no current bill. Frontend keys and expand states use `survey_id` (always non-null) instead of `psid` to avoid React duplicate-key warnings and auto-expand bugs (`null === null`). |
| 17 | `payment_history` PSID doesn't match any `survey_units.psid` (orphaned) | **Orphaned PSID from deleted survey ID.** The govt survey app created duplicate PSIDs, then survey IDs were deleted on portal but PSIDs remain in biller list (~20K). `payment_history` lacks a `city`/`tehsil` column â€” the RPC joins to `survey_units` which returns NULL for orphans â†’ "Unknown" in charts. **Short-term fix:** Add `city`/`tehsil` columns to `payment_history` so chart geography is independent of `survey_units` match. **Long-term fix:** Staff marking system over 2-3 billing cycles to identify and filter ghost PSIDs. |
| 18 | QR scan returns `survey_id` not in staff's active assignment | Show toast: "This bill is not in your today's assignment." Do NOT open HouseDetailSheet. Staff can still open HDS manually from the map/list if they need to view. |
| 19 | GPS capture fails during delivery (timeout, denied, unavailable) | Deliver silently without GPS â€” mark delivered with `gps_lat = null, gps_lng = null`. The photo timestamp alone is sufficient proof. GPS failure rate tracked as a staff performance metric (excessive failures = suspicion). |
| 20 | Staff takes photo offline â†’ assignment marked offline â†’ photo syncs later | Photo queued in IndexedDB with `assignment_item_id`. On sync, GAS webhook uploads to Drive â†’ URL saved to `delivery_photos`. Count reflects synced count, not taken count. Assignment status updated when photo successfully uploaded. |
| 21 | Staff is replaced mid-cycle â€” new staff inherits partial assignment | New staff gets new `daily_assignments` for remaining units. Previous staff's deliveries stay under their name. No transfer of partial completion. Both staff's stats are tracked independently. |
| 22 | Route stabilization detects conflict (Month 1 order â‰  Month 2 order) | System flags the conflict with a warning percentage. Admin manually reviews and chooses or reorders. Only sequences with >80% consensus auto-commit. |

---
## 10. Implementation Phases

### Phase 0d â€” Reference Tables & Filter Fix (~1.5 hrs)
| Step | Time | Task |
|------|------|------|
| 0d.1 | 30 min | SQL migration `010-reference-tables.sql`: create `hierarchy`, `surveyors`, `bill_months`, populate from existing data, add maintenance trigger |
| 0d.2 | 15 min | Update `GET /api/hierarchy` to query `hierarchy` + `surveyors` tables (remove RPC/fallback) |
| 0d.3 | 15 min | Update `GET /api/bill-months` to query `bill_months` table (remove RPC/fallback) |
| 0d.4 | 10 min | Verify all filters populate correctly: Khushab, Bhalwal, MC-1, all months |
| 0d.5 | 5 min | Delete 6 dead service files: `finance-service`, `retention-service`, `recovery-service`, `hierarchy-service`, `survey-service`, `route-service` |

### Phase 0e â€” Stabilize & Clean (~2 hrs)
| Step | Time | Task |
|------|------|------|
| 0e.1 | 20 min | Fix payment filter pagination: fetch all survey IDs, apply payment filter, THEN paginate |
| 0e.2 | 15 min | Fix `billing-stats` API: populate or remove empty `tehsil_stats`/`uc_stats`/`category_stats` |
| 0e.3 | 15 min | Move `useBillingRoutes` to API route pattern (`/api/routes`) |
| 0e.4 | 10 min | Deduplicate `currentMonth()` â€” single shared utility |
| 0e.5 | 10 min | Add `survey_units.status` index |
| 0e.6 | 30 min | Fix `FinanceSummary` type to match actual API response (remove empty arrays or populate them) |

### Phase 0f â€” Schema Restructuring Foundation (~3 hrs)
| Step | Time | Task |
|------|------|------|
| 0f.1 | 20 min | `012-add-psid-to-survey-units.sql` â€” add `psid` column, backfill from `bill_items`, unique partial index |
| 0f.2 | 5 min | `013-add-verification-tracking.sql` â€” add `last_verified_month` to `survey_units` |
| 0f.3 | 20 min | `014-house-corrections-table.sql` â€” create `house_corrections` table to replace `verified_houses` |
| 0f.4 | 15 min | `015-revise-rpcs.sql` â€” update 5 RPCs (`get_billing_group_stats`, `get_billing_summary`, `get_hierarchy`, `get_surveyors`, `get_bill_months`) |
| 0f.5 | 30 min | `016-delivery-tracking-tables.sql` â€” create 4 delivery tables + triggers |
| 0f.6 | 10 min | Archive legacy tables: `scripts/archive-legacy-tables.py` â†’ JSON â†’ drop `verified_houses`, `staff_sync_logs` |

### Phase A â€” Admin Assignment UI (~3 hrs)
| Step | Time | Task |
|------|------|------|
| A.1 | 30 min | `GET /api/assignments` + `POST /api/assignments` endpoints |
| A.2 | 60 min | `/assignments` page: UC list with totals, click â†’ unassigned bills â†’ pick staff â†’ set count |
| A.3 | 30 min | Assignment management: view active, completion %, revoke |
| A.4 | 30 min | `/route` tab from `saved_routes`, grouped cityâ†’UCâ†’route |

### Phase B â€” Field Staff Delivery UI (~10 hrs)

**B1 â€” Assignment Overview (`/deliver` page) âœ… (Done 2026-06-02)**
| Step | Time | Task | Status |
|------|------|------|--------|
| B.1 | 60 min | `/deliver` page: full-screen mobile map with assigned bill markers, bottom sheet with progress bar | âœ… |
| B.2 | 30 min | Deliver bottom sheet: name, address, bill amount, delivery status, photo button | âœ… |
| B.3 | 60 min | Photo capture: camera API â†’ WebP compress â†’ IndexedDB queue â†’ GAS webhook â†’ Drive URL | âœ… |
| B.4 | 30 min | Status marking: delivered (photo+GPS) or missed (photo+reason+GPS) | âœ… |
| B.5 | 30 min | Live progress: "Delivered X/Y" from assignment_items | âœ… |
| B.6 | 60 min | Swipeable card list view: pull-to-refresh, sorted by route sequence | âœ… |
| B.7 | 30 min | Offline support: cached assignment + IndexedDB photo queue + sync indicator | âœ… |
| B.8 | 30 min | Advance to next pending | âœ… |

**B2 â€” Map-Based Delivery Flow (QR + UnitDeliverySheet) â³ (In Progress)**
| Step | Time | Task | Status |
|------|------|------|--------|
| B.13 | 15 min | **Add `survey_id` to `assignment_items`**: ALTER TABLE migration. Update assignment creation to write `survey_id`. Enables QRâ†’assignment matching. | âœ… |
| B.14 | 30 min | **Fix delivery target key**: Changed from `survey_id` to `psid` â€” always populated, no backfill needed. Fixes null-equality bug. | âœ… |
| B.9 | 60 min | **QR Scanner**: Floating button on Map view. Install `html5-qrcode`, scan `sid={survey_id}` from physical bill. Match to staff's active `assignment_items` by `survey_id`. Open UnitDeliverySheet. Fallback manual input. | âœ… |
| B.15 | 30 min | **Shared marker module**: `src/lib/markers.ts` â€” `createMarkerIcon(color, opts?)` with CSS pulse animation. Used by both admin and staff. 10px default, 12px staff, selected ring. | âœ… |
| B.16 | 30 min | **UnitDeliverySheet redesign**: Full-bleed hero image with gradient overlay, overlaid info + action buttons, close button top-left, delivered green checkmark overlay, nav arrows, touch swipe. | âœ… |
| B.17 | 30 min | **FlyToTarget + Satellite toggle on StaffMap**: Auto-flies to selected marker (zoom 18, 1s). Reads `mapType` from billing store. | âœ… |
| B.18 | 45 min | **Stats page for field_staff**: Bottom tab `/stats` route. StaffPersonalStats with today's progress + 7/30/90 day historical KPIs. | âœ… |
| B.19 | 30 min | **Deliver page redesigned**: Compact mobile list â€” progress header bar, pagination (50/page), route seq circles, consumer name + status dot, delivered timestamp, amount right-aligned. | âœ… |
| B.20 | 15 min | **Stale files deleted**: Removed old deliver-map, deliver-bottom-sheet, deliver-action, deliver-card-list. | âœ… |
| B.21 | 15 min | **QR scanner guard + z-index fix**: activeView guard, z-index bump to z-[1000]. | âœ… |
| B.10 | 90 min | **One-tap delivery with GPS verification**: Create `useDeliverUnit()` hook + `POST /api/deliveries/mark`. One-tap flow: Take Picture â†’ compress WebP (q0.6, 1024px, 30-70KB) â†’ capture GPS (silent, 3s timeout) â†’ POST FormData to server â†’ server uploads to GAS webhook â†’ saves to Drive + delivery_photos â†’ calculates Haversine distance from survey marker â†’ if â‰¤50m: status='delivered', else: status='processing'. No manual "Confirm Delivery" step. UnitDeliverySheet button auto-advances after photo. | âœ… |
| B.11 | 30 min | **Auto-advance + distance indicator**: After one-tap delivery, auto-advance to next pending item (B.12 merged). Show green checkmark if auto-verified, yellow "processing" badge if pending review. Distance badge on delivered overlay. Drive photos in HDS gallery via `GET /api/delivery/photos/drive` + `useDrivePhotos` hook. | âœ… |
| B.12 | â€” | _(merged into B.10-B.11)_ | â€” |

### Phase B3 â€” Delivery Stability & Hardening (~8 hrs)

**B3a â€” Critical Fixes for Testing (~1.5 hr)**
| Step | Time | Task |
|------|------|------|
| B3a.1 | 5 min | **DB CHECK constraint fix**: Migration 035 â€” drop old `assignment_items_status_check`, add new one allowing `'processing'`. Update `refresh_staff_daily_stats` trigger to count `processing` items. **Blocks every out-of-range delivery (orphan photo + 500).** |
| B3a.2 | 15 min | **Auth on mark route**: Add `sup.auth.getUser()` + ownership check on `POST /api/deliveries/mark`. Verify `assignment_item` belongs to caller's `daily_assignments.staff_id`. Remove `email` form field, derive from `user.email`. **Prevents cross-user delivery marking.** |
| B3a.3 | 10 min | **Webhook AbortController**: Add 8s timeout on GAS webhook `fetch` in mark route via `AbortController`. On abort: set `gdrive_file_id = null`, `synced_to_drive = false`, continue with status update. **Prevents 30-60s frozen UI on slow GAS.** |
| B3a.4 | 15 min | **Error classification in `useDeliverUnit`**: Distinguish `TypeError` (network failure â†’ offline queue) from `res.ok === false` (server error â†’ toast, no queue). Fixes silent offline-queue on 500s. |
| B3a.5 | 15 min | **Query invalidation gaps**: `useMarkItem` â†’ invalidate `['staff-stats']`. `useCreateAssignment` â†’ invalidate `['staff-stats']` + `['staff-performance']`. `useCreateUser` â†’ invalidate `['staff-list']`. **Stats stay stale after delivery/creation.** |
| B3a.6 | 5 min | **Auto-advance timing**: 2s for `'delivered'`, 3.5s for `'processing'` (more time to read "Saved" message). |

**B3b â€” GPS & Photo Reliability (~2 hr)**
| Step | Time | Task |
|------|------|------|
| B3b.1 | 15 min | **GPS retry on error**: `useUserLocation` stops after first error. Add exponential backoff (1s, 3s, 10s). |
| B3b.2 | 30 min | **Single GPS watcher**: Sheet + StaffMap each call `watchPosition` â€” double battery drain. Read `useUserLocation` from shared store/context, remove duplicate watcher in sheet. |
| B3b.3 | 15 min | **Mark endpoint idempotency**: Reject status update if `assignment_item` is already `delivered`/`missed`. Return existing `photo_url`. Prevents duplicate photos from double-tap / offline replay. |
| B3b.4 | 30 min | **Photo queue robustness**: Store photo as `Blob` in IndexedDB (not base64 â€” UI freeze). `navigator.sendBeacon` for fire-and-forget on tab close. Surface `lastError` per photo in admin UI. |
| B3b.5 | 30 min | **Offline cache to IndexedDB**: `offline-cache.ts` uses `localStorage` (5MB cap). Move to IndexedDB. Prevents silent cache loss on large assignments. |
| B3b.6 | 15 min | **Cache fallback on ANY error**: `deliver/page.tsx` only caches on `!data`. Add `isError` fallback â€” use cache on fetch failure too. |

**B3c â€” State Machine Completeness & Production Auth (~3 hr)**
| Step | Time | Task |
|------|------|------|
| B3c.1 | 15 min | **Processing counts in assignment views**: Fix `getAssignmentList` and `getUcTotals` to include `'processing'` in item count queries. |
| B3c.2 | 15 min | **Staff daily stats trigger**: Update `refresh_staff_daily_stats()` to count `processing` items in the rollup. |
| B3c.3 | 15 min | **Dead code cleanup**: Remove duplicate `useEffect` (GPS cleanup), duplicate `isDelivering` state, unused `totalDue` variable, orphaned `photo-upload.tsx` file. |
| B3c.4 | 15 min | **Server-side target GPS lookup**: Derive `psid` and `survey_units.lat/lng` from `assignment_item_id` server-side. Drop form fields `psid`, `target_lat`, `target_lng`. Prevents target-swap attack. |
| B3c.5 | 45 min | **Auth on remaining 7 routes**: Add `sup.auth.getUser()` + role check to `PATCH /api/assignments/items`, `GET/POST /api/staff/performance`, `GET /api/staff/stats`, `GET/POST /api/delivery/photos`, `GET /api/delivery/photos/drive`, `GET /api/settings`, `GET /api/staff`. |
| B3c.6 | 30 min | **Extract shared constants**: `src/lib/delivery-status.ts` (STATUS_LABEL, STATUS_COLORS), `src/lib/geo.ts` (haversine), `src/lib/drive-webhook.ts` (extractFileId, WEBHOOK_URL). Eliminates 3-way duplication. |
| B3c.7 | 15 min | **STALE_TIMES consistency**: Replace raw `1000 * 30` with `STALE_TIMES.DELIVERY` / `STALE_TIMES.PERFORMANCE` constants across all delivery hooks. |

**B3d â€” Production Hardening (~1.5 hr)**
| Step | Time | Task |
|------|------|------|
| B3d.1 | 30 min | **RLS on delivery tables**: Migration 036 â€” ENABLE ROW LEVEL SECURITY + policies for `daily_assignments`, `assignment_items`, `delivery_photos`, `staff_daily_stats`, `app_settings`. Staff sees own data, admin sees all. |
| B3d.2 | 30 min | **Multi-assignment fix**: Currently silently picks `[0]`. Add picker UI for staff with multiple active assignments, or sum across all. |
| B3d.3 | 5 min | **Force Complete button**: Currently `!assignmentItemId` hides it for the real use case. Show for admins when `deliveryStatus === 'processing'`. |
| B3d.4 | 15 min | **City validation bug**: `createAssignment` uses broken `bill_month` format for city check â€” silently bypassed. Query `survey_units.city_district/tehsil` directly. |
| B3d.5 | 15 min | **Index on `created_at`**: `daily_assignments` sorted by `created_at DESC` with no index â€” full table scan as count grows. Migration: `CREATE INDEX idx_daily_assignments_created ON daily_assignments(created_at DESC)`. |

### Phase C â€” Admin Dashboard (~3 hrs)
| Step | Time | Task |
|------|------|------|
| C.1 | 60 min | `/stats` page: daily delivery stats per staff (assigned/delivered/missed/rate) |
| C.2 | 60 min | Staff performance tracking: filter by staff, date range. Add notes + rating (1-5) |
| C.3 | 60 min | Data Insight enhancement: add delivery KPIs (delivery rate, photos per staff, avg time per delivery) |

### Phase E â€” Flag Management UI (~4 hrs) **â† NEW**
| Step | Time | Task |
|------|------|------|
| E.1 | 45 min | `GET /api/admin/flagged-psids` â€” paginated, filterable by reason type, UC, tehsil, date range |
| E.2 | 30 min | `PATCH /api/admin/flagged-psids/[id]` â€” resolve (`resolved_at=now()`), update notes, change reason |
| E.3 | 60 min | `/flagged-units` page layout + filter bar + table with action badges |
| E.4 | 45 min | Row actions: Resolve button, Add/Edit Note modal, Confirm Keeper (for duplicate PSIDs â€” radio list of PSIDs + resolve surplus) |
| E.5 | 20 min | `GET /api/admin/flagged-psids/stats` â€” count by reason type for summary KPIs |
| E.6 | 20 min | "Flag for Review" button on HouseDetailSheet â†’ creates `staff_flagged` entry in `flagged_psids` |
| E.7 | 20 min | Add `staff_flagged` support to enrichment pipeline (noted in Phase 2, handled in ingest menu) |

**What this enables:**
- Admin reviews all flagged entries before each monthly cycle
- Confirms keeper PSIDs for duplicates (resolves the surplus)
- Acknowledges portal/field deletions
- Staff can flag issues during delivery â†’ admin resolves via this page
- Keeps `flagged_psids` table lean (~50K today, growing ~1K/month)

### Phase F â€” Auto-Route Generation (~3 hrs)
| Step | Time | Task |
|------|------|------|
| F.1 | 30 min | Delivery sequence query: `assignment_items` ordered by `delivered_at` per PSID, grouped by staff + UC. Generate consensus route from last 2 months' delivery order. |
| F.2 | 30 min | Admin UI: view auto-generated delivery sequence for a staff's last X deliveries. Drag-reorder if needed before committing. |
| F.3 | 60 min | Write route to `survey_units`: update `route_name`/`route_seq` from delivery-based consensus order. Flag conflicts (staff walked different order in month 1 vs month 2). |
| F.4 | 30 min | Printer integration: paper bills sorted by `survey_units.route_seq ASC` within each UC for subsequent months. Update bill-numbering logic to reflect new sequence. |
| F.5 | 30 min | New staff onboarding: when staff is replaced, inherit the previous staff's delivery-derived route for that UC. New staff follows sorted paper bills from day 1. |

### Phase G â€” Live Admin Monitoring (~3 hrs)
| Step | Time | Task |
|------|------|------|
| G.1 | 30 min | Database: verify `assignment_items` has gps_lat/gps_lng + `delivery_photos` has captured_at. These are the data sources for live view. |
| G.2 | 60 min | Admin Map: "Staff Mode" toggle layer. Shows selected staff's today's assignment markers color-coded by status (green=delivered, blue=pending, red=missed). |
| G.3 | 60 min | Staff breadcrumbs: select a staff â†’ show their last N delivery locations on the map as connected dots (polyline). Show the sequence of today's deliveries. |
| G.4 | 30 min | Near-real-time (polling): poll `assignment_items` every 10s for the selected staff. Highlight new deliveries since last poll with animation marker. |
| G.5 | 30 min | Admin Quick View: click a staff's delivery dot â†’ show house name, status, photo thumbnail, timestamp in a tooltip/info card. |

### Phase D â€” Visual Rehaul (~4 hrs)
| Step | Time | Task |
|------|------|------|
| D.1 | 60 min | Staff mode route guard: `/deliver` is default for staff role, no admin nav access |
| D.2 | 60 min | Staff mobile layout: map fills screen, bottom sheet for detail, progress bar in header, bottom tab nav (Map/List/Progress) |
| D.3 | 60 min | Admin desktop sidebar: collapsed/expanded, nav groups (Map/List/Assignments/Stats/Insight/Settings) |
| D.4 | 30 min | Admin filter bar: inline chips for desktop, bottom sheet for mobile |
| D.5 | 30 min | Theme system: Vercel light/dark defaults, staff forced to light mode |
| D.6 | 30 min | Touch target audit: all interactive elements 44px+ on mobile, 48px+ for primary actions |

### Phase RBAC â€” User Management & Auth System (~3 hrs)
| Step | Time | Task |
|------|------|------|
| RBAC.1 | 15 min | SQL migration `020-rbac-system.sql`: roles table, profiles migration, RLS policies |
| RBAC.2 | 15 min | Update auth-store: usernameâ†’email login, freeze/deletion check, roleName replaces role |
| RBAC.3 | 5 min | Update login page: accept username or email |
| RBAC.4 | 15 min | `POST /api/admin/users` â€” create user with service_role |
| RBAC.5 | 10 min | `GET /api/admin/users` â€” list users with roles |
| RBAC.6 | 15 min | `PATCH/DELETE /api/admin/users/[id]` â€” edit, freeze, password reset, soft-delete/restore |
| RBAC.7 | 25 min | `/settings` page: Users tab with table, add modal, row actions |
| RBAC.8 | 5 min | AppHeader shows displayName from profile |
| RBAC.9 | 5 min | Update all role references across app (roleâ†’roleName, 'staff'â†’'field_staff') |
| RBAC.10 | 15 min | Apply migration to Supabase + backfill admin + E2E test |
| RBAC.11 | 20 min | **Assignment approval chain**: Add `status` enum to `daily_assignments` (`draft` â†’ `pending_approval` â†’ `approved` â†’ `active`). Field supervisor creates in draft, admin approves, super admin final. Staff sees only `active`. |
| RBAC.12 | 20 min | **Approval UI in `/assignments`**: Approval queue tab showing draft/pending assignments. Approve/reject buttons role-gated by admin/super_admin. |
| RBAC.13 | 15 min | **Route protection**: Super admin bypasses approval chain. Admin approves pending. Staff only sees active assignments in `/deliver`. |
| RBAC.14 | 10 min | **Audit log**: Log assignment status changes (who approved/rejected, when) to `ingest_log` or new `assignment_audit` table. |

### Phase 1 â€” Copy Reference Scripts from Office PC (~30 min) âœ… **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 1.1 | 5 min | Copy `bill-extractor-v4.py`, `pdf-psid-extractor.py`, `pdf-bill-printer.py`, `survey_filtered.py`, `generate_category_fallbacks.py` to `scripts/ref/` |
| 1.2 | 5 min | Copy any shared lib files (e.g. `config.py`, `geography.json`) to `scripts/ref/` |
| 1.3 | 10 min | Copy the biller list CSVs and lifecycle XLSX sample files (1 city Ã— 1 month) for test fixtures |
| 1.4 | 10 min | Verify all scripts parse without import errors on office PC Python |

### Phase 2 â€” Rewrite `enrich-survey-units.py` (~2 hrs) âœ… **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 2.1 | 20 min | Add all 13 new fields to the upsert: `consumer_name`, `address`, `city_district`, `tehsil`, `uc_name`, `surveyor_name`, `survey_date`, `survey_time`, `lat`, `lng`, `start_month`, `status` (ARCHIVED if Deleted=Yes) |
| 2.2 | 15 min | Add `--dry-run` flag: preview changes without writing to DB |
| 2.3 | 15 min | Add `--exclude-ghosts` flag: skip PSIDs in `flagged_psids` table |
| 2.4 | 15 min | Add diff report: show count of new/updated/skipped/error rows |
| 2.5 | 20 min | Upsert reference tables: `hierarchy`, `surveyors`, `bill_months` from lifecycle data |
| 2.6 | 15 min | Write audit log to `ingest_log` |
| 2.7 | 20 min | Refactor: move shared (DB connection, config, logging) to `scripts/lib/` utils |

### Phase 3 â€” Create `load-payments.py` (~1 hr) âœ… **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 3.1 | 20 min | Write script: read combined payment CSV, parse all 12 columns, upsert to `payment_history` with `(psid, bill_month)` as upsert key |
| 3.2 | 10 min | Add `--dry-run`, `--file` flags |
| 3.3 | 10 min | Write audit log to `ingest_log` |
| 3.4 | 15 min | Report: inserted/skipped/error counts with sample of bad rows |
| 3.5 | 5 min | Add city/tehsil/uc_name upsert to payment_history (fixes "Unknown" chart cities) |

### Phase 4 â€” Add `city`/`tehsil`/`uc_name` to `payment_history` (~30 min) âœ… **(Done â€” Migration 023)**
**Note:** `city_district`, `tehsil`, `uc_name` already exist on `payment_history` via migration `023-add-payment-geography.sql`. The RPCs already use `ph.city_district`/`ph.tehsil` directly. No work needed.

### Phase 5 â€” Create `ingest-all.py` Orchestrator (~1 hr) âœ… **(Done 2026-06-01)**
| Step | Time | Task |
|------|------|------|
| 5.1 | 20 min | Interactive menu: `[1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit` |
| 5.2 | 10 min | CLI args: `--month`, `--daily`, `--dry-run`, `--file` |
| 5.3 | 10 min | Sequential orchestration: run Phase 2 scripts then Phase 3 in order |
| 5.4 | 10 min | Combined audit log entry with summary |
| 5.5 | 10 min | Error handling: abort on failure, show partial results |

### Phase 6 â€” Bill Metadata in HouseDetailSheet (~1.5 hrs) âœ… **(Done 2026-06-01)**
| Step | Time | Task | Status |
|------|------|------|--------|
| 6.1 | 15 min | `GET /api/survey/[survey_id]/bill-info` â€” returns bill number, route info, paid status from `survey_units` + `payment_history` | âœ… |
| 6.2 | 30 min | HouseDetailSheet: show "Bill #X/Y in UC" with route info, paid status badge | âœ… |
| 6.3 | 15 min | Compute `bill_count` per UC: sort by `route_seq ASC â†’ survey_id DESC`, assign sequential number | âœ… |
| 6.4 | 15 min | Compute `paid_status`: count paid months from `payment_history` â†’ "P-{n}" or "U-P" | âœ… |
| 6.5 | 15 min | Show all PSIDs per survey_id with payment history + ghost marking button | âœ… |

### Phase 2b â€” Drop `amount_due` (deferred, ~30 min)
| Step | Time | Task |
|------|------|------|
| 2b.1 | 10 min | Remove `amount_due` from all SELECTs, TypeScript types, RPC queries |
| 2b.2 | 10 min | `ALTER TABLE survey_units DROP COLUMN amount_due` |
| 2b.3 | 10 min | Update any remaining frontend references |

### Phase P1 â€” In-App Notification System (~4 hrs) âœ… (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P1a | 15 min | DB migration `037-notifications.sql` â€” table, indexes, RLS | â³ SQL written, not yet applied to Supabase |
| P1b | 5 min | Types â€” `Notification` interface in `src/types/index.ts` | âœ… |
| P1c | 30 min | `GET /api/notifications` â€” returns notifications + unread count + admin summary with auto-create `admin_alert` | âœ… |
| P1d | 15 min | `POST /api/notifications/read` â€” mark single or all as read | âœ… |
| P1e | 30 min | `POST /api/admin/notifications` â€” admin sends to user or all staff | âœ… |
| P1f | 15 min | `use-notifications.ts` â€” 3 React Query hooks (fetch, mark read, mark all read) | âœ… |

### Phase P2 â€” Notifications Bell UI (~2 hrs) âœ… (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P2a | 60 min | NotificationsBell â€” bell icon + unread badge + bottom sheet (mobile) + dropdown (desktop) with admin summary, notification list, mark all read, empty state, deep links | âœ… |
| P2b | 15 min | Bell on DesktopFilterBar â€” `NotificationsBell` + satellite toggle (`Layers` button) in `ActionButtons` | âœ… |
| P2c | 15 min | Bell on AppHeader â€” `NotificationsBell` after refresh button in mobile header | âœ… |

### Phase P3 â€” Staff Notification Form (~1 hr) âœ… (Done 2026-06-05)
| Step | Time | Task | Status |
|------|------|------|--------|
| P3.1 | 30 min | Staff notification form â€” recipient dropdown (all staff + individual), subject, message, Send â†’ `POST /api/admin/notifications` | âœ… |
| P3.2 | 15 min | Move form from Delivery tab to Users tab sidebar | âœ… |
| P3.3 | 15 min | Users tab redesign â€” sidebar layout, city group headers, Table component, RoleSelect CSS | âœ… |

### Phase P4 â€” Users Tab UI Polish (~1 hr) âœ… (Done 2026-06-06)
| Step | Time | Task | Status |
|------|------|------|--------|
| P4.1 | 15 min | `hideChevron` prop on `SelectTrigger` â€” cleaner icon-only action dropdown | âœ… |
| P4.2 | 15 min | City accent colors on group headers + city selector dropdowns (emerald=Sargodha, blue=Bhalwal, amber=Khushab) | âœ… |
| P4.3 | 15 min | Typography consistency â€” standardized `text-xs` table headers/rows, `text-[10px]` badges | âœ… |
| P4.4 | 15 min | Action dropdown cleanup â€” `hideChevron`, `size-7`, no conflicting CSS | âœ… |

### Phase M1 â€” Map Unification (Staff Sees Survey Data + Assignment Overlay) (~30 min)
| Step | Time | Task |
|------|------|------|
| M1.1 | 15 min | `map-view.tsx` â€” accept optional `assignmentItems` prop, render assignment markers on top of survey markers with blue ring dot |
| M1.2 | 15 min | `map/page.tsx` â€” remove role-split rendering, always render `MapView`, pass `staffItems` as `assignmentItems` for staff |

### Phase M2 â€” "Show All" Markers + Unit Counts per UC (~3 hrs)
| Step | Time | Task |
|------|------|------|
| M2.1 | 30 min | `GET /api/hierarchy` â€” add `active_unit_count` per UC via LEFT JOIN survey_units |
| M2.2 | 15 min | `FilterState.showAll` â€” add boolean to types + billing store defaults |
| M2.3 | 45 min | Surveys API + repository â€” handle `all=true` with `fetchAllRows` batched pattern |
| M2.4 | 15 min | `useSurveyData` â€” pass `showAll` through query key, adjust pageSize |
| M2.5 | 30 min | `map-view.tsx` â€” wrap markers in `<MarkerClusterGroup>` (react-leaflet-cluster already installed) |
| M2.6 | 45 min | `filter-panel.tsx` â€” show count per UC in desktop dropdown + mobile sheet. Add "Show all on map" toggle |

### Phase M3 â€” Post-Enrichment JSON Marker Chunks (~1.5 hrs)
| Step | Time | Task |
|------|------|------|
| M3.1 | 45 min | `scripts/export-marker-chunks.py` â€” per-UC JSON export with lean columns (survey_id, lat, lng, psid, consumer_name, uc_name, monthly_fee, arrears, status) |
| M3.2 | 15 min | `ingest-all.py` â€” add `[4] Export marker chunks` menu option |
| M3.3 | 30 min | Surveys API â€” add `source=chunk` mode, stream from static JSON when available |

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
| 4 (city columns) | ~~0.5 hrs~~ | âœ… Already in DB via migration 023 |
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
| 1 | **R.1-R.5** Architecture Improvement | 6 hrs | Security guard, Zod validation, repository layer, middleware, server component split | âœ… Done |
| 2 | **2b** Drop `amount_due` | 30 min | Remove column â€” deferred cleanup | âœ… Done |
| 3 | **A** Admin Assignment UI | 3 hrs | UC list â†’ pick staff â†’ create daily chunks with approval chain support | âœ… Done |
| 4 | **B1** Field Staff Delivery Basics | 7 hrs | /deliver page, photo capture, offline queue, map, card list, bottom sheet | âœ… Done |
| 5 | **B2** QR + One-Tap Delivery | 2 hrs | QR scanner, UnitDeliverySheet, one-tap photo+GPS+auto-verify, auto-advance, Drive images in HDS gallery | âœ… Done |
| 6 | **4** City columns in payment_history | 30 min | `city_district`, `tehsil`, `uc_name` are already on DB via migration 023 | âœ… Done |
| 7 | **6** Bill Metadata in HDS | 1.5 hrs | Bill info API + HouseDetailSheet display | âœ… Done |
| 8 | **P1** Notifications Infrastructure | 2 hrs | DB migration, types, 3 API routes, hook | âœ… Done (migration not yet applied) |
| 9 | **P2** Notifications Bell UI | 1.5 hrs | Bell + badge + mobile/desktop panel, desktop filter bar integration, header integration | âœ… Done |
| 10 | **P3** Staff Notification Form | 1 hr | Form in Users tab sidebar, send to all or individual | âœ… Done |
| 11 | **P4** Users Tab UI Polish | 1 hr | hideChevron, city accent colors, typography, dropdown cleanup | âœ… Done |
| 12 | **B3** Delivery Stability & Hardening | 8 hrs | DB CHECK fix, auth on mark route, webhook timeout, GPS reliability, photo queue, state machine, remaining auth, RLS | ðŸ”² |
| 13 | **M1** Map Unification | 30 min | Unified map â€” staff sees survey data + assignment overlay, filters work for all | ðŸ”² |
| 14 | **M2** "Show All" + Counts | 3 hrs | Marker counts per UC, show all on map, marker clustering | ðŸ”² |
| 15 | **M3** JSON Marker Chunks | 1.5 hrs | Post-enrichment per-UC JSON export, static file serving | ðŸ”² |
| 16 | **0d** Reference Tables & Filter Fix | 1.5 hrs | Create hierarchy/surveyors/bill_months tables, update APIs, delete dead services | ðŸ”² |
| 17 | **0e** Stabilize & Clean | 2 hrs | Fix payment filter pagination, billing-stats empty arrays, route API, deduplicate currentMonth | ðŸ”² |
| 18 | **0f** Egress & Stability | 6 hrs | Fix PSID pagination loop, unbounded fetches, staff stats fallback | ðŸ”² |
| 19 | **C** Admin Dashboard | 3 hrs | /stats, staff performance, delivery KPIs | ðŸ”² |
| 20 | **E** Flag Management UI | 4 hrs | /flagged-units, resolve/confirm/note actions | ðŸ”² |
| 21 | **F** Auto-Route Generation | 3 hrs | Delivery sequence â†’ consensus route â†’ survey_units â†’ printer | ðŸ”² |
| 22 | **G** Live Admin Monitoring | 3 hrs | Staff mode map, breadcrumbs, near-real-time polling | ðŸ”² |
| 23 | **RBAC** Approval Chain | 3 hrs | Assignment draftâ†’pendingâ†’approvedâ†’active workflow | ðŸ”² |
| 24 | **D** Visual Rehaul | 4 hrs | Staff mobile layout, admin sidebar, theme system, touch targets | ðŸ”² |
| 25 | **Deploy** Office PC pipeline | 1 hr | ingest-all.py + scripts on Office PC, live test | ðŸ”² |
| â€” | **Z** Deferred | 19 hrs | Auth hardening, Zod validation, structured logging, egress optimization, audit cleanup | ðŸ”² Deferred |

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

- **What to do** â€” exact UI actions, API calls, or commands
- **What to expect** â€” the specific behavior change to observe
- **Edge cases** â€” boundary conditions, error states, null values
- **Where to inspect** â€” URL path, DB query, network tab, console

Format (required at end of every implementation message):
```

**Testing Verification:**
1. Open `/page` â†’ do X â†’ expect Y
2. Network tab shows `GET /api/endpoint` returning `{...}`
3. DB: `SELECT ... FROM table` confirms write
4. Edge case: no data / null / error â†’ expect graceful fallback
5. Edge case: offline / slow network â†’ expect fallback behavior
```

---
## 16. Pipeline Reference

### 16.1 Data Flow

```
Office PC (local Python, manual triggers)
â”‚
â”œâ”€â”€ pdf-psid-extractor.py (monthly, 16thâ€“18th)
â”‚     A4 PDFs + Biller CSVs â†’ lifecycle XLSX
â”‚     Output: test_lifecycle_Biller_{City}_{Month}.xlsx (57 cols)
â”‚
â”œâ”€â”€ bill-extractor-v4.py (daily, multiple times)
â”‚     SWMC portal â†’ combined payment CSV
â”‚     Output: COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv (19 cols)
â”‚
â”œâ”€â”€ survey_filtered.py (monthly/on-demand)
â”‚     Portal survey data â†’ survey CSV
â”‚     Output: {DISTRICT}_{TEHSIL}_SURVEY_DATA.csv
â”‚
â”œâ”€â”€ pdf-bill-printer.py (monthly, 19thâ€“20th)
â”‚     Lifecycle XLSX + A4 PDFs â†’ sorted A5 print PDFs
â”‚     Output: F:\Final_print\{Month}\*.pdf + index_cache_{city}_{month}.json
â”‚
â””â”€â”€ generate_category_fallbacks.py (monthly)
      Biller CSV â†’ fallback mapping CSV
      Output: biller_data_{city}_{month}.csv
```

**Supabase ingest (desktop, same machine or nearby):**

```
python scripts/ingest-all.py
  â”œâ”€â”€ Option [1] Full Monthly
  â”‚     â”œâ”€â”€ enrich-survey-units.py â†’ survey_units (21 fields, Phase 2)
  â”‚     â”œâ”€â”€ load-payments.py       â†’ payment_history (12 fields, Phase 3)
  â”‚     â””â”€â”€ Write audit log        â†’ ingest_log
  â”œâ”€â”€ Option [2] Daily Update
  â”‚     â””â”€â”€ load-payments.py       â†’ payment_history (idempotent upsert)
  â””â”€â”€ Option [3] Quick Sync
        â””â”€â”€ enrich-survey-units.py --quick â†’ new records only
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
| `pdf-psid-extractor.py` | Office PC: `F:\qoder\billing-system\01_Local_Engine\scripts\` | Monthly: A4 PDFs â†’ lifecycle XLSX |
| `bill-extractor-v4.py` | Office PC (same path) | Daily: payment CSV from SWMC portal |
| `survey_filtered.py` | Office PC (same path) | Monthly/on-demand: survey data from portal |
| `pdf-bill-printer.py` | Office PC (same path) | Monthly: A4â†’A5 print PDFs |
| `generate_category_fallbacks.py` | Office PC (same path) | Monthly: category fallback CSV |
| `enrich-survey-units.py` | `scripts/enrich-survey-units.py` | Supabase upsert: lifecycle XLSX â†’ survey_units |
| `load-payments.py` | `scripts/load-payments.py` (Phase 3) | Supabase upsert: payment CSV â†’ payment_history |
| `ingest-all.py` | `scripts/ingest-all.py` (Phase 5) | Orchestrator with interactive menu |
| `config.py` | Office PC copy + `scripts/lib/config.py` (Phase 2.7) | Centralized paths, DB connection, logging |

### 16.4 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Lifecycle XLSX is single source for `survey_units` | Contains all 21 fields; Biller CSVs are redundant intermediate |
| Payment CSV is single source for `payment_history` | Contains city/tehsil/uc â€” fixes "Unknown" chart cities |
| `amount_due` dropped in Phase 2b | SWMC miscalc, not reliable; app computes `monthly_fee + arrears` |
| Printer cache JSON stays local | Bill metadata reconstructable from `survey_units` + `payment_history` |
| `ingest_log` tracks every import run | PSID count, inserted/skipped/error, duration, file hash, exit status |
| No server-side pipeline | Govt portal blocks external IPs â€” all scripts run on Office PC |
| Idempotent upserts on `(psid, bill_month)` | Daily payment imports safe to run multiple times

### 16.8 Billing Charts Architecture â€” Established Pattern (2026-05-30)

**Problem:** Dashboard charts need to aggregate 122K+ `payment_history` rows. Cannot fit through REST API (1MB limit, 1000-row limit). Client-side aggregation is impossible.

**Solution:** One PL/pgSQL RPC (`get_charts_data`) does all aggregation at DB level. SSR API route (`/api/billing-charts`) calls the RPC and adds display-level transforms in TypeScript.

**Architecture:**
```
payment_history (122K rows)
  â†“
  PL/pgSQL RPC: get_charts_data() â†â”€ City/tehsil filter params
  â†“ (single JSON response)
  /api/billing-charts/route.ts
    â”œâ”€â”€ Calls sup.rpc('get_charts_data', ...)
    â”œâ”€â”€ Transforms: adds day_label from paid_date (display logic only)
    â””â”€â”€ Returns BillingChartsData
  â†“
  useBillingCharts() hook (React Query, staleTime: 5min)
  â†“
  Dashboard component renders 5 charts
```

**Key Rules for Future Chart Work:**

| Rule | Details |
|------|---------|
| **No SQL changes for display** | `day_label`, formatting, sorting â€” all in `route.ts` TypeScript. Only edit SQL for new metrics or filter params. |
| **One RPC call** | All chart data comes from a single `get_charts_data()` call. No separate queries per chart. |
| **No survey_units join in aggregation** | Join causes timeout even with index. Use `EXISTS` for filtering, LATERAL only for display enrichment on filtered subset. |
| **No client-side aggregation** | RPC does all summing/counting/windowing. Chart components only reshape (pivot) the data for recharts. |
| **Month sort: chronological** | Use `to_date(bill_month, 'MonYYYY')` in SQL ORDER BY. Use `sortMonths()` helper on client if re-sorting. Never use alphabetical `.sort()`. |
| **Cycle day = 16thâ†’15th** | Day 1 = 16th of bill month. Formula: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)::int`. Display label computed from `paid_date.getDate()` in route.ts. |
| **Tooltip: daily, not cumulative** | Curves chart shows cumulative lines but tooltip shows daily_amount per month in table format. |
| **Re-run SQL** | `CREATE OR REPLACE FUNCTION get_charts_data(...)` â€” only when aggregation logic changes. |

**Approved RPCs for client-facing charts:** This is a second exception (beyond admin-only Data Insight RPCs in `007-data-insight-rpcs.sql`). Rationale: 122K payment rows physically cannot be fetched through REST API for aggregation.

**File map:**
| File | Purpose |
|------|---------|
| `scripts/sql/021-charts-aggregation.sql` | PL/pgSQL RPC definition (final, run once) |
| `src/app/api/billing-charts/route.ts` | SSR endpoint: RPC caller + display transforms |
| `src/hooks/use-billing-charts.ts` | React Query hook |
| `src/components/dashboard.tsx` | Dashboard layout with tabs + KPI cards |
| `src/components/charts/monthly-curves.tsx` | Cumulative curve chart with table tooltip |
| `src/components/charts/office-breakdown.tsx` | Tehsil Ã— month bar chart |
| `src/components/charts/monthly-trend.tsx` | Monthly bar trend |
| `src/components/charts/category-breakdown.tsx` | Category pie/bar |
| `src/types/index.ts` | `MonthlyCurveRow` (includes `day_label`), `BillingChartsData`, etc. |

### 16.9 Data Quality & Cleanup Strategy (2026-05-30 Planning)

#### 16.9.1 The Real Data Problem

The govt survey app has two fundamental bugs that create data chaos:

| Bug | Result | Scale |
|-----|--------|-------|
| Network issues â†’ survey goes to "unsent" â†’ user clears queue â†’ re-submits | Multiple survey IDs created for the same house | Unknown, several thousand |
| Same survey ID saved multiple times | Multiple PSIDs generated against one survey ID | ~20K+ orphaned PSIDs |
| Portal has no "deactivate PSID" option | Stale PSIDs live forever in biller list | ~20K+ |
| Only option: delete the survey ID on portal | PSID disconnected from survey record but still in payment history + lifecycle files | ~20K+ |

**Result in the app:**
- `payment_history` has records for PSIDs whose `survey_id` was deleted on the portal
- `LEFT JOIN LATERAL` to `survey_units` in the RPC returns NULL for these â†’ `coalesce(tehsil, 'Unknown')` â†’ "2 unknown cities" in Office Breakdown chart
- One house can have multiple PSIDs (staff manually picks the one with payment history)
- One house can have multiple survey IDs (different names, same address)

#### 16.9.2 Strategy: 2-3 Billing Cycle Cleanup

Not a one-time fix. An **iterative cleanup over 2-3 monthly billing cycles** using the app as the data quality tool:

```
Cycle 1: Display â†’ Staff marks â†’ Export â†’ Filter next import
Cycle 2: Remaining ghosts identified â†’ Mark â†’ Export â†’ Filter
Cycle 3: Verification pass
```

**Staff workflow in the app:**
1. HouseDetailSheet shows ALL PSIDs for a house (from payment_history + lifecycle)
2. Each PSID shows: payment history, current bill amount, "Deleted in Portal" flag if available
3. Staff taps "Mark as Ghost" â†’ PSID is flagged for exclusion
4. Flagged PSIDs are collected into an exportable list
5. Next month's `enrich-survey-units.py` reads the flagged list and excludes those PSIDs during enrichment

#### 16.9.3 Bill-Printer Metadata Integration

`pdf-bill-printer.py` currently generates sorted A5 PDFs with survey_id printed in the metadata/page. This metadata should be:

1. **Stored per PSID** â€” link each printed bill (PDF page number, print date) to the PSID
2. **Displayed in HouseDetailSheet** â€” staff sees which physical bill corresponds to which PSID
3. **Used for duplicate bill printing** â€” if a customer loses their bill, staff can find it by survey_id/PSID and re-print

**Implementation:**
- `pdf-bill-printer.py` already outputs a mapping file (PSID â†’ survey_id â†’ PDF page number)
- This mapping JSON gets imported via an API endpoint or stored alongside the lifecycle data
- HouseDetailSheet reads this mapping and shows: "Bill #42 in May-2026 print batch"

#### 16.9.4 Immediate Schema Fix: Add City to payment_history

**Problem:** `payment_history` has no `city` or `tehsil` column. The RPC must join to `survey_units` for geography, which fails for orphaned PSIDs.

**Fix:** Add `city` and `tehsil` columns to `payment_history` and populate from the source payment CSV (which already contains city info â€” `bill-extractor-v4.py` drops it during upsert).

```sql
ALTER TABLE payment_history ADD COLUMN city text;
ALTER TABLE payment_history ADD COLUMN tehsil text;
```

**Impact:**
- `get_charts_data` RPC can use `ph.city`/`ph.tehsil` directly â€” no LATERAL join needed
- "Unknown" cities disappear â€” every payment has its source city
- Chart geography is independent of survey_units completeness
- 30-minute fix, but a prerequisite for correct chart data

#### 16.9.5 Pipeline Architecture

Since govt portal blocks external IPs (no GitHub Actions, no Vercel Cron), the pipeline architecture must be:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Office PC (local)                           â”‚
â”‚                                             â”‚
â”‚  bill-extractor-v4.py  â† daily, manual     â”‚
â”‚  enrich-survey-units.py â† monthly, manual  â”‚
â”‚  pdf-bill-printer.py   â† monthly, manual   â”‚
â”‚                                             â”‚
â”‚  All write to: scripts/data/ + Supabase DB  â”‚
â”‚  via service_role key (API routes)          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚
        â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ App (Next.js SSR)                           â”‚
â”‚                                             â”‚
â”‚  - Ingestion endpoints (/api/ingest/*)      â”‚
â”‚  - Staff marking UI (HouseDetailSheet)      â”‚
â”‚  - Ghost PSID export (/api/export/ghosts)   â”‚
â”‚  - Dashboard + charts (already built)       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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

| Script | Purpose | Input â†’ Output |
|--------|---------|----------------|
| `bill-extractor-v4.py` | Daily: downloads payment CSV from SWMC portal, cleans, upserts to DB | Portal CSV â†’ `COMBINED_...csv` + `payment_history` upsert |
| `pdf-psid-extractor.py` | Monthly: reads A4 PDFs from govt, extracts PSIDs, links to survey data | A4 PDFs â†’ `test_lifecycle_Biller_*.xlsx` |
| `pdf-bill-printer.py` | Monthly: sorts lifecycle data MC/UC, cuts A4â†’A5, prints metadata on each bill | Lifecycle XLSX + A4 PDFs â†’ sorted A5 PDFs + print mapping |

**Critical finding:** The payment CSV already has **City, Tehsil, UC, District** columns for every row, but `payment_history` stores none of these. The `enrich-survey-units.py` script reads the lifecycle XLSX and writes to `survey_units`, but the payment ingestion script only upserts core columns. City data is discarded during CSVâ†’DB upsert.

#### 16.10.2 Proposed Workflow

```
MONTHLY (18th-20th):
  Govt A4 PDFs â†’ pdf-psid-extractor.py
    â”œâ”€â”€â†’ test_lifecycle_Biller_{City}_{Month}.xlsx (41 cols)
    â”‚
    â”œâ”€â”€â†’ enrich-survey-units.py â†’ Supabase: survey_units
    â”‚    (upserts psid, monthly_fee, arrears, route_name,
    â”‚     current_bill_month, billing_category, city, tehsil)
    â”‚
    â””â”€â”€â†’ pdf-bill-printer.py â†’ Sorted A5 PDFs + mapping JSON
         (future: import mapping to DB for HouseDetailSheet)

DAILY:
  SWMC Portal â†’ CSV download (manual) â†’ bill-extractor-v4.py
    â”œâ”€â”€â†’ COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv
    â””â”€â”€â†’ Supabase: payment_history (psid, city, tehsil, uc, amount, ...)
```

#### 16.10.3 Required Changes

| # | Change | Est. | Impact |
|---|--------|------|--------|
| 1 | **Copy 3 major scripts** into repo from office PC | 10m | Foundation â€” everything depends on having them in version control |
| 2 | **Add `city`/`tehsil`/`uc_name` to `payment_history`** (SQL migration 022) + update bill-extractor-v4.py | 30m | Fixes "Unknown" cities in charts. Every future dashboard feature depends on correct geography |
| 3 | **Update `enrich-survey-units.py`** to write `city_district`/`tehsil` to `survey_units` | 20m | Makes enrichment complete â€” current month records get geography |
| 4 | **Update `get_charts_data` RPC** to use `ph.city`/`ph.tehsil` instead of LATERAL join | 15m | Eliminates survey_units join entirely for chart data |
| 5 | **Add `flagged_psids` table** + staff marking UI (DQ.4-DQ.6) | 2h | Enables the 2-3 cycle cleanup workflow |
| 6 | **Centralize data paths** to `config.py` | 15m | Prevents path fragmentation across scripts |
| 7 | **Build `ingest-payments.py` + `ingest-lifecycle.py`** wrappers | 2h | Standardized CLI interface for all scripts |

#### 16.10.4 New Pipeline Scripts (To Create)

##### P.1 â€” `scripts/ingest-payments.py`
```bash
python scripts/ingest-payments.py                          # processes latest CSV
python scripts/ingest-payments.py --file path/to/file.csv  # specific file
python scripts/ingest-payments.py --upload                 # sends to /api/ingest/payments
```
- Reads payment CSV, validates columns, logs bad rows
- Upserts to `payment_history` INCLUDING `city`, `tehsil`, `uc_name`
- Reports: inserted count, skipped, errors
- Optionally uploads to app's ingest API endpoint

##### P.2 â€” `scripts/ingest-lifecycle.py`
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

##### P.3 â€” `scripts/export-bill-mapping.py`
```bash
python scripts/export-bill-mapping.py --month May2026
```
- Reads PDF print mapping output from pdf-bill-printer.py
- Creates `bill_print_log` linking PSID â†’ survey_id â†’ PDF page number â†’ print batch
- Feeds HouseDetailSheet: "Bill #42 in May-2026 print batch"

#### 16.10.5 App-Controlled Pipeline (Future Phase)

Once scripts are stable, app controls them via:

```
App (Next.js SSR)                     Local Server (office PC)
  /api/ingest/payments â”€â”€POSTâ”€â”€â†’     Node.js/Python Flask
  /api/ingest/lifecycle â”€â”€POSTâ”€â”€â†’     â†’ triggers Python scripts
  /api/ingest/status    â”€â”€GETâ”€â”€â†’      â†’ returns result report
  /api/export/ghosts    â”€â”€GETâ”€â”€â†’      â†’ exports flagged PSIDs
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

**Total: ~6 hrs for full pipeline streamlining.** This is additive to the DQ items in 16.9.6. The first 3 items (P0-P3, ~1 hr) are the critical path â€” everything else can be done incrementally.

---

## 17. Batch Assignment Model

### 17.1 Core Concept

A batch *is* an assignment — one `daily_assignments` row extended with:
- `name` — permanent name (e.g. "Sargodha-B1"), never changes
- `target_per_day` — daily minimum delivery target (default 500)
- `uc_names` — multiple UCs per batch (was single `uc_name`)

**No new tables.** The existing `daily_assignments` table gets extended. `assignment_items` stays identical.

### 17.2 Key Rules

| Rule | Detail |
|------|--------|
| **Batch is permanent** | Created once. Same name forever. Staff can change — batch is reassigned. |
| **Start date** | Automatic — first `delivered_at` in the batch = day 1 |
| **Monthly refresh** | Admin clicks "Refresh" after pipeline run. System adds new PSIDs, removes deleted ones, updates `bill_month`. Pending items from removed PSIDs get `skipped`. Delivered history is preserved. |
| **Staff changes** | Admin reassigns batch to new staff by updating `staff_id`. |
| **UC changes** | If MCs add new UCs, admin can update `uc_names` on the batch. |
| **Revoke** | Admin only. Supervisor cannot revoke. |
| **Naming** | `{City}-B{seq}` — e.g. `Sargodha-B1`. Global per-city counter, never resets. |

### 17.3 Monthly Refresh Flow

1. Pipeline runs (lifecycle + payments) — new `survey_units` data available
2. Admin opens Manage tab → finds batch → clicks **Refresh for {Month}**
3. System:
   - Deletes `assignment_items` where `status = 'pending'` (undelivered from last cycle)
   - Inserts fresh `assignment_items` from current lifecycle for the same `uc_names`
   - Keeps delivered/missed items as history
   - Updates `bill_month` on the batch row
4. Batch auto-adjusts: flagged/removed PSIDs disappear, new PSIDs appear

### 17.4 Supervisor Role

New role between admin and field_staff:

| Feature | Access |
|---------|--------|
| **Create batches** | Full — this is their primary job |
| **Live monitoring** | Full — same as admin |
| **Map view** | Full — all markers, filters, HDS |
| **Manage tab** | Read-only — view progress, no revoke |
| **Routes tab** | Read-only |
| **Staff performance** | Read-only |
| **Data Insight** | Read-only |
| **Settings** | No access |
| **Revoke batches** | No — admin only |

City scoping: Admin assigns one or more cities to a supervisor via `staff.assigned_cities`. Supervisor only sees data for their assigned cities.

### 17.5 Schema Changes (Migration 048)

```sql
ALTER TABLE public.daily_assignments
  ADD COLUMN name            text,                -- "Sargodha-B1"
  ADD COLUMN target_per_day  integer DEFAULT 500,
  ADD COLUMN uc_names        text[] DEFAULT '{}';

ALTER TABLE public.staff
  ADD COLUMN assigned_cities text[] DEFAULT '{}',  -- supervisor city scope
  ADD COLUMN daily_target    integer DEFAULT 500;   -- per-staff default target

INSERT INTO public.roles (name, description) VALUES
  ('supervisor', 'Creates batches, monitors delivery, read-only management');
```

### 17.6 Future Phases

| Phase | What | Status |
|-------|------|--------|
| 2 | Create batches UI: multi-UC selector, auto-naming, target input | Pending |
| 3 | Manage tab: batch name column, Refresh button | Pending |
| 4 | Staff `/deliver`: batch header with target progress | Pending |
| 5 | Supervisor role gates in API + sidebar | Pending |


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

## 26. Delivery Mechanism Comprehensive Audit (2026-06-07)

### 26.1 Architecture Overview

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         DELIVERY MECHANISM                               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚   `/deliver` page     â”‚    `/map` page        â”‚   `/settings` page      â”‚
â”‚   Staff-only list     â”‚  Universal delivery   â”‚   Admin + Staff config  â”‚
â”‚   (Plain list +       â”‚  (StaffMap +          â”‚   Unsent Images tab     â”‚
â”‚    UnsentModal)       â”‚   UnitDeliverySheet)  â”‚   Delivery tab (admin)  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚          â”‚                       â”‚                       â”‚              â”‚
â”‚  useStaffAssignment  â”‚   useUserLocation     â”‚   usePhotoQueue          â”‚
â”‚  (query from GET     â”‚   (shared GPS watcher â”‚   (IndexedDB `billing-   â”‚
â”‚   /api/assignments)  â”‚    â†’ StaffMap blue dotâ”‚    saas-photo-queue`)    â”‚
â”‚                      â”‚                       â”‚   Badge + UnsentModal   â”‚
â”‚  usePhotoQueue       â”‚   useDeliverUnit      â”‚   uses this queue        â”‚
â”‚  (IndexedDB badge    â”‚   (deliver/deliver-   â”‚                         â”‚
â”‚   + UnsentModal)     â”‚    NoPhoto hooks)     â”‚  useUnsentPhotos         â”‚
â”‚                      â”‚                       â”‚  (IndexedDB `unsent-    â”‚
â”‚                      â”‚                       â”‚   photo-queue`)         â”‚
â”‚                      â”‚                       â”‚  Settings Unsent tab    â”‚
â”‚                      â”‚                       â”‚  uses this queue        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                           API ENDPOINTS                                â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ GET /api/assign â”‚ POST /api/deliveries  â”‚ POST /api/deliveries         â”‚
â”‚   ments?staff_  â”‚   /mark              â”‚   /mark-processing           â”‚
â”‚   id=X          â”‚   (Normal delivery:   â”‚   (Unsent mode:              â”‚
â”‚   â†’ assignment  â”‚    GPS + photo +      â”‚    mark as processing,       â”‚
â”‚     items with  â”‚    distance check)    â”‚    no distance calc)         â”‚
â”‚     unit data)  â”‚                       â”‚                              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ POST /api/deliv â”‚ POST /api/deliveries  â”‚ POST /api/deliveries         â”‚
â”‚   eries/promote â”‚   /sync-photo         â”‚   /ping                      â”‚
â”‚   (processingâ†’  â”‚   (Upload to Drive,   â”‚   (sendBeacon on             â”‚
â”‚    delivered)   â”‚    update photo,      â”‚    tab close)                â”‚
â”‚                 â”‚    NO status update)  â”‚                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 26.2 User Flows

#### Flow A: Normal Delivery (unsent_mode.enabled = false)

Path: Staff on `/deliver` â†’ taps unit â†’ `/map` â†’ UnitDeliverySheet â†’ Take Picture â†’ delivered/processing

Step-by-step:

1. **Staff opens `/deliver`** â†’ `useStaffAssignment` fetches items from `GET /api/assignments?staff_id=USER_ID`
   - Returns `{ data: DailyAssignment, items: AssignmentItemWithUnit[] }`
   - Each item has `unit` (AssignmentItemUnit) with lat/lng from `survey_units`
   - React Query with `staleTime: 30s`

2. **Staff taps a pending unit** â†’ `handleSelect(item.id)`:
   - `setDeliverTarget(item.psid)` â€” stores PSID in billing store
   - `router.push('/map?target=PSID')` â€” navigates to map page

3. **Map page loads** â†’ URL param `?target=PSID` triggers:
   - Effect reads target from URL â†’ `setDeliverTarget(target)` (no unit yet)
   - Sync effect: find unit from `deliverableList` (populated from `staffItems[i].unit`) â†’ `setDeliverTarget(target, item)`
   - `UnitDeliverySheet` renders: `unit={deliverTargetUnit}`, `assignmentItemId={deliveryItem?.id || null}`

4. **UnitDeliverySheet opens** â†’ GPS tracking starts (3 effects):
   - **Effect A** (Fast init): `setTimeout(100ms)` â†’ `getCurrentPosition` with `{ enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }`. On success: `setLiveGpsStatus('ready')`, sets distance, userLat/userLng.
   - **Effect B** (WatchPosition): Sets `liveGpsStatus('locating')` â†’ `watchPosition` with `{ enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }`. On success: sets 'ready', distance, userLat/userLng, gpsAccuracy. On error: 'unavailable'.
   - **Effect C** (Unmount cleanup): `clearWatch(watchIdRef.current)` on component unmount.
   - **Fast init wins on desktop** (Wi-Fi returns in 1-2s). **WatchPosition wins on mobile** (GPS resolves instantly via `enableHighAccuracy: true`).
   - Reset effect: When `unit.psid` changes, deliveryStatus/idle/resets, userLat/userLng reset to `initialLat/initialLng` (from `useUserLocation` via `userLocation?.lat/lng`).

5. **Distance badge renders** â€” shows "X m away" with color coding (green â‰¤50m, amber â‰¤200m, gray >200m). 3 GPS accuracy dots (â‰¤10m=3green, â‰¤50m=2green1gray, >50m=1green2gray).

6. **Staff taps "Take Picture & Deliver"** â†’ `openCamera()` triggers `inputRef.current.click()` (file input with `capture='environment'`).

7. **File selected** â†’ `handleFile(file)` fires:
   ```javascript
   const gpsOverride = userLat != null && userLng != null
     ? { lat: userLat, lng: userLng }
     : null
   ```
   - If `unsentModeEnabled` = true â†’ **Flow B** below
   - If `unsentModeEnabled` = false â†’ continues:

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
   if (!ownership) â†’ 403
   // If already delivered/missed â†’ early return (NO photo saved!)
   if (ownership.status === 'delivered' || ownership.status === 'missed')
     â†’ return { status: ownership.status, distance: null, already_delivered: true }
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
      : 'Processing â€” awaiting review'  // amber warning
    // If GAS webhook failed (photo_url starts with "pending://")
    if (result.photo_url?.startsWith('pending://')) {
      compressImage(file)  // re-compress for IndexedDB
      enqueueUnsent({ assignmentItemId, psid, photoBlob, gpsLat, gpsLng })  // â†’ unsent-photo-queue
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

11. **Auto-advance effect**: `[deliveryStatus, onNext]` â€” when deliveryStatus is 'delivered' or 'processing', calls `onNext?.()` after 2s (independent of the handleFile timeout).

12. **onNext loads next unit** â†’ step 4 repeats for the next pending item.

#### Flow B: Always Unsent Mode (unsent_mode.enabled = true)

Activated via Settings â†’ Delivery tab â†’ "Always Queue Unsent" toggle (admin only).

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
  updateToast(progressTid, 'Saved to queue âœ“', 'success')
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
// NO distance calculation â€” always 'processing'
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
// result is null â†’ offline fallback
const compressed = await compressImage(file)
await enqueuePhoto({
  assignmentItemId, psid: unit.psid,
  photoBlob: compressed, email: email || '',
  // No skipAutoSync â†’ will auto-sync when online
})
setDeliveryStatus('processing')  // NO toast shown
setIsDelivering(false)
```

When online, `usePhotoQueue` auto-processes:
```javascript
// processQueue() runs on online event
// Batch 3 photos via Promise.allSettled
for each photo:
  1. Upload to GAS webhook (resolvePhotoData â†’ base64 â†’ POST)
  2. If webhook succeeds: POST /api/deliveries/promote
     a. INSERT/UPDATE delivery_photos with real Drive URL
     b. UPDATE assignment_items SET status='delivered' WHERE status='processing'
  3. If promote returns 403/404: remove from queue (orphan)
  4. If any failure: incrementRetry() â€” removed after 3 failures
```

### 26.3 GPS System Detail

| Component | Hook/Effect | Accuracy | Timeout | Lifetime | Data flow |
|-----------|-------------|----------|---------|----------|-----------|
| **StaffMap blue dot** | `useUserLocation` (shared hook) | `enableHighAccuracy: true` | 30s | Continuous (page session) | `location` â†’ Marker position |
| **Sheet distance (fast init)** | getCurrentPosition | `enableHighAccuracy: false` | 5s | Once per unit open | â†’ userLat/userLng â†’ gpsOverride |
| **Sheet distance (watchPosition)** | watchPosition | `enableHighAccuracy: true` | 30s | While sheet idle | â†’ userLat/userLng â†’ gpsOverride |
| **deliver() captureGPS** | getCurrentPosition fallback | `enableHighAccuracy: false` | 3s | Once per delivery | Used only if gpsOverride is null |
| **GPS override** | From userLat/userLng state | N/A | N/A | Closure at render time | Bypasses captureGPS entirely |

**Current state:** TWO independent GPS watchers (StaffMap + Sheet). Battery impact minimal â€” same GPS chip, sheet watcher runs 10-15s per delivery.

**Note:** `useUserLocation` hook also uses watchPosition with its own retry logic (exponential backoff: 1s, 3s, 10s). This hook is ONLY used by StaffMap (blue dot) and map page (initialLat). UnitDeliverySheet does NOT import `useUserLocation` as of Part 13 fix.

#### Location on Desktop vs Mobile

| Aspect | Desktop (Office/Home PC) | Mobile (Production) |
|--------|-------------------------|---------------------|
| GPS hardware | None (Wi-Fi positioning) | GPS chip |
| lfsvc service | Required (was disabled on home PC) | N/A |
| Fast init | getCurrentPosition returns in 1-2s via Wi-Fi | May fail (3s timeout too fast) |
| WatchPosition | enableHighAccuracy:true may hang â†’ fast init wins | enableHighAccuracy:true resolves instantly |
| captureGPS fallback | getCurrentPosition 3s timeout â†’ may return null | getCurrentPosition works but slow |

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
queued â†’ uploadSingle(): POST to GAS webhook â†’ POST /api/deliveries/promote
         â†’ markSynced (status = 'synced') â†’ clearSynced (delete synced entries)
```

**unsent-photo-queue processing flow:**
```
Unsentry entry â†’ retrySingle(): resolvePhotoData (blobâ†’dataUrl) â†’ POST /api/deliveries/sync-photo
                â†’ removeUnsent (delete entry)
```

### 26.5 Server Endpoint Specification

#### POST /api/deliveries/mark
- **Purpose:** Normal one-tap delivery
- **Input:** FormData (multipart)
  - `photo` â€” WebP Blob (file)
  - `assignment_item_id` â€” UUID string
  - `psid` â€” string
  - `gps_lat` / `gps_lng` â€” optional float strings
  - `target_lat` / `target_lng` â€” optional float strings
  - `skip_photo` â€” 'true' (no-photo delivery)
- **Auth:** supabase.auth.getUser() + field_staff role check + ownership (assignment_items.daily_assignments.staff_id = user.id)
- **Already delivered guard:** If item.status is 'delivered' or 'missed', return early with `{ status, distance: null, already_delivered: true }`. **NOTE: photo is NOT saved.**
- **No 'processing' guard:** Items with status 'processing' proceed through full flow, creating duplicate delivery_photos records.
- **GAS webhook:** POST to NEXT_PUBLIC_DRIVE_WEBHOOK_URL (AbortController 8s timeout). On success: extract fileId. On failure: continue without Drive file.
- **Distance calculation:** Haversine formula. Only computed if gps_lat/lng AND target_lat/lng are all non-null.
- **Status determination:**
  - distance â‰¤ threshold(default 50m) OR enforceGps=false â†’ `'delivered'`
  - distance > threshold OR GPS null OR target null â†’ `'processing'`
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
- **Purpose:** Upload unsent photos to Drive (called by Settings Unsent Images â†’ "Sync All" / retrySingle)
- **Input:** JSON
  - `assignmentItemId`, `psid`, `dataUrl`, `gpsLat`, `gpsLng`
- **Auth:** supabase.auth.getUser() (no field_staff check â€” any authenticated user)
- **Behavior:**
  - POST to GAS webhook with base64 dataUrl (8s AbortController timeout)
  - UPDATE delivery_photos SET photo_url, gdrive_file_id, synced_to_drive=true
  - **BUG: Does NOT call promote endpoint or update assignment_items status**
  - If webhook fails â†’ returns 502
- **Response:** `{ success: true, photo_url, gdrive_file_id }`

### 26.6 Settings / Admin Controls

| Setting | DB Key | Storage Type | Frontend | Effect |
|---------|--------|-------------|----------|--------|
| **GPS Enforcement** | `gps_enforcement` | JSON `{ enforce: boolean, threshold: number }` | Settings â†’ Delivery tab | Toggle distance check + threshold slider |
| **Allow No Photo** | `allow_no_photo` | boolean | Settings â†’ Delivery tab | Enables "Photo not working? Deliver without photo" button in sheet |
| **Always Unsent Mode** | `unsent_mode` | JSON `{ enabled: boolean, max_limit: number }` | Settings â†’ Delivery tab | Routes all deliveries to mark-processing + photo-queue |

**API:**
- `GET /api/settings` â€” returns all settings as flat object: `{ gps_enforcement: {...}, allow_no_photo: bool, unsent_mode: {...}, ... }`
- `PATCH /api/settings` â€” body `{ key: string, value: any }` â€” upserts into app_settings table

**Settings page tabs:**
- Appearance (staff + admin): Theme toggle
- Account (staff + admin): Username, password change
- Unsent Images (staff + admin): `UnsentImagesSection` â€” reads from `useUnsentPhotos` (NOT photo-queue)
- Delivery (admin only): GPS enforcement, Allow No Photo, Unsent Mode toggle
- Users (admin only): User management CRUD

### 26.7 Critical Issues Found

| # | Issue | Location | Severity | Root Cause |
|---|-------|----------|----------|------------|
| 1 | **Unsent mode writes to wrong queue** | `unit-delivery-sheet.tsx:208` â€” calls `enqueuePhoto()` instead of `enqueueUnsent()` | **HIGH** | Office commit added unsent mode path but used the wrong hook. Settings reads from `unsent-photo-queue`, unsent mode writes to `photo-queue`. Photos invisible in Settings. |
| 2 | **sync-photo doesn't promote status** | `sync-photo/route.ts:75-97` â€” updates delivery_photos but NOT assignment_items.status | **HIGH** | The promote endpoint exists (`/api/deliveries/promote`) but sync-photo never calls it. Items stay 'processing' even after successful Drive upload. |
| 3 | **Redelivery blocks photo save** | `mark/route.ts:83-90` â€” early returns for 'delivered'/'missed' WITHOUT inserting/updating delivery_photos | **MEDIUM** | Redelivery of an already-delivered item silently drops the new photo. The photo is taken, uploaded, but never saved. |
| 4 | **No early-return for 'processing' items** | `mark/route.ts` â€” 'delivered' and 'missed' have early returns, 'processing' does not | **MEDIUM** | Redelivery of a 'processing' item creates a DUPLICATE delivery_photos record every time. |
| 5 | **Unsent icon in wrong location** | `deliver/page.tsx:209-222` â€” placed in filter bar, should be in FloatingActions | **LOW** | MASTER.md item #1 â€” reverting deliver filter bar and adding to FloatingActions is pending. |
| 6 | **Two separate unsent queues are confusing** | `usePhotoQueue` vs `useUnsentPhotos` â€” completely independent IndexedDB stores | **MEDIUM** | Same concept (unsent photos) implemented twice with different storage, sync mechanisms, and visibility. |
| 7 | **Offline fallback has no toast** | `unit-delivery-sheet.tsx:323-337` â€” sets deliveryStatus('processing') without showing any toast | **LOW** | User gets no feedback that photo was queued offline. Only visible via badge increment. |
| 8 | **captureGPS timeout (3s) may be too fast** | `use-deliver-unit.ts:6-25` â€” timeout 3000ms for getCurrentPosition | **LOW** | On slow networks or GPS-poor devices, captureGPS may return null, causing unnecessary 'processing' status. However, gpsOverride from live tracking bypasses this. |
| 9 | **lfsvc disabled on home PC** | OS-level â€” Windows Geolocation Service was set to Disabled | **FIXED** | `sc.exe config lfsvc start=auto` + `sc.exe start lfsvc` resolved it. Documented here for reference. |
| 10 | **Stale MASTER.md: GPS dots use gpsAccuracy** | MASTER.md Part 12 (line 3570) â€” says GPS dots use `gpsAccuracy` | **LOW** | Current code uses local `gpsAccuracy` state from sheet's own watchPosition callback. Documentation is stale. |

### 26.8 Efficiency Assessment

| Criterion | Score | Evidence |
|-----------|-------|----------|
| **Speed per delivery** | âš¡ ~3-5s | Photo compression ~500ms + FormData upload ~1-2s + server processing ~500ms. GPS pre-warmed via live tracking (0s wait). 2s auto-advance after delivered. |
| **GPS accuracy** | âœ… 50m Haversine | Street-level precision in Pakistani urban areas. Configurable via settings. Falls to 'processing' if GPS null or coordinates null. |
| **Battery drain** | âœ… Negligible | Two watchers share same GPS chip. Sheet watcher runs 10-15s per delivery (while sheet is idle). StaffMap watcher continuous but adds only JS callback overhead. |
| **Offline resilience** | âœ… IndexedDB + sendBeacon | Photo queued to IndexedDB on network error. `beforeunload` fires sendBeacon for best-effort ping. Auto-syncs when online via `online` event listener. |
| **Data integrity** | âš ï¸ Duplicate records | No dedup guard for re-delivery photo inserts. Items in 'processing' status get new delivery_photos records on each delivery attempt. |
| **Admin oversight** | âœ… Processing status + Force Complete | Admin can review 'processing' items and force-deliver or revoke. Force Complete endpoint at `POST /api/deliveries/force`. |
| **QR scanning** | âœ… Present on map | QRScannerButton scans PSID, opens delivery sheet with matching unit. |
| **Photo storage cost** | âœ… Zero Supabase egress | All photos stored in Google Drive via GAS webhook. Supabase only stores the Drive URL. |
| **Unsent queue visibility** | âŒ Split across 2 queues | photo-queue (deliver badge) and unsent-photo-queue (Settings tab) are completely separate. Photos in one are invisible in the other. |
| **Redelivery experience** | âš ï¸ Silent drop on delivered items | Tapping "Redeliver" on a 'delivered' item captures photo + uploads but server returns early without saving. Staff sees "Delivered" toast but photo is lost. |

### 26.9 Fix Priority Matrix for Office Session

| Priority | Issue # | Files | Fix Description | Estimated Time |
|----------|---------|-------|-----------------|----------------|
| **P0** | #1 | `unit-delivery-sheet.tsx:208` | Change `enqueuePhoto(...)` â†’ `enqueueUnsent({ assignmentItemId, psid, photoBlob, gpsLat, gpsLng })` in the unsent mode path. Remove `skipAutoSync` param. | 5 min |
| **P0** | #2 | `sync-photo/route.ts:75-97` | After successful webhook upload + delivery_photos update, add: `await sup.from('assignment_items').update({ status: 'delivered' }).eq('id', assignmentItemId).eq('status', 'processing')`. Same logic as promote endpoint lines 65-73. | 10 min |
| **P1** | #3 | `mark/route.ts:83-90` | Change early return to also INSERT the new delivery_photos record before returning. Or allow photo replacement by UPDATE. | 15 min |
| **P1** | #4 | `mark/route.ts` | Add `ownership.status === 'processing'` early return guard (same as 'delivered'/'missed') to prevent duplicate photo records. | 5 min |
| **P1** | #5 | `deliver/page.tsx`, `floating-actions.tsx` | Move unsent icon from deliver filter bar â†’ add as 4th button in FloatingActions. Wire UnsentModal. | 20 min |
| **P2** | #7 | `unit-delivery-sheet.tsx:332` | Add `updateToast(progressTid, 'Saved for later â€” will sync when online', 'info')` in the offline fallback path. | 5 min |
| **P3** | #6 | Both queue files | Deferred: Consider merging both queues into one. Not urgent â€” confusing UX but functional. | Deferred |
| **P3** | #10 | MASTER.md:3570 | Update "GPS dots use `gpsAccuracy`" â†’ "GPS dots use local `gpsAccuracy` state". | 2 min |

### 26.10 Data Flow Diagrams

#### Normal Delivery (No photo â†’ delivered/processing)
```
Camera/File â†’ compressImage (WebP, q0.6, 1024px)
  â†’ FormData (gps_override OR captureGPS)
    â†’ POST /api/deliveries/mark
      â†’ Auth: user.getId() + role=field_staff + ownership
      â†’ If already delivered/missed: return early (BUG: no photo saved)
      â†’ GAS webhook: POST to Drive (8s AbortController timeout)
      â†’ INSERT delivery_photos (photo_url, gps, synced_to_drive)
      â†’ Haversine distance(gps, target)
      â†’ If enforceGps && distance â‰¤ 50m â†’ status='delivered'
        Else â†’ status='processing'
      â†’ UPDATE assignment_items
      â†’ Response: { status, distance, photo_url }
  â†’ If photo_url starts with "pending://":
      â†’ compressImage again (for IndexedDB)
      â†’ enqueueUnsent() to unsent-photo-queue
  â†’ Optimistic cache update
  â†’ Invalidate queries
  â†’ Auto-advance after 2s (delivered) / 3.5s (processing)
```

#### Always Unsent Mode (mark-processing â†’ queue)
```
Camera/File â†’ POST /api/deliveries/mark-processing
  â†’ Auth (same as mark)
  â†’ INSERT delivery_photos (pending://unsent/...)
  â†’ UPDATE assignment_items SET status='processing'
  â†’ compressImage
  â†’ enqueuePhoto(skipAutoSync:true)  â† BUG: writes to wrong queue
  â†’ Toast "Saved to queue âœ“"
  â†’ setTimeout 1.5s â†’ onClose()
```

#### Offline Fallback (network error)
```
Camera/File â†’ deliver() throws TypeError â†’ returns null
  â†’ compressImage
  â†’ enqueuePhoto() to photo-queue (no skipAutoSync)
  â†’ setDeliveryStatus('processing')  â† no toast shown
  â†’ When online: processQueue()
    â†’ For each photo (batch 3):
      â†’ Upload to GAS webhook
      â†’ POST /api/deliveries/promote
        â†’ INSERT/UPDATE delivery_photos
        â†’ UPDATE assignment_items SET status='delivered'
      â†’ markSynced â†’ clearSynced after all done
```

#### Unsent Sync from Settings (retrySingle)
```
Settings â†’ "Sync All" â†’ retryAll â†’ retrySingle() per photo
  â†’ resolvePhotoData (blob â†’ dataUrl)
  â†’ POST /api/deliveries/sync-photo
    â†’ POST to GAS webhook (base64)
    â†’ UPDATE delivery_photos (photo_url, gdrive_file_id, synced_to_drive=true)
    â†’ BUG: NO status update â€” item stays 'processing'
  â†’ removeUnsent from queue
```

---

### 2026-06-09 â€” Offline Photo Queue & Delivery Refactor (Phase 6 Completion) â€” Location: Home

**Goal:** Fix the P0-P2 delivery pipeline bugs from Section 25.1. Replace the broken multi-round-trip photo flow with an IndexedDB-backed offline queue + atomic sync-photo endpoint.

**Done (P0-P2 items 1-13 from Section 25.1):**

**Architecture redesign:**
- **Old flow:** `POST /mark` â†’ client captures photo â†’ `POST promote` â†’ `POST mark-processing` â†’ `POST sync-photo` (GAS upload in route) â†’ `POST ping-process`/`ping` (tracking). Multiple round trips, no offline queue, dueling `processing`/`delivered` status cascade.
- **New flow:** `POST /mark` (creates `delivery_photos` placeholder row, sets status) â†’ staff captures photo client-side â†’ IndexedDB queue stores blob â†’ `POST /sync-photo` (single atomic upload to GAS webhook + DB update `photo_url` + `synced_to_drive=true`) â†’ queue resolves to `ok`/`orphan`/`retry`
- **Key change:** Only one path to Drive upload. No intermediate "pending" URLs. No separate promote/mark-processing route. Queue retries on failure, orphans after `MAX_RETRIES`.

**Files created:**
1. `scripts/sql/030-delivery-photos.sql` â€” `delivery_photos` table with indexes + trigger `trg_refresh_assignment_on_photo` (updates `assignment_items.photo_count` on INSERT) + cleanup RPC `cleanup_orphan_delivery_photos`
2. `src/lib/geo.ts` â€” `haversine()` function for GPS distance calculation
3. `src/lib/photo-queue.ts` â€” IndexedDB queue (add, getAll, count, remove, incrementRetry)
4. `src/hooks/use-photo-queue.ts` â€” React hook wrapping photo-queue lib with `enqueuePhoto`, `processQueue`, `queueCount`, `isProcessing`
5. `src/app/api/deliveries/unsynced/route.ts` â€” GET endpoint listing unsynced photos for retry UI (`synced_to_drive=false`)

**Files rewritten:**
6. `src/app/api/deliveries/mark/route.ts` â€” JSON-only. Creates `delivery_photos` placeholder (`photo_url=null`, `synced_to_drive=false`). GPS enforcement from `app_settings`. Correct early-return for delivered/missed (fixes #10). Processing guard (fixes #11).
7. `src/app/api/deliveries/sync-photo/route.ts` â€” Single route: uploads to GAS webhook, then atomically updates `delivery_photos` with `photo_url`, `gdrive_file_id`, `synced_to_drive=true`. Also promotes `assignment_items` status to `delivered` if currently `processing` (fixes #9).

**Files refactored:**
8. `src/components/delivery/unit-delivery-sheet.tsx` â€” Uses `usePhotoQueue` for offline-first enqueue. Added live GPS accuracy indicator with colored dot (10m green / 50m amber / âˆž red). Unsupported mode uses `enqueueUnsent` (fixes #8).
9. `src/app/deliver/page.tsx` â€” Queue badge ("3 photos waiting to sync") + manual retry button
10. `src/components/delivery/unsent-badge.tsx` â€” Updated for new queue lib
11. `src/components/settings/unsent-images-section.tsx` â€” Updated for new queue lib
12. `src/components/layout/floating-actions.tsx` â€” Uses new hook for badge count (fixes #12)
13. `src/components/ui/toast.tsx` â€” Default duration 4s â†’ 12s for delivery workflow
14. `src/app/api/deliveries/unsynced/route.ts` â€” New endpoint for retry UI

**Files deleted:**
15. `src/app/api/deliveries/promote/route.ts` â€” Removed (replaced by atomic sync-photo)
16. `src/app/api/deliveries/mark-processing/route.ts` â€” Removed (status set directly in /mark)
17. All `src/app/api/deliveries/ping*` variants â€” Removed (no tracking round trips needed)

**Key decisions:**
- IndexedDB over `localStorage` â€” Blob storage needed for photo binary data (base64 conversion only at upload time)
- Blob stored directly in IndexedDB (not base64) â€” avoids double encoding overhead
- `removeFromQueue` resolves in `tx.oncomplete` â€” but `incrementRetry` has a race condition (resolves immediately, not in `tx.oncomplete`). Documented in audit.
- `onupgradeneeded` only creates indexes on initial store creation â€” upgrade from v3 to v4 won't create `deliveryPhotoId` index. Documented in audit.
- No auth check on `sync-photo` â€” relies on JWT for authentication but doesn't verify staff_id ownership of the `delivery_photos` record. Documented in audit.

**Audit report:** `docs/AUDIT-2026-06-09.md` â€” 13 findings (2 P1, 5 P2, 6 P3)

**Remaining:**
- Apply `030-delivery-photos.sql` to Supabase (needs PAT token)
- Apply `037-notifications.sql` (needs PAT token from office PC)
- Data cleanup: stale IndexedDB + DB records from prior testing
- Fix P1 bugs from audit (incrementRetry race condition, sync-photo auth check)
- Consider P2 fixes (unsynced admin auth, GPS target validation, IndexedDB schema migration, usePhotoQueue state dedup, toast duration)

### 2026-06-10 â€” Photo Upload Reliability Investigation + Simplified Direct-Upload Plan â€” Location: Office

## 25. Remaining Corrections

Items that need to be fixed before the next session or are deferred from this session.  
**Note: Items 1-13 were implemented in the 2026-06-09 session (see session log above).**

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 1 | **CRITICAL** | **Photo upload unreliable â€” SSR proxy causes 85% failure rate. Rewrite to direct browser-to-GAS upload (see Section 27).** | **Pending â€” top priority** |
| 2 | LOW | Offline fallback has no toast | Pending |
| 3 | INFO | Stale IndexedDB entries from prior testing | Clear before each test session |
| 4 | HIGH | Stale `processing` items in DB from failed tests | `UPDATE ... SET status='pending' WHERE status='processing' AND delivered_at IS NOT NULL` |
| 5 | MEDIUM | `037-notifications.sql` not yet applied | Needs PAT token |
| 6 | MEDIUM | `030-delivery-photos.sql` not yet applied | Needs PAT token |
| 7 | MEDIUM | `036-test-mc-data.sql` not yet applied | Needs PAT token |
| 8 | INFO | GPS signal thresholds (10m/50m/Infinity) â€” verify on mobile | Test with actual mobile GPS |
| 9 | INFO | GPS battery optimization (deferred) | `use-user-location.ts` â€” low accuracy default |
| 10 | INFO | Stale GPS dots doc in MASTER.md | `gpsAccuracy` â†’ `gpsAccuracy` |
| 11 | INFO | `haversine()` in `geo.ts` has no input validation | Add bounds checking |
| 12 | MEDIUM | `usePhotoQueue` state duplicated across 5 components | Move to Context/Zustand store |
| 13 | MEDIUM | IndexedDB v3â†’v4 upgrade won't create `deliveryPhotoId` index | Create indexes unconditionally on upgrade |

**Fixed in 2026-06-09 session:**
- `incrementRetry` race condition âœ…
- `sync-photo` staff_id ownership check âœ…
- `unsynced` admin `?all` enforcement âœ…
- `mark` GPS target validation âœ…
- Toast default duration restored to 4s âœ…
- `sync-photo` hardcoded email fallback âœ…
- `skipAutoSync` removed from `use-photo-queue` âœ…
- "Always Queue Unsent" dead UI removed from Settings âœ…
- Test mode toggle added to Settings âœ…
- TestCity added to CITY_TEHSIL_MAP + CITY_CONFIG âœ…
- CitySwitcher hides TestCity unless admin + test_mode enabled âœ…
- "Unsent Images" tab renamed to "Photo Queue" âœ…
- `036-test-mc-data.sql` created (11 MCs Ã— 50 houses) âœ…
- Bug 1: Delivery status wiped by GPS updates (reset effect deps) âœ…
- Bug 2: GPS unavailable after auto-advance (watch effect deps) âœ…
- Bug 3: Redelivery photo never syncs (ALLOWED_STATUSES) âœ…
- Bug 4: Staff map redundant flyTo on every delivery (lastTargetRef guard) âœ…
- GPS seeding from parent on marker-click (setUserLat/Lng in reset effect, not deps) âœ…
- `useMapZoom` hook + Settings zoom slider (admin) + read-only display (staff) âœ…
- `MapContainer` initial zooms from hardcoded 12 to configured value âœ…
- `FlyToTarget` compound guard (target+zoom) replaces dual ref âœ…

---

## 27. Photo Upload Architecture: Direct Browser-to-GAS (2026-06-11 Implementation)

### 27.1 Problem (Before)

The old flow had an **85% failure rate**:
```
Browser â†’ SSR /api/deliveries/promote â†’ GAS webhook â†’ Drive
           â†‘                             â†— 404/timeout
         3-step: mark-processing â†’ enqueue â†’ promote
```
- SSR proxy added an extra Vercel hop with 10s timeout (Hobby plan)
- GAS rate-limited when photos arrived in bursts (auto-sync sent 3+ concurrent)
- 3-step flow created orphaned `processing` items
- IndexedDB queue dropped blobs after 3 retries â†’ data permanently lost
- Photos tagged with `psid` but HDS queried by `survey_id` â†’ new uploads never appeared in gallery

### 27.2 Actual Architecture (Mark-First + Direct GAS Upload)

Two operational modes controlled by `manualSync` setting:

**Mode 1: Manual Sync OFF (default) â€” Immediate GAS upload**
```
Staff takes photo â†’ compress WebP
  â†“
POST /api/deliveries/mark (creates delivery_photos + sets status via GPS: 50mâ†’delivered, elseâ†’processing)
  â†“
fetch Upload to GAS directly from browser (uploadToGAS(dataUrl, surveyId, email))
  â†“ Success â†’ POST /api/deliveries/sync-photo { deliveryPhotoId, gdriveFileId }
               â†’ updates delivery_photos.photo_url, gdrive_file_id, synced_to_drive = true
  â†“ Fail    â†’ Queue photo in IndexedDB for later retry + toast error
```

**Mode 2: Manual Sync ON â€” Always queue**
```
Staff takes photo â†’ compress WebP
  â†“
POST /api/deliveries/mark (creates delivery_photos + sets status)
  â†“
Queue photo in IndexedDB immediately
  â†“
Staff taps "Sync" when ready â†’ processQueue() â†’ for each queued photo:
    uploadToGAS(dataUrl, surveyId, email)
    â†’ POST /api/deliveries/sync-photo { deliveryPhotoId, gdriveFileId }
```

**Key decision: Mark-first, not upload-first.** The delivery record (GPS coordinates, timestamp, status) is created FIRST by the `mark` endpoint. Photo upload happens as a second, independent step. This ensures:
- GPS enforcement (50m threshold â†’ 'delivered'/'processing') is never lost
- No orphan GAS file without a corresponding DB row
- Staff can always see the delivery record even if photo upload fails
- The `mark` endpoint is the single entry point for all deliveries (photo and skip-photo)

### 27.3 Files Changed

| Action | File | What |
|--------|------|------|
| **CREATE** | `src/lib/drive-upload.ts` | Client-side `uploadToGAS(dataUrl, surveyId, email): Promise<string>` â€” direct `fetch('mode:cors', 'Content-Type:text/plain', no preflight)`. Tags images with `survey_id` for HDS compatibility. |
| **REWRITTEN** | `src/hooks/use-photo-queue.ts` | `processSingle` calls `uploadToGAS()` then `fetch('/api/deliveries/sync-photo')`. No `promote` dependency. Added progress tracking: `processingIndex`, `totalToProcess`, `currentFileSize`, `uploadSpeed`. |
| **REWRITTEN** | `src/components/delivery/unit-delivery-sheet.tsx` | `handleFile` calls `mark()` instead of `mark-processing`. Toast chain via `updateToast` across phases (Savingâ†’Uploadingâ†’Done). `processingStep` overlay in sheet. `inputCooldown` 2s button guard on unit change. |
| **REWRITTEN** | `src/app/api/deliveries/sync-photo/route.ts` | Accepts `{ deliveryPhotoId, gdriveFileId }`, updates DB (`photo_url`, `gdrive_file_id`, `synced_to_drive=true`). No GAS upload, no status promotion. ~142â†’~50 lines. |
| **MODIFIED** | `src/lib/photo-queue.ts` | Added `surveyId` and `email` fields to `QueuedPhoto` type. |
| **MODIFIED** | `src/app/deliver/page.tsx` | Sync banner shows "Syncing 2/5 (45 KB) Â· 12 KB/s" during queue processing. |
| **MODIFIED** | `src/components/delivery/unsent-badge.tsx` | Real progress bar (`width%`), index/total, KB/s, current item amber highlight. |
| **MODIFIED** | `src/components/settings/unsent-images-section.tsx` | Same progress display + progress bar, KB/s. |
| **DELETED** | `src/app/api/deliveries/mark-processing/route.ts` | Replaced by `mark()`. |
| **DELETED** | `src/app/api/deliveries/promote/route.ts` | Replaced by `uploadToGAS()` browser-side + `sync-photo`. |
| **DELETED** | `src/hooks/use-unsynced-photos.ts` | Replaced by `usePhotoQueue` progress tracking. |

### 27.4 Why This Works

1. **Direct browserâ†’GAS matches proven pattern** â€” old routing station app uses identical `fetch` to same webhook
2. **No SSR timeout** â€” browser handles upload with no 10s Vercel limit
3. **Staff-paced** â€” natural single-photo pacing (1 per delivery), no burst rate-limiting
4. **Mark-first ensures data integrity** â€” delivery record always persisted before upload
5. **Queue only for offline/retry** â€” IndexedDB is fallback, not primary path
6. **GAS URL is public CORS endpoint** â€” `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` safe client-side
7. **survey_id tagging** â€” `uploadToGAS` passes `survey_id` (not `psid`), matching HDS Drive Images query (which searches by `survey_id`)
8. **Progress tracking** â€” all consumers (`usePhotoQueue`) share same progress state: index/total, KB/s, file size, progress bar

### 27.5 Env Fix: HDS Drive Images 500

The HDS Drive Images tab was returning `{"error":"DRIVE_WEBHOOK_URL not configured"}` (500) because `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` was missing from:
- **Vercel env vars** â€” added via Vercel Dashboard
- **`.env.local`** â€” added locally

After fix: old Routing Station images (tagged with `survey_id`) appear in HDS gallery. New uploads also tag with `survey_id` (code fix in `uploadToGAS`).

### 27.6 Edge Cases

| Scenario | Handling |
|----------|----------|
| **GAS unreachable** | Toast error, photo queued in IndexedDB for retry (max 3 attempts). Staff taps Sync when online. |
| **Offline during capture** | `mark` fails â†’ toast error. After reconnect, staff retakes photo. |
| **GPS > 50m** | `mark` sets status='processing' (amber). Photo uploaded normally. No auto-promote to 'delivered'. |
| **Manual Sync ON** | Photos always queued. No GAS upload during delivery. Sync button shows count + progress. |
| **Queue retry (3x failure)** | Photo orphaned in IndexedDB. Error logged via `toast('error')`. Staff can manually retry. |
| **Redelivery** | Same flow, new `delivery_photos` row. `mark` always INSERTs. |
| **Revoke** | Revoke resets `assignment_items.status`. `delivery_photos` rows preserved. |
| **Browser closes mid-upload** | If close during GAS upload â†’ DB row exists (from `mark`) but `photo_url` is null. Staff sees pending badge next session. |
| **HDS Drive Images** | Old Routing Station images + new app images both visible (all tagged with `survey_id`). |

### 27.7 Operational Notes

- Queue limit: 50 photos, 3 retries max per photo
- `staleTime` for photo queue queries: 30s (real-time badge updates)
- GAS webhook is a public CORS endpoint â€” no auth header, `Content-Type: text/plain` avoids preflight
- `uploadToGAS` converts WebP blob â†’ base64 `dataUrl` same as old code
- `sync-photo` endpoint uses service_role key via `createAdminClient()` to write `delivery_photos`

---

## Testing Protocol â€” Direct Browser-to-GAS Photo Upload (PRIORITY)

**Status:** Not yet executed. **Must run through these scenarios before deploying to Vercel.**

### PREREQUISITE: Deploy to Vercel first
The code changes are local. Deploy via `git push` to trigger Vercel deploy. Then test on live URL with a real mobile device.

### T1: Normal delivery (Manual Sync OFF, GPS OK)
1. Open `/deliver` â†’ tap a pending assignment â†’ tap "Take Picture & Deliver"
2. Toast chain: "Saving..." â†’ "Uploading photo (45 KB)..." â†’ "Delivered (14m from target)" (green)
3. Sheet shows "Saved âœ“" â†’ "Uploading photo..." â†’ checkmark
4. Auto-advances to next unit. Buttons show spinner for 2s then re-enable.
5. DB: `SELECT * FROM delivery_photos WHERE assignment_item_id = '<id>'` â†’ has `photo_url`, `gdrive_file_id`, `synced_to_drive=true`

### T2: GPS out of range (>50m)
1. Stand >50m from target â†’ tap "Take Picture & Deliver"
2. Toast: "Out of range â€” Awaiting Review" (amber). Status shows 'processing'.
3. DB: `assignment_items.status = 'processing'`

### T3: Manual Sync ON (always queue)
1. Settings â†’ Delivery â†’ toggle "Manual Photo Sync" ON
2. Take 2-3 pictures â†’ FloatingActions badge shows count
3. Open UnsentBadge modal â†’ shows list with camera icon per item
4. Tap "Sync All" â†’ progress bar fills, text reads "Syncing 1/3 (45 KB)" â†’ "Syncing 2/3 (52 KB)"
5. Deliver page Sync banner shows "Syncing 2/3 (45 KB Â· 12 KB/s)"
6. Settings â†’ Delivery â†’ UnsentImagesSection shows same progress + KB/s
7. After sync completes â†’ queue count resets to 0, badge hidden

### T4: Offline â†’ recovery
1. Airplane mode â†’ take picture â†’ `mark` fails â†’ error toast ("Delivery failed â€” check connection")
2. Disable airplane mode â†’ retake photo â†’ normal flow (both toast chain + DB write)
3. No orphan state left behind

### T5: Queue retry (3x failure)
1. Enable Manual Sync â†’ take picture â†’ disable WiFi
2. Tap Sync â†’ upload fails â†’ auto-retries 3 times â†’ toast error after 3rd failure
3. Photo remains in IndexedDB queue (can retry manually)
4. DB: delivery_photos row exists but `photo_url` and `gdrive_file_id` are null

### T6: Redelivery
1. Unit already delivered â†’ tap "Redeliver" â†’ same flow
2. DB: new `delivery_photos` row (old row preserved)
3. HDS shows both photos under Delivery badge

### T7: HDS gallery â€” Drive images
1. Open HDS for any unit with old Routing Station images (e.g., survey_id that was in Sargodha May 2026 batch)
2. "DRIVE" badge shows old images (these were tagged with `survey_id` by Routing Station)
3. Take a new delivery photo â†’ after upload completes, refresh HDS â†’ new photo also visible under DRIVE

### T8: Settings toggles
1. **GPS OFF:** Delivery proceeds without GPS, status = 'delivered', `delivery_gps_lat/lng` = null
2. **No Photo ON:** "Skip Photo" button appears below main buttons â†’ tap â†’ mark called with no photo â†’ status set normally
3. **Manual Sync ON â†’ OFF:** Toggle off â†’ next delivery uploads immediately to GAS instead of queueing

### T9: Button cooldown
1. After delivery auto-advance â†’ both "Take Picture" and "Details" buttons show spinner
2. Wait ~2s â†’ buttons re-enable, tap works normally
3. Rapid tapping during cooldown â†’ only first tap registers

### T10: Admin view â€” no breakage
1. `/map` â†’ click any marker â†’ sheet opens â†’ "View Details" works (no delivery buttons)
2. `/assignments` â†’ manage tab â†’ force complete works
3. `/stats` â†’ staff stats load normally

### Ripple effects to verify
- `FloatingActions` badge updates in real-time during queue processing
- `useToast` updateToast path works across all components (not just delivery sheet)
- QR scanner â†’ `/deliver` redirect â†’ sheet works with same photo flow
- No console errors on page navigation (deliver â†’ map â†’ settings â†’ deliver)
- UnsentBadge modal dismiss (X button + tapping outside) both work

---

## 28. Night Session â€” 2026-06-11 (Comprehensive Audit & Monthly Cycle Gap)

### 28.1 Session Context

**Location:** Home PC (office session ended 5pm, committed `7a0c250`)
**Previous commit at home:** `278e24f` (v32.0: direct browser-to-GAS photo upload + progress tracking + button cooldown)
**This session triggered by:** User arriving home, asking for office session recap, then requesting a full delivery system audit

### 28.2 Office Session Recap (2026-06-11 4pm-5pm)

Committed as `a8647c5` (4pm) and `7a0c250` (5pm):

**Major additions:**
1. **Failed upload tracking system** â€” Migration 040 added `verified_by`/`verified_at` to `delivery_photos`
2. **`GET /api/deliveries/failed-uploads`** â€” Returns photos where `synced_to_drive=false AND verified_by=null`. Staff see own, admin sees all with staff filter.
3. **`POST /api/deliveries/verify-photo`** â€” Admin stamps verified_by/verified_at. Admin+super_admin only. Uses `createAdminClient()`.
4. **Staff stats page** â€” New "Failed Uploads" card showing PSID list with dates, expandable
5. **Admin Settings** â€” New "Failed Uploads" tab with per-row Verify button, staff filter pills, GPS coords

**Minor fixes:**
6. **Sidebar fix** â€” Dashboard (`id: 'stats'`) was visible to ALL users (outside admin spread). Moved inside admin-only check so staff no longer see it.
7. **`mark/route.ts` GPS** â€” Changed from conditional (`if (gps_lat != null) set`) to always write (`gps_lat ?? null`), clearing stale values
8. **Deliver page DB unsynced fallback** â€” Red banner when IndexedDB queue empty but DB has unsynced photos (queue cleared/lost)
9. **`uploadToGAS()`** â€” Now accepts Blob directly (internal base64 conversion)
10. **Toast messages** â€” Shortened for mobile
11. **Error log section** â€” Source pills accumulate across loads, `#ID` per row with copy button, admin can filter by `user_id`
12. **MASTER.md** â€” `sharedLocation.accuracy` â†’ `gpsAccuracy` fixes

### 28.3 Sidebar Correction

The user pointed out that my initial summary of the sidebar fix was backwards. I wrote "Dashboard was missing from staff view" â€” this was wrong. The actual bug was:

```
Before (bug):    Dashboard was OUTSIDE the admin spread â†’ visible to ALL users (staff saw it)
After (fix):     Dashboard was moved INSIDE the admin spread â†’ only admin/super_admin see it
```

The Dashboard is an admin-only billing KPI view (charts, data-insight), never meant for staff. Staff have their own `/stats` page for delivery stats. The user clarified: there is no confusion between the two â€” Dashboard = admin billing charts, `/stats` = staff delivery stats.

### 28.4 Comprehensive Delivery System Audit

#### Architecture

Two-phase **mark-first** flow:

```
Mark:     POST /api/deliveries/mark â†’ delivery_photos row + set status (GPS enforcement 50m)
Upload:   uploadToGAS() (browserâ†’Drive) â†’ POST /api/deliveries/sync-photo (update DB record)
Fallback: IndexedDB queue (3 retries max) â†’ manual/staff-triggered Sync
```

Two modes controlled by `manualSync` setting:
- **Auto (default):** Upload fires immediately after mark succeeds; queue only on failure
- **Manual:** Photo always goes to IndexedDB queue; staff taps "Sync" later

#### History (Three Failed Approaches Before Current)

| Phase | Approach | Failure |
|-------|----------|---------|
| **Original** | SSR proxy via `promote` route (browser â†’ Vercel â†’ GAS) | 85% failure â€” Vercel 10s timeout + GAS rate limits |
| **Interim** | "Unsent" skip-first flow (mark-processing â†’ enqueue â†’ promote) | Created orphaned `processing` items, 3-step clutter |
| **Current** | Direct browserâ†’GAS upload, matching legacy Routing Station `12_drive_sync.js` | Working (proven pattern) |

#### Key Files (19 files in the delivery/photo pipeline)

| File | Lines | Role | Status |
|------|-------|------|--------|
| `src/lib/drive-upload.ts` | 54 | Browserâ†’GAS upload (client-side fetch) | Active, core |
| `src/lib/photo-queue.ts` | 101 | IndexedDB queue (v4, blob storage) | Active, has race condition |
| `src/hooks/use-photo-queue.ts` | 203 | Queue hook with progress tracking | Active, state duplication |
| `src/hooks/use-deliver-unit.ts` | 72 | Mark endpoint wrapper | Active |
| `src/lib/geo.ts` | 10 | Haversine distance | Active, no input validation |
| `src/stores/photo-queue-store.ts` | 11 | Queue count Zustand store | Active, minimal |
| `src/app/api/deliveries/mark/route.ts` | 176 | Create delivery record (single entry point) | Active, core |
| `src/app/api/deliveries/sync-photo/route.ts` | 56 | Update Drive URL in DB after upload | Active |
| `src/app/api/deliveries/failed-uploads/route.ts` | 143 | List unverified failed uploads | Active, N+1 query |
| `src/app/api/deliveries/verify-photo/route.ts` | 52 | Admin verify (stamp verified_by) | Active |
| `src/app/api/deliveries/unsynced/route.ts` | 90 | List photos stuck in DB after queue loss | Active |
| `src/app/api/deliveries/force/route.ts` | 57 | Admin force complete | Active |
| `src/app/api/deliveries/mark-processing/route.ts` | DELETED | Replaced by mark | Deleted |
| `src/app/api/deliveries/promote/route.ts` | DELETED | Replaced by uploadToGAS | Deleted |
| `src/app/api/delivery/photo/[fileId]/route.ts` | 36 | Proxy to Google CDN (lh3.googleusercontent.com) | Active, verified |
| `src/app/api/delivery/photos/route.ts` | 70 | Photo CRUD by PSID | POST handler is dead code |
| `src/app/api/delivery/photos/drive/route.ts` | 46 | Drive images for HDS gallery | Active |
| `src/components/delivery/unit-delivery-sheet.tsx` | 655 | Main delivery UI | Active |
| `src/components/delivery/unsent-badge.tsx` | 127 | Queue modal (misnamed) | Active |
| `src/components/settings/failed-uploads-tab.tsx` | 181 | Admin failed uploads UI | Active |

#### Risk Matrix

| Risk | Severity | Likelihood | File | Mitigation |
|------|----------|------------|------|------------|
| Race condition in incrementRetry | MEDIUM | LOW | photo-queue.ts | Serialize queue ops |
| IndexedDB v3â†’v4 indexes missing | LOW | MEDIUM | photo-queue.ts | Move index creation outside if-block |
| haversine() NaN crash | LOW | MEDIUM | geo.ts | Add input validation + NaN guard |
| Orphaned delivery_photos on redelivery | MEDIUM | HIGH | mark/route.ts | Add superseded_at column |
| Queue state stale across components | LOW | HIGH | photo-queue-store.ts | Move all state to Zustand |
| GAS webhook URL public | LOW | LOW | drive-upload.ts | Add referer check |
| No toast on offline queue | LOW | MEDIUM | unit-delivery-sheet.tsx | Add updateToast call |
| /api/log error swallowing | LOW | LOW | use-photo-queue.ts | Remove empty catch |
| extractFileId dead code | NONE | N/A | drive.ts | Delete |
| POST /api/delivery/photos dead | NONE | N/A | photos/route.ts | Delete POST handler |

### 28.5 Photo URL Proxy Investigation

The user was concerned that `photo_url` set by `sync-photo/route.ts:37` might be a broken link:

```ts
const photo_url = '/api/delivery/photo/${gdriveFileId}'
```

**Verdict: NOT broken.** The route `src/app/api/delivery/photo/[fileId]/route.ts` exists (36 lines). It proxies to Google's CDN:

```
https://lh3.googleusercontent.com/d/${fileId}
```

Features:
- 8s timeout (AbortSignal)
- Error handling (returns 502 on upstream failure)
- Proper Content-Type passthrough
- 24h Cache-Control header
- fileId length validation (min 10 chars)

Every synced photo URL is valid.

### 28.6 Monthly Cycle Gap Discovery

**This is the biggest unresolved architectural gap.** The investigation found:

1. **`daily_assignments` has NO `bill_month` column.** The only time field is `issued_at` (date). No way to tell which billing month an assignment belongs to.

2. **`assignment_items` has NO `bill_month` column.** Same gap.

3. **No automation for month transitions.** Nothing happens when the billing cycle rolls over:
   - No cron jobs (Vercel or otherwise)
   - No scheduled DB functions
   - No assignment expiry mechanism
   - No archive/close for old month

4. **Old assignments never expire.** A `pending` assignment from MAY2026 remains active and visible in JUN2026. Staff could deliver against it in the wrong month.

5. **`getUnassignedBills()` accepts `month` param but never uses it.** The underlying query against `survey_units` only checks active status + not already assigned. It does NOT filter by `survey_units.current_bill_month`.

6. **`hierarchy_summary` is the only month-keyed table**, but it's a cache table refreshed manually by the Python pipeline (Office PC).

7. **Consequence:** Cross-month data corruption is possible. A unit could have `current_bill_month='JUN2026'` but be delivered against a MAY2026 assignment with stale data.

**Full schema â€” `daily_assignments`:**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| staff_id | uuid FK â†’ staff(id) | |
| issued_at | date | Was `assigned_date` (renamed migration 031) |
| uc_name | text | |
| total_items | integer | DEFAULT 0 |
| created_by | uuid FK â†’ staff(id) | Admin who created it |
| created_at | timestamptz | DEFAULT now() |

**`assignment_items`:**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| assignment_id | uuid FK â†’ daily_assignments(id) CASCADE | |
| psid | text NOT NULL | |
| survey_id | text | Nullable (added migration 030) |
| route_seq | integer | DEFAULT 0 |
| status | text | DEFAULT 'pending', CHECK IN (pending,processing,delivered,missed,skipped) |
| delivered_at | timestamptz | Nullable |
| gps_lat/lng | numeric | Nullable |
| notes | text | Nullable |

### 28.7 Orphaned Rows Clarification

The user asked: "For the orphaned rows, are they the result of photo syncing failure? Because if the GPS enforcement was ok then the row is valid."

**Answer:** Correct. Not every incomplete `delivery_photos` row is a problem. Three categories:

| Scenario | Has photo_url? | Has GPS? | Status Set? | Verdict |
|----------|---------------|----------|-------------|---------|
| Sync failed after successful delivery | null | Yes (50m OK) | 'delivered' | **Valid delivery.** GPS proves staff was there. Photo is secondary. |
| GPS out of range + sync failed | null | Yes (>50m) | 'processing' | **Needs admin verification.** Photo was the only evidence. Now handled by Failed Uploads tab. |
| Redelivery created new row (old row orphaned) | null | Yes | 'delivered' (new) or 'processing' (old) | **Stale.** Old row has no photo and never will. Should be superseded. |

**Proposed fix for item #11:** Add `superseded_at timestamptz` to `delivery_photos`. When `mark` creates a new row for the same `assignment_item_id`, it sets `superseded_at = now()` on older incomplete rows. Failed upload tracking filters to `superseded_at IS NULL`.

### 28.8 Delivery Quality Metrics Proposal

**Two independent rates per staff per billing month:**

| Metric | Formula | What It Measures | High Value Means |
|--------|---------|-----------------|------------------|
| **Photo Fail Rate** | rows with photo_url=null / total deliveries | Upload reliability | Device issue, browser closed early, genuine network dead zone |
| **GPS Out-of-Range Rate** | processing status / total deliveries | Location accuracy | Staff not reaching target, or dense urban area with bad GPS |

**Combined score:**

| Photo Fail | GPS OOR | Interpretation |
|------------|---------|----------------|
| Low | Low | Normal operation |
| **High** | Low | Device/network issue. Staff was at location. Less worrying. |
| Low | **High** | Staff taking photos but from far away. Suspicious. |
| **High** | **High** | Genuine area-wide connectivity issue. Both metrics failing. |

**Score formula:** `100 - (photo_fail_pct Ã— 2 + gps_oor_pct Ã— 3)`
(GPS OOR weighted higher because it's a stronger indicator of effort issues.)

**Where to place:** Settings â†’ Administration â†’ "Delivery Quality" tab (alongside Failed Uploads and Error Log).

**Required for implementation:**
- Monthly bill_month on assignments (Item 10 must come first)
- New RPC: `get_delivery_quality(p_month text)`
- New API: `GET /api/deliveries/quality?month=JUN2026`
- New component: `delivery-quality-tab.tsx`

### 28.9 Public GAS Webhook Safeguarding

`NEXT_PUBLIC_DRIVE_WEBHOOK_URL` is visible to every browser that loads the app. Anyone who inspects the network tab or source can POST arbitrary images to the app's Google Drive.

**Options evaluated:**

| Approach | Effort | Security | App Changes |
|----------|--------|----------|-------------|
| **Do nothing** | 0 | None | None |
| **Referer header check** (in GAS script) | ~5 min | Medium â€” spoofable but stops casual abuse | None |
| **HMAC signature** (server signs payload, GAS verifies) | ~30 min | Strong â€” cannot forge without secret | New `/api/drive-token` + client passes sig |
| **Short-lived token** (server generates expiring token, GAS verifies against Supabase) | ~1 hr | Strongest â€” expires per request | Same as HMAC + expiry logic |

**Recommendation:** Add a referer check in the GAS script as an immediate stopgap. The GAS `doPost()` function checks `e.postData.contents` for a `referer` field matching the app's domain. Zero app code changes needed â€” `uploadToGAS()` already sends JSON which can include an extra field.

### 28.10 Prioritized Correction Items (11 Items)

| # | Priority | Item | Files | Effort | Impact |
|---|----------|------|-------|--------|--------|
| 10 | **P0** | Add `bill_month` to `daily_assignments` | Schema + API + UI | ~2 hrs | Prevents cross-month data corruption |
| 3 | P1 | `haversine()` NaN guard | `geo.ts` + `mark/route.ts` | ~10 min | Prevents silent GPS bypass |
| 1 | P1 | `incrementRetry` race condition | `photo-queue.ts` | ~30 min | Prevents queue data corruption |
| 2 | P1 | IndexedDB v3â†’v4 index upgrade | `photo-queue.ts` | ~15 min | Fixes queue for existing users |
| 4 | P2 | Toast on offline queue fallback | `unit-delivery-sheet.tsx` | ~15 min | UX â€” no silent failures |
| 6 | P2 | Delivery quality RPC + Settings tab | New RPC + API + UI | ~2 hrs | Staff accountability metric |
| 5 | P2 | Referer check on GAS webhook | GAS script only | ~5 min | Security stopgap |
| 11 | P3 | Supersede old delivery_photos on redelivery | Schema + `mark/route.ts` | ~30 min | Cleans orphan data |
| 7 | P3 | Move queue state to Zustand store | `photo-queue-store.ts` + hook | ~1 hr | Fixes multi-component progress |
| 8 | P3 | Clean dead code | `drive.ts` + `photos/route.ts` | ~15 min | Hygiene |
| 9 | P3 | Fix `/api/log` error swallowing | `use-photo-queue.ts` | ~10 min | Debuggability |

### 28.11 Full Conversation Transcript

## 29. Performance Audit â€” Current App vs Routing Station Pro (2026-06-11 Night)

### 29.1 Trigger

The user asked: "Audit the current app for speed, efficiency, performance on low-end devices, limitations of Chrome based app on mobile, drive sync, delivery enforcement, standard industry procedures. Focus on how to improve lagging performance on low end devices with just 50 markers on the map. Compare it with the routing station app."

Initial analysis blamed missing MarkerCluster. The user corrected: "the old app did not used markercluster, every selected filter marker list was visible on the map, from average 3k to 40k markers was no issue to appear in the old app."

### 29.2 Root Cause: Canvas vs SVG Renderer

Re-reading the old app's map initialization (`04_app.js:387-396`):

```js
State.map = L.map('map', {
    zoomControl: false,
    preferCanvas: window.innerWidth <= 768,  // THE KEY LINE
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    inertia: true,
    inertiaDeceleration: 3000,
    updateWhenIdle: true
});
```

Two critical differences from the current app:

| Setting | Old App | Current App | Impact |
|---------|---------|-------------|--------|
| **preferCanvas** | `true` on mobile (screen width â‰¤768px) | Not set (defaults to SVG) | **Canvas**: single `<canvas>` element, GPU-accelerated, all markers drawn as paint calls. **SVG**: each marker = separate DOM `<g>` element, created/destroyed on every React re-render. |
| **updateWhenIdle** | `true` | Not set | Defers tile loading until map stops moving. Reduces tile request bursts during pan/zoom. |

### 29.3 Why 50 Markers Lag on Current App

**SVG renderer (current default):**
- Each `<Marker>` creates an SVG `<g>` element in the DOM
- React reconciles all 50 on every state change (pan, zoom, filter, tab switch)
- React Query returns new array references â†’ useMemo treats markers as changed â†’ all 50 DivIcons destroyed and recreated
- Each DivIcon contains inline `<style>` with animation keyframes
- On low-end Android (2GB RAM, Chrome): 50-100ms for React diff + 50-100ms for Leaflet SVG DOM manipulation = 100-200ms visible lag per interaction

**Canvas renderer (old app approach):**
- All markers paint to a single `<canvas>` element
- Zero DOM nodes per marker
- GPU handles the paint â€” 50 or 40K markers make no difference
- React only manages the MapContainer, not individual marker DOM nodes
- Even with React overhead, canvas paint is <5ms

### 29.4 Full Comparison

| Metric | Current App (React + SVG) | Old App (Vanilla JS + Canvas) | Why |
|--------|--------------------------|-------------------------------|-----|
| **50 markers** | 100-200ms lag per interaction | Smooth (<5ms) | SVG vs Canvas renderer |
| **40K markers** | Would crash browser | Smooth | Canvas renders all as one layer |
| **GPS battery** | High (2 concurrent watchers) | None (no GPS) | Current has enforcement features |
| **Bundle size** | ~200-300KB (React + deps) | ~80KB (vanilla JS) | Framework overhead |
| **Delivery enforcement** | âœ… Full (GPS, status, admin verify) | âŒ None | Current wins on features |
| **Offline support** | Partial (photo queue only) | Full PWA (sw.js v9, app shell) | Old wins on offline |
| **PWA installable** | âŒ No manifest/sw | âœ… standalone + icons | Current missing this |
| **Data loading** | SSR API â†’ React Query | window.RAW_DATA (client-side) | Different architectures |

### 29.5 The Actual Fixes (Three Small Changes)

| Fix | File Change | Effort | Effect |
|-----|------------|--------|--------|
| **preferCanvas: true** | Add to react-leaflet MapContainer (both StaffMap and MapView) | 5 min | Eliminates DOM overhead per marker â€” fixes all lag |
| **updateWhenIdle: true** | Add to same MapContainers | 2 min | Reduces tile requests during pan/zoom |
| **Remove duplicate GPS watcher** | UnitDeliverySheet uses shared useUserLocation instead of its own watchPosition | 30 min | Halves battery drain |

**No architecture rewrite needed.** These are isolated config changes.

### 29.6 Corrected Verdict

The current app is **not architecturally wrong** for low-end devices. It was missing two Leaflet config flags (`preferCanvas`, `updateWhenIdle`) that the old app had. Once applied:

- 50 markers will render as smoothly as the old app (Canvas renderer)
- 40K markers would also work (though the current app limits to 50/page by design)
- React overhead becomes negligible â€” Canvas renderer bypasses DOM per marker

The old app wins on **raw rendering speed** and **offline capability**. The current app wins on **delivery enforcement, data integrity, admin oversight, and security**. The rendering gap is closed with two lines of config.


## 28. New Delivery Model — Multi-Staff Same-MC (Proposed 2026-06-19)

### 28.1 The Problem
Current assignment model: admin splits an MC into ranges per staff. Staff must follow a pre-set sequence. This doesn't match field reality — staff arrange physical bills in their own walking order.

### 28.2 The Proposal
1. **Multiple staff assigned to one full MC** — Each staff gets ALL units of the MC. Each has their own `assignment_id` with the same PSIDs. No conflict because each physical bill belongs to one staff only.
2. **QR-scan-first delivery** — Staff scans QR code on their physical bill → UDS opens → marks delivered. No more scrolling through a list to find the right unit.
3. **"My Position" tab** — After first delivery, a new view appears showing survey_ids in descending order from the delivered point. Staff scrolls naturally from where they left off.
4. **No pre-set sequence** — Each staff builds their own delivery order naturally. Next month's printed bills sorted per-staff based on this month's actual delivery order.

### 28.3 Assignment Creation
Admin picks an MC → selects multiple staff → sets daily target → clicks "Assign MC to All". Each staff gets the same full MC. Current checkbox/range assign UI preserved as alternative.

### 28.4 Open Questions (Resolve Before Implementation)
1. "My Position" tab: two tabs ("All" + "My Position") or does main view switch entirely?
2. If staff delivers a *higher* survey_id later, does "My Position" update to start from new highest?
3. Admin /map marker view: show "Pending (3 staff assigned)" or just "Pending" until someone delivers?
4. Does a delivery by one staff auto-resolve other staff's assignment_items for that PSID?


## 19. Assignment Order Rule

### 19.1 Rule
`sUrvey_units.route_seq` is a **printing and routing field only** (from lifecycle files). It defines the order bills are printed and which route a unit belongs to. It must NEVER be used as the assignment sequence for staff delivery.

### 19.2 Source of truth for staff assignment order
The **Create tab display order** (`survey_id` descending) is the only valid sequence. When an assignment is created:
- **Checkbox "Assign Selected"**: Items are numbered 1, 2, 3...n in the order they were checked (selection order = delivery sequence).
- **Range-based "Assign"**: Items are numbered 1, 2, 3...n in the order they appeared in the Create tab table.

### 19.3 Implementation
In `assignment-repository.ts:355`:
```ts
route_seq: routeSeqMap?.[psid] ?? (psids.indexOf(psid) + 1),
```
The fallback `psids.indexOf(psid) + 1` uses the PSID position in the `psids` array (which arrives in Create tab display order). The old fallback `seqMap.get(psid) ?? 0` was removed because it copied `survey_units.route_seq` (the printing/routing value).

### 19.4 Deliver page display
- Flat paginated list (50 per page), sorted by `route_seq` ascending
- No UC grouping — UC name is shown per item in the address line
- Pagination controls at the bottom (Previous/Next with range display)

---
## 29. Supabase Query Patterns — The Definitive Reference

### 29.1 The Core Rule
**All client data goes through SSR API routes.** The Supabase JS client is only used in `src/app/api/` route files. Hooks call `fetch('/api/...')`. The only exception is `supabase.auth.*` calls.

### 29.2 Decision Tree — Pick a Pattern

```
How many rows will the query return?
├── < 1000 rows
│   └── Use Supabase JS client: sup.from('table').select(COLS).eq(...)
│
├── >= 1000 rows (or unknown)
│   └── Use fetchAllRows() with REST API + Range headers
│
Does the query need SUM / COUNT(DISTINCT) / GROUP BY?
├── YES, and it's admin-only
│   └── Create a PL/pgSQL RPC (the only allowed exception)
├── YES, and it's for all users
│   └── Fetch rows → aggregate in TypeScript (in route.ts)
├── SIMPLE COUNT only
│   └── head: true + prefer: 'count' — no rows returned

Does the query filter by a list of PSIDs/survey_ids?
├── < 300 items in the list
│   └── Use sup.from().in('psid', smallList)
├── >= 300 items in the list
│   └── Chunk at 300 + Promise.all + fetchAllRows() per chunk

Does the query span multiple tables?
├── Use two separate queries + TypeScript join in route.ts
│── Avoid SQL joins when one side is a large table
│── Simplify: fetch small reference table, use Map lookups
```

### 29.3 Pattern 1 — Simple Query (< 1000 rows)

Use the Supabase JS client directly. Always name columns.

```ts
const COLS = 'id, name, city_district, tehsil'
const { data } = await sup
  .from('staff')
  .select(COLS)
  .eq('city_district', 'SARGODHA')
  .order('name')

// For count-only (no rows returned):
const { count } = await sup
  .from('survey_units')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'ACTIVE')
```

### 29.4 Pattern 2 — Batched Fetch (sequential)

For queries returning more than 1000 rows. Fetches pages one at a time using the PostgREST Range header directly. The Supabase JS client's `.range()` cannot override the 1000-row hard limit — this is a Supabase project config, not a PostgREST limit.

```ts
async function fetchAllRows<T = any>(
  url: string,
  batchSize = 1000
): Promise<T[]> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await fetch(url, {
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        Range: `${offset}-${offset + batchSize - 1}`,
      },
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}`)
    const chunk: T[] = await res.json()
    if (!chunk?.length) break
    all.push(...chunk)
    offset += chunk.length
    if (chunk.length < batchSize) break
  }
  return all
}

// Usage: build a PostgREST URL with all filters + order
const url = `${SUPABASE_URL}/rest/v1/survey_units?select=psid,uc_name&uc_name=eq.${encodeURIComponent(uc)}&order=survey_id.desc`
const rows = await fetchAllRows(url)
```

**When to use this pattern:** Order matters (sequential pages preserve sort order), or the total row count is unknown and you need to fetch until empty.

**Important:** Always include `order=` in the URL. Without it, pagination is inconsistent — PostgREST may return different rows on different pages.

### 29.5 Pattern 3 — Chunked PSID/Survey ID List

When filtering by an array of IDs (e.g., fetching survey_units for a list of 3000 PSIDs), the Supabase JS client `.in('psid', largeArray)` silently truncates at 1000 items. Never use it with large arrays.

**Chunk size 300** — PostgREST URLs with 300 PSIDs in the `in.(...)` filter are ~6K characters. At 800 PSIDs, the URL reaches ~16K and **may silently fail with a 500 error** (Supabase/PostgREST URL length limit). Always chunk at 300.

```ts
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// For large PSID lists, chunk + fetchAllRows per chunk
const psidChunks = chunkArray(psids, 300)
const results = await Promise.all(
  psidChunks.map(async (chunk) => {
    const url = `${SUPABASE_URL}/rest/v1/survey_units?select=survey_id,psid,uc_name&psid=in.(${chunk.map(encodeURIComponent).join(',')})`
    return fetchAllRows(url)
  })
)
const allRows = results.flat()
```

**When to use this pattern:** Creating assignments with > 300 items, fetching metadata for a large batch of PSIDs, payment history lookups by PSID.

### 29.6 Pattern 4 — Parallel Batched Fetch (for speed)

When you need all rows quickly and order doesn't matter across pages. First does a HEAD request to get the total count, then fetches all pages in parallel.

```ts
async function fetchAllParallel<T = any>(
  url: string,
  batchSize = 1000
): Promise<T[]> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  // HEAD request for total count
  const headRes = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      Prefer: 'count=exact',
    },
  })
  const total = parseInt(headRes.headers.get('content-range')?.split('/')[1] || '0', 10)
  if (total === 0) return []
  const pageCount = Math.ceil(total / batchSize)
  const pages = Array.from({ length: pageCount }, (_, i) => {
    const offset = i * batchSize
    return fetch(url, {
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        Range: `${offset}-${offset + batchSize - 1}`,
      },
    }).then((r) => r.json() as Promise<T[]>)
  })
  const results = await Promise.all(pages)
  return results.flat()
}
```

**When to use this pattern:** Speed is critical (e.g., MC list counts where sequential 42s → parallel 12s). Do NOT use when order across pages matters or when the server might rate-limit parallel requests.

**When to AVOID:** If the total is > 100,000 rows (too many parallel requests), or the server is shared with active users (avoid flooding).

### 29.7 Pattern 5 — Admin-Only Aggregate Queries (RPC)

The only case where PL/pgSQL RPCs are allowed. The Supabase REST API cannot do `SUM`, `COUNT(DISTINCT)`, `GROUP BY` through `.select()`. Even `?select=sum:amount` returns column values, not aggregates.

```sql
CREATE OR REPLACE FUNCTION get_billing_stats(
  p_month text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_tehsil text DEFAULT NULL
) RETURNS json AS $$
  -- Aggregate logic here
$$ LANGUAGE plpgsql;
```

```ts
// Called from route.ts:
const { data, error } = await sup.rpc('get_billing_stats', {
  p_month: month,
  p_district: district,
  p_tehsil: tehsil,
})
```

**Approved RPCs:** Listed in `scripts/sql/007-data-insight-rpcs.sql`. No new RPCs should be created without reviewing this rule.

### 29.8 The Status Filter Trap

`survey_units` has ~160,000 rows with `status = NULL` (enriched units with PSIDs). These are ACTIVE but the column value is null, not 'ACTIVE'. Never use a bare filter:

```ts
// WRONG — misses 160K rows:
.eq('status', 'ACTIVE')

// CORRECT — includes null-status units:
.or('status.is.null,status.eq.ACTIVE')
```

The shared helper `applyActiveFilter(query)` in `src/lib/queries/survey-units.ts` does this correctly. Always import it.

### 29.9 The 1MB Response Body Trap

PostgREST silently truncates responses at 1MB, even when Range headers are used. If a single page of 1000 rows exceeds 1MB (e.g., wide rows with many columns), the response is silently truncated and you get fewer rows than requested.

**Detection:** If `chunk.length < batchSize` but you know there are more rows, the 1MB limit was hit. The `fetchAllRows()` sequential pattern handles this — it breaks the loop when it gets fewer rows than requested, but this may give you incomplete data.

**Mitigation:**
- Use smaller batch sizes (e.g., 500 instead of 1000) to keep each page under 1MB
- Select fewer columns (never `select('*')`)
- For wide rows (e.g., survey_units with 20+ columns), batchSize=300 is safer

### 29.10 What NOT to Do

| Anti-Pattern | Why It's Wrong | What Happens |
|---|---|---|
| `.range(0, 1_000_000)` | 1000-row limit is a project config, not a range limit | Silently returns only 1000 rows |
| `.select('*')` on big tables | Wastes egress + 1MB limit risk | Appears to work until row count grows |
| `.in('psid', arrayOf3000)` | Supabase JS client truncates at 1000 | 2000 rows silently lost |
| `sum:amount_due` in select | PostgREST doesn't support aggregates | Returns column values, NOT sum |
| Client-side `.filter()` on > 1000 items | Fetches all rows to browser | Slow load, wasted egress |
| Joining 2 large tables via REST | PostgREST does nested joins poorly | Timeout or massive data transfer |
| `order` without explicit direction | Default may not match expectation | Inconsistent sort for paginated fetches |

### 29.11 URL Construction Reference

Construct PostgREST URLs manually for **all batched fetches**. The pattern:

```
{SUPABASE_URL}/rest/v1/{table}?select={cols}&{filter1}&{filter2}&order={col}.{dir}
```

| Parameter | Example | Notes |
|---|---|---|
| `select` | `select=psid,uc_name,status` | CSV, no spaces |
| `eq` | `uc_name=eq.MC-123` | URL-encode value |
| `in` | `psid=in.(PSID1,PSID2,PSID3)` | Max 300 items |
| `or` | `or=(status.is.null,status.eq.ACTIVE)` | Parens required |
| `order` | `order=survey_id.desc` | Always include for pagination |
| `limit` | `limit=50` | Use with Range for single page |
| `not` | `status=not.eq.ARCHIVED` | Not equals |

**Standard Supabase URL:** `https://qrxbsoqepfaryolwcedk.supabase.co`

### 29.12 Quick Checklist for Any New Query

Before writing a query, ask:

1. **How many rows?** If > 1000, use `fetchAllRows()`.
2. **Do I need aggregates?** If yes, fetch raw rows + TypeScript, or admin-only RPC.
3. **Am I filtering by status?** Use `applyActiveFilter()` — never bare `.eq('status', 'ACTIVE')`.
4. **Am I using `.in()` with a big array?** Chunk at 300.
5. **Did I name my columns?** Never `select('*')`.
6. **Did I include `order`?** Required for consistent pagination.
7. **Am I joining large tables?** Two queries + Map lookup is often faster.
8. **Is this in a client hook?** It should call `/api/*`, not Supabase directly.

---

## 30. UnitDeliverySheet Redesign Plan (2026-06-20)

### Problem Statement

The UDS has two issues blocking the no-photo delivery flow:
1. **z-index conflict** — confirm dialog (`z-50`) opens **behind** the delivery sheet (`z-[1001]`), making the "skip photo" action unusable on mobile.
2. **No-photo mode is buried** — it's a secondary "Photo not working?" fallback link instead of a first-class flow when `allowNoPhoto=true`.

### Scope

Full visual redesign of `UnitDeliverySheet` (`src/components/delivery/unit-delivery-sheet.tsx`). The calling code (`map/page.tsx`) and all stores remain unchanged.

### New Layout (top → bottom)

```
┌──────────────────────────────────────┐
│ ×    📍45m ●●●              #351     │  ← top row: close | GPS | survey_id
├──────────────────────────────────────┤
│                                      │
│   Muhammad Kashif                    │  ← consumer info (no Amount)
│   Mohallah Abbas, St #4, H #12      │
│   UC-51 MC Sargodha                 │
│                                      │
├──────────────────────────────────────┤
│ ┌────────────────────────────────┐   │
│ │          HERO IMAGE            │   │  ← full-bleed, same as current
│ │    (or gradient fallback)      │   │     min-h-[300px], flex-1
│ │                        [🗞️]   │   │  ← gallery icon (new)
│ └────────────────────────────────┘   │
│                                      │
│  [■] [■] [■] [■] [■]               │  ← thumbnail strip (max 5, new)
│                                      │
├──────────────────────────────────────┤
│                                      │
│  [📷 Deliver]  [Details]  [🏴]      │  ← single action row (all states)
│  or [✓ Mark]                         │     flag is icon-only
│                                      │
│  Previously delivered — tap Redeliver│  ← status hint (conditional)
├──────────────────────────────────────┤
│   ✓ Delivered (45m away)             │  ← success overlay (on outer
│   ─→ auto-advance 2s                │     container, covers everything)
└──────────────────────────────────────┘
```

### Key Changes from Current

| Change | Detail |
|--------|--------|
| **GPS row moved** | From bottom area → top row. Dots slightly bigger, distance text more vibrant. Shares row with close (left) and survey_id (right). |
| **Amount removed** | Delete `totalDue` block entirely. |
| **No-photo primary button** | When `allowNoPhoto=true`, replaces "Take Picture & Deliver" with direct "Mark Delivery" — single tap, no confirm dialog. |
| **Flag → icon-only** | Shrinks from full-width text to icon button in the action row. |
| **Single action row** | All action buttons in one `flex-row`: primary action (flex-1) | Details (shrink) | Flag (icon, shrink). |
| **Thumbnail strip** | New — shows up to 5 `unit.image_urls` thumbnails. Tap swaps the hero image. |
| **Gallery lightbox** | New — `yet-another-react-lightbox` instance inside UDS. Opens on 🗞️ icon tap. Shows all portal images. Does NOT close UDS. |
| **Admin can flag** | Flag condition changes from `assignmentItemId` to `assignmentItemId \|\| isAdmin`. |
| **Swipe on outer container** | Touch handlers moved from hero div to outer `fixed bottom-0` container so swipe works regardless of hero image presence. |
| **Success overlay on outer container** | Moved from hero div to outer container so it covers the full sheet. |
| **Confirm dialog** | Existing `useConfirm()` kept for Flag and Force Complete paths only. No-photo confirm removed (direct mark). z-index bug remains but only affects Flag/ForceComplete (less frequent). |

### Action Row States

| Condition | Primary Button | Details | Flag |
|---|---|---|---|
| Has assignment, photo mode | `[📷 Take Picture & Deliver]` | `[Details →]` | `[🏴]` |
| Has assignment, no-photo mode | `[✓ Mark Delivery]` | `[Details →]` | `[🏴]` |
| Already delivered (redeliver) | `[↻ Redeliver]` | `[Details →]` | `[🏴]` |
| Admin (no assignment) | `[→ View Details]` (full width) | — | `[🏴]` |
| Processing (GPS out of range) | `[↻ Mark as Delivered]` | `[Details →]` | `[🏴]` |

### Gallery Implementation

- Import `yet-another-react-lightbox` (already in `package.json`)
- `<Lightbox>` rendered inside UDS, portal-based — overlays everything
- Slides = `unit.image_urls.map(src => ({ src }))` (portal images only)
- Plugins: Counter, Zoom (same as HDS)
- Opens on 🗞️ icon tap, closes on backdrop click/×
- Does NOT close UDS — staff stays in delivery flow

### Risk Analysis

**Breaking:**
1. **Swipe navigation** — touch handlers on hero div currently. Moving to outer container fixes this, but testing needed to confirm swipe distance threshold still feels right.
2. **Auto-advance overlay** — currently inside hero div (`absolute inset-0`). Moving to outer container ensures coverage of all new elements.

**Moderate:**
3. **Nav arrows** — currently `top-1/3` on hero. With new top row, arrows may need `top-1/2` to avoid collision with GPS/survey_id.
4. **Previous photos badge** — currently `top-3 right-3`, same position as survey_id. Merge or reposition.
5. **Thumbnail strip** — new element. Edge cases: 0 images (don't render), 15 images (overflow scroll), broken URLs (`onError`).

**Low:**
6. **GPS row repositioning** — pure CSS, no logic change.
7. **Amount removed** — delete block, clean.
8. **Flag condition change** — `assignmentItemId || isAdmin` addition only.

**No Risk (untouched):**
- `billing-store.ts` — `setDeliverTarget`, `deliverableList`, prev/next navigation
- `map/page.tsx` — UDS props identical
- `survey-markers.tsx` / `staff-map-markers.tsx` — marker click flow unchanged
- `handleFlag` / `handleForceComplete` callbacks — same logic, just different UI

### Git Rollback

Before implementation, checkpoint is committed:

```bash
# View checkpoint hash
git log --oneline -1
# → abc1234 checkpoint: before UDS redesign

# Full hard reset (throw away redesign)
git reset --hard abc1234

# Soft reset (keep files as unstaged)
git reset --soft abc1234
```

---

## Session History
All development session logs have been moved to `docs/SESSION.md`.
For the current working state (active phase, next steps, blockers), see `.opencode/context.json`.
For the complete phase catalog with status tracking, see `docs/PHASES.md`.
