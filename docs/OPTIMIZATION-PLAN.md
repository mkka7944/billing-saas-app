# Optimization Plan — Filters, Staff Data Access & HDS

> Generated 2026-06-15 after office session (Performance Optimization + Bug Fix Audit).
> Last updated: 2026-06-16 (Plan S scrapped, current state reviewed).
> Author: AI analysis based on full codebase audit.

---

## Table of Contents

1. [Filter System: Why MC/UC/City Filters Break for Staff](#1-filter-system-why-mcuc-city-filters-break-for-staff)
2. [Plan S: Staff Sees All Data + Own Assignments](#2-plan-s-staff-sees-all-data--own-assignments)
3. [Plan F: Streamline Filters (Desktop + Mobile, Admin + Staff)](#3-plan-f-streamline-filters-desktop--mobile-admin--staff)
4. [HDS Analysis & Improvements](#4-hds-analysis--improvements)
5. [Recommended Implementation Order](#5-recommended-implementation-order)

---

## 1. Filter System: Why MC/UC/City Filters Break for Staff

### 1.1 Root Cause

Staff's map renders `<StaffMap>`, not `<MapView>`. The `DesktopFilterBar` is visible in the AppShell but writes to `FilterState` which **nobody reads for staff data**. Staff data comes from `useStaffAssignment()` → `GET /api/assignments?staff_id=...`, completely bypassing the survey filter pipeline (`useSurveyData()` → `GET /api/surveys`). The filter bar is a ghost — it looks interactive but does nothing.

Additionally, in `AppShell.tsx:28-33`, staff are force-overridden to their `assignedCity` on every render:

```ts
if (roleName === 'field_staff' && assignedCity && selectedCity !== assignedCity) {
  setCity(assignedCity, ...)  // runs every render, reverts any user change
}
```

This means staff can never browse another city even if they wanted to.

### 1.2 Admin-Specific Issues

For admins, the MC/UC/city filters work through the standard pipeline (`FilterState → useSurveyData → GET /api/surveys → survey-repository.ts`), but have several issues:

- **`selectedCity`** sets `districts[]` + `tehsils[]` implicitly, but `DataInsight` only reads `[0]` of each array — multi-select geography doesn't propagate
- **UC multi-select** uses `setPendingFilter` (batch commit pattern) while every other filter uses `setFilters` (instant apply) — inconsistent UX
- **Many API routes don't accept `ucs[]`** — assignments, charts, billing-stats only use single UC or ignore it entirely
- **`unitType` is dead** — defined in `FilterState`, but no UI renders it and Zod silently drops it
- **`overdue` payment status is dead** — shown in UI dropdown, but server ignores it (`survey-repository.ts` only handles `paid`/`unpaid`)
- **Search doesn't match PSID** — staff naturally searches by PSID but the ILIKE only covers `consumer_name` and `survey_id`
- **`billMonth` defaults differently** — FilterState defaults to `currentMonth()`, but Zod schema defaults to `''` (converted server-side). Works but confusing.

### 1.3 Two-Copy Pattern Inconsistency

The store maintains `filters` (committed) and `pendingFilters` (draft), but the split is inconsistent:

| Control | Writes to | Pattern |
|---------|-----------|---------|
| Search input | `setFilters()` | Instant apply |
| Sort selector | `setSortConfig()` | Instant apply |
| Payment status | `setFilters()` | Instant apply |
| Bill month | `setFilters()` | Instant apply |
| UC multi-select | `setPendingFilter()` | Batch commit |
| Mobile filter sheet | `setPendingFilter()` auto-applied | Mixed |

Desktop bar mixes both patterns — confusing for users. Mobile sheet has no explicit "Apply" or "Cancel" button, making it unclear when changes take effect.

### 1.4 Complete Employee Behavior Summary

| Role | Map Content | Filter Bar Effect | City Switcher |
|------|------------|-------------------|---------------|
| Admin | All units via `MapView` | Works | Full control |
| Staff | Assigned items via `StaffMap` | **Ghost — does nothing** | **Overridden every render** |

---

## ~~2. Plan S: Staff Sees All Data + Own Assignments~~ SCRAPPED 2026-06-16

> **Decision: Not worth the risk.** StaffMap stays separate. Swapping map instances on mode switch is fast, and staff rarely switches modes. Risk of breaking marker clicks, fly-to behavior, and GPS marker outweighs marginal benefit of avoiding a 1-second map reset.

### Concept: Unified Map with Role-Specific Layers

Replace the dual-map approach (StaffMap vs MapView) with a **single map** for everyone. Staff get:

- All survey markers (to browse/consult other MCs)
- Their assignment markers **overlaid** with status colors + pulse ring
- Their delivery sheet still works from marker taps
- CitySwitcher lets them browse other cities (chevron stays hidden if `assignedCity` is set, but shows options)

### S.1 — Unified MapPage

**File:** `src/app/map/page.tsx`

Remove the `roleName === 'field_staff' ? <StaffMap> : <MapView>` branch. Always render `<MapView>` as the single map component. The `StaffMapMarkers` layer replaces `StaffMap`.

**Change:**
```tsx
// Before:
{roleName === 'field_staff' ? (
  <StaffMap items={staffItems} />
) : (
  <MapView />
)}

// After:
<MapView />
{/* StaffMarkerLayer renders inside MapView */}
```

### S.2 — StaffMarkerLayer

**New component** inside `MapView` (or as sibling). Only renders when `roleName === 'field_staff'`. Reads from `useStaffAssignment` and renders `CircleMarker`s on top of the full survey markers.

**Note:** `SurveyMarkers` already supports admin markers with pulse ring for selected target. `StaffMarkerLayer` adds the status-colored assignment markers (blue=pending, green=delivered, amber=processing) as an additional overlay.

### S.3 — Remove Forced City Override

**File:** `src/app/layout/AppShell.tsx`

Remove the continuous `setCity()` override for staff. Instead, set city once on mount. Allow staff to browse other cities via CitySwitcher. The chevron stays hidden if `assignedCity` is set, but the dropdown shows their city + "All Cities" option.

### S.4 — Keep Deliver Page Unchanged

The `/deliver` page stays as-is — staff sees only their assigned items in list form. The map becomes the "browse all + see your pins" view.

### S.5 — Delete Dead Map Files

Delete `staff-map.tsx` and `staff-map-markers.tsx` once their functionality is merged into `MapView`/`StaffMarkerLayer`.

### Effort: ~1 hour

---

## 3. Plan F: Streamline Filters (Desktop + Mobile, Admin + Staff)

### 3.1 Industry Standard

Consumer apps (Uber Eats, Google Maps, Zillow, Airbnb):
- **Single copy of filter state** — Changes either apply immediately or through a single "Apply" button at the top level. Never a mix within the same panel.
- **Mobile = slide-up bottom sheet** with all filters in one scrollable panel, one "Show Results" button.
- **Desktop = collapsible panel** or top bar with dropdowns.
- **Active filter chips** below the bar showing what's applied. Tap to clear a single chip.
- **URL-based filter state** — filters encoded in URL params (shareable, back-button-friendly).

### 3.2 Our App vs Industry Standard

| Dimension | Industry | Our App | Gap |
|-----------|----------|---------|-----|
| Filter state copies | 1 | 2 (`filters` + `pendingFilters`) | Over-engineered, inconsistently applied |
| Mobile Apply button | Yes, explicit | No — changes auto-apply without user intent | Confusing |
| Filter chips | Yes (always visible) | No | No at-a-glance summary |
| URL persistence | Yes | No (Zustand store only) | Lost on refresh |
| UC list rendering | 1 component | 2 copies (DesktopFilterBar + FilterPanelInner) | Duplicated code |
| Dead filters | None | `unitType`, `overdue` | Clutter |

### 3.3 Implementation Steps

#### F.1 — Eliminate `pendingFilters`

Remove the two-copy filter state. UC multi-select becomes instant-apply via `setFilters` (same as every other filter). Remove `applyFilters()`, `cancelFilters()`, `setPendingFilter()` from store.

Rationale: the batch-commit pattern added complexity with no real UX benefit when all other filters are instant. If users batch-select UCs, React Query deduplicates concurrent requests anyway.

**Files changed:**
- `src/stores/billing-store.ts` — remove pendingFilter actions, simplify to single filter state
- `src/components/filter-panel.tsx` — replace `setPendingFilter()` calls with `setFilters()`
- All consumers that imported `applyFilters`/`cancelFilters`/`setPendingFilter`

#### F.2 — Remove Dead Fields

- Delete `unitType` from `FilterState`, `defaultFilters`, `useSurveyData`, and `surveys/route.ts`
- Delete `'overdue'` from payment status UI dropdown options (keep type for future but hide UI)
- Remove `surveyQuerySchema` reference to `unitType`

#### F.3 — Add PSID to Search

In `survey-repository.ts`, the search ILIKE currently covers `consumer_name` and `survey_id`. Add `psid`:

```ts
or(consumer_name.ilike.%${q.search}%,survey_id.ilike.%${q.search}%,psid.ilike.%${q.search}%)
```

#### F.4 — Active Filter Chips

Component below the filter bar (desktop) or inside the mobile sheet header showing current filters as chips:

```
[Sargodha ×] [MC-25 ×] [MC-26 ×] [Paid ×] [Surveyor: Ahmed ×] [Clear all]
```

Tap × to clear that specific filter. "Clear all" resets to defaults. Always visible so user knows what's applied without expanding the filter panel.

#### F.5 — Unify UC List

Extract the MC/UC tree multi-select into a single shared component `uc-selector.tsx`. Used by both `DesktopFilterBar` and `MobileFilterSheet`. Eliminates the two virtually identical copies.

Current duplication:
- `filter-panel.tsx:95-215` (FilterPanelInner — UC section)
- `filter-panel.tsx:310-375` (DesktopFilterBar — UC section)

#### F.6 — Mobile Filter Sheet Gets "Show Results" Button

MobileFilterSheet changes to hold a **local copy** of filter state. User adjusts controls (UCs, surveyor, etc.) in the local copy. "Show Results" commits local copy to the store. Cancel discards the local copy.

Only affects mobile sheet — desktop bar stays as instant-apply.

#### F.7 — CitySwitcher "Browse All" for Staff

Staff with `assignedCity` see their city + "All Cities" option in CitySwitcher. Clicking "All Cities" clears the forced city filter and shows the full map. The chevron stays disabled but the dropdown is functional.

Requires S.3 to be done first (remove the continuous override).

#### F.8 — Verify uc[] Array Across All API Routes

Audit every API route that accepts `uc` parameter:

| Route | Current | Should Be |
|-------|---------|-----------|
| `GET /api/surveys` | ✅ `ucs[]` array | ✅ Already correct |
| `GET /api/data-insight` | ❌ Single `uc` only | ✅ Convert to `ucs[]` |
| `GET /api/billing-charts` | ❌ No `uc` filter | Should accept optional `ucs[]` |
| `GET /api/billing-stats` | ❌ No `uc` filter | Should accept optional `ucs[]` |

### Effort: ~3.5 hours

---

## 4. HDS Analysis & Improvements

### 4.1 Current Architecture

The HouseDetailSheet opens from:
- Map marker → UnitDeliverySheet → "View Details" → HDS
- Data Insight drill-down → tap row → HDS
- Survey list → tap row → HDS
- Delivery sheet → "View Details" → HDS

### 4.2 API Calls per Open

When HDS opens for a single unit:

| # | Call | Hook | staleTime | Approx |
|---|------|------|-----------|--------|
| 1 | `GET /api/surveys?survey_id=X` | `useSurveyById` | 5min | 200ms |
| 2 | `GET /api/surveys/payments?psid=X` | `useSurveyPayments` | 5min | 300ms |
| 3 | `GET /api/surveys/X/bill-info` | `useSurveyBillInfo` | 5min | 150ms |
| 4 | `GET /api/house-detail/extra?survey_id=X` | `useHouseDetailExtra` | depends | 200ms |
| 5 | Drive images from GAS | direct fetch | none | 500ms+ |

**Total: 4-5 API calls + external image fetch per unit.** Each navigation to a new unit fires all of these again.

### 4.3 Sections Currently Rendered

The HDS renders all sections expanded simultaneously:

| Section | Content | Data Source |
|---------|---------|-------------|
| **Header** | Consumer name, address, survey_id, psid, current bill amount | `useSurveyById` |
| **Bill Summary** | Bill number (N/M), route name, paid months, current month status | `useSurveyBillInfo` |
| **Payment History** | 24-month rolling history with paid/unpaid badges | `useSurveyPayments` |
| **Delivery History** | Past delivery photos timestamps | `useHouseDetailExtra` |
| **Issues** | Flagged entries for this PSID | `useHouseDetailExtra` |
| **Portal Images** | Photos from survey portal | `image_urls` column |
| **Drive Images** | Delivery photos via GAS webhook | Direct fetch |

### 4.4 Issues Found

| # | Issue | Severity |
|---|-------|----------|
| 1 | `houseListSurvey` reuse bypasses call #1, but calls #2-4 always fire fresh per unit — no compound endpoint | Medium |
| 2 | `params.set('psid', psid)` doesn't URL-encode — prefixed PSIDs like `SWMC-SGD-...` can produce malformed URLs | **High** |
| 3 | Drive images fetch direct from GAS — no proxy, no caching, no stale-while-revalidate | Medium |
| 4 | All sections expanded by default — visually overwhelming for units with 24 months of history | Low |
| 5 | Portal images and Delivery photos in separate tabs — confusing, user has to switch to see all photos | Low |
| 6 | No section-level loading skeletons — whole sheet appears at once or not at all, blank flash | Medium |
| 7 | `nextHouse`/`prevHouse` navigation re-fetches everything — no prefetching of adjacent units | Low |

### 4.5 Implementation Steps

#### ~~H.1 — Compound Endpoint (High Impact)~~ ✅ COMPLETED

~~Create `GET /api/house-detail/:survey_id` that returns survey data + payments + bill-info + extra data in one server-side call. Server runs `Promise.all` for independent sub-queries. Reduces 4 API calls → 1. Creates `useHouseDetail(surveyId)` hook that replaces `useSurveyById` + `useSurveyPayments` + `useSurveyBillInfo` + `useHouseDetailExtra` for the HDS context.~~

Implemented: Added `surveyData` to existing `GET /api/house-detail/extra` response. Removed `useSurveyById` from HDS. Drive photos separated into independent `useDrivePhotos` hook (non-blocking).

#### ~~H.2 — Collapsible Sections~~ ✅ COMPLETED (inline accordion)

Payment History uses `PaymentHistoryCard` with collapsible "View All / Show Less" (3 items preview, rest expandable).

#### ~~H.3 — Unified Gallery~~ ✅ COMPLETED

Portal images + drive photos + delivery photos in a single 3-column grid with source badges. Gallery accordion: first 3 images visible, "Show all (X more)" expands inline.

#### H.4 — Section-Level Skeletons

Each collapsible section gets its own skeleton when collapsed state flips:
- Summary: 3 shimmer lines
- Payment History: 8 rows of shimmer table
- Delivery History: 4 skeleton cards
- Gallery: 6 square shimmer blocks

#### H.5 — Proxy Portal Images Through Server

Extend the existing `/api/delivery/photo/:fileId` proxy pattern to portal images too. Portal images from `image_urls` are Drive thumbnail URLs — serve them through the same proxy endpoint with 24h `Cache-Control` header.

#### H.6 — URL-Encode PSID

In `src/app/api/surveys/payments/route.ts`:
```ts
params.set('psid', encodeURIComponent(psid))
```

#### H.7 — Prefetch Adjacent on Navigation

When `nextHouse`/`prevHouse` navigates, prefetch the next unit's data in the background. When user taps again, the data is cached. Uses React Query `prefetchQuery` with the same `queryKey` pattern.

### Effort: ~3.5 hours

---

## 5. Recommended Implementation Order

| Priority | Plan | Steps | Est. Time | Impact | Status |
|----------|------|-------|-----------|--------|--------|
| P0 | H.6 — URL-encode PSID | 1 step | 5m | **Critical bug fix** | 🔴 Not started (deferred) |
| P0 | H.1 — Compound HDS endpoint | 1 step | 1h | 75% fewer API calls per HDS open | ✅ **Completed** |
| ❌ | **S** — Staff sees all data | S.1-S.5 | 1h | Scrapped — risk > benefit | ❌ **Scrapped** |
| P2 | **F** — Filter streamlining | F.1-F.8 | 3.5h | Removes dead complexity, unifies roles | 🟡 F.2 done |
| P4 | H.2-H.5 — HDS UX | 4 steps | 1.5h | Polished, fast HDS | 🟡 H.2/H.3 done, H.4/H.5 pending |
| P5 | H.7 — HDS prefetch | 1 step | 45m | Instant navigation feel | 🔴 Not started |

### Quick Wins (can be done in parallel)

- ✅ **F.2** — Remove dead fields (`unitType`, `overdue`) — **done (2026-06-16)**
- ✅ **Floating search** — Changed to instant-apply (no longer uses `pendingFilters`) — **done (2026-06-16)**
- ✅ **H.1** — Compound HDS endpoint — **done (2026-06-16)**
- ✅ **H.3** — Unified gallery — **done (2026-06-16)**
- **F.3** — Add PSID to search — 10m, no risk
- **H.6** — URL-encode PSID — 5m, critical bug (deferred)
- ❌ **S.1 + S.2** — Unified MapPage — scrapped
