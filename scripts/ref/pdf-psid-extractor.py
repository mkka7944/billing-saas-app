#! /usr/bin/env python3
"""
PDF PSID & Arrears Extractor V6.0 (Metadata Integration)
--------------------------------------------------------
Features:
- Extracts PSID, Arrears.
- Batch Mode: Dec-2025 for all cities.
- Lifecycle Analysis, Payment History, Deleted Check.
- NEW: Merges Surveyor Name, Date, Time, Union Council from Survey Data.

Outputs:
1. Enhanced Biller Lists (per city).
2. Combined Master List.
"""

import os
import sys
import re
import csv
import glob
import pandas as pd
from datetime import datetime
import sys

if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    print("⚠️ tqdm not installed. Install with: pip install tqdm")

try:
    import fitz  # PyMuPDF
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False
    print("⚠️ PyMuPDF (fitz) not installed. Install with: pip install pymupdf")

# -----------------------------
# CONFIG
# -----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_ROOT = r"F:\Original_pdfs"
BILLER_DUMPS_DIR = os.path.join(BASE_DIR, "..", "inputs", "excel_dumps")
SCRAPED_DATA_DIR = os.path.join(BASE_DIR, "..", "outputs", "scraped_data")
OUTPUT_DIR = os.path.join(BASE_DIR, "..", "outputs", "processed_pdfs")

# Routing Configuration
ROUTING_FILE_PATH = r"F:\qoder\billing-system\01_Local_Engine\inputs\Batch_Routes_Export_2026-02-25.csv"

# External Deletion List (Survey IDs to exclude from print)
DELETION_LIST_PATH = r"F:\qoder\billing-system\01_Local_Engine\inputs\SID-zubair.xlsx"

PSID_TO_SURVEY_MAP = {}

SURVEY_FILE_MAP = {
    'Sargodha': 'SARGODHA_SARGODHA_SURVEY_DATA.csv',
    'Khushab': 'KHUSHAB_KHUSHAB_SURVEY_DATA.csv',
    'Bhalwal': 'SARGODHA_BHALWAL_SURVEY_DATA.csv'
}

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def clean_amount(amount_str):
    if not amount_str: return 0
    clean = re.sub(r'[^\d.]', '', amount_str)
    try:
        return float(clean)
    except ValueError:
        return 0

def clean_psid(psid_val):
    if pd.isna(psid_val): return ""
    return re.sub(r'\D', '', str(psid_val))

def get_biller_filename(city_code, month_code):
    city_map = {
        'sgd': 'Sargodha',
        'ksb': 'Khushab',
        'bhl': 'Bhalwal'
    }
    
    city_full = city_map.get(city_code.lower(), city_code.capitalize())
    
    try:
        dt = datetime.strptime(month_code, "%b-%y")
        month_full = dt.strftime("%b%Y")
    except ValueError:
        try:
             dt = datetime.strptime(month_code, "%b-%Y")
             month_full = dt.strftime("%b%Y")
        except:
             clean_month = month_code.replace("-", "").lower()
             if "dec" in clean_month and "25" in clean_month: month_full = "Dec2025"
             elif "nov" in clean_month and "25" in clean_month: month_full = "Nov2025"
             elif "jan" in clean_month and "26" in clean_month: month_full = "Jan2026"
             elif "feb" in clean_month and "26" in clean_month: month_full = "Feb2026"
             elif "mar" in clean_month and "26" in clean_month: month_full = "Mar2026"
             elif "apr" in clean_month and "26" in clean_month: month_full = "Apr2026"
             elif "may" in clean_month and "26" in clean_month: month_full = "May2026"
             else: month_full = month_code.capitalize() 

    filename = f"Biller_{city_full}_{month_full}.csv"
    return filename, city_full

