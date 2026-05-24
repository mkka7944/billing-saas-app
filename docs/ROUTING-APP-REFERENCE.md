# Routing Station Pro — Reference Document

> **Purpose**: This document captures the full architecture, features, and implementation details of the legacy Routing Station Pro app (`scripts/ref/routing-station-src/`). Our billing-saas-app is a **superset** — every feature here should be replicated natively in Next.js, then extended.

---

## 1. Architecture Overview

### 1.1 Tech Stack (Legacy)
- **Single-page app**: Jinja2 template (`index.html.jinja`) → rendered to static HTML
- **No framework**: Vanilla JS, inline event handlers (`onclick`, `onchange`), global namespaced objects
- **CSS**: Custom, CSS variables, flexbox layout, no Tailwind
- **Map**: Leaflet with CartoDB/OSM tiles
- **Auth**: Google OAuth
- **Offline**: Service Worker (network-first + cache fallback), IndexedDB for photo queue
- **Build**: Python scripts (`build.py`, `split_css.py`, `split_js.py`) inject JS/CSS bundles

### 1.2 Directory Structure
```
routing-station-src/
  index.html.jinja           — Main SPA template (1278 lines)
  style_block.css            — Combined CSS bundle (8955 lines)
  manifest.json              — PWA manifest
  sw.js                      — Service Worker
  icon-192.png / icon-512.png — PWA icons
  templates/
    index.html.jinja         — Jinja2 template
  css/
    00_extracted.css         — Primary CSS (3612 lines)
    01_base.css              — Extended CSS (4011 lines)
    02_sidebar.css           — Sidebar styles (322 lines)
    03_markers.css           — Marker/popup styles (276 lines)
    04_modal.css             — Modal overlay styles (377 lines)
    05_routing.css           — Routing panel styles (746 lines)
  js/
    01_auth.js               — Google OAuth
    02_state.js              — Application state (global `state` object)
    04_app.js                — Main controller (filters, clustering, markers)
    05_view_switcher.js      — Map/List view switching
    06_list_view.js          — List view rendering
    07_stats.js              — Staff leaderboard
    08_gallery.js            — Image lightbox
    09_local_cam.js          — Camera capture
    10_qr_scanner.js         — QR scanning
    11_verified_layer.js     — Verified surveys
    12_drive_sync.js         — Google Drive photo sync
    13_layer_manager.js      — Map tile layer management
    14_sidebar.js            — Sidebar toggle
    15_info_card.js          — Hover info card
    16_settings.js           — Settings modal
    17_performance_log.js    — Attendance log
    18_bill_verifier.js      — Bill verification iframe
    19_paid_bills.js         — Paid Analytics Hub
    20_premium_select.js     — Custom dropdown
    21_universal_search.js   — Global search
    22_router.js             — Spatial Router (routing engine)
    23_map_navigator.js      — Map marker navigation
    24_map_rotation.js       — Map rotation HUD
    25_ui_interactions.js    — Misc UI controls
    99_init.js               — App initialization
```

---

## 2. MC/UC Short Name System

### 2.1 Python Backend (`routingstation.py` — `shorten_name()`)

```python
def shorten_name(self, name, district, tehsil):
    # Step 1: Strip district/tehsil prefix
    name = name.replace(f"{district} - ", "").replace(f"{tehsil} - ", "")
    # Step 2: Khushab is NOT shortened (keeps full name)
    if district.upper() == 'KHUSHAB':
        return name.strip()
    # Step 3: Match MC-1, UC-4, Zone-2, Ward-3
    match = re.search(r'((?:MC|UC|Zone|Ward)[-\s]*\d+)', name, re.IGNORECASE)
    if match:
        val = match.group(1).upper()
        val = re.sub(r'(MC|UC|ZONE|WARD)\s*(\d+)', r'\1-\2', val)
        return val
    # Step 4: Fallback to first word
    return name.split(',')[0].strip().split()[0]
```

