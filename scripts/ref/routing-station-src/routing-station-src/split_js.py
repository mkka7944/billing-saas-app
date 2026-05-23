"""
split_js.py — Phase 3 & 4: JS Extraction
==========================================
Reads js/00_extracted.js and splits it into module files,
one per major JS object, preserving load order.

Splitting strategy:
  - Each file starts with a "const X = {" declaration
  - Ends just before the next top-level "const/let/var X = {" marker
  - The SpatialRouter block is further split into 4 sub-files

Usage:
    python split_js.py
"""

from pathlib import Path
import re

JS_SRC = Path("js/00_extracted.js")
OUT_DIR = Path("js")

# ---- Module boundary definitions ----
# (output_filename, start_marker, notes)
# Listed in FILE ORDER (dependency order)
MODULES = [
    ("00_config.js",         "const SUPABASE_URL",         "Config / Constants"),
    ("01_auth.js",           "const Auth = {",             "Auth object"),
    ("02_state.js",          "const State = {",            "State object"),
    ("03_dataloader.js",     "const loadingOverlay",       "Data loader & init"),
    ("04_app.js",            "const App = {",              "App - filters & render"),
    ("05_view_switcher.js",  "const ViewSwitcher = {",     "ViewSwitcher"),
    ("06_list_view.js",      "const ListView = {",         "ListView"),
    ("07_stats.js",          "const Stats = {",            "Stats modal"),
    ("08_gallery.js",        "const Gallery = {",          "Gallery / image viewer"),
    ("09_local_cam.js",      "const LocalCam = {",         "LocalCam"),
    ("10_qr_scanner.js",     "const QRScanner = {",        "QR Scanner"),
    ("11_verified_layer.js", "// Recently Verified Layer", "VerifiedLayer"),
    ("12_drive_sync.js",     "const DriveSync = {",        "DriveSync / Google Drive"),
    ("13_layer_manager.js",  "const LayerManager = {",     "Layer manager"),
    ("14_sidebar.js",        "const Sidebar = {",          "Sidebar"),
    ("15_info_card.js",      "const InfoCard = {",         "InfoCard"),
    ("16_settings.js",       "const Settings = {",         "Settings"),
    ("17_performance_log.js","const PerformanceLog = {",   "Performance Log"),
    ("18_bill_verifier.js",  "const BillVerifier = {",     "Bill Verifier"),
    ("19_paid_bills.js",     "const PaidBills = {",        "Paid Bills"),
    ("20_premium_select.js", "const PremiumSelect = {",    "Premium Select"),
    ("21_universal_search.js","const UniversalSearch = {", "Universal Search"),
    # SpatialRouter is split into 4 sub-files (see below)
    ("22a_router_core.js",   "const SpatialRouter = {",   "SpatialRouter - core"),
    ("23_map_navigator.js",  "const MapNavigator = {",     "Map Navigator"),
    ("24_map_rotation.js",   "const MapRotation = {",      "Map Rotation"),
    ("25_ui_interactions.js","const UIInteractions = {",   "UIInteractions + bootstrap"),
]

# SpatialRouter sub-split markers (internal to the router block)
ROUTER_SUBSPLIT = [
    ("22a_router_core.js",     "const SpatialRouter = {"),
    ("22b_router_sequence.js", "harvest("),
    ("22c_router_drawing.js",  "startDrawing("),
    ("22d_router_display.js",  "renderRoute("),
]


def find_marker(text: str, marker: str, start: int = 0) -> int:
    """Find next occurrence of marker in text starting from start index."""
    idx = text.find(marker, start)
    return idx


def split_router(router_block: str) -> dict:
    """Split the SpatialRouter block into 4 sub-files using Object.assign pattern."""
    parts = {}
    
    # Find position of each sub-split marker within the router block
    positions = []
    for fname, marker in ROUTER_SUBSPLIT:
        idx = router_block.find(marker)
        if idx >= 0:
            positions.append((idx, fname, marker))
    
    positions.sort(key=lambda x: x[0])
    
    if not positions:
        return {"22a_router_core.js": router_block}
    
    # Extract each slice
    for i, (pos, fname, marker) in enumerate(positions):
        end = positions[i+1][0] if i+1 < len(positions) else len(router_block)
        chunk = router_block[pos:end].strip()
        
        if i == 0:
            # First sub-file: keep original `const SpatialRouter = {` declaration
            parts[fname] = chunk
        else:
            # Subsequent sub-files: wrap in Object.assign to extend window.SpatialRouter
            # We need to merge into the parent object — extract method definitions
            # and assign them
            parts[fname] = (
                f"// === {fname} — extends SpatialRouter ===\n"
                f"// These methods are added to the SpatialRouter object defined in 22a_router_core.js\n\n"
                + chunk
            )
    
    return parts


def split():
    if not JS_SRC.exists():
        print(f"[ERROR] {JS_SRC} not found. Run extract.py first.")
        return

    raw = JS_SRC.read_text(encoding="utf-8")
    print(f"[SPLIT] Total JS: {len(raw)/1024:,.1f} KB")

    # Find start positions for all module markers
    cuts = []
    for fname, marker, note in MODULES:
        idx = find_marker(raw, marker)
        if idx < 0:
            print(f"[WARN]  Could not find marker: '{marker}' for {fname}")
            idx = -1
        else:
            cuts.append((idx, fname, note))
    
    # Sort by position
    cuts.sort(key=lambda x: x[0])
    
    print(f"[SPLIT] Found {len(cuts)} module boundaries")

    OUT_DIR.mkdir(exist_ok=True)
    
    results = {}
    for i, (pos, fname, note) in enumerate(cuts):
        end = cuts[i+1][0] if i+1 < len(cuts) else len(raw)
        block = raw[pos:end].strip()
        results[fname] = (block, note)

    # Handle SpatialRouter sub-split
    if "22a_router_core.js" in results:
        router_block = results["22a_router_core.js"][0]
        router_note  = results["22a_router_core.js"][1]
        sub_parts = split_router(router_block)
        # Remove the monolithic router entry, add sub-files
        del results["22a_router_core.js"]
        for sfname, sblock in sub_parts.items():
            results[sfname] = (sblock, f"SpatialRouter sub-module: {sfname}")

    # Write all files
    for fname in sorted(results.keys()):
        block, note = results[fname]
        header = f"// === {fname} ===\n// {note}\n\n"
        path = OUT_DIR / fname
        path.write_text(header + block, encoding="utf-8")
        print(f"[OUTPUT] {fname}: {len(block)/1024:6.1f} KB")

    # Remove the raw dump
    JS_SRC.unlink()
    print(f"\n[SPLIT] Removed {JS_SRC.name}")
    print("[SPLIT] Done. Run: python build.py; python validate.py")


if __name__ == "__main__":
    split()