def load_biller_data_full():
    global PSID_TO_SURVEY_MAP
    PSID_TO_SURVEY_MAP = {}
    
    if not os.path.exists(BILLER_DUMPS_DIR): return

    csv_files = glob.glob(os.path.join(BILLER_DUMPS_DIR, "*.csv"))
    print(f"📊 Loading matches from {len(csv_files)} biller files...")

    for csv_file in csv_files:
        try:
            df = pd.read_csv(csv_file, usecols=lambda x: x in ['Biller PSID', 'Survey ID'], low_memory=False)
            df.columns = [c.strip() for c in df.columns]
            
            if 'Biller PSID' in df.columns and 'Survey ID' in df.columns:
                df['Biller PSID'] = df['Biller PSID'].apply(clean_psid)
                df['Survey ID'] = df['Survey ID'].astype(str).str.strip()
                df = df[df['Biller PSID'] != ""]
                mapping = pd.Series(df['Survey ID'].values, index=df['Biller PSID']).to_dict()
                PSID_TO_SURVEY_MAP.update(mapping)
        except:
            pass
    print(f"[*] Loaded mappings for {len(PSID_TO_SURVEY_MAP)} unique PSIDs.")

def enrich_biller_categories(df, city_full, month_folder):
    """
    Checks if Category columns are missing or empty.
    If so, attempts to merge from biller_data_{city}_{month}.csv in excel_dumps.
    """
    category_cols = ['Category', 'Sub Category', 'Billing Category']
    needs_enrichment = False
    
    if not all(col in df.columns for col in category_cols):
        needs_enrichment = True
    else:
        # Check if they are mostly empty (NaN or empty string)
        sample = df[category_cols].head(20).fillna('')
        if (sample == '').all().all():
            needs_enrichment = True

    if not needs_enrichment:
        return df

    print(f"[*] Data Enrichment: Category columns missing or empty. Searching for source...")
    
    # Normalize naming for lookup
    city_clean = city_full.lower().replace(" ", "")
    month_clean = month_folder.lower().replace("-", "").replace(" ", "")
    # Support both apr26 and apr2026 patterns
    month_variations = [month_clean]
    if "26" in month_clean and "2026" not in month_clean:
        month_variations.append(month_clean.replace("26", "2026"))
    
    # Try common patterns
    patterns = []
    for mv in month_variations:
        patterns.extend([
            f"biller_data_{city_clean}_{mv}.csv",
            f"biller-data_{city_clean}_{mv}.csv"
        ])
    
    # Fallback to wildcard
    patterns.extend([
        f"biller_data_{city_full.lower()}_*.csv",
        f"biller-data_{city_full.lower()}_*.csv"
    ])
    
    data_file = None
    for p in patterns:
        matches = glob.glob(os.path.join(BILLER_DUMPS_DIR, p))
        if matches:
            # Sort matches to pick the most recent if wildcard used
            matches.sort(reverse=True)
            data_file = matches[0]
            break
            
    if not data_file:
        print(f"    [!] No category source file found for {city_full}/{month_folder}. Skipping enrichment.")
        return df

    print(f"    [OK] Found Source: {os.path.basename(data_file)}")
    try:
        # Load Source Data with UTF-8-sig for Urdu
        df_src = pd.read_csv(data_file, low_memory=False, encoding='utf-8-sig')
        df_src.columns = [c.strip() for c in df_src.columns]
        
        # Handle common typos or naming variations from portal exports
        rename_map = {
            'ory': 'Category', 
            'subcategory': 'Sub Category', 
            'billingcategory': 'Billing Category'
        }
        df_src = df_src.rename(columns=rename_map)
        
        # Select target columns
        target_cols = ['Survey ID', 'Category', 'Sub Category', 'Billing Category']
        available_cols = [c for c in target_cols if c in df_src.columns]
        
        df_merge = df_src[available_cols].copy()
        df_merge['Survey ID'] = df_merge['Survey ID'].astype(str).str.strip()
        df_merge = df_merge.drop_duplicates(subset=['Survey ID'])
        
        # Prepare Biller DF for merge
        df['Survey ID'] = df['Survey ID'].astype(str).str.strip()
        
        # Drop existing empty category columns to avoid suffixing (_x, _y)
        to_drop = [c for c in category_cols if c in df.columns]
        df_enriched = pd.merge(df.drop(columns=to_drop), df_merge, on='Survey ID', how='left')
        
        print(f"    [ENRICH] Successfully merged categories for {city_full}.")
        return df_enriched
        
    except Exception as e:
        print(f"    [!] Enrichment Error: {e}")
        return df

