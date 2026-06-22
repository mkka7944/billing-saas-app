# Live Monitoring — Implementation Plan

> Last updated: 2026-06-18
> Status: Phase 1 complete, Phase 2 pending (start tomorrow morning)
> Effort: Phase 1 ~3 hours (done), Phase 2 ~2 hours (pending)

---

## 1. Overview

Live Monitoring lets admins see what field staff are doing **right now**, all in one place. It has two parts:

**Phase 1 — Delivery Trail (DB only, no phone changes needed)**
- A new "Live Monitoring" sidebar item (admin only)
- Opens the same map page in a new "Live" view
- Survey markers hide, Delivery Trail dots appear (green/red/amber circles showing today's deliveries)
- A right-side panel with KPIs, city/UC breakdown, staff list with stats, and live activity feed
- Everything comes from existing database tables — no new data sources, no changes to staff phones

**Phase 2 — Staff Positions (requires phone GPS reporting)**
- Adds a `staff_locations` table + staff-side location reporter
- Per-staff GPS toggle in the panel (off by default)
- When toggled ON, a blue dot with the staff's first name appears on the map
- "Last seen" timestamps track freshness

---

## 2. Sidebar & Navigation

### New sidebar item

Add to the **Administration** group (admin/super_admin only), below "Delivery Stats":

```
ADMINISTRATION
  Assignments
  Routes
  Delivery Stats       → /stats
  Live Monitoring      → NEW: isView = true, icon = Radio (or Activity)
```

**How it works:**
- `isView: true` → clicking sets `activeView = 'live'` and routes to `/map`
- Same pattern as Dashboard and Data Insight
- Only visible for `admin` and `super_admin` roles

### Icon choice

Use `Radio` icon from lucide-react (broadcast symbol — industry standard for live monitoring).

---

## 3. Page Layout (`/map` when `activeView === 'live'`)

### What changes when entering Live view

| Element | Normal map | Live view |
|---------|-----------|-----------|
| Survey markers | ✅ Visible | ❌ Hidden |
| Filter bar | ✅ Visible | ❌ Hidden |
| Floating actions | Search, Filters, Satellite, Mode, Photos | Satellite toggle + Panel collapse |
| Delivery Trail dots | ❌ Hidden | ✅ Visible |
| Staff Position dots | ❌ Hidden | ✅ Per-staff toggle (off by default) |
| Map center / zoom | User's last position | Sargodha default, city dropdown centers map |
| HDS / Delivery sheet | ✅ Works normally | ❌ Blocked (cannot open from Live view) |

### Entering/exiting Live

**Enter:**
1. Click "Live Monitoring" in sidebar → `setView('live')` → `activeView === 'live'`
2. `setView` clears `selectedHouseId` (same as stats/data-insight)
3. Survey markers component sees `activeView === 'live'` and renders nothing
4. Delivery Trail component mounts and starts polling
5. Live panel opens on the right side
6. Floating actions switch to Live mode (satellite + collapse only)

**Exit:**
- Click Close (X) button in panel header → `setView('map')` → returns to normal map
- Click another sidebar item (Map, List, Dashboard) → normal view switching
- On exit: stop polling, clear live state, show survey markers again

### What renders on the map page

In `map/page.tsx`, add after the `activeView === 'data-insight'` block:

```
{activeView === 'live' && (
  <>
    <LiveDeliveryTrail />       // Delivery markers on map
    <StaffPositionLayers />     // Blue dots (only for toggled staff)
    <LivePanel />               // Right-side panel
    {/* No HDS, no delivery sheet — blocked in live mode */}
  </>
)}
```

Map container stays visible (same as stats/data-insight which use absolute overlay). The map shows beneath the panel.

---

## 4. Live Panel (Right Side)

### Wireframe

```
┌─────────────────────────────────────┐
│ 🔴 LIVE                  [🗕] [X]  │ ← Header
├─────────────────────────────────────┤
│ Delivered: 342     Rate: 89%        │ ← Summary KPI
│ Active staff: 14/70                 │
├─────────────────────────────────────┤
│ [City ▼] Sargodha                   │ ← Dropdown centers map
├─────────────────────────────────────┤
│ Sargodha  ████████░ 210  91% ●●●●● │ ← City rows (read-only)
│ Bhalwal   ███████░░  89  88% ●●○○○ │   ● = GPS reporting
│ Khushab   █████████  43  92% ●●●●○ │   ○ = offline
├─────────────────────────────────────┤
│ UC CARDS (Sargodha)              ▼ │ ← Collapsed by default
│ MC-25   45/58  delivered  | 78%  → │   Shows UC, assigned,
│ MC-26   38/52  delivered  | 73%  → │   delivered count, rate
│ MC-27   27/42  delivered  | 64%  → │
├─────────────────────────────────────┤
│ STAFF (Sargodha)                    │ ← Filtered to selected city
│ Name        A   D   P  Rate GPS    │
│ ● Ali Ahmed  43  42  1  98%  [○]   │
│ ○ Usman Khan 35  35  0  100% [○]   │
│ ● Sara Bibi  41  38  3  93%  [○]   │
│ ● Zahid Ali  27  25  2  93%  [○]   │
│ ...                                 │
├─────────────────────────────────────┤
│ ACTIVITY (Sargodha)                  │ ← Scrollable, newest first
│ 3:45 ✅ Ali → SWMC-SGD-001234      │
│ 3:44 ✅ Usman → SWMC-SGD-001235    │
│ 3:43 ❌ Sara  ✗ SWMC-SGD-001236   │
│ 3:42 ✅ Ali  → SWMC-SGD-001237    │
│ 3:40 ⏳ Zahid processing...        │
└─────────────────────────────────────┘
```

### Section details

#### Header
- "🔴 LIVE" badge (red dot + bold text) + panel title
- [🗕] Collapse button → panel shrinks to thin strip (more map visible)
- [X] Close button → exits Live view, returns to normal map

#### Summary KPI bar
- Total deliveries today (across all cities): "Delivered: 342"
- Overall completion rate: "Rate: 89%"
- Active staff count (GPS ping < 3min ago / total staff with today's assignment)

#### City dropdown
- Dropdown: "Sargodha", "Bhalwal", "Khushab"
- On select: centers map on that city's coordinates (from `CITY_CONFIG`)
- Panel sections (UC cards, Staff list, Activity feed) filter to selected city

#### City rows (read-only)
- One row per city, always visible
- Progress bar (visual), delivered count, rate %, online/offline dots
- Online dot = staff with GPS ping < 3min ago

#### UC Cards (collapsible)
- Collapsed by default
- User taps city row or "▼" to expand UC cards for that city
- Each UC: name, "delivered/assigned", rate %, → arrow
- Future: clicking → could zoom map to UC bounds

#### Staff list
- Filtered to selected city
- Columns: Name (with online/offline dot = GPS ping < 3min), Assigned (A), Delivered (D), Pending (P), Rate (%), GPS toggle
- GPS toggle: `[○]` = off by default, `[●]` = showing on map
- Tapping GPS toggle calls action to show/hide that staff's position dot on the map
- Scrollable — 70+ staff in Sargodha

#### Activity feed
- Filtered to selected city
- Newest delivery events first
- Format: `time` `icon` `staff_name` `→/✗/⏳` `PSID`
- Icons: ✅ delivered, ❌ missed, ⏳ processing
- Auto-scrolls to top when new event arrives
- Polls at default 60 seconds (admin-configurable via polling settings) for new events since last check
- Reads `useSettings()` for `live_polling_enabled` and `live_poll_interval` (range 10-300s)
- Only polls while `activeView === 'live'`

---

## 5. Delivery Trail (Map Markers)

### What are they
Small colored `CircleMarker`s on the map showing each delivery from today:
- **Green** = delivered
- **Red** = missed
- **Amber** = processing (GPS out of range, pending admin approval)

### Data source
`GET /api/live/delivery-trail?city=SARGODHA`

Returns today's delivery items with lat/lng + status. The endpoint:
1. Joins `daily_assignments` + `assignment_items` for today's date
2. Joins `survey_units` for lat/lng coordinates
3. Returns: `{ psid, status, delivered_at, lat, lng, staff_name, staff_id }`

### Hook
`useDeliveryTrail(city?)` — polls at admin-configurable interval (default 60s), returns array of delivery events.

Uses admin-controllable polling settings from `useSettings()` (default `refetchInterval: 60000`, min 10s). Only fetches while `activeView === 'live'`.

### Marker rendering
- Radius 4, no tooltip (too many dots)
- Semi-transparent fill (`fillOpacity: 0.6`)
- Click → brief info popup (staff name + PSID + time)
- New dots appear with a small fade-in animation (CSS transition)

### Visibility
- Survey markers are hidden in Live view → no overlap
- Delivery Trail dots always visible (no toggle needed)

---

## 6. Staff Positions (Live GPS)

### Phase 2 — requires new DB table + staff-side reporter

### New database table: `staff_locations`

```sql
CREATE TABLE staff_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'gps'
);

CREATE INDEX idx_staff_locations_staff_id ON staff_locations(staff_id);
CREATE INDEX idx_staff_locations_captured_at ON staff_locations(captured_at);
```

Auto-cleanup: delete rows older than 24 hours (could be a cron job or a trigger).

### Staff-side reporter

In `src/hooks/use-user-location.ts` (already tracks GPS for delivery), add:

When `currentPosition` updates and position changed >50m from last report:
```
POST /api/live/report-location
Body: { lat, lng, accuracy }
```

Rate-limited: max once every 60 seconds. Debounced to avoid excessive writes.

### API endpoint
`POST /api/live/report-location` — staff phone reports position.
`GET /api/live/staff-positions?city=SARGODHA` — admin fetches latest positions.

Returns: `{ staff_id, staff_name, lat, lng, last_seen, is_active }`

### Hook
`useStaffPositions(city?)` — polls every 10 seconds. Returns array of staff positions.

### Marker rendering (blue dots)
- `CircleMarker` radius 7, blue fill, blue stroke
- Pulse animation (CSS, similar to existing pulsing ring but for current location)
- **Permanent tooltip** above showing first name only (e.g., "Ali")
- Names come from `staff.full_name`, split on first space for display
- Click → popup with full name + today's stats

### Per-staff toggle
- Panel shows GPS `[○/●]` per staff row
- Click toggles visibility of that staff's dot on the map
- Store: `Set<string>` of staff IDs with GPS visible (Zustand)
- Default: empty set — no dots visible

---

## 7. Activity Feed

### Data source
Reuses the same `GET /api/live/delivery-trail` response, but also returns a `recent_activity` array with timestamps.

**Activity event shape:**
```
{
  staff_name: string,
  psid: string,
  status: 'delivered' | 'missed' | 'processing',
  delivered_at: string (ISO),
  time_label: string (e.g., "3:45 PM")
}
```

### Polling
The `useDeliveryTrail` hook returns both `{ markers, activities }`. The activity feed renders from the `activities` array, newest first.

On each poll:
- New events appended to top
- Older events beyond 50 items are trimmed
- Auto-scroll to top on new event

### Filtering
- City filter applies (activity for selected city only)
- Staff filter: future enhancement

---

## 8. KPIs (Panel Summary)

All KPIs come from the same live endpoint or can be computed client-side from the delivery trail data.

| KPI | Source |
|-----|--------|
| Total delivered today | Count of `status === 'delivered'` in delivery trail |
| Overall rate | `delivered / (delivered + missed) * 100` |
| Active staff count | Staff with GPS ping < 3min OR staff with any delivery today |
| Per-city del/rate | Filtered by city district |
| Per-UC del/rate | Filtered by UC name |
| Per-staff stats | From staff list (assigned, delivered, pending, rate) |

---

## 9. Data Source Summary

### Phase 1 (DB only)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/live/delivery-trail?city=T` | New | Returns today's deliveries + activity feed for a city |
| `GET /api/staff/stats?from=today&to=today` | Existing | Per-staff today's delivery numbers |
| `GET /api/staff` | Existing | Staff list with names and assigned cities |

### Phase 2 (+ GPS)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/live/report-location` | New | Staff phone reports GPS position |
| `GET /api/live/staff-positions?city=T` | New | Returns latest positions for all staff in a city |

---

## 10. Files to Create / Modify

### Phase 1

| File | Action | Purpose |
|------|--------|---------|
| `src/stores/billing-store.ts` | Edit | Add `'live'` to `activeView` union type; update `setView` to clear `selectedHouseId` for live |
| `src/components/layout/BillingSidebar.tsx` | Edit | Add "Live Monitoring" to Administration group with `isView: true` |
| `src/components/layout/floating-actions.tsx` | Edit | Add `activeView === 'live'` branch — hide search, filters, mode pill, photos badge; show satellite + collapse only |
| `src/app/map/page.tsx` | Edit | Add `activeView === 'live'` render branch — live panel + delivery trail + staff positions |
| `src/app/api/live/delivery-trail/route.ts` | **Create** | Returns today's deliveries + activity feed for a city |
| `src/hooks/use-delivery-trail.ts` | **Create** | Polls every 5s, returns markers + activities |
| `src/components/live/live-delivery-trail.tsx` | **Create** | Renders colored CircleMarkers for deliveries |
| `src/components/live/live-panel.tsx` | **Create** | Right-side panel with all sections |
| `src/components/live/live-staff-list.tsx` | **Create** | Staff list with stats + GPS toggle |
| `src/components/live/live-activity-feed.tsx` | **Create** | Chronological activity list |
| `src/components/live/live-uc-cards.tsx` | **Create** | Collapsible UC list |
| `src/components/live/live-summary-bar.tsx` | **Create** | KPI row at top of panel |

### Phase 2

| File | Action | Purpose |
|------|--------|---------|
| `scripts/sql/048-staff-locations.sql` | **Create** | DB migration for `staff_locations` table |
| `src/app/api/live/report-location/route.ts` | **Create** | Staff phone reports GPS position |
| `src/app/api/live/staff-positions/route.ts` | **Create** | Returns latest positions for admin |
| `src/hooks/use-staff-positions.ts` | **Create** | Polls every 10s for staff positions |
| `src/hooks/use-user-location.ts` | Edit | Add 60s periodic reporter to POST location |
| `src/components/live/staff-position-layers.tsx` | **Create** | Renders blue dots with name tooltips |
| `src/stores/live-store.ts` | **Create** | Zustand store: `liveEnabled`, `staffGpsVisible: Set<string>`, `selectedCity`, `panelCollapsed` |

---

## 11. Implementation Order

### Phase 1 — Complete (2026-06-18)

| Step | Status | Notes |
|------|--------|-------|
| Step 1: Store + Sidebar | ✅ Done | `'live'` in `activeView`, sidebar item, `live-store.ts` |
| Step 2: API endpoint — Delivery Trail | ✅ Done | `GET /api/live/delivery-trail?city=X` — queries by `delivered_at` in PKT range |
| Step 3: Hook — useDeliveryTrail | ✅ Done | React Query with admin-controllable polling (default 60s, range 10-300s) |
| Step 4: Map page — Live view render | ✅ Done | `activeView === 'live'` block in `map/page.tsx` |
| Step 5: Delivery Trail markers | ✅ Done | Green/red/amber CircleMarkers with tooltip + popup |
| Step 6: Floating actions — Live mode | ✅ Done | Greyed-out search/filters/mode/photos in live mode |
| Step 7: Live Panel + Summary bar | ✅ Done | Fixed-position panel, draggable, collapsible, KPI row |
| Step 8: UC cards | ✅ Done | Collapsible UC list, grouped by UC name |
| Step 9: Staff list | ✅ Done | Stats + GPS toggle button (wired to store, data pending) |
| Step 10: Activity feed | ✅ Done | Chronological feed, auto-scroll on new events |
| Step 11: Polish | ✅ Done | TypeScript check; drag fix; column rename (assigned_date→issued_at); PKT timezone fix |

### Phase 2 — Not started (start **tomorrow morning** — office priority)

| Step | Effort | Notes |
|------|--------|-------|
| Step 1: DB migration (048-staff-locations.sql) | ~30m | Create `staff_locations` table |
| Step 2: `POST /api/live/report-location` | ~20m | Staff phone reports GPS position |
| Step 3: `GET /api/live/staff-positions?city=X` | ~20m | Admin fetches latest per-city positions |
| Step 4: `useStaffPositions(city?)` hook | ~15m | Polls every 10s |
| Step 5: `StaffPositionLayers` component | ~25m | Blue dots + name tooltip + pulse animation |
| Step 6: Update `use-user-location.ts` | ~15m | Add 60s reporter to POST location |
| Total | ~2 hrs | |

### Phase 2 Implementation Details

See Section 6 (Staff Positions) above for full spec.

---

## 12. Critical Findings (2026-06-18 Session)

### PKT Timezone — All timestamp operations must use `src/lib/pkt.ts`

`new Date().toISOString().slice(0, 10)` returns **UTC date**, not Pakistan date. This caused "today's deliveries" to be empty for deliveries made between 12 AM and 5 AM PKT.

**Fix applied:**
- `src/lib/pkt.ts` created with `pktToday()`, `pktDayRange()`, `pktCurrentMonth()`
- `constants.ts` `today()` and `currentMonth()` now delegate to PKT helpers
- All future code must use these helpers, never raw `toISOString()`

### Delivery trail queries by `delivered_at`, not `issued_at`

The original query filtered `daily_assignments` by `issued_at` (the date the admin created the assignment). This is wrong for two reasons:
1. `issued_at` tracks assignment creation, not delivery time
2. The column was renamed from `assigned_date` but the original code still used the old name

**Fix applied:** Query `assignment_items` directly with `delivered_at` in PKT date range.

### LiveDeliveryTrail requires `dynamic(..., { ssr: false })`

React-Leaflet references `window` at module import time. Static import causes SSR crash: "window is not defined". Always use `dynamic(() => import(...), { ssr: false })`.

---

## 13. Edge Cases

| Scenario | Behavior |
|----------|----------|
| No deliveries today | Map shows empty, panel shows "0 delivered, —%", activity feed empty with "No deliveries yet today" message |
| No staff online | Staff list shows all with gray dots, GPS toggles disabled, activity feed shows last known deliveries |
| City with no data | Panel sections for that city show 0s, map center on city but empty |
| Staff has no GPS for >5 min | Dot turns gray, tooltip says "Last seen 6 min ago", panel shows gray dot |
| Poll returns error | Keep last known data, show stale indicator in panel header (small amber dot) |
| Panel collapsed | Thin strip on right edge with "LIVE" badge, tap to re-open |
| Exit live during poll | Stop polling via `refetchInterval: false` when `activeView !== 'live'`. Polling rate is admin-configurable (default 60s). |
| 70 staff all GPS toggled ON | Blue dots + name tooltips may overlap at city zoom level. Acceptable — admin zooms in or toggles per-staff. Future: clustering. |
| Mobile view | Panel becomes full-screen bottom sheet (like HDS on mobile). Map visible behind with delivery dots. |
| Staff with no today assignment | Not shown in staff list. GPS reporting still works but they appear as "no assignment today". |
