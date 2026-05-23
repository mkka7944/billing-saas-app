"""
split_css.py — Phase 2: CSS Extraction (v2)
=============================================
Reads css/06_verified.css (which holds all raw CSS from extract.py),
splits into 6 domain files using a line-by-line state machine.

Usage:
    python split_css.py
"""

import re
from pathlib import Path

CSS_SRC = Path("css/06_verified.css")  # All CSS landed here from first run
OUT_DIR = Path("css")

# Domain classification by keyword matching on selectors/comments
ROUTING_KW = [
    "route-marker", "route-pager", "routing-panel", "routing-list",
    "route-sequence", "route-badge", "route-info", "route-tab",
    "routing-station", "drawing-mode", "route-card",
    "sequence-", "spatial-", "route-dot", "pool-dot",
]
SIDEBAR_KW = [
    "sidebar", "filter-group", "filter-label", "filter-content",
    "panel-header", "multi-select", "multi-option",
    "selection-badge", "surveyor-", "quick-filter",
    ".tab-btn", ".nav-tab",
]
MARKER_KW = [
    ".marker-", ".leaflet", ".cluster", "map-marker", "pulse",
    ".route-dot", ".pool-dot", ".route-marker",
]
MODAL_KW = [
    "modal", "gallery", "image-modal", "stats-modal",
    "settings-modal", "billing-modal", "log-modal", "card-header",
    "card-content", "card-footer", "#mod-", ".mod-",
]
VERIFIED_KW = [
    "verified-conn", "verified-layer", "marker-ghost",
    "audit-", "conn-line",
]


def classify(block_text: str) -> str:
    t = block_text.lower()
    for kw in VERIFIED_KW:
        if kw in t: return "06_verified.css"
    for kw in ROUTING_KW:
        if kw in t: return "05_routing.css"
    for kw in MODAL_KW:
        if kw in t: return "04_modal.css"
    for kw in MARKER_KW:
        if kw in t: return "03_markers.css"
    for kw in SIDEBAR_KW:
        if kw in t: return "02_sidebar.css"
    return "01_base.css"


def split():
    if not CSS_SRC.exists():
        print(f"[ERROR] {CSS_SRC} not found.")
        return

    raw = CSS_SRC.read_text(encoding="utf-8")
    
    # Simple block splitter: accumulate lines until a top-level `}` closes
    # (tracks brace depth to handle nested rules like @media)
    buckets = {
        "01_base.css":     [],
        "02_sidebar.css":  [],
        "03_markers.css":  [],
        "04_modal.css":    [],
        "05_routing.css":  [],
        "06_verified.css": [],
    }

    current_block = []
    depth = 0
    
    for line in raw.splitlines():
        opens  = line.count('{')
        closes = line.count('}')
        depth += opens - closes
        current_block.append(line)
        
        if depth == 0 and current_block:
            block_str = "\n".join(current_block).strip()
            if block_str:
                target = classify(block_str)
                buckets[target].append(block_str)
            current_block = []

    # Handle any trailing block
    if current_block:
        block_str = "\n".join(current_block).strip()
        if block_str:
            buckets[classify(block_str)].append(block_str)

    total_blocks = sum(len(v) for v in buckets.values())
    print(f"[SPLIT] Total blocks: {total_blocks}")

    for fname, chunks in buckets.items():
        content = "\n\n".join(chunks)
        path = OUT_DIR / fname
        path.write_text(content, encoding="utf-8")
        size_kb = len(content) / 1024
        print(f"[OUTPUT] {fname}: {len(chunks):3d} blocks,  {size_kb:6.1f} KB")

    # Remove the raw extracted dump
    CSS_SRC.unlink()
    print(f"\n[SPLIT] Removed {CSS_SRC.name}")
    print("[SPLIT] Done. Run: python build.py && python validate.py")


if __name__ == "__main__":
    split()