def load_payment_history_map():
    if not os.path.exists(SCRAPED_DATA_DIR): return {}

    # Pattern updated to be more flexible (removed mandatory underscore before Full)
    pattern = os.path.join(SCRAPED_DATA_DIR, "COMBINED_ALL_CITIES_paid_ALL_HISTORY*Full.csv")
    files = glob.glob(pattern)
    if not files: return {}
    
    latest_file = max(files, key=os.path.getmtime)
    print(f"[*] Loading Payment History: {os.path.basename(latest_file)}")

    history_map = {}
    try:
        use_cols = ['PSID', 'Month', 'Status'] 
        # Force encoding for Urdu support
        df = pd.read_csv(latest_file, usecols=lambda x: x in use_cols, low_memory=False, encoding='utf-8-sig')
        df.columns = [c.strip() for c in df.columns]
        if 'Status' in df.columns:
            df = df[df['Status'].str.lower() == 'paid']
        
        df['PSID'] = df['PSID'].apply(clean_psid)
        # Normalize month for matching (e.g., 'Jan 2026' -> 'JAN2026')
        df['Month'] = df['Month'].astype(str).str.strip().str.upper().str.replace(" ", "") 

        grouped = df.groupby('PSID')
        for psid, group in grouped:
            history_map[psid] = {
                'months': set(group['Month'].unique()),
                'count': len(group)
            }
    except Exception as e:
        print(f"[!] Error loading history: {e}")
        return {}
    return history_map

def load_routing_map():
    """
    Loads manual routing data from Desktop CSV.
    Returns: (df_routing, csv_route_totals)
    """
    if not os.path.exists(ROUTING_FILE_PATH):
        print(f"[!] Routing file not found: {ROUTING_FILE_PATH}")
        return None, {}
    
    print(f"[*] Loading Routing Logic from: {os.path.basename(ROUTING_FILE_PATH)}")
    try:
        df = pd.read_csv(ROUTING_FILE_PATH, usecols=['Global Seq', 'Route Seq', 'Survey ID', 'Route Name'], dtype={'Survey ID': str}, low_memory=False)
        df['Survey ID'] = df['Survey ID'].str.strip()
        
        # Drop duplicates based on ALL columns to remove exact identical rows
        # But KEEP different route assignments for the same ID
        initial_count = len(df)
        df = df.drop_duplicates()
        final_count = len(df)
        if initial_count != final_count:
             print(f"    [!] Warning: Ignored {initial_count - final_count} exact duplicate rows in routing list.")
        
        # Check for multiple assignments (same ID, different routes)
        assignment_counts = df.groupby('Survey ID')['Route Name'].nunique()
        multi_assigned = assignment_counts[assignment_counts > 1]
        if not multi_assigned.empty:
            print(f"    [!] OK: Identified {len(multi_assigned)} Survey IDs with multiple route assignments. These will be duplicated in output.")

        # Calculate totals per route from the CSV source
        csv_route_totals = df.groupby('Route Name')['Survey ID'].nunique().to_dict()
        
        print(f"    -> Loaded {len(df)} unique routing points.")
        return df, csv_route_totals
    except Exception as e:
        print(f"[!] Error loading routing: {e}")
        return None, {}

def load_survey_metadata(city_name):
    """
    Loads Survey Data (metadata) for the given city.
    Returns: DataFrame indexed by 'Survey ID' with columns: [Surveyor Name, Survey Date, Survey Time, Union Council]
    """
    filename = SURVEY_FILE_MAP.get(city_name)
    if not filename:
        print(f"[!] No survey data map found for {city_name}")
        return None
    
    path = os.path.join(SCRAPED_DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"[!] Survey data file not found: {filename}")
        return None
        
    print(f"[*] Loading Survey Metadata from: {filename}")
    try:
        # Columns to extract
        target_cols = ['Survey ID', 'Surveyor Name', 'Survey Date', 'Survey Time', 'Union Council', 'Latitude', 'Longitude']
        
        # Check if columns exist first (optional reliability check)
        # Using usecols with lambda to avoid error if col missing, or just try/except
        df = pd.read_csv(path, usecols=lambda x: x in target_cols, low_memory=False)
        
        if 'Survey ID' not in df.columns:
            print("[!] 'Survey ID' column missing in survey data.")
            return None
            
        df['Survey ID'] = df['Survey ID'].astype(str).str.strip()
        
        # Remove duplicates (keep last or first? First usually fine)
        df = df.drop_duplicates(subset=['Survey ID'])
        df = df.set_index('Survey ID')
        
        print(f"    -> Loaded metadata for {len(df)} IDs.")
        return df
        
    except Exception as e:
        print(f"[!] Error reading survey data: {e}")
        return None