### 2.2 Frontend JS (`22_router.js` — `cleanMCName()`)

```javascript
cleanMCName(name) {
    if (!name) return 'Unknown Area';
    let cleaned = String(name)
        .replace(/Municipal Committee/gi, 'MC')
        .replace(/Union Council/gi, 'UC')
        .replace(/\s*(Bhalwal|Sargodha|Mianwali|Khushab|Tehsil)\s*/gi, '')
        .replace(/_Route_\d+/gi, '')
        .trim();
    const match = cleaned.match(/(MC|UC)[-\s]*(\d+)/i);
    if (match) return `${match[1].toUpperCase()}-${match[2]}`;
    return cleaned || 'Unknown Area';
}
```

### 2.3 Inline Pattern (Used Everywhere)

```javascript
const match = r[12].match(/(MC|UC)[- ]?(\d+)/i);
shortMC = match ? `${match[1].toUpperCase()}-${match[2]}` : r[12].split(' ')[0];
```

Also expands full names:
```javascript
let area = row[12]
    .replace(/Municipal Committee/gi, 'MC')
    .replace(/Union Council/gi, 'UC');
```

### 2.4 Hierarchy Storage

Short name is stored as property `'s'` in the hierarchy dict:
```python
hierarchy[district][tehsil][mcuc_name] = {
    'c': color,        # Color for this MC/UC
    's': short,        # Short name ("MC-1")
    'cnt': len(records) # Count of records
}
```

### 2.5 Filter Sorting (`04_app.js`)

MC items sorted before UC items, then numerically:
```javascript
items.sort((a, b) => {
    const aIsMC = aShort.startsWith('MC');
    const bIsMC = bShort.startsWith('MC');
    if (aIsMC && !bIsMC) return -1;
    if (!aIsMC && bIsMC) return 1;
    const aNum = parseInt(aShort.replace(/[^0-9]/g, '')) || 0;
    const bNum = parseInt(bShort.replace(/[^0-9]/g, '')) || 0;
    if (aNum !== bNum) return aNum - bNum;
    return a.l.localeCompare(b.l);
});
```

### 2.6 Key Regex (Universal)

```
/(MC|UC)[-\s]*(\d+)/i
```
Matches: `MC-1`, `MC 1`, `MC1`, `UC-4`, `UC 4`, `uc-4`
Normalized to: `MC-{N}` or `UC-{N}`

---

## 3. Filter System

### 3.1 Layout (Sidebar Accordion)

All filters use collapsible accordion groups:
```html
<div class="filter-group collapsed" data-group="district">
  <div class="panel-header-premium" onclick="App.expandFilter('district')">
    <span>Districts</span>
    <span class="arrow-icon">▶</span>
  </div>
  <div class="control-group" id="f-dist">
    <!-- checkboxes rendered here -->
  </div>
</div>
```

### 3.2 Filter Order in Sidebar
1. **Saved Routes** — List of designed routes
2. **Districts** — Multi-select checkboxes
3. **Tehsils** — Multi-select (initially collapsed)
4. **MC/UC Areas** — Multi-select with "All" / "None" quick buttons, short names shown
5. **Date Range** — Flatpickr date inputs
6. **Verified** — Admin-only search, ghost lines
7. **Surveyors** — Multi-select list
8. **Bills & Payments** — Dashboard, Verify Bill, Paid/Unpaid/Not-Billed checkboxes
9. **Boundary Layers (KML)** — Dynamic layer toggles
10. **Staff Report** — Leaderboard / Performance
11. **View & Sync** — List View toggle, Domestic/Commercial quick filters, Drive Images Only

### 3.3 Cascading Logic
- Selecting a district filters available tehsils
- Selecting a tehsil filters available MC/UCs
- "All" / "None" quick buttons per group
- Active filter count shown on collapsed header

---

## 4. Navigation System

