#! /usr/bin/env python3
"""
PDF Bill Printer V1.2 (City Selection + U-P Fix)
------------------------------------------------
Transforms raw A4 PDFs (2 bills/page) into printer-ready A5 PDFs.

Updates:
- V1.2: Added City Selection Menu (All vs Single).
- V1.2: Changed "Unpaid" to "U-P".
- V1.2: Added Debug print for DataFrame columns to trace missing metadata.

Usage:
    python pdf-bill-printer.py
"""

import os
import re
import sys
import json
import argparse
import glob
import fitz  # PyMuPDF
import pandas as pd
import gc
import qrcode
import time
from datetime import datetime
from io import BytesIO

if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    print("⚠️ 'tqdm' not installed. Progress bars disabled.")

# Try importing barcode, warn if missing
try:
    from barcode import Code128
    from barcode.writer import ImageWriter
    HAS_BARCODE = True
except ImportError:
    HAS_BARCODE = False
    print("⚠️ 'python-barcode' not installed. Barcodes will be skipped.")

# ---------------- CONFIGURATION ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_PDF_ROOT = r"F:\Original_pdfs"
OUTPUT_BASE_DIR = r"F:\Apr-Final-Print"
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, "..", "outputs", "processed_pdfs")

BATCH_SIZE = 500
PSID_REGEX_PATTERN = r"\b(\d{20})\b"

# Routing CSV (for route totals)
ROUTING_CSV_PATH = r"F:\qoder\billing-system\01_Local_Engine\inputs\Batch_Routes_Export_2026-02-25.csv"

# --- LAYOUT SETTINGS ---
LABEL_FONT = "helv"
LABEL_FONT_SIZE = 7
LABEL_COLOR = (0, 0, 0)
LABEL_MARGIN_X = 15      
LABEL_MARGIN_Y = 5       

# Divider detection (True Half of A4 is ~5.85 inches)
DIVIDER_TARGET_INCH = 5.85
DIVIDER_TOLERANCE_PX = 40

# --- PRODUCTION DEFAULTS (Golden Settings) ---
PRODUCTION_DEFAULTS = {
    'split_inch': 5.85,
    'top_v_shift': -5,
    'bot_v_shift': -10,
    'scale': 1.02,
    'h_content_shift': 0,
    'meta_side': 'B',    # B=Bottom, L=Left Margin, R=Right Margin
    'meta_h_offset': 0,  # Margin from bottom or side
    'meta_v_nudge': 0,   # Sidebar vertical shift
}

# Active Global Config (Modified by Testing Menu)
GLOBAL_SCALE_FACTOR = PRODUCTION_DEFAULTS['scale']
GLOBAL_HORIZONTAL_SHIFT = PRODUCTION_DEFAULTS['h_content_shift']
SAFE_WIDTH = 582 
SAFE_MARGIN_X = 6.5 


# QR/Barcode Settings (Preserved as per user verification)
QR_SIZE = 42
BARCODE_HEIGHT_PDF = 35  
BARCODE_WIDTH_PDF = 350
BARCODE_OFFSET_Y = -25

# ---------------- HELPERS ----------------
def log(msg):
    print(msg)

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def generate_qr_image(data):
    qr = qrcode.QRCode(box_size=10, border=0)
    qr.add_data(str(data))
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def generate_barcode_image(data):
    if not HAS_BARCODE: return None
    writer = ImageWriter()
    bc = Code128(str(data), writer=writer)
    img_byte_arr = BytesIO()
    options = {"write_text": False, "module_height": 10.0, "module_width": 0.4, "quiet_zone": 0.5}
    bc.write(img_byte_arr, options=options)
    return img_byte_arr.getvalue()

def smart_find_uc_column(columns):
    """Finds the UC column ('UC' or 'Union Council')."""
    candidates = ['UC', 'Union Council', 'Address', 'Location']
    cols_lower = {c.lower().strip(): c for c in columns}
    
    for cand in candidates:
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    return None

def find_latest_city_excel(city_name_part, month_folder):
    """Finds the latest test_lifecycle_Biller_{City}_{Month} excel."""
    try:
        dt = datetime.strptime(month_folder, "%b-%y")
        excel_month = dt.strftime("%b%Y")
    except:
        excel_month = month_folder.capitalize()
    pattern = os.path.join(PROCESSED_DATA_DIR, f"test_lifecycle_Biller_{city_name_part}_{excel_month}*.xlsx")
    files = glob.glob(pattern)
    if not files:
        return None
    # Sort by modification time desc
    latest = max(files, key=os.path.getmtime)
    return latest

# ---------------- PHASE 1: MAP SOURCE ----------------
def find_solid_divider(page, target_inch=DIVIDER_TARGET_INCH):
    """
    Scans the center area of the page for a solid horizontal line.
    Returns the Y-coordinate.
    """
    target_y = target_inch * 72
    search_rect = fitz.Rect(0, target_y - DIVIDER_TOLERANCE_PX, page.rect.width, target_y + DIVIDER_TOLERANCE_PX)
    
    drawings = page.get_drawings()
    for d in drawings:
        for item in d["items"]:
            if item[0] in ["l", "re"]: 
                p0 = item[1] 
                y = p0.y if hasattr(p0, "y") else p0.y0
                
                if target_y - DIVIDER_TOLERANCE_PX < y < target_y + DIVIDER_TOLERANCE_PX:
                    if d["items"][0][1].x1 - d["items"][0][1].x0 > page.rect.width * 0.7 if item[0] == "re" else True:
                         return y
                         
    return target_y