def scan_biller_start_dates(city_full):
    start_map = {}
    if not os.path.exists(BILLER_DUMPS_DIR): return {}
    
    pattern = os.path.join(BILLER_DUMPS_DIR, f"Biller_{city_full}_*.csv")
    files = glob.glob(pattern)
    print(f"[*] Analyzing Lifecycle from {len(files)} biller files...")
    
    for f in tqdm(files, unit="file", desc="Scanning Biller History", leave=False):
        fname = os.path.basename(f)
        try:
            parts = fname.replace(".csv", "").split("_")
            date_str = parts[-1]
            dt = datetime.strptime(date_str, "%b%Y")
            month_key = dt.strftime("%Y-%m")
            
            # Force encoding for Urdu support
            df = pd.read_csv(f, usecols=['Biller PSID'], low_memory=False, encoding='utf-8-sig')
            df['Biller PSID'] = df['Biller PSID'].apply(clean_psid)
            psids = df[df['Biller PSID'] != ""]['Biller PSID'].unique()
            
            for p in psids:
                if p not in start_map:
                    start_map[p] = month_key
                else:
                    if month_key < start_map[p]:
                        start_map[p] = month_key
        except Exception as e:
            continue
            
    return start_map

def scan_pdf_history(city_folder, months_to_scan):
    pdf_map = {}
    city_path = os.path.join(INPUT_ROOT, city_folder)
    
    print(f"[*] Scanning PDF History for months: {months_to_scan}")
    
    for mon in months_to_scan:
        mon_path = os.path.join(city_path, mon)
        if not os.path.exists(mon_path): continue
        
        pdfs = glob.glob(os.path.join(mon_path, "*.pdf"))
        # Fast scan
        psid_pattern = r'(?:PSID|Reference Number|Ref\s*#)[:\s]*(\d{11,20})'
        
        for pdf_file in tqdm(pdfs, desc=f"Scanning {mon}", leave=False):
            try:
                doc = fitz.open(pdf_file)
                for page in doc:
                    text = page.get_text()
                    matches = re.findall(psid_pattern, text, re.IGNORECASE)
                    for m in matches:
                        if m not in pdf_map: pdf_map[m] = set()
                        pdf_map[m].add(mon)
                doc.close()
            except:
                pass
                
    return pdf_map

