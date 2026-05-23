"""
extract.py — Phase 1 Extractor
================================
Reads the monolithic routingstation.py and generates:
  1. templates/index.html.jinja  — HTML skeleton with placeholders
  2. css/00_extracted.css        — All inline CSS (raw dump, to be split in Phase 2)
  3. js/00_extracted.js          — All inline JS  (raw dump, to be split in Phase 3-4)

This is the FOUNDATION step. After this runs, build.py assembles
the same index.html from the extracted parts, which should be
byte-for-byte identical in content to the original.

Usage:
    python extract.py
"""

import os, sys, re
from pathlib import Path

# --- Source & Target Paths ---
MONO = Path(r"F:\qoder\billing-system\01_Local_Engine\scripts\routingstation.py")
SRC  = Path(r"F:\qoder\billing-system\routing-station-src")

JS_DIR  = SRC / "js"
CSS_DIR = SRC / "css"
TPL_DIR = SRC / "templates"

# ---------------------------------------------------------------------------
# Step 1: Run the original routingstation.py to get the *generated* HTML
# We import and call it in-process so we don't have to deal with escaping.
# ---------------------------------------------------------------------------
def get_generated_html():
    """Execute routingstation.py in-process and capture the generated HTML string."""
    import importlib.util, io
    
    spec = importlib.util.spec_from_file_location("routingstation", MONO)
    mod  = importlib.util.module_from_spec(spec)
    
    # Redirect stdout to capture if it prints
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    
    try:
        spec.loader.exec_module(mod)
    except SystemExit:
        pass
    finally:
        sys.stdout = old_stdout
    
    # Read the generated index.html directly instead
    out = Path(r"F:\qoder\billing-system\local_test_server\index.html")
    if out.exists():
        return out.read_text(encoding="utf-8")
    raise FileNotFoundError("Could not find generated index.html. Run routingstation.py first.")


def extract():
    print("[EXTRACT] Reading generated index.html...")
    html = get_generated_html()
    total_size = len(html)
    print(f"          Total size: {total_size/1024:,.1f} KB")

    # ---- Extract CSS block ----
    css_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
    if not css_match:
        print("[ERROR] Could not find <style> block!")
        sys.exit(1)
    css_content = css_match.group(1).strip()
    
    # ---- Extract JS block ----
    # The main script block is the last (or largest) <script> without a src attr
    script_matches = re.findall(r'<script(?! src)(.*?)>(.*?)</script>', html, re.DOTALL)
    # Find the largest one (the app code)
    js_content = max(script_matches, key=lambda m: len(m[1]))[1].strip()

    # ---- Build HTML template (everything except inlined CSS/JS) ----
    template = html
    # Replace CSS content with placeholder
    template = template.replace(css_match.group(0), '<style>\n/* __CSS_BUNDLE__ */\n</style>', 1)
    # Replace the main script content with placeholder
    for attrs, content in script_matches:
        if content == js_content:
            template = template.replace(
                f'<script{attrs}>{content}</script>',
                '<script>\n// __JS_BUNDLE__\n</script>',
                1
            )
            break

    # ---- Write files ----
    TPL_DIR.mkdir(parents=True, exist_ok=True)
    JS_DIR.mkdir(parents=True, exist_ok=True)
    CSS_DIR.mkdir(parents=True, exist_ok=True)

    tpl_path = TPL_DIR / "index.html.jinja"
    tpl_path.write_text(template, encoding="utf-8")
    print(f"[OUTPUT] Template:  {tpl_path}  ({len(template)/1024:,.1f} KB)")

    css_path = CSS_DIR / "00_extracted.css"
    css_path.write_text(css_content, encoding="utf-8")
    print(f"[OUTPUT] CSS:       {css_path}  ({len(css_content)/1024:,.1f} KB)")

    js_path = JS_DIR / "00_extracted.js"
    js_path.write_text(js_content, encoding="utf-8")
    print(f"[OUTPUT] JS:        {js_path}  ({len(js_content)/1024:,.1f} KB)")

    print(f"\n[EXTRACT] Done! Files ready in {SRC}")
    print("          Run 'python build.py' to assemble and verify output.")


if __name__ == "__main__":
    extract()