### 4.1 Views / Stages
| ID | Type | Purpose |
|---|---|---|
| `#sidebar` | Fixed panel (320px) | Filters + tools |
| `#main-stage` | Flex-grow | Map container |
| `#list-view-stage` | Fullscreen overlay | Card-based list view |
| `#paid-dashboard-stage` | Fullscreen overlay | Analytics dashboard |
| `#routing-station-overlay` | Floating panel (380px) | Route editor |
| `#route-pager-container` | Bottom-center HUD | Route navigation |
| `#modal-marker-card` | Centered overlay | Marker detail card |
| `#gallery` | Fullscreen overlay | Image lightbox |
| `#modal-search` | Fullscreen overlay | Universal search |
| `#modal-stats` | Centered modal | Leaderboard |
| `#pinning-hud` | Bottom-center HUD | Pinpoint mode |

### 4.2 Navigation Controls
- **Desktop**: Sidebar toggle + floating control buttons
- **Mobile**: Hamburger menu → slides sidebar in from left
- **List View**: Prev/Next record + Back to Map
- **Route Pager**: Prev/Next/Skip with marker info
- **Info Card**: Floating card at top-left, click marker shows it
- **Modal**: Close button / click outside to dismiss

### 4.3 No Formal Back Button
The routing app does **not** have a dedicated back button with history stack. Navigation is view-based:
- Close modal → returns to underlying view
- Back to Map button in list view
- Sidebar toggle on mobile

---

## 5. Photo / Image Display

### 5.1 Marker Card (`#modal-marker-card`)
- Full-width image (`.marker-card-img`, 400x400 placeholder)
- Placeholder: `https://placehold.co/400x400?text=No+Structure+Image`
- Fallback: `https://placehold.co/400x400?text=Image+Load+Error`
- Surveyor info overlay on image
- Action buttons overlay with status badge
- Card gallery (`.card-gallery`): Grid of square thumbnails

### 5.2 Gallery Lightbox (`#gallery`)
- Full-screen dark overlay (z-index: 31000)
- `.gal-viewport` > `#gal-img`
- Zoom / Rotate / Reset controls
- Prev / Next navigation

### 5.3 Offline Sync Gallery
- 3-column grid of preview images
- Remove buttons per image
- Upload queue management

---

## 6. Map Integration

### 6.1 Base Map
- **Default**: CartoDB tiles (`.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png')`)
- **Satellite**: Google Satellite via `.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { subdomains: ['mt0','mt1','mt2','mt3'] })`
- Toggle via `#btn-satellite` button

### 6.2 Markers
- **Default**: Circle markers with color per MC/UC
- **Verified**: Purple square markers with "V" letter
- **Ghost lines**: Connection lines to verified locations
- **Route markers**: Numbered markers with sequence badges
- **Pulsing pin**: For pinpoint mode
- Colors stored in hierarchy: `hierarchy[district][tehsil][mcuc_name]['c']`

### 6.3 Marker Clustering
- MarkerCluster plugin for grouped display at low zoom
- Cluster colors match dominant MC/UC color

### 6.4 Map Navigation
- `#map-navigator`: Prev/Next markers with "Record X of Y"
- Highlights current marker on map
- Scrolls map to center on current

### 6.5 Floating Controls (`#extra-ctrls`)
- List View toggle
- Search button
- Map Navigator toggle
- Routing Station toggle
- Satellite toggle
- Settings
- QR Scanner

---

## 7. Mobile Responsiveness

### 7.1 Breakpoints
| Breakpoint | Behavior |
|---|---|
| `max-width: 768px` | Sidebar slides off-screen, hamburger menu shown, full-width overlays, compact filters |
| `max-width: 480px` | Smaller fonts, single-column grids |
| `max-width: 380px` | Extra compact info card |

### 7.2 Mobile-Specific Layout
- Sidebar: `transform: translateX(-100%)` → `translateX(0)` when `.open`
- Map controls: repositioned to `bottom: 90px; right: 20px`
- Info card: `width: 96%; max-height: 40vh; left: 50%; transform: translateX(-50%)`
- Filter multi-select: `max-height: 120px` scrollable
- Dashboard: single-column stats, table→cards transform
- Routing overlay: fullscreen (`left/right: 10px`)
- `.mobile-only` class for hamburger button
- Map fills entire viewport on mobile