def map_source_pdfs(city_code, month_folder):
    """
    Scans a specific City/Month folder for PSID locations.
    Uses JSON index cache for faster subsequent runs.
    Returns: { psid: {path, page, rect, split_y} }
    """
    source_dir = os.path.join(INPUT_PDF_ROOT, city_code, month_folder)
    if not os.path.exists(source_dir):
        log(f"[!] Source folder not found: {source_dir}")
        return {}

    log(f"--- Phase 1: Indexing PDFs in {city_code}/{month_folder} ---")
    files = sorted([f for f in os.listdir(source_dir) if f.lower().endswith(".pdf")])

    # --- TURBO MODE CHECK ---
    if os.environ.get("TURBO_MODE") == "1":
        files = [files[0]]
        log("[TURBO] Mode Active: Processing only first PDF.")

    # --- INDEX CACHE ---
    cache_path = os.path.join(PROCESSED_DATA_DIR, f"index_cache_{city_code}_{month_folder}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                cache = json.load(f)
            all_valid = True
            for fname in files:
                path = os.path.join(source_dir, fname)
                if abs(os.path.getmtime(path) - cache['files'].get(path, 0)) > 0.001:
                    all_valid = False
                    break
            if all_valid:
                psid_map = {}
                for psid, info in cache['psid_map'].items():
                    info['rect'] = fitz.Rect(info['rect']['x0'], info['rect']['y0'], info['rect']['x1'], info['rect']['y1'])
                    psid_map[psid] = info
                print(f"  Indexing Complete (cached). Mapped {len(psid_map)} bills.")
                return psid_map
        except Exception:
            pass

    psid_map = {}

    iterator = tqdm(files, unit="file", desc="Indexing") if HAS_TQDM else files

    for fname in iterator:
        path = os.path.join(source_dir, fname)
        try:
            doc = fitz.open(path)
            for page_num, page in enumerate(doc):
                r = page.rect
                split_y = find_solid_divider(page)

                # --- SINGLE BILL (GHOST PAGE) DETECTION ---
                psid_matches = re.findall(PSID_REGEX_PATTERN, page.get_text("text"))
                is_single_bill = (len(psid_matches) == 2)

                if is_single_bill:
                    rects = [("Top", fitz.Rect(0, 0, r.width, split_y))]
                else:
                    rects = [
                        ("Top", fitz.Rect(0, 0, r.width, split_y)),
                        ("Bottom", fitz.Rect(0, split_y, r.width, r.height))
                    ]

                for pos, clip_rect in rects:
                    text = page.get_text("text", clip=clip_rect)
                    match = re.search(PSID_REGEX_PATTERN, text)
                    if match:
                        psid = match.group(1)
                        psid_map[psid] = {"path": path, "page": page_num, "rect": clip_rect, "split_y": split_y, "pos": pos, "is_single_bill": is_single_bill}
            doc.close()
        except Exception:
            pass

    # Save index cache
    try:
        files_mtimes = {os.path.join(source_dir, f): os.path.getmtime(os.path.join(source_dir, f)) for f in files}
        cache = {
            'version': 1,
            'city_code': city_code,
            'month_folder': month_folder,
            'files': files_mtimes,
            'psid_map': {}
        }
        for psid, info in psid_map.items():
            cache['psid_map'][psid] = {
                'path': info['path'],
                'page': info['page'],
                'rect': {'x0': info['rect'].x0, 'y0': info['rect'].y0, 'x1': info['rect'].x1, 'y1': info['rect'].y1},
                'split_y': info['split_y'],
                'pos': info['pos'],
                'is_single_bill': info['is_single_bill']
            }
        ensure_dir(os.path.dirname(cache_path))
        with open(cache_path, 'w') as f:
            json.dump(cache, f)
        log(f"    Index cache saved: {cache_path}")
    except Exception as e:
        log(f"    [!] Cache save failed: {e}")

    print(f"  Indexing Complete. Mapped {len(psid_map)} bills.")
    return psid_map

# ---------------- PHASE 1.5: OPTIMIZATION HUB ----------------
def safe_folder_name(name):
    """
    Sanitizes folder name:
    1. Removes special chars.
    2. Replaces spaces with underscores.
    3. Truncates to 30 chars.
    """
    clean = re.sub(r'[^a-zA-Z0-9]', '_', str(name))
    clean = re.sub(r'_+', '_', clean) # Collapse underscores
    return clean[:30].strip('_')

def optimize_batches(grouped_items, min_batch_size=200):
    """
    Groups small UCs into batches.
    Returns list of dicts: {'folder_name': str, 'items': list, 'manifest': list_of_uc_names}
    """
    optimized = []
    small_batch_buffer = []
    small_batch_manifest = []
    
    for uc_name, items in grouped_items:
        clean_name = safe_folder_name(uc_name)
        if not clean_name: clean_name = "Unknown_UC"
        
        if len(items) >= min_batch_size:
            # Large enough: Keep independent
            optimized.append({
                'type': 'single',
                'folder_name': clean_name,
                'file_prefix': clean_name,
                'items': items,
                'manifest': [uc_name]
            })
        else:
            # Too small: Add to buffer
            small_batch_buffer.extend(items)
            small_batch_manifest.append(f"{uc_name} ({len(items)})")
            
            # If buffer full, flush
            if len(small_batch_buffer) >= min_batch_size:
                batch_idx = len([x for x in optimized if x['type'] == 'batch']) + 1
                fname = f"Small_UCs_Batch_{batch_idx}"
                optimized.append({
                    'type': 'batch',
                    'folder_name': fname,
                    'file_prefix': fname,
                    'items': list(small_batch_buffer),
                    'manifest': list(small_batch_manifest)
                })
                # Reset
                small_batch_buffer = []
                small_batch_manifest = []
                
    # Flush remaining buffer
    if small_batch_buffer:
        batch_idx = len([x for x in optimized if x['type'] == 'batch']) + 1
        fname = f"Small_UCs_Batch_{batch_idx}"
        optimized.append({
            'type': 'batch',
            'folder_name': fname,
            'file_prefix': fname,
            'items': list(small_batch_buffer),
            'manifest': list(small_batch_manifest)
        })
        
    return optimized

# ---------------- PHASE 2: PROCESSING ----------------
def process_city_batch(city_name, df_city, month_folder, output_root, target_mc_filter=None, max_bills=None):
    """
    Process one city's data. 
    1. Map Source PDFs.
    2. Group by Union Council.
    3. Generate Output.
    """
    print(f"DEBUG: Columns in DataFrame: {list(df_city.columns)}")

    # Load CSV route totals (once, cached on function)
    if not hasattr(process_city_batch, '_csv_route_totals'):
        process_city_batch._csv_route_totals = {}
        if os.path.exists(ROUTING_CSV_PATH):
            try:
                df_rt = pd.read_csv(ROUTING_CSV_PATH, usecols=['Route Name'], low_memory=False)
                process_city_batch._csv_route_totals = df_rt['Route Name'].value_counts().to_dict()
                print(f"[*] Loaded route totals from CSV: {len(process_city_batch._csv_route_totals)} routes")
            except Exception as e:
                print(f"[!] Warning: Could not load routing CSV for totals: {e}")

    # 1. Map Source
    city_code_map = {'Sargodha': 'sgd', 'Khushab': 'ksb', 'Bhalwal': 'bhl'} 
    city_code = city_code_map.get(city_name, city_name.lower())
    
    psid_map = map_source_pdfs(city_code, month_folder)
    if not psid_map:
        log(f"[!] No PDF map generated for {city_name}. Skipping.")
        return

    # 2. Find UC Column
    uc_col = smart_find_uc_column(df_city.columns)
    if not uc_col:
        log(f"[!] 'UC'/'Union Council' column missing in {city_name} file. Skipping.")
        return

    # 3. Filter & Group
    # Filter Deletes
    if 'Deleted in Portal' in df_city.columns:
        df_active = df_city[df_city['Deleted in Portal'] != 'Yes'].copy()
    else:
        df_active = df_city.copy() 

    # MC Filter (Testing)
    if target_mc_filter:
        log(f"[*] Applying Filter: {uc_col} contains '{target_mc_filter}'")
        df_active = df_active[df_active[uc_col].fillna('').str.contains(rf"{re.escape(target_mc_filter)}\b", case=False, na=False, regex=True)]

    if df_active.empty:
        log("[!] No records found after filtering.")
        return

    # Group by Union Council
    grouped = df_active.groupby(uc_col)
    
    total_groups = len(grouped)
    log(f"--- Phase 2: Generating Output for {city_name} ({len(df_active)} bills in {total_groups} UCs) ---")

    city_stats = []
    missing_bills_log = [] # Track missing PSIDs
    
    all_uc_items = []

    # --- PHASE 2A: BUILD ITEMS & STATS ---
    for i, (uc_name, group_df) in enumerate(grouped, 1):
        clean_uc = str(uc_name).replace("/", "-").replace("\\", "-").strip()
        if not clean_uc: clean_uc = "Unknown_UC"
        
        # Stats Prep
        total_in_uc_master = len(df_city[df_city[uc_col] == uc_name])
        active_target = len(group_df)
        deleted_count = total_in_uc_master - active_target
        printed_count = 0
        
        # Sort: Route Number (numeric) → Route Seq within each route → Survey ID tiebreaker
        try:
            # Extract route number from names like "MC-1_Route_17_RafiPark..." → 17
            # Unrouted → 999999 so they print last
            def extract_route_num(seg):
                m = re.search(r'Route_(\d+)', str(seg))
                return int(m.group(1)) if m else 999999
            
            group_df['_sort_route_num'] = group_df['Route Segment'].apply(extract_route_num)
            group_df['_sort_route_seq'] = pd.to_numeric(group_df['Route Seq'], errors='coerce').fillna(999999)
            group_df['_sort_survey_id'] = pd.to_numeric(group_df['Survey ID'], errors='coerce').fillna(0)
            
            # Route 1 first, then Route 2, etc. Within each route: Seq 1, 2, 3...
            group_df = group_df.sort_values(
                by=['_sort_route_num', '_sort_route_seq', '_sort_survey_id'],
                ascending=[True, True, False]
            )
            group_df = group_df.drop(columns=['_sort_route_num', '_sort_route_seq', '_sort_survey_id'])
        except Exception as e:
            log(f"    [!] Sorting Warning: {e}")
            group_df = group_df.sort_values(by=['Survey ID'], ascending=[False]) 
        
        # Prepare Batch Items
        batch_items = []
        bill_count = 0
        total_bills_in_uc = len(group_df)
        
        for _, row in group_df.iterrows():
            psid = str(row['Biller PSID']).strip()
            
            if psid not in psid_map:
                missing_bills_log.append({
                    'City': city_name,
                    'UC': clean_uc,
                    'PSID': psid,
                    'Survey ID': row.get('Survey ID', ''),
                    'Surveyor': row.get('Surveyor Name', ''),
                    'Reason': 'Not Found in Source PDFs'
                })
                continue 
                
            bill_count += 1
            printed_count += 1
            
            # Extract metadata
            # Name Cleaning (Remove Muhammad)
            raw_surveyor = str(row.get('Surveyor Name', ''))
            parts = [p for p in raw_surveyor.split() if p.lower() != 'muhammad']
            surveyor = " ".join(parts).strip()
            if not surveyor: surveyor = raw_surveyor 
            if surveyor == 'nan': surveyor = ''
            
            s_date = str(row.get('Survey Date', ''))
            if s_date == 'nan': s_date = ''
            
            s_time = str(row.get('Survey Time', ''))
            if s_time == 'nan': s_time = ''
            
            s_name = surveyor.split(' ')[0] if surveyor else 'N/A'
            
            # Prepare Metadata Segments
            survey_id = str(row.get('Survey ID', ''))
            route_name = str(row.get('Route Segment', 'Unrouted'))
            route_seq = str(row.get('Route Seq', ''))
            route_total = str(row.get('Route Total', '0'))
            # Override with CSV total if available
            if hasattr(process_city_batch, '_csv_route_totals') and route_name in process_city_batch._csv_route_totals:
                route_total = str(process_city_batch._csv_route_totals[route_name])
            
            # Left Segment (Survey Metadata)
            # Labeling: Append (N-R) if not routed
            sid_label = f"SID: {survey_id}"
            if route_name == "Unrouted":
                sid_label += " (N-R)"
                
            paid_status = "U-P" 
            freq = row.get('Total Payment Frequency', 0)
            try:
                if int(freq) > 0:
                    paid_status = f"P-{int(freq)}"
            except: pass
            
            seq_text = f"#{bill_count}/{total_bills_in_uc}"
            left_meta = f"{sid_label} | {s_name} | {s_date} {s_time} | {paid_status} | {seq_text}"
            
            # Right Segment (Routing Metadata)
            # Format: [Route Name] | Bill:[Seq]/[CSV Total]
            if route_name != "Unrouted":
                right_meta = f"{route_name} | Bill:{route_seq}/{route_total}"
            else:
                right_meta = "N-R"

            # Location Data
            lat = str(row.get('Lat', '')).strip()
            lng = str(row.get('Lng', '')).strip()
            
            batch_items.append({
                'psid': psid,
                'survey_id': survey_id,
                'left_meta': left_meta.strip().replace("  ", " "),
                'right_meta': right_meta.strip().replace("  ", " "),
                'lat': lat,
                'lng': lng,
                'source': psid_map[psid]
            })
            
        # Collect Stats
        city_stats.append({
            'City': city_name,
            'UC': clean_uc,
            'Total_In_List': total_in_uc_master,
            'Deleted': deleted_count,
            'Active_Target': active_target,
            'Printed': printed_count,
            'Missing_Source': active_target - printed_count
        })

        if not batch_items: continue
        
        # APPLY TEST LIMIT
        if max_bills is not None and max_bills > 0:
            batch_items = batch_items[:max_bills]
            
        # Store for Optimization
        all_uc_items.append((uc_name, batch_items))

    # --- PHASE 2B: OPTIMIZATION ---
    print(f"[*] Optimizing Folder Structure for {len(all_uc_items)} UCs...")
    optimized_batches = optimize_batches(all_uc_items, min_batch_size=200)
    
    # --- PHASE 2C: GENERATION ---
    total_batches = len(optimized_batches)
    print(f"[*] Generating {total_batches} Output Folders...")
    
    for i, batch in enumerate(optimized_batches, 1):
        folder_name = batch['folder_name']
        items = batch['items']
        
        # Create Output Folder
        uc_folder = os.path.join(output_root, city_name, folder_name)
        ensure_dir(uc_folder)
        
        print(f"  [{i}/{total_batches}] Generating: {folder_name} ({len(items)} items)")
        
        # Write Manifest if batch
        if batch['type'] == 'batch':
            with open(os.path.join(uc_folder, "Batch_Content.txt"), "w") as f:
                f.write(f"Merged Batch: {folder_name}\n")
                f.write("Contains the following UCs:\n")
                for m in batch['manifest']:
                    f.write(f"- {m}\n")
                    
        generate_merged_pdf(items, uc_folder, batch['file_prefix'])


    # SAVE MISSING BILLS LOG
    print(f"DEBUG: Checking Missing Bills Log: {len(missing_bills_log)} items.")
    if missing_bills_log:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        missing_csv_path = os.path.join(output_root, f"Missing_Bills_{city_name}_{timestamp}.csv")
        try:
            pd.DataFrame(missing_bills_log).to_csv(missing_csv_path, index=False)
            print(f"\n[!] WARNING: {len(missing_bills_log)} bills were missing from source PDFs.")
            print(f"    Details saved to: {missing_csv_path}")
        except Exception as e:
            print(f"[!] Error saving missing log: {e}")

    return city_stats

def apply_bill_overlays(new_page, item, psid, v_offset=0, h_offset=12, meta_side='B', v_nudge=0, center_label=None):
    """
    Applies text metadata, barcodes, and QR codes.
    Supports Side-Shifting (Bottom vs Left/Right Sidebar).
    """
    pw, ph = new_page.rect.width, new_page.rect.height

    # --- CENTER TEST IDENTIFIER (Large & Light) ---
    if center_label:
        label_rect = fitz.Rect(pw*0.1, ph/2 - 50, pw*0.9, ph/2 + 50)
        new_page.insert_textbox(
            label_rect, 
            center_label, 
            fontsize=40, 
            fontname="helv", 
            color=(0.95, 0.95, 0.95), 
            align=fitz.TEXT_ALIGN_CENTER
        )
        # Foreground label
        new_page.insert_text((pw/2 - 100, ph/2), center_label, fontsize=32, fontname="helv", color=(0.8, 0, 0))

    # --- METADATA (BOTTOM MARGIN) ---
    left_meta = item['left_meta']
    right_meta = item['right_meta']
    if center_label:
        left_meta = "BILL: " + left_meta
        right_meta = "ROUTE: " + right_meta

    m_y = ph - h_offset # Default 12pt from bottom
    m_font_size = 7
    combined_meta = f"{right_meta} | {left_meta}"
    
    # Position Constants (No Clipping Math)
    BILL_LEFT = (pw - SAFE_WIDTH * GLOBAL_SCALE_FACTOR) / 2
    BILL_RIGHT = pw - BILL_LEFT
    
    # Text Placement Logic
    if meta_side == 'L':
        # Left Margin (Sidebar)
        # Outward rotation: 90 degrees
        # Gap: 2 points from BILL_LEFT
        txt_x = BILL_LEFT - 2
        txt_y = ph/2 + v_nudge
        new_page.insert_text((txt_x, txt_y), combined_meta, fontsize=m_font_size, fontname=LABEL_FONT, color=LABEL_COLOR, rotate=90)
    elif meta_side == 'R':
        # Right Margin (Sidebar) 
        # Outward rotation: 270 degrees
        # Gap: 2 points from BILL_RIGHT
        txt_x = BILL_RIGHT + 2
        txt_y = ph/2 + v_nudge
        new_page.insert_text((txt_x, txt_y), combined_meta, fontsize=m_font_size, fontname=LABEL_FONT, color=LABEL_COLOR, rotate=270)
    else:
        # Bottom Margin (Default Corner-Fixed)
        m_y = ph - h_offset
        new_page.insert_text((15, m_y), right_meta, fontsize=m_font_size, fontname=LABEL_FONT, color=LABEL_COLOR)
        lw = fitz.get_text_length(left_meta, fontname=LABEL_FONT, fontsize=m_font_size)
        new_page.insert_text((pw - lw - 15, m_y), left_meta, fontsize=m_font_size, fontname=LABEL_FONT, color=LABEL_COLOR)

    # 3. Barcode & QR Codes (Relative to "Sanitation Bill" button)

    # 3. Barcode & QR Codes
    san = None
    wmc = None
    if HAS_BARCODE:
        bc_data = generate_barcode_image(psid)
        search_rect = fitz.Rect(0, ph/2, pw, ph)
        wmc = new_page.search_for("Sargodha WMC", clip=search_rect)
        san = new_page.search_for("Sanitation Bill", clip=search_rect)
        
        bc_x = (pw - BARCODE_WIDTH_PDF)/2
        bc_y = ph - 75
        
        if wmc:
            bc_y = wmc[0].y1 + BARCODE_OFFSET_Y
            if san:
                center = wmc[0].x1 + (san[0].x0 - wmc[0].x1)/2
                bc_x = center - (BARCODE_WIDTH_PDF/2)
            else:
                bc_x = wmc[0].x1 + 10
                
        new_page.insert_image(fitz.Rect(bc_x, bc_y, bc_x+BARCODE_WIDTH_PDF, bc_y+BARCODE_HEIGHT_PDF), stream=bc_data)

        # --- QR CODE (Right Side) ---
        MAP_BASE_URL = "https://mkka7944.github.io/billing-dept/scanner.html?sid=" 
        
        sid = item.get('survey_id', 'TEST-SID')
        if sid:
            qr_data = f"{MAP_BASE_URL}{sid}"
            qr_img = generate_qr_image(qr_data)
            qr_size = 42
            qr_x = pw - qr_size - 12
            qr_y = ph - 85
            
            if san:
                qr_y = san[0].y0 - qr_size - 15
            
            new_page.insert_image(fitz.Rect(qr_x, qr_y, qr_x + qr_size, qr_y + qr_size), stream=qr_img)
            label_y = qr_y + qr_size + 8
            label_text = "For office use only"
            l_len = fitz.get_text_length(label_text, fontname=LABEL_FONT, fontsize=6)
            new_page.insert_text((qr_x + (qr_size - l_len) / 2, label_y), label_text, fontsize=6, fontname=LABEL_FONT, color=LABEL_COLOR)

def generate_merged_pdf(items, output_folder, file_prefix, h_offset=5):
    """
    Creates merged PDF (A5 sized) from the items list.
    """
    total_items = len(items)
    chunk_idx = 1
    
    current_src_path = None
    src_doc = None
    
    iterable = range(0, total_items, BATCH_SIZE)
    if total_items > 100 and HAS_TQDM:
        iterable = tqdm(iterable, desc="   > Merging", leave=False)
        
    for start_i in iterable:
        chunk_items = items[start_i : start_i + BATCH_SIZE]
        
        if total_items <= BATCH_SIZE:
            final_path = os.path.join(output_folder, f"{file_prefix}_Bills.pdf")
        else:
            final_path = os.path.join(output_folder, f"{file_prefix}_Part{chunk_idx}.pdf")
            
        merged_doc = fitz.open()
        
        for item in chunk_items:
            psid = item['psid']
            src_info = item['source']
            
            if src_info['path'] != current_src_path:
                if src_doc: src_doc.close()
                try:
                    src_doc = fitz.open(src_info['path'])
                    current_src_path = src_info['path']
                except:
                    continue
            
            try:
                # 1. Standard A5 Target
                A5_WIDTH = 595
                A5_HEIGHT = 421 
                src_rect = src_info['rect'] 
                new_page = merged_doc.new_page(width=A5_WIDTH, height=A5_HEIGHT)
                pw, ph = new_page.rect.width, new_page.rect.height
                
                # Tight Area Crop (9 to 585)
                active_rect = fitz.Rect(SAFE_MARGIN_X, src_rect.y0, SAFE_MARGIN_X + SAFE_WIDTH, src_rect.y1)
                
                # Apply Vertical & Horizontal Content Shifts
                final_v_shift = PRODUCTION_DEFAULTS['top_v_shift'] if item['source'].get('pos') == "Top" else PRODUCTION_DEFAULTS['bot_v_shift']
                final_h_shift = GLOBAL_HORIZONTAL_SHIFT 
                
                # Single-Bill Auto-Shrink (Scale 1.0 overrides 1.02)
                is_single = item['source'].get('is_single_bill', False)
                current_scale = 1.00 if is_single else GLOBAL_SCALE_FACTOR
                
                # DSF Scaling (Relative to 595 target)
                sw = active_rect.width * current_scale
                sh = active_rect.height * current_scale
                off_x = ((A5_WIDTH - sw) / 2) + final_h_shift
                content_rect = fitz.Rect(off_x, final_v_shift, off_x + sw, final_v_shift + sh)
                new_page.show_pdf_page(content_rect, src_doc, src_info['page'], clip=active_rect)
                
                # 2. Overlays
                apply_bill_overlays(
                    new_page, item, psid, 
                    meta_side=PRODUCTION_DEFAULTS['meta_side'],
                    v_nudge=PRODUCTION_DEFAULTS['meta_v_nudge'],
                    h_offset=h_offset
                )

            except Exception as e:
                print(f"[!] Error adding bill {psid}: {e}")

        # Save Chunk
        try:
            merged_doc.save(final_path, garbage=4, deflate=True)
            merged_doc.close()
        except Exception as e:
            print(f"[!] Save Error {final_path}: {e}")
            
        chunk_idx += 1
        
    if src_doc: 
        try: src_doc.close()
        except: pass

def run_layout_test(city_name):
    """
    Precision Calibration: Targeted testing with Safe-Margin (565pt) cropping.
    """
    month_folder = "may-26"
    city_code_map = {'Sargodha': 'sgd', 'Khushab': 'ksb', 'Bhalwal': 'bhl'}
    city_code = city_code_map.get(city_name, city_name.lower())
    
    # --- TARGET SELECTION ---
    print("\n--- [PRECISION TESTING] ---")
    print("[1] Auto-pick first PDF (Standard)")
    print("[2] Targeted File & Page (Manual)")
    mode = input("Select Mode [Enter for 1]: ").strip()
    
    test_pdf = None
    start_page = 0
    max_test_pages = 2
    
    if mode == '2':
        test_pdf = input("   Enter Full Path to PDF: ").strip().strip('"')
        p_num = input("   Enter Starting Page (e.g. 1761): ").strip()
        start_page = int(p_num) - 1 if p_num.isdigit() else 0
        n_pages = input("   Enter Number of Pages to Test [Enter for 100]: ").strip()
        max_test_pages = int(n_pages) if n_pages.isdigit() else 100
    else:
        source_dir = os.path.join(INPUT_PDF_ROOT, city_code, month_folder)
        pdfs = glob.glob(os.path.join(source_dir, "*.pdf"))
        if not pdfs:
            log(f"[!] No PDFs found in {source_dir}")
            return
        test_pdf = sorted(pdfs)[0]

    # --- INTERACTIVE TWEAK MODULE ---
    print("\n--- [PRECISION CALIBRATION] ---")
    print(f"1. Split Point [Golden: {PRODUCTION_DEFAULTS['split_inch']}\"]: ")
    s_adj = input("   New Point (e.g. 5.90) [Enter for Default]: ").strip()
    split_target = float(s_adj) if s_adj.replace(".","").isdigit() else PRODUCTION_DEFAULTS['split_inch']
    
    print(f"2. Top Bill Vertical Shift [Default: {PRODUCTION_DEFAULTS['top_v_shift']}]: ")
    sh_top = input("   New Shift (e.g. -5) [Enter for 0]: ").strip()
    top_shift = int(sh_top) if sh_top.replace("-","").isdigit() else PRODUCTION_DEFAULTS['top_v_shift']
    
    print(f"3. Bottom Bill Vertical Shift [Golden: {PRODUCTION_DEFAULTS['bot_v_shift']}]: ")
    sh_bot = input("   New Shift (e.g. -15) [Enter for Default]: ").strip()
    bot_shift = int(sh_bot) if sh_bot.replace("-","").isdigit() else PRODUCTION_DEFAULTS['bot_v_shift']
    
    print(f"4. Metadata Placement (B=Bottom, L=Left, R=Right) [Golden: {PRODUCTION_DEFAULTS['meta_side']}]: ")
    side_ch = input("   Enter Choice (L/R/B) [Enter for Default]: ").strip().upper()
    meta_side = side_ch if side_ch in ['L','R','B'] else PRODUCTION_DEFAULTS['meta_side']
    
    print(f"5. Metadata Nudges (H-Offset: {PRODUCTION_DEFAULTS['meta_h_offset']}, V-Nudge (Sidebar): {PRODUCTION_DEFAULTS['meta_v_nudge']}): ")
    m_h_adj = input("   New Bottom Margin (e.g. 15) [Enter for Default]: ").strip()
    meta_h = int(m_h_adj) if m_h_adj.isdigit() else PRODUCTION_DEFAULTS['meta_h_offset']
    m_v_adj = input("   New Vertical Nudge (e.g. -50) [Enter for Default]: ").strip()
    meta_v = int(m_v_adj) if m_v_adj.replace("-","").isdigit() else PRODUCTION_DEFAULTS['meta_v_nudge']
    
    print(f"6. Scale Factor (DSF) [Golden: {PRODUCTION_DEFAULTS['scale']}x]: ")
    sc_adj = input("   New Scale (e.g. 1.05) [Enter for Default]: ").strip()
    scale_factor = float(sc_adj) if sc_adj.replace(".","").isdigit() else PRODUCTION_DEFAULTS['scale']
    
    print(f"7. Content Horz. Shift [Default: {PRODUCTION_DEFAULTS['h_content_shift']}]: ")
    h_sh_adj = input("   New Shift (e.g. -5) [Enter for 0]: ").strip()
    h_shift = int(h_sh_adj) if h_sh_adj.replace("-","").isdigit() else PRODUCTION_DEFAULTS['h_content_shift']

    log(f"\n[TEST_MODE] Generating Calibration PDF (Scaling: {scale_factor}x | Meta: {meta_side})")
    log(f"    Target: {os.path.basename(test_pdf)} | Start Page: {start_page+1}")

    out_path = os.path.join(OUTPUT_BASE_DIR, f"_TEST_PRECISION_p{start_page+1}.pdf")
    ensure_dir(OUTPUT_BASE_DIR)
    
    merged_doc = fitz.open()
    try:
        src_doc = fitz.open(test_pdf)
    except Exception as e:
        log(f"[!] Error opening PDF: {e}")
        return
    
    # Target standard A5 dimensions
    A5_WIDTH = 595
    A5_HEIGHT = 421
    
    # Process range
    for page_num in range(start_page, min(start_page + max_test_pages, len(src_doc))):
        page = src_doc[page_num]
        split_y = find_solid_divider(page, target_inch=split_target)
        
        # --- SINGLE BILL (GHOST PAGE) DETECTION for Testing ---
        psid_matches = re.findall(PSID_REGEX_PATTERN, page.get_text("text"))
        is_single_bill = (len(psid_matches) == 2)
        
        if is_single_bill:
            rects = [("Top", fitz.Rect(0, 0, page.rect.width, split_y))]
        else:
            rects = [
                ("Top", fitz.Rect(0, 0, page.rect.width, split_y)),
                ("Bottom", fitz.Rect(0, split_y, page.rect.width, page.rect.height))
            ]
        
        for pos, clip_rect in rects:
            dummy_item = {
                'psid': "77777777777777777777",
                'survey_id': "TEST-1024",
                'left_meta': f"SID:TEST-1 | Surveyor:TEST | {datetime.now().strftime('%Y-%m-%d')} | P-1",
                'right_meta': f"TEST_ROUTE_A | Page:{page_num+1} {pos}",
                'source': {'pos': pos, 'page': page_num}
            }
            
            new_page = merged_doc.new_page(width=A5_WIDTH, height=A5_HEIGHT)
            
            # Tight Area Crop (9 to 585)
            active_rect = fitz.Rect(SAFE_MARGIN_X, clip_rect.y0, SAFE_MARGIN_X + SAFE_WIDTH, clip_rect.y1)
            
            # Apply Vertical & Horizontal Shift
            final_v_shift = top_shift if pos == "Top" else bot_shift
            final_h_shift = h_shift
            
            # Single-Bill Auto-Shrink
            current_scale = 1.00 if is_single_bill else scale_factor
            
            # Apply Scaling & Centering
            sw = active_rect.width * current_scale
            sh = active_rect.height * current_scale
            off_x = ((A5_WIDTH - sw) / 2) + final_h_shift
            content_rect = fitz.Rect(off_x, final_v_shift, off_x + sw, final_v_shift + sh)
            new_page.show_pdf_page(content_rect, src_doc, page_num, clip=active_rect)
            
            # Overlays 
            label_text = f"[{pos.upper()} HALF]"
            apply_bill_overlays(
                new_page, dummy_item, dummy_item['psid'], 
                h_offset=meta_h,
                meta_side=meta_side, v_nudge=meta_v,
                center_label=label_text
            )
            
    try:
        merged_doc.save(out_path, garbage=4, deflate=True)
        log(f"\n[OK] Layout check saved to: {out_path}")
        merged_doc.close()
    except Exception as e:
        log(f"[!] Save Error: {e}")
        
    src_doc.close()

def _parse_number_ranges(text):
    """Parses '1,3,5-7' or '1 3 5-7' into a list of ints [1,3,5,6,7]."""
    import re as _re
    numbers = set()
    # Split by comma or space
    parts = _re.split(r'[,\s]+', text.strip())
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            try:
                a, b = part.split('-', 1)
                start, end = int(a), int(b)
                numbers.update(range(start, end + 1))
            except ValueError:
                pass
        else:
            try:
                numbers.add(int(part))
            except ValueError:
                pass
    return sorted(numbers)

def run_custom_verified_print(args, output_root, mc_filter=None):
    custom_path = os.path.join(BASE_DIR, "..", "outputs", "custom_sequences", "House_Intelligence_For_Printer.csv")
    if not os.path.exists(custom_path):
        log(f"[!] Custom sequence source not found: {custom_path}")
        return

    # Load baseline master
    city_name = args.city
    city_code_map = {'Sargodha': 'sgd', 'Khushab': 'ksb', 'Bhalwal': 'bhl'} 
    city_code = city_code_map.get(city_name, city_name.lower())
    
    excel_path = find_latest_city_excel(city_name, args.month)
    if not excel_path:
        log(f"[!] No master excel baseline found.")
        return
        
    try:
        df_master = pd.read_excel(excel_path, dtype=str)
    except Exception as e:
        log(f"[!] Master fail: {e}")
        return

    uc_col = smart_find_uc_column(df_master.columns)
    if not uc_col:
        log(f"[!] UC column missing.")
        return

    psid_map = map_source_pdfs(city_code, args.month)
    if not psid_map:
        log(f"[!] No source PDFs.")
        return

    # Load custom sequence
    try:
        df_custom = pd.read_csv(custom_path, dtype=str)
        # If mc_filter provided, filter to that MC only; otherwise use all
        if mc_filter:
            df_custom = df_custom[df_custom['Area'].fillna('').str.contains(mc_filter, case=False, na=False, regex=True)]
    except Exception as e:
        log(f"[!] Custom CSV read fail: {e}")
        return

    if df_custom.empty:
        log(f"[!] No rows match the selected MC in custom CSV.")
        return

    # Loop over MC groups preserving CSV row order
    for mc_code, sheet_df in df_custom.groupby('Area', sort=False):
        mc_code = mc_code.strip()
        log(f"\n[*] Processing prioritized custom sequence for {mc_code}")
        mc_rows = []
        custom_psids = set()
        
        # Pass 1: Gather prioritized items from CSV, grouped by Verified_By
        for verifier, verifier_df in sheet_df.groupby('Verified_By', sort=False):
            verifier_name = str(verifier).split('@')[0] if verifier else 'Unknown'
            log(f"    Verifier: {verifier_name}")

            # Pre-collect printable rows with resolved PSIDs to count total per verifier
            verifier_printable = []
            for _, row in verifier_df.iterrows():
                psid = str(row.get('Bill_ID', '')).strip()
                survey_id = str(row.get('SurveyID', '')).strip()
                if not psid or psid == 'nan':
                    match_m = df_master[df_master['Survey ID'] == survey_id]
                    if not match_m.empty:
                        psid = str(match_m.iloc[0]['Biller PSID']).strip()
                if psid in psid_map:
                    verifier_printable.append((psid, survey_id, row))

            verifier_total = len(verifier_printable)
            for v_idx, (psid, survey_id, row) in enumerate(verifier_printable, 1):
                custom_psids.add(psid)

                email = str(row.get('Verified_By', 'Unknown')).split('@')[0]
                v_date = str(row.get('Verified_Date', ''))
                v_time = str(row.get('Verified_Time', ''))
                if v_date == 'nan': v_date = ''
                if v_time == 'nan': v_time = ''
                street = str(row.get('Street', ''))
                side = str(row.get('Side', ''))
                seq = str(row.get('Sequence', ''))
                right_meta = f"{email} ({v_idx}/{verifier_total}) | {v_date} {v_time} | St:{street} | Side:{side} | Seq:{seq}"

                match_m = df_master[df_master['Survey ID'] == survey_id]
                s_name = 'N/A'
                s_date = ''
                s_time = ''
                paid_status = 'U-P'
                if not match_m.empty:
                    m_row = match_m.iloc[0]
                    s_name = str(m_row.get('Surveyor Name', ''))
                    s_date = str(m_row.get('Survey Date', ''))
                    s_time = str(m_row.get('Survey Time', ''))
                    freq = m_row.get('Total Payment Frequency', 0)
                    try:
                        if int(freq) > 0: paid_status = f"P-{int(freq)}"
                    except: pass

                left_meta = f"SID: {survey_id} | {s_name} | {s_date} {s_time} | {paid_status}"

                mc_rows.append({
                    'psid': psid,
                    'survey_id': survey_id,
                    'left_meta': left_meta,
                    'right_meta': right_meta,
                    'lat': '',
                    'lng': '',
                    'source': psid_map[psid]
                })

        # Pass 2: Gather unmapped defaults belonging to the target MC/UC
        fallback_df = df_master[df_master[uc_col].fillna('').str.contains(mc_code, case=False, na=False)].copy()
        fallback_df['_sort_survey_id'] = pd.to_numeric(fallback_df['Survey ID'], errors='coerce').fillna(0)
        fallback_df = fallback_df.sort_values(by='_sort_survey_id', ascending=False)
        
        for idx, row in fallback_df.iterrows():
            psid = str(row.get('Biller PSID', '')).strip()
            if psid in custom_psids:
                continue
                
            if psid in psid_map:
                survey_id = str(row.get('Survey ID', ''))
                
                s_name = str(row.get('Surveyor Name', ''))
                s_date = str(row.get('Survey Date', ''))
                s_time = str(row.get('Survey Time', ''))
                paid_status = 'U-P'
                freq = row.get('Total Payment Frequency', 0)
                try:
                    if int(freq) > 0: paid_status = f"P-{int(freq)}"
                except: pass
                
                left_meta = f"SID: {survey_id} | {s_name} | {s_date} {s_time} | {paid_status}"
                right_meta = "N-R"
                mc_rows.append({
                    'psid': psid,
                    'survey_id': survey_id,
                    'left_meta': left_meta,
                    'right_meta': right_meta,
                    'lat': '',
                    'lng': '',
                    'source': psid_map[psid]
                })
                
        if mc_rows:
            # Append print sequence counters
            for idx, row in enumerate(mc_rows, 1):
                row['left_meta'] += f" | #{idx}/{len(mc_rows)}"
                
            folder_name = f"Custom_Verified_{mc_code}"
            uc_folder = os.path.join(output_root, "Custom_Sequences_Export", folder_name)
            ensure_dir(uc_folder)
            log(f"  > Generating {len(mc_rows)} custom sequence prints...")
            generate_merged_pdf(mc_rows, uc_folder, folder_name, h_offset=0)

# ---------------- PHASE 3: MAIN ----------------
def main():
    global GLOBAL_SCALE_FACTOR, OUTPUT_BASE_DIR
    import sys
    import argparse
    
    # HYBRID LAUNCH DETECTION
    if len(sys.argv) == 1:
        # Interactive Terminal Mode
        print("=== PDF Bill Printer V1.2 (Interactive Mode) ==\n")
        print("--- Main Menu ---")
        print("[1] Process ALL Cities")
        print("[2] Sargodha")
        print("[3] Khushab")
        print("[4] Bhalwal")
        print("[5] Testing Mode (Auto-Layout Check)")
        print("[6] Process Custom Verified Sequences")
        choice = input("Enter Choice: ").strip()
        
        # Create a dummy args object
        args = type('Args', (), {})()
        args.scale = PRODUCTION_DEFAULTS['scale']
        args.top_shift = PRODUCTION_DEFAULTS['top_v_shift']
        args.bot_shift = PRODUCTION_DEFAULTS['bot_v_shift']
        args.split_inch = PRODUCTION_DEFAULTS['split_inch']
        args.month = "may-26"
        args.mc_filter = None
        args.max_bills = None
        args.h_offset = PRODUCTION_DEFAULTS['meta_h_offset']
        
        if choice == '1':
            args.mode = 'process'
            args.city = 'all'
        elif choice == '2':
            args.mode = 'process'
            args.city = 'Sargodha'
        elif choice == '3':
            args.mode = 'process'
            args.city = 'Khushab'
        elif choice == '4':
            args.mode = 'process'
            args.city = 'Bhalwal'
        elif choice == '5':
            args.mode = 'test'
            print("\n--- Testing Mode: Select City ---")
            print("[1] Sargodha\n[2] Khushab\n[3] Bhalwal")
            tc = input("Select: ").strip()
            city_map = {'1': 'Sargodha', '2': 'Khushab', '3': 'Bhalwal'}
            args.city = city_map.get(tc, 'Sargodha')
        elif choice == '6':
            args.mode = 'custom_verified'
            args.city = 'Sargodha'
            # Read CSV to show MC choices
            csv_path = os.path.join(BASE_DIR, "..", "outputs", "custom_sequences", "House_Intelligence_For_Printer.csv")
            mc_choices = []
            if os.path.exists(csv_path):
                try:
                    df_pick = pd.read_csv(csv_path, dtype=str)
                    mc_choices = sorted(df_pick['Area'].dropna().unique())
                except: pass
            if mc_choices:
                print("\n--- Select MC to Process ---")
                for ci, mc_name in enumerate(mc_choices, 1):
                    cnt = len(df_pick[df_pick['Area'] == mc_name])
                    print(f"  [{ci}] {mc_name} ({cnt})")
                print(f"  [A] All ({len(mc_choices)} MCs)")
                print("  Enter numbers (e.g. 2,3 or 1-5 or 2 8)")
                mc_pick = input("Enter choice: ").strip()
                if mc_pick.upper() == 'A':
                    args.mc_filter = None
                else:
                    selected = _parse_number_ranges(mc_pick)
                    selected_names = [mc_choices[i-1] for i in selected if 1 <= i <= len(mc_choices)]
                    if selected_names:
                        # Build regex matching any of the selected names
                        escaped = [re.escape(n) for n in selected_names]
                        args.mc_filter = '(' + ')|('.join(escaped) + ')'
                    else:
                        args.mc_filter = None
            else:
                print("[!] Could not read MC list from CSV. Processing all.")
        else:
            print("Invalid choice. Exiting.")
            return
            
        print("\n--- Optional Filters ---")
        mc_f = input("Enter UC Filter (e.g., MC-1) or press enter to skip: ").strip()
        if mc_f: args.mc_filter = mc_f
        
        lim = input("Enter Max Bills per UC (or press enter for all): ").strip()
        if lim.isdigit(): args.max_bills = int(lim)

        h_off = input("Enter H-Offset (bottom margin, press enter for default 5): ").strip()
        if h_off.isdigit(): args.h_offset = int(h_off)
        
    else:
        # Automated Dashboard Mode
        parser = argparse.ArgumentParser(description="PDF Bill Printer V1.2")
        parser.add_argument("--city", choices=["all", "Sargodha", "Khushab", "Bhalwal"], default="all", help="City to process")
        parser.add_argument("--mode", choices=["process", "test", "custom_verified"], default="process", help="Processing Mode: process=Full, test=Layout Check, custom_verified=Custom Verified Scan")
        parser.add_argument("--scale", type=float, default=PRODUCTION_DEFAULTS['scale'], help="Scale factor")
        parser.add_argument("--top-shift", type=float, default=PRODUCTION_DEFAULTS['top_v_shift'], help="Top vertical shift")
        parser.add_argument("--bot-shift", type=float, default=PRODUCTION_DEFAULTS['bot_v_shift'], help="Bottom vertical shift")
        parser.add_argument("--split-inch", type=float, default=PRODUCTION_DEFAULTS['split_inch'], help="Split point in inches")
        parser.add_argument("--month", default="may-26", help="Month folder to process")
        parser.add_argument("--mc-filter", help="Filter by MC/UC name")
        parser.add_argument("--max-bills", type=int, help="Limit number of bills per UC (for testing)")
        parser.add_argument("--h-offset", type=int, help="Bottom margin offset for metadata (default: 5)")

        args = parser.parse_args()

    # Override Production Defaults from CLI/Interactive
    PRODUCTION_DEFAULTS['scale'] = args.scale
    PRODUCTION_DEFAULTS['top_v_shift'] = args.top_shift
    PRODUCTION_DEFAULTS['bot_v_shift'] = args.bot_shift
    PRODUCTION_DEFAULTS['split_inch'] = args.split_inch
    GLOBAL_SCALE_FACTOR = args.scale
    if args.h_offset is not None:
        PRODUCTION_DEFAULTS['meta_h_offset'] = args.h_offset

    try:
        dt = datetime.strptime(args.month, "%b-%y")
        month_cap = dt.strftime("%b")
    except:
        month_cap = args.month.split('-')[0].capitalize()
    OUTPUT_BASE_DIR = rf"F:\Final_print\{month_cap}-Final-Print"

    print("=== PDF Bill Printer V1.2 (With QR & Summary) ==\n")
    print(f"   Settings: Scale={args.scale}, Top={args.top_shift}, Bot={args.bot_shift}, Split={args.split_inch}\"")
    print(f"   Output: {OUTPUT_BASE_DIR}")
    
    cities_list = ['Sargodha', 'Khushab', 'Bhalwal']
    
    if args.mode == 'test':
        city_to_test = args.city if args.city != "all" else "Sargodha"
        print(f"--- [CLI] Running Layout Test for {city_to_test} ---")
        run_layout_test(city_to_test)
        return

    if args.mode == 'custom_verified':
        mc_filter = getattr(args, 'mc_filter', None)
        print(f"--- [CLI] Running Custom Verified Sequence Print for {args.city} ---")
        if mc_filter:
            print(f"    MC Filter: {mc_filter}")
        run_custom_verified_print(args, OUTPUT_BASE_DIR, mc_filter=mc_filter)
        return

    selected_targets = []
    if args.city == 'all':
        selected_targets = [{'name': c, 'part': c} for c in cities_list]
    else:
        selected_targets = [{'name': args.city, 'part': args.city}]

    month_folder = args.month
    mc_filter = args.mc_filter
    max_bills = args.max_bills

    all_run_stats = []

    for t in selected_targets:
        city_name = t['name']
        
        # A. Find File
        excel_path = find_latest_city_excel(t['part'], month_folder)
        if not excel_path:
            print(f"\n[!] No Master List found for {city_name} (Pattern: test_lifecycle_Biller_{t['part']}_May2026*.xlsx)")
            continue
            
        print(f"\n" + "="*60)
        print(f"[*] Starting {city_name}")
        print(f"    File: {os.path.basename(excel_path)}")
        
        try:
            df = pd.read_excel(excel_path, dtype=str)
        except Exception as e:
            print(f"[!] Error loading excel: {e}")
            continue
            
        # Process and collect stats
        city_stats = process_city_batch(city_name, df, month_folder, OUTPUT_BASE_DIR, mc_filter, max_bills)
        if city_stats:
            all_run_stats.extend(city_stats)

    # 5. Final Summary Report
    print("\n" + "="*60)
    print("=== FINAL SUMMARY REPORT ===")
    if all_run_stats:
        df_report = pd.DataFrame(all_run_stats)
        cols = ['City', 'UC', 'Total_In_List', 'Deleted', 'Active_Target', 'Printed', 'Missing_Source']
        cols = [c for c in cols if c in df_report.columns]
        df_report = df_report[cols]
        
        # Rename columns to match manual format
        rename_map = {
            'Total_In_List': 'Total',
            'Active_Target': 'Target',
            'Missing_Source': 'Missing'
        }
        df_report = df_report.rename(columns=rename_map)
        
        # Add tracker columns
        df_report['Print Done'] = ""
        df_report['Pending'] = ""
        
        # Print terminal output without tracker columns
        print(df_report.drop(columns=['Print Done', 'Pending'], errors='ignore').to_string(index=False))
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join(OUTPUT_BASE_DIR, f"Final_Run_Report_{timestamp}.xlsx")
        
        try:
            with pd.ExcelWriter(report_path, engine='openpyxl') as writer:
                # 1. All Offices Tab
                today_str = datetime.now().strftime("%d-%m-%Y")
                title = f"ALL OFFICE FINAL RUN REPORT APR 2026 CYCLE ({today_str})"
                
                # Write empty DataFrame for the title row
                title_df = pd.DataFrame(columns=[title])
                title_df.to_excel(writer, sheet_name='All Offices', index=False, startrow=0)
                
                # Write actual data below the title
                df_report.to_excel(writer, sheet_name='All Offices', index=False, startrow=1)
                
                # 2. City Specific Tabs
                for city in df_report['City'].unique():
                    city_df = df_report[df_report['City'] == city]
                    city_df.to_excel(writer, sheet_name=str(city)[:31], index=False)
                
                # 3. Run Summary Tab
                summary_data = []
                for city in df_report['City'].unique():
                    c_df = df_report[df_report['City'] == city]
                    summary_data.append({
                        'City Summary': city,
                        'Total UCs': len(c_df),
                        'Total Bills': c_df['Total'].astype(float).sum(),
                        'Total Deleted': c_df['Deleted'].astype(float).sum(),
                        'Total Target': c_df['Target'].astype(float).sum(),
                        'Total Printed': c_df['Printed'].astype(float).sum(),
                        'Total Missing': c_df['Missing'].astype(float).sum()
                    })
                
                if summary_data:
                    summary_df = pd.DataFrame(summary_data)
                    grand_total = {
                        'City Summary': 'GRAND TOTAL',
                        'Total UCs': summary_df['Total UCs'].sum(),
                        'Total Bills': summary_df['Total Bills'].sum(),
                        'Total Deleted': summary_df['Total Deleted'].sum(),
                        'Total Target': summary_df['Total Target'].sum(),
                        'Total Printed': summary_df['Total Printed'].sum(),
                        'Total Missing': summary_df['Total Missing'].sum()
                    }
                    summary_df.loc[len(summary_df)] = grand_total
                    summary_df.to_excel(writer, sheet_name='Run Summary', index=False)
                    
            print(f"\n[OK] Detailed Multi-Tab Report saved to: {report_path}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[!] Error saving report: {e}")
    else:
        print("[!] No stats collected.")

    print("\n" + "="*60)
    print("[OK] All Jobs Complete.")
    print(f"Output: {OUTPUT_BASE_DIR}")

if __name__ == "__main__":
    main()
