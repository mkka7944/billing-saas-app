"""
Routing Station Pro — validate.py
=====================================
Automated validation script. Checks that the assembled index.html
contains all expected functions, IDs, and CSS classes.

Usage:
    python validate.py [path/to/index.html]

If no path is given, defaults to local_test_server/index.html.
"""

import sys
import re
from pathlib import Path

TARGET = Path(r"F:\qoder\billing-system\local_test_server\index.html")
if len(sys.argv) > 1:
    TARGET = Path(sys.argv[1])

ORIGINAL = Path(r"F:\qoder\billing-system\local_test_server\index.html")

# ---- All functions / objects that MUST exist in the output ----
REQUIRED_JS_SYMBOLS = [
    # Auth
    "const Auth =", "logout(", "updateUI(", "toggle()",
    # State
    "const State =", "raw_data", "quickFilters",
    # App
    "const App =", "apply(", "initMap", "initFilters", "resetFilters",
    "toggleLayer", "toggleFilterGroup", "getSelectedMCUC",
    "onDistChange", "onTehsilChange", "updateSurveyors",
    "bindCustomTooltip",
    # ViewSwitcher
    "const ViewSwitcher =", "toList", "toMap",
    # ListView
    "const ListView =", "jumpFromMap", "showOnMap", "jumpToID",
    # Stats
    "const Stats =",
    # Gallery
    "const Gallery =", "updateTransform", "onStart", "onEnd",
    # LocalCam
    "const LocalCam =",
    # QRScanner
    "const QRScanner =", "onScanSuccess",
    # VerifiedLayer
    "const VerifiedLayer =", "focusHouse", "renderConnection",
    "renderLayer", "toggleAudit", "renderItem",
    # DriveSync
    "const DriveSync =", "compressImage", "renderPreview",
    # LayerManager
    "const LayerManager =", "renderSettingsUI", "naturalSort",
    # Sidebar
    "const Sidebar =", "syncRoutingOverlay",
    # InfoCard
    "const InfoCard =",
    # Settings
    "const Settings =", "fetchGlobalVerifications", "renderVerificationStats",
    # PerformanceLog
    "const PerformanceLog =",
    # BillVerifier
    "const BillVerifier =",
    # PaidBills
    "const PaidBills =", "renderAnalyticPanels",
    # PremiumSelect
    "const PremiumSelect =",
    # UniversalSearch
    "const UniversalSearch =", "performSearch",
    # SpatialRouter (core)
    "const SpatialRouter =", "dumpDiagnostics", "saveSnapshot", "undo(", "redo(",
    # SpatialRouter (sequence)
    "harvest(", "addToSequence", "removeFromSequence", "setStart", "setEnd",
    "autoNumber", "sortByID", "simpleOptimize", "reverseSequence",
    # SpatialRouter (drawing)
    "startDrawing", "finishDrawing", "cancelDrawing", "saveRoute", "loadRoutes",
    "importRouteFile", "isPointInPoly",
    # SpatialRouter (display)
    "renderRoute", "renderDisplayLayer", "highlightMarker", "showMarkerCard",
    "renderSavedList", "toggleRoutePager", "refreshMapMarkers",
    # MapNavigator
    "const MapNavigator =",
    # MapRotation
    "const MapRotation =",
    # UIInteractions
    "const UIInteractions =", "setupDraggable", "toggleExtraCtrls",
]

REQUIRED_CSS_CLASSES = [
    # Markers
    "marker-verified-square", "marker-ghost", "marker-ghost-focused",
    "verified-conn-line", "route-marker-square", "route-marker-pool-dot",
    # Layout
    "sidebar", "filter-group", "multi-option",
    # Modals
    "modal-content", "modal-header",
    # Routing
    "routing-panel", "route-pager",
]

REQUIRED_HTML_IDS = [
    "map", "sidebar", "f-dist", "f-tehsil", "f-mc", "f-verified-mc",
    "lv-content", "lv-search-id", "routing-station-overlay", "route-list",
    "user-session", "zoom-level-text", "stat-count", "f-start", "f-end",
    "auth-status", "btn-verify-house", "btn-nav-toggle",
]


def check(content, items, label):
    missing = []
    for item in items:
        if item not in content:
            missing.append(item)
    if missing:
        print(f"\n[FAIL] {label} — {len(missing)} MISSING:")
        for m in missing:
            print(f"       ✗ {m}")
        return False
    else:
        print(f"[PASS] {label} — all {len(items)} items present.")
        return True

def main():
    if not TARGET.exists():
        print(f"[ERROR] File not found: {TARGET}")
        sys.exit(1)

    content = TARGET.read_text(encoding="utf-8")
    size_kb = len(content) / 1024
    print(f"\n[VALIDATE] {TARGET}")
    print(f"           Size: {size_kb:,.1f} KB  |  Lines: {content.count(chr(10)):,}")
    print("=" * 60)

    results = []
    results.append(check(content, REQUIRED_JS_SYMBOLS, "JS Symbols"))
    results.append(check(content, REQUIRED_CSS_CLASSES, "CSS Classes"))
    results.append(check(content, REQUIRED_HTML_IDS, "HTML IDs"))

    print("\n" + "=" * 60)
    if all(results):
        print("[VALIDATE] OK: All checks passed. Build is valid!")
    else:
        print("[VALIDATE] FAIL: Validation FAILED. Fix missing items before proceeding.")
        sys.exit(1)

if __name__ == "__main__":
    main()
