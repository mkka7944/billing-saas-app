"""
Routing Station Pro — build.py
===============================
Assembles modular JS + CSS files into a single self-contained index.html.
Output is written to: local_test_server/index.html
"""

import os
import shutil
import sys
import json
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent
TEMPLATE = BASE_DIR / "templates" / "index.html.jinja"
JS_DIR = BASE_DIR / "js"
CSS_DIR = BASE_DIR / "css"
LOCAL_TEST_SERVER = BASE_DIR.parent / "local_test_server"
DEPLOY_TARGET = Path("F:/Routing-Station-Pro")
OUTPUT_FILE = LOCAL_TEST_SERVER / "index.html"

def read_dir(directory, extension):
    files = sorted(directory.glob(f"*.{extension}"))
    parts = []
    for f in files:
        content = f.read_text(encoding="utf-8-sig")
        parts.append(f"\n/* === {f.name} === */\n" + content if extension == "css"
                     else f"\n// === {f.name} ===\n" + content)
        print(f"  [+] {f.name} ({len(content):,} chars)")
    return "\n".join(parts)

def build():
    print("\n[BUILD] Billing Station Pro")
    print("=" * 48)

    if not TEMPLATE.exists():
        print(f"[ERROR] Template not found: {TEMPLATE}")
        sys.exit(1)
    html = TEMPLATE.read_text(encoding="utf-8")

    print("\n[CSS]")
    css_bundle = read_dir(CSS_DIR, "css") if CSS_DIR.exists() and any(CSS_DIR.glob("*.css")) else "/* CSS */"

    print("\n[JS]")
    js_bundle = read_dir(JS_DIR, "js") if JS_DIR.exists() and any(JS_DIR.glob("*.js")) else "// JS"

    html = html.replace("/* __CSS_BUNDLE__ */", css_bundle)
    html = html.replace("// __JS_BUNDLE__", js_bundle)

    # Load saved_routes
    saved_routes_dir = BASE_DIR.parent / "01_Local_Engine" / "scripts" / "saved_routes"
    routes_data = {}
    if saved_routes_dir.exists():
        for rf in sorted(saved_routes_dir.glob("*.json")):
            try:
                with open(rf, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    routes_data[rf.stem] = data
            except:
                pass
    html = html.replace("% saved_routes %", json.dumps(routes_data, ensure_ascii=False))
    print(f"  [+] Saved routes: {len(routes_data)}")

    # Count actual data chunks
    data_chunks = list(LOCAL_TEST_SERVER.glob("data_part*.json"))

    actual_chunk_count = len(data_chunks)
    if actual_chunk_count == 0:
        actual_chunk_count = 1
    
    # Replace placeholders
    html = html.replace("%dev_mode%", "")
    html = html.replace("[% data_version %]", f"v{datetime.now().strftime('%Y.%m.%d.%H%M')}")
    html = html.replace("% data_version %", f"v{datetime.now().strftime('%Y.%m.%d.%H%M')}")
    html = html.replace("% kml_metadata %", "{}")
    html = html.replace("% data_chunks_count %", str(actual_chunk_count))

    LOCAL_TEST_SERVER.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"\n[OUTPUT] {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size / 1024:,.1f} KB)")

    # 1. Copy standard PWA assets
    assets = ["manifest.json", "sw.js", "icon-512.png", "icon-192.png"]
    for asset in assets:
        src = BASE_DIR / asset
        if src.exists():
            shutil.copy(src, LOCAL_TEST_SERVER / asset)
            if DEPLOY_TARGET.exists():
                shutil.copy(src, DEPLOY_TARGET / asset)
            print(f"  [+] {asset}")

    # 2. Sync Roles Database (CRITICAL for Auth)
    roles_src = BASE_DIR.parent / "01_Local_Engine" / "scripts" / "roles.json"
    if roles_src.exists():
        shutil.copy(roles_src, LOCAL_TEST_SERVER / "roles.json")
        if DEPLOY_TARGET.exists():
            shutil.copy(roles_src, DEPLOY_TARGET / "roles.json")
        print(f"  [+] roles.json (Synced from Engine)")

    # 3. Deploy Main HTML
    if DEPLOY_TARGET.exists():
        shutil.copy(OUTPUT_FILE, DEPLOY_TARGET / "index.html")
        print(f"[DEPLOY] Assets & HTML copied to {DEPLOY_TARGET}")

    print("\n[BUILD] Done.\n")

if __name__ == "__main__":
    build()