---

## 8. CSS Architecture

### 8.1 CSS Variables (`:root`)
```css
--primary: #2563eb;
--warning: #f59e0b;
--danger: #ef4444;
--text: #1e293b;
--bg: #f8fafc;
--sidebar-w: 320px;
--spacer: 16px;
--font-xs: 11px;
--font-sm: 13px;
--font-base: 14px;
--font-md: 16px;
--font-lg: 18px;
```

### 8.2 Z-Index Stacking
| z-index | Layer |
|---|---|
| 1000 | Base map |
| 10000-20000 | Sidebar |
| 26000 | Routing station overlay |
| 30000 | Modals |
| 31000 | Gallery (highest) |

### 8.3 Layout
- `body`: `display: flex; height: 100vh; overflow: hidden`
- Sidebar: fixed 320px, collapses to 0px / slides off-screen
- Map: `flex: 1` with 100%x100% Leaflet container
- Overlays: `position: fixed; inset: 0`

---

## 9. Key Components to Replicate

### 9.1 MC/UC Short Name Utility
**Priority**: High
**Source**: `22_router.js` → `cleanMCName()`, `routingstation.py` → `shorten_name()`
**Implementation**: TypeScript function in `src/lib/mc-utils.ts`

### 9.2 Cascading Filter Bar
**Priority**: High
**Source**: `04_app.js` filter logic, sidebar accordion HTML
**Implementation**: Mobile-first dropdown selects District → Tehsil → MC/UC

### 9.3 MC/UC-Based Marker Coloring
**Priority**: Medium
**Source**: `routingstation.py` color assignment, `04_app.js` marker creation

### 9.4 Map Navigation (Prev/Next)
**Priority**: Medium
**Source**: `23_map_navigator.js`
**Implementation**: Navigation HUD with prev/next through filtered markers

### 9.5 Route Builder
**Priority**: Low (Phase A)
**Source**: `22_router.js` (950 lines)
**Implementation**: Drag-to-reorder sequence with map markers, optimize route

### 9.6 Photo Gallery / Lightbox
**Priority**: Medium
**Source**: `08_gallery.js`, marker card HTML
**Implementation**: Full-screen image viewer with zoom, rotate, navigation

### 9.7 Dashboard / Analytics
**Priority**: Low
**Source**: `19_paid_bills.js`
**Implementation**: Recovery rate, paid/unpaid stats, tehsil/UC breakdown

### 9.8 Offline Photo Queue
**Priority**: Low
**Source**: `12_drive_sync.js`
**Implementation**: IndexedDB queue → Google Drive Apps Script webhook

---

## 10. Comparison: Routing App vs Our App

| Feature | Routing App | Our App (Current) | Target |
|---|---|---|---|
| Framework | Vanilla JS + Jinja2 | Next.js 16 + React | Same |
| Map | Leaflet + CartoDB + Google | Leaflet + Google Maps | Same + satellite toggle |
| Filter UI | Sidebar accordion | Sidebar only | Mobile-first top/bottom bar |
| MC/UC Short Names | Yes (`s` property) | No (full names only) | Implement |
| Back Navigation | No formal history | Zustand views | Add history stack |
| Marker Colors | Per MC/UC (hierarchy) | Per UC (hash-based) | Same approach |
| Photos | Gallery lightbox | Placeholder | Add gallery |
| Photo Upload | Google Drive webhook | None | Add (existing infra) |
| Route Builder | Drag-to-reorder + optimize | None | Phase A |
| Offline | Service Worker + IndexedDB | None | Later |
| PWA | Manifest + SW | None | Later |
| Dashboard | Paid analytics hub | Basic KPI cards | Enhanced |