def extract_data_from_page(page_text, page_num, filename):
    psid_pattern = r'(?:PSID|Reference Number|Ref\s*#)[:\s]*(\d{11,20})'
    arrears_pattern = r'Arrears[:\s]*([\d,]+)'

    raw_psids = re.findall(psid_pattern, page_text, re.IGNORECASE)
    raw_arrears = re.findall(arrears_pattern, page_text, re.IGNORECASE)
    
    unique_psids = []
    seen = set()
    for p in raw_psids:
        if p not in seen:
            unique_psids.append(p)
            seen.add(p)
            
    extracted_records = []
    count_bills = len(unique_psids)
    all_arrears_values = [clean_amount(a) for a in raw_arrears]
    
    for i, psid in enumerate(unique_psids):
        bill_arrears = 0
        if all_arrears_values:
            if count_bills == 1:
                bill_arrears = max(all_arrears_values)
            else:
                mentions_total = len(all_arrears_values)
                mentions_per_bill = max(1, mentions_total // count_bills)
                start_idx = i * mentions_per_bill
                end_idx = start_idx + mentions_per_bill
                slice_vals = all_arrears_values[start_idx:end_idx]
                if slice_vals:
                    bill_arrears = max(slice_vals)

        survey_id = PSID_TO_SURVEY_MAP.get(str(psid), "N/A")

        extracted_records.append({
            "psid": psid,
            "survey_id": survey_id,
            "arrears": bill_arrears
        })

    return extracted_records


def process_pdf(pdf_path, city_name, month_folder):
    filename = os.path.basename(pdf_path)
    results = []
    try:
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            text = page.get_text()
            if not text: continue
            
            page_records = extract_data_from_page(text, i+1, filename)
            
            for rec in page_records:
                results.append({
                    "City": city_name,
                    "Month": month_folder,
                    "Filename": filename,
                    "Page": i + 1,
                    "PSID": rec['psid'],
                    "Survey ID": rec['survey_id'],
                    "Arrears": rec['arrears'],
                    "SourceFile": pdf_path
                })
        doc.close()
    except Exception as e:
        print(f"[!] Error processing {filename}: {e}")
    return results

def get_testing_selection(cities):
    print("\n--- Test Mode: Select Folder ---")
    print("Available Cities:")
    for idx, c in enumerate(cities, 1):
        print(f"[{idx}] {c}")
    
    while True:
        try:
            choice = int(input("Select City (Number): "))
            if 1 <= choice <= len(cities):
                selected_city = cities[choice-1]
                break
            print("Invalid.")
        except ValueError: pass

    city_path = os.path.join(INPUT_ROOT, selected_city)
    months = [d for d in os.listdir(city_path) if os.path.isdir(os.path.join(city_path, d))]
    
    if not months:
        print("[!] No months found.")
        return None, None

    print(f"\nAvailable Months for {selected_city}:")
    for idx, m in enumerate(months, 1):
        print(f"[{idx}] {m}")

    while True:
        try:
            choice = int(input("Select Month (Number): "))
            if 1 <= choice <= len(months):
                selected_month = months[choice-1]
                break
            print("Invalid.")
        except ValueError: pass
            
    return selected_city, selected_month

def generate_enhanced_report(city_code, month_folder):
    """
    Encapsulated Logic to generate report for One City + One Month.
    """
    print(f"\n>>> Processing Batch Job: {city_code}/{month_folder}")
    
    # 1. Check Input Exists (with fuzzy fallback for January)
    city_path = os.path.join(INPUT_ROOT, city_code)
    month_path = os.path.join(city_path, month_folder)
    
    if not os.path.exists(month_path):
        # Fuzzy fallback: If looking for jan-26, check for jan-25 (common typo on disk)
        if 'jan' in month_folder.lower():
            alternatives = ['jan-25', 'jan25', 'january', 'jan']
            found_alt = False
            for alt in alternatives:
                alt_path = os.path.join(city_path, alt)
                if os.path.exists(alt_path):
                    print(f"    [!] '{month_folder}' not found. Using fuzzy match: '{alt}'")
                    month_path = alt_path
                    found_alt = True
                    break
            if not found_alt:
                print(f"[!] Path not found: {month_path}")
                return None, None
        else:
            print(f"[!] Path not found: {month_path}")
            return None, None

    # 2. Extract Data
    pdf_files = glob.glob(os.path.join(month_path, "*.pdf"))
    if not pdf_files:
        print("[!] No PDFs found.")
        return None, None
    
    print(f"[*] Extracting Arrears ({len(pdf_files)} PDF files)...")
    all_data = []
    iterator = tqdm(pdf_files, unit="file", leave=False) if HAS_TQDM else pdf_files
    for pdf_path in iterator:
        file_records = process_pdf(pdf_path, city_code, month_folder)
        all_data.extend(file_records)
        
    if not all_data:
        print("[!] No data extracted.")
        return None, None

    # 3. Load Base Biller CSV
    b_filename, city_full = get_biller_filename(city_code, month_folder)
    b_path = os.path.join(BILLER_DUMPS_DIR, b_filename)
    
    if not os.path.exists(b_path):
        print(f"[!] Biller File '{b_filename}' missing. Skipping enhancement.")
        return None, None
        
    print(f"[*] Loading Biller File: {b_filename}")
    try:
        # Use utf-8-sig for Urdu compatibility
        df_biller = pd.read_csv(b_path, low_memory=False, encoding='utf-8-sig')
        df_biller.columns = [c.strip() for c in df_biller.columns]
        df_biller['Biller PSID'] = df_biller['Biller PSID'].apply(clean_psid)
        
        # --- ENRICHMENT LOGIC ---
        
        # NEW: Explicitly call Category Enrichment (Source B merge)
        # This restores Category, Sub Category, Billing Category from biller_data exports
        df_biller = enrich_biller_categories(df_biller, city_full, month_folder)
        
        # A. Arrears Merge
        df_extract = pd.DataFrame(all_data)
        df_extract_agg = df_extract.groupby('PSID')['Arrears'].max().reset_index()
        arrears_map = pd.Series(df_extract_agg.Arrears.values, index=df_extract_agg.PSID.astype(str)).to_dict()
        
        df_biller['City Name'] = city_full
        df_biller['Matched Survey ID'] = df_biller.apply(
            lambda x: x.get('Survey ID', '') if str(x['Biller PSID']) in arrears_map else '', axis=1
        )
        df_biller['Arrears'] = df_biller['Biller PSID'].map(arrears_map).fillna(0)
        
        # B. Start Month
        start_date_map = scan_biller_start_dates(city_full)
        df_biller['Start Month'] = df_biller['Biller PSID'].map(start_date_map).fillna('Unknown')

        # C. PDF History (Updated for Apr-26)
        target_pdf_months = ['Sep-25', 'Oct-25', 'Nov-25', 'Dec-25', 'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26']
        pdf_history_map = scan_pdf_history(city_code, target_pdf_months)
        for mon in target_pdf_months:
            col_name = f"{mon} PDF Issued"
            df_biller[col_name] = df_biller['Biller PSID'].apply(
                lambda x: "Yes" if x in pdf_history_map and mon in pdf_history_map[x] else "No"
            )

        # D. Payment History (Normalized for v4 Alignment)
        history_map = load_payment_history_map()
        pay_configs = [
            ("Sep 2025", "SEP2025"),
            ("Oct 2025", "OCT2025"),
            ("Nov 2025", "NOV2025"),
            ("Dec 2025", "DEC2025"),
            ("Jan 2026", "JAN2026"),
            ("Feb 2026", "FEB2026"),
            ("Mar 2026", "MAR2026"),
            ("Apr 2026", "APR2026"),
            ("May 2026", "MAY2026")
        ]
        for display_name, internal_key in pay_configs:
            col_name = f"{display_name} Paid"
            df_biller[col_name] = df_biller['Biller PSID'].apply(
                lambda x: "Yes" if x in history_map and internal_key in history_map[x]['months'] else "No"
            )
        df_biller['Total Payment Frequency'] = df_biller['Biller PSID'].apply(
            lambda x: history_map[x]['count'] if x in history_map else 0
        )

        # E. METADATA MERGE (Surveyor, Date, Time, UC) + Deleted Check
        df_survey_meta = load_survey_metadata(city_full)
        
        if df_survey_meta is not None:
            # Create helper columns in df_biller for merge
            # Assuming 'Survey ID' in biller matches scraped 'Survey ID'
            df_biller['Survey ID'] = df_biller['Survey ID'].astype(str).str.strip()
            
            # Identify valid IDs (those present in metadata)
            valid_ids = set(df_survey_meta.index)
            df_biller['Deleted in Portal'] = df_biller['Survey ID'].apply(
                lambda x: "Yes" if pd.notna(x) and x != "" and x not in valid_ids else "No"
            )
            
            # Map metadata columns
            # Using map is faster/easier than merge for specific cols if index is unique
            for col in ['Surveyor Name', 'Survey Date', 'Survey Time', 'Union Council', 'Latitude', 'Longitude']:
                if col in df_survey_meta.columns:
                    df_biller[col] = df_biller['Survey ID'].map(df_survey_meta[col])
            
            # Rename for Printer Compatibility
            df_biller = df_biller.rename(columns={'Latitude': 'Lat', 'Longitude': 'Lng'})
        else:
            df_biller['Deleted in Portal'] = "Unknown (Data Missing)"
            for col in ['Surveyor Name', 'Survey Date', 'Survey Time', 'Union Council']:
                df_biller[col] = ""

        # F. Reordering and Placeholders
        # Add Sr# first to avoid KeyError during reordering
        if 'Sr#' not in df_biller.columns:
            df_biller.insert(0, 'Sr#', range(1, len(df_biller) + 1))
        else:
            df_biller['Sr#'] = range(1, len(df_biller) + 1)

        # Add placeholders for missing portal columns with EXACT production naming
        # Total columns aimed for: 43 (Dec's 41 + Jan PDF + Jan Paid)
        placeholders = ['Last Bill Date &Time', 'Last Bill ID']
        for p_col in placeholders:
            if p_col not in df_biller.columns:
                df_biller[p_col] = ""

        # Reorder columns: Categories after Address
        cols = list(df_biller.columns)
        if 'Address' in cols:
            addr_idx = cols.index('Address')
            target_after_addr = ['Category', 'Sub Category', 'Billing Category']
            
            # Filter columns that are actually in the dataframe (now enriched)
            to_move = [c for c in target_after_addr if c in cols]
            
            # Remove them from their current positions
            for c in to_move:
                cols.remove(c)
                
            # Re-insert after Address
            for i, c in enumerate(to_move):
                cols.insert(addr_idx + 1 + i, c)
            
            if 'Sr#' in cols:
                cols.remove('Sr#')
                cols.insert(0, 'Sr#')
            
            df_biller = df_biller[cols]

        # --- ROUTING DECORATION (FOR PRINTER) ---
        df_routing, csv_route_totals = load_routing_map()
        
        if df_routing is not None:
            print(f"[*] Decorating records with Routing Metadata (Merge Mode)...")
            # Ensure types match for merging
            df_biller['Survey ID'] = df_biller['Survey ID'].astype(str).str.strip()
            df_routing['Survey ID'] = df_routing['Survey ID'].astype(str).str.strip()
            
            # Merge (left merge to keep original bills, duplicates are created if SID in multiple routes)
            df_biller = pd.merge(df_biller, df_routing, on='Survey ID', how='left')
            
            # Fix column names if they changed (not expected if columns were missing before merge)
            # Fill missing with defaults
            df_biller['Global Seq'] = df_biller['Global Seq'].fillna(999999).astype(int)
            df_biller['Route Seq'] = df_biller['Route Seq'].fillna(999999).astype(int)
            df_biller['Route Name'] = df_biller['Route Name'].fillna("Unrouted")
            df_biller['Route Total'] = df_biller['Route Name'].map(csv_route_totals).fillna(0).astype(int)
            
            # For backward compatibility with printer
            df_biller = df_biller.rename(columns={'Route Name': 'Route Segment'})
            
            # Count routed vs unrouted for log
            routed_count = len(df_biller[df_biller['Route Segment'] != "Unrouted"])
            print(f"    [OK] Tagged {routed_count} records with route sequences (Expansion: {len(df_biller)} total rows)")
        else:
            # Initialize with defaults if no routing file
            df_biller['Global Seq'] = 999999
            df_biller['Route Seq'] = 999999
            df_biller['Route Segment'] = "Unrouted"
            df_biller['Route Total'] = 0

        # --- EXTERNAL DELETION LIST ---
        if os.path.exists(DELETION_LIST_PATH):
            try:
                df_del = pd.read_excel(DELETION_LIST_PATH)
                sid_col = 'SID' if 'SID' in df_del.columns else df_del.columns[-1]
                del_sids = set(df_del[sid_col].astype(str).str.replace(r'\.0$', '', regex=True).str.strip())
                print(f"[*] Loading Deletion List: {os.path.basename(DELETION_LIST_PATH)} ({len(del_sids)} IDs)")
                
                if 'Deleted in Portal' not in df_biller.columns:
                    df_biller['Deleted in Portal'] = 'No'
                
                match_mask = df_biller['Survey ID'].astype(str).str.strip().isin(del_sids)
                df_biller.loc[match_mask, 'Deleted in Portal'] = 'Yes'
                marked = match_mask.sum()
                print(f"    [OK] Marked {marked} records as deleted from external list.")
            except Exception as e:
                print(f"    [!] Warning: Could not load deletion list: {e}")
        else:
            print(f"[*] No external deletion list found at: {os.path.basename(DELETION_LIST_PATH)}")

        # --- SAVE ---
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        out_name = f"test_lifecycle_{b_filename.replace('.csv', '')}.xlsx"
        out_path = os.path.join(OUTPUT_DIR, out_name)
        
        try:
            df_biller.to_excel(out_path, index=False)
            print(f"[OK] Saved: {out_name}")
        except PermissionError:
            out_name = f"test_lifecycle_{b_filename.replace('.csv', '')}_{timestamp}.xlsx"
            out_path = os.path.join(OUTPUT_DIR, out_name)
            df_biller.to_excel(out_path, index=False)
            print(f"[OK] Saved (Fallback): {out_name}")
            
        return df_biller, out_path

    except Exception as e:
        print(f"[!] Error processing batch item: {e}")
        import traceback
        traceback.print_exc()
        return None, None

import argparse

def main():
    parser = argparse.ArgumentParser(description="PDF PSID/Arrears Extractor V6.0")
    parser.add_argument("--mode", choices=["2", "3"], default="2", help="Processing Mode: 2=Interactive/Single, 3=Batch")
    parser.add_argument("--month", choices=["dec-25", "jan-26", "feb-26", "mar-26", "apr-26", "may-26"], default="may-26", help="Month to process")
    parser.add_argument("--city", help="City code for mode 2 (e.g. sgd, ksb, bhl)")
    args = parser.parse_args()

    print("=== PDF PSID/Arrears Extractor V6.0 (Metadata Integration) ===\n")
    
    if not HAS_FITZ:
        print("[!] CRITICAL: PyMuPDF (fitz) library missing.")
        return

    ensure_dir(OUTPUT_DIR)
    
    # NEW: Load Biller PSID -> Survey ID mapping at startup
    load_biller_data_full()
    
    mode = args.mode
    
    if mode == '2':
        # Interactive / Single
        if args.city and args.month:
            c, m = args.city, args.month
        else:
            c, m = get_testing_selection([d for d in os.listdir(INPUT_ROOT) if os.path.isdir(os.path.join(INPUT_ROOT, d))])
            
        if c and m:
            generate_enhanced_report(c, m)
            
    elif mode == '3':
        # Batch Mode
        target_month = args.month
             
        print(f"\n[*] Starting Batch Process for {target_month.upper()}...")
        BATCH_JOBS = [
            {'city': 'sgd', 'month': target_month},
            {'city': 'ksb', 'month': target_month},
            {'city': 'bhl', 'month': target_month}
        ]
        
        combined_dfs = []
        
        for job in BATCH_JOBS:
            df, path = generate_enhanced_report(job['city'], job['month'])
            if df is not None:
                combined_dfs.append(df)
        
        # Merge All
        if combined_dfs:
            print("\n[*] Generating Combined Master List...")
            try:
                # Concatenate
                master_df = pd.concat(combined_dfs, ignore_index=True)
                
                # Dynamic Output Naming
                try:
                    dt = datetime.strptime(target_month, "%b-%y")
                    month_clean = dt.strftime("%b%Y")
                except:
                    month_clean = target_month.replace("-", "").capitalize()
                
                out_name = f"Combined_{month_clean}_Master_List.xlsx"
                out_path = os.path.join(OUTPUT_DIR, out_name)
                
                try:
                    master_df.to_excel(out_path, index=False)
                    print(f"[OK] Master List Saved: {out_name}")
                except PermissionError:
                    timestamp = datetime.now().strftime('%H%M%S')
                    out_name = f"Combined_{month_clean}_Master_List_{timestamp}.xlsx"
                    out_path = os.path.join(OUTPUT_DIR, out_name)
                    master_df.to_excel(out_path, index=False)
                    print(f"[OK] Master List Saved (Fallback): {out_name}")
                    
                # --- DELETION SUMMARY ---
                total_deleted = 0
                if 'Deleted in Portal' in master_df.columns:
                    total_deleted = master_df[master_df['Deleted in Portal'] == 'Yes'].shape[0]
                print(f"\\n=== Final Batch Summary ===")
                print(f"[*] {total_deleted} total IDs were marked as 'Deleted in Portal' based on SID-zubair.xlsx")
                # ----------------------------
                
            except Exception as e:
                print(f"[!] Error generating master list: {e}")
                
        print("\n=== Batch Process Complete ===")

if __name__ == "__main__":
    main()