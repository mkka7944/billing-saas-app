#!/usr/bin/env python3
"""
Universal Bill Extractor v10 (Final Production)
- Architecture: Fresh Session Isolation (prevents data mixing).
- Fixes: Hybrid Data Keys, Magic Category Key, Context Switching.
- Output: Auto-Sorted, Month-Filtered, with Sequential Serial Numbers.
"""

import sys
import requests
import csv
import os
import time
import pandas as pd
import re
import config
from datetime import datetime
from urllib.parse import urljoin
import math
import concurrent.futures

if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

# --- CONSTANTS ---
LOGIN_URL = "https://suthra.punjab.gov.pk/suthra-punjab/backend/public/api/login"
SWITCH_URL = "https://suthra.punjab.gov.pk/suthra-punjab/backend/public/api/hrmis/set-active-designation"
GET_DATA_URL = "https://suthra.punjab.gov.pk/suthra-punjab/backend/public/api/autoform/get-item-listing"
BASE_HOST = "https://suthra.punjab.gov.pk"

PAGE_SIZE = 250
REQUEST_RETRIES = 3
SESSION_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/96.0.4664.110 Safari/537.36',
    'Content-Type': 'application/json',
    'Origin': BASE_HOST,
    'Referer': f"{BASE_HOST}/suthra-billing/view/suthra-punjab-bills",
}

CHANNEL_MAP = {"1": "1Bill", "2": "BOP OTC", "0": "OTC/Cash"}

# Full Columns for API Request
FULL_DISPLAY_COLUMNS = [
    {"key": "sr_no", "column": True, "value": "Sr#"}, {"key": "print_serial", "column": True, "value": "PDF JOB ID"},
    {"key": "psid", "column": True, "value": "PSID"}, {"key": "month_str", "column": True, "value": "Month"},
    {"key": "attached_department_id", "column": True, "value": "WMC"}, {"key": "division_id", "column": True, "value": "Division"},
    {"key": "district_id", "column": True, "value": "District"}, {"key": "tehsil_id", "column": True, "value": "Tehsil"},
    {"key": "office_id", "column": True, "value": "Office"}, {"key": "uc_id", "column": True, "value": "UC"},
    {"key": "biller_category_id", "column": True, "value": "Billing Category"}, {"key": "amount", "column": True, "value": "Amount"},
    {"key": "fine", "column": True, "value": "Fine"}, {"key": "bill_url", "column": True, "value": "Bill PDF"},
    {"key": "channel", "column": True, "value": "Channel"}, {"key": "paid_date", "column": True, "value": "Paid Date"},
    {"key": "paid_amount", "column": True, "value": "Paid Amount"}, {"key": "status", "column": True, "value": "Status"},
    {"key": "active", "column": True, "value": "Active"}, {"key": "action", "column": True, "value": "Action"}
]

# --- COLUMN DEFINITIONS ---
COLS_CSV = [
    "Sr#", "PSID", "Month", "WMC", "Division", "District", "Tehsil", "Office", 
    "UC", "Billing Category", "Amount", "Fine", "Bill PDF", "Channel", 
    "Paid Date", "Paid Amount", "Status", "Active"
]

COLS_EXCEL = [
    "Sr#", "PSID", "Month", "Office", "UC", "Billing Category", 
    "Amount", "Fine", "Channel", "Paid Date", "Paid Amount", "Active"
]

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def build_full_url(fragment):
    if not fragment or not isinstance(fragment, str): return ""
    fragment = fragment.strip()
    if fragment.startswith(("http://", "https://")): return fragment
    return urljoin(BASE_HOST, fragment)

def create_fresh_session(profile_key):
    creds = config.CREDENTIALS.get(profile_key)
    if not creds or "YOUR_" in creds.get("CNIC", ""):
        print(f"[SKIP] {profile_key}: Credentials not set in config.py")
        return None

    print(f"   [AUTH] Logging in Identity: {profile_key}...")
    s = requests.Session()
    s.headers.update(SESSION_HEADERS)
    
    try:
        payload = {"cnic": creds["CNIC"], "password": creds["PASSWORD"], "user_type": creds["USER_TYPE"]}
        resp = s.post(LOGIN_URL, json=payload, timeout=25)
        resp.raise_for_status()
        token = resp.json().get("data", {}).get("token")
        if not token: raise RuntimeError("No token returned.")
        s.headers.update({"Authorization": f"Bearer {token}"})
        print("      ✅ Login Success!")
        return s
    except Exception as e:
        print(f"      ❌ Login Failed: {e}")
        return None

def switch_context(session, designation_id, city_name):
    print(f"   🔀 Switching Context for {city_name} (Designation: {designation_id})...")
    payload = {"designation_id": designation_id}
    try:
        r = session.post(SWITCH_URL, json=payload, timeout=20)
        r.raise_for_status()
        print(f"      [OK] Context Switched.")
        return True
    except Exception as e:
        print(f"      [ERR] Context Switch Failed: {e}")
        return False

def extract_records_from_response(data):
    if not data: return []
    payload = data.get("data", data)
    if isinstance(payload, dict):
        for key in ("listings", "items", "records", "data"):
            if isinstance(payload.get(key), list): return payload[key]
    return payload if isinstance(payload, list) else []

def fetch_page(session, payload, page_num, retry_count=3):
    """Worker function for parallel page fetching."""
    local_payload = payload.copy()
    local_payload["page"] = page_num
    
    for _ in range(retry_count):
        try:
            r = session.post(GET_DATA_URL, json=local_payload, timeout=45)
            r.raise_for_status()
            return extract_records_from_response(r.json())
        except Exception as e:
            print(f"      ⚠️ Page {page_num} Retry Error: {e}")
            time.sleep(2)
    return []

def fetch_bills(session, job_details, status_arg, use_manual=False):
    city = job_details['city_name']
    final_status = status_arg.upper()
    target_office = job_details.get('office_id', "")
    
    des_id = job_details.get('designation_id')
    if des_id:
        if not switch_context(session, des_id, city):
            return [], 0

    print(f"   📡 [FETCH] -> {city} ({final_status})...")
    
    # 2. CHECK FOR MANUAL FALLBACK FILE (Only if enabled)
    if use_manual:
        manual_file = os.path.join(config.OUTPUT_DIR, f"{city}_{final_status.lower()}_manual.csv")
        if os.path.exists(manual_file):
            print(f"      📥 [MANUAL] Loading File: {manual_file}")
            try:
                # Use quotechar and handle empty correctly
                df_manual = pd.read_csv(manual_file, quotechar='"')
                print(f"      [OK] [MANUAL] Loaded {len(df_manual)} records.")
                manual_records = df_manual.to_dict('records')
                return manual_records, len(manual_records)
            except Exception as e:
                print(f"      [WARN] [MANUAL] Failed to read file: {e}")
                print(f"      [BACKUP] Falling back to Portal Fetching...")
        else:
            print(f"      [INFO] No manual file found for {city}. Proceeding with Portal Fetch.")

    # Use City-Specific Settings from Config
    pg_size = job_details.get('size', PAGE_SIZE)
    max_workers = job_details.get('workers', 5)

    # Base Payload with Sorting Hint
    base_payload = {
        "slug": "suthra-punjab-bills", 
        "id": "0", "page": 1, "size": pg_size,
        "search_keyword": "", "sorting": job_details.get('sorting', "paid_date desc"),
        "requesting_url": "/suthra-billing/view/suthra-punjab-bills",
        "displayedColumnsAll": FULL_DISPLAY_COLUMNS,
        "filters_data": {
            "status": final_status,
            "division_id": job_details['division_id'],
            "district_id": job_details['district_id'],
            "office_id": target_office, "uc_id": "", "active": ""
        },
        "user_type": "contractor", "plateform": "web"
    }

    # 1. Fetch Page 1 to get Total Count
    try:
        r = session.post(GET_DATA_URL, json=base_payload, timeout=45)
        r.raise_for_status()
        resp_json = r.json()
        total_in_db = resp_json.get("data", {}).get("totalInDB", 0)
        pg_size = job_details.get('size', PAGE_SIZE)
        total_pages = math.ceil(total_in_db / pg_size)
        first_page_items = extract_records_from_response(resp_json)
        print(f"      📊 Portal confirms total records in DB: {total_in_db} ({total_pages} pages)")
        print(f"      ✅ Page 1/{total_pages} fetched ({len(first_page_items)} records)")
    except Exception as e:
        print(f"      ❌ Failed to fetch first page: {e}")
        return [], 0

    if total_in_db == 0:
        return [], 0

    all_records = list(first_page_items)
    
    if total_pages > 1:
        print(f"      🚀 Parallel Fetching {total_pages - 1} remaining pages (Workers: {max_workers})...")
        pages_to_fetch = range(2, total_pages + 1)
        
        # 2. Parallel Fetching for remaining pages
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_page = {executor.submit(fetch_page, session, base_payload, p, REQUEST_RETRIES): p for p in pages_to_fetch}
            for future in concurrent.futures.as_completed(future_to_page):
                pg = future_to_page[future]
                try:
                    items = future.result()
                    if items:
                        all_records.extend(items)
                        print(f"      ✅ Page {pg}/{total_pages} fetched ({len(items)} records)")
                except Exception as e:
                    print(f"      ❌ Page {pg}/{total_pages} generated an exception: {e}")

    return all_records, total_in_db

def process_data(raw_records, city_name, status, target_month):
    if not raw_records: return None

    # The Magic Key from V2 logic
    cat_key = "biller_categories.bill_category_id.category,' ', sub_category, ' ',billing_category"

    # Helper for truly empty values (None, NaN, "", "nan")
    def is_empty_val(val):
        if val is None: return True
        if isinstance(val, float) and math.isnan(val): return True
        s = str(val).strip().lower()
        if s in ("", "nan", "none", "null"): return True
        return False

    def normalize_month_name(m_str):
        if is_empty_val(m_str): return ""
        m_str = str(m_str).strip()
        
        # 1. Try ISO Date (e.g., 2026-01-01 or 2026-01)
        try:
            if re.match(r'\d{4}-\d{2}', m_str):
                dt = datetime.strptime(m_str[:7], '%Y-%m')
                return dt.strftime('%b%Y').upper()
        except: pass

        # 2. Try 'Month-YY' or 'Month YY' (e.g. Jan-26, Jan 26)
        match = re.search(r'([A-Za-z]{3,})[-\s]+(\d{2})$', m_str)
        if match:
            mon = match.group(1)[:3].upper()
            yr = match.group(2)
            return f"{mon}20{yr}"

        # 3. Try 'Month YYYY' with various separators
        match = re.search(r'([A-Za-z]{3,})[-\s\-/]*(\d{4})', m_str)
        if match:
            month_part = match.group(1)[:3].upper()
            year_part = match.group(2)
            return f"{month_part}{year_part}"
            
        # 4. Already normalized 'JAN2026'
        match = re.search(r'([A-Z]{3})(\d{4})', m_str.upper())
        if match:
            return match.group(0)
            
        return m_str.upper().replace(" ", "")

    rows = []
    for i, rec in enumerate(raw_records, 1):
        
        # Hybrid Extractor (Tries Flat Key, then Nested Key)
        def get_n(d, path):
            if path in d: return d[path] # Try Flat
            keys = path.split('.')
            val = d
            for k in keys: 
                if isinstance(val, dict): val = val.get(k, {})
                else: return ""
            if isinstance(val, (str, int, float)): return val
            return ""

        # Helper for case-insensitive get with robust empty check
        def get_ci(d, key, fallback=""):
            if key in d:
                val = d[key]
                if not is_empty_val(val): return val
            for k in [key.lower(), key.capitalize(), key.upper()]:
                if k in d:
                    val = d[k]
                    if not is_empty_val(val): return val
            return fallback

        raw_date = get_ci(rec, "paid_date") or get_ci(rec, "Paid Date") or get_ci(rec, "raw_date")
        pretty_date = ""
        iso_date = ""
        
        if raw_date:
            raw_str = str(raw_date).strip()
            # Try ISO First (%Y-%m-%d)
            try:
                dt = datetime.strptime(raw_str, '%Y-%m-%d')
                pretty_date = dt.strftime('%b %d, %Y')
                iso_date = dt.strftime('%Y-%m-%d')
            except:
                # Try Human Readable (%b %d, %Y)
                try:
                    dt = datetime.strptime(raw_str, '%b %d, %Y')
                    pretty_date = dt.strftime('%b %d, %Y')
                    iso_date = dt.strftime('%Y-%m-%d')
                except:
                    # Generic Fallback
                    pretty_date = raw_str
                    iso_date = raw_str

        # Smarter Channel Mapping
        raw_channel = str(get_ci(rec, "channel") or get_ci(rec, "Channel")).strip()
        channel_name = "Unknown"
        if raw_channel in CHANNEL_MAP:
            channel_name = CHANNEL_MAP[raw_channel]
        elif raw_channel in CHANNEL_MAP.values():
            channel_name = raw_channel
        else:
            # Try to match fuzzy
            for k, v in CHANNEL_MAP.items():
                if raw_channel.lower() in v.lower():
                    channel_name = v
                    break

        row = {
            "Sr#": i,
            "PSID": get_ci(rec, "psid") or get_ci(rec, "PSID"),
            "Month": normalize_month_name(get_ci(rec, "month_str") or get_ci(rec, "Month") or get_ci(rec, "month")),
            "WMC": get_n(rec, "attached_departments.attached_department_id.name") or get_ci(rec, "WMC"),
            "Division": get_n(rec, "divisions.division_id.name") or get_ci(rec, "Division"),
            "District": get_n(rec, "districts.district_id.name") or get_ci(rec, "District"),
            "Tehsil": get_n(rec, "tehsils.tehsil_id.name") or get_ci(rec, "Tehsil"),
            "Office": get_n(rec, "new_offices.office_id.name") or get_ci(rec, "Office"),
            "UC": get_n(rec, "sw_areas.uc_id.name") or get_ci(rec, "UC"),
            
            "Billing Category": rec.get(cat_key) or get_ci(rec, "biller_category_id") or get_ci(rec, "Billing Category"),
            
            "Amount": str(get_ci(rec, "amount") or get_ci(rec, "Amount")).replace(",", ""),
            "Fine": str(get_ci(rec, "fine") or get_ci(rec, "Fine")).replace(",", ""),
            "Bill PDF": build_full_url(get_ci(rec, "bill_url") or get_ci(rec, "Bill PDF")),
            "Channel": channel_name,
            "Paid Date": pretty_date,
            "raw_date": iso_date,
            "Paid Amount": str(get_ci(rec, "paid_amount") or get_ci(rec, "Paid Amount")).replace(",", ""),
            "Status": get_ci(rec, "status") or get_ci(rec, "Status"),
            "Active": get_ci(rec, "active") or get_ci(rec, "Active"),
            "City": city_name
        }
        rows.append(row)

    df = pd.DataFrame(rows)

    # Remove duplicates caused by API pagination shifting (exclude Sr# from check)
    initial_len = len(df)
    cols_to_check = [col for col in df.columns if col != "Sr#"]
    df = df.drop_duplicates(subset=cols_to_check, keep='first')
    if len(df) < initial_len:
        print(f"      🧹 Removed {initial_len - len(df)} duplicates caused by live API shifting.")

    # 2. Filter by Month
    if target_month:
        norm_target = normalize_month_name(target_month)
        original_count = len(df)
        df = df[df['Month'].str.upper() == norm_target.upper()]
        print(f"      [FILTER] Filtered by Month '{norm_target}': {original_count} -> {len(df)} records.")
        if len(df) == 0: return None

    # 3. Sort by Paid Date (Newest First)
    if "raw_date" in df.columns:
        df['sort_date'] = pd.to_datetime(df['raw_date'], errors='coerce').fillna(pd.Timestamp.min)
        df = df.sort_values(by="sort_date", ascending=False).drop(columns=['sort_date'])
    
    df['Sr#'] = range(1, len(df) + 1)
    return df

def save_files(df, city_name, status, target_month):
    ensure_dir(config.OUTPUT_DIR)
    month_label = target_month.replace(" ", "_") if target_month else "ALL_HISTORY"
    base_name = f"{city_name}_{status}_{month_label}"
    
    csv_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_Full.csv")
    csv_cols = [c for c in COLS_CSV if c in df.columns]
    df[csv_cols].to_csv(csv_path, index=False, encoding='utf-8-sig')

    xlsx_path = os.path.join(config.OUTPUT_DIR, f"{base_name}_Report.xlsx")
    excel_cols = [c for c in COLS_EXCEL if c in df.columns]
    
    try:
        df[excel_cols].to_excel(xlsx_path, index=False, sheet_name=city_name)
        print(f"      [OK] Saved: {os.path.basename(xlsx_path)}")
        print(f"      [OK] Saved: {os.path.basename(csv_path)}")
    except Exception as e:
        print(f"      [ERR] Save Failed: {e}")

import argparse

def main():
    parser = argparse.ArgumentParser(description="Universal Bill Extractor v10")
    parser.add_argument("--status", choices=["PAID", "UNPAID"], default="PAID", help="Status to fetch (default: PAID)")
    parser.add_argument("--month", default="", help="Filter by Month (e.g. 'Mar 2026')")
    parser.add_argument("--manual-bhalwal", action="store_true", help="Enable Manual CSV Injection for Bhalwal")
    args = parser.parse_args()
    print("=== Universal Bill Extractor v10 (Final Production) ===")
    start_time = time.time()
    
    # Hybrid Input: Use CLI args if provided, otherwise fallback to interactive input for Terminal
    if len(sys.argv) > 1:
        status_input = args.status
        month_input = args.month
        use_manual_bhalwal = args.manual_bhalwal
    else:
        # Independent Terminal Run - Restore Original Prompts
        status_input = input("Status to fetch (PAID/UNPAID) [PAID]: ").strip() or "PAID"
        month_input = input("Filter by Month (e.g. 'Mar 2026') or Enter for All: ").strip()
        manual_input = input("\nEnable Manual CSV Injection for Bhalwal? (y/n) [n]: ").strip().lower()
        use_manual_bhalwal = (manual_input == 'y')
    
    print(f"\n--- Execution Mode ---")
    print(f"   Status: {status_input}")
    if month_input: print(f"   Filter: {month_input}")
    
    summary_stats = []
    master_df_list = []

    for job in config.TARGET_JOBS:
        city = job['city_name']
        profile = job['profile']
        print(f"\n🚀 Starting Job: {city}")
        session = create_fresh_session(profile)
        if not session:
            print(f"      ❌ SKIPPING {city}: Authentication Failed.")
            summary_stats.append({"City": city, "Portal Total": 0, "Extracted": 0, "Status": "❌ AUTH_ERROR"})
            continue
        
        is_manual_mode = (city.lower() == "bhalwal" and use_manual_bhalwal)
        raw_data, total_in_db = fetch_bills(session, job, status_input, use_manual=is_manual_mode)
        
        df = process_data(raw_data, city, status_input, month_input)
        extracted_count = len(df) if df is not None else 0
        
        summary_stats.append({"City": city, "Portal Total": total_in_db, "Extracted": extracted_count, "Status": "✅ MATCH" if extracted_count == total_in_db else "❌ MISMATCH"})

        if df is not None and not df.empty:
            save_files(df, city, status_input, month_input)
            master_df_list.append(df)
        else:
            print("      ⚠️ No records found (Check Status/Month filter).")

        session.close()
        print(f"   [CLOSE] Session closed for {city}.")

    print("\n" + "="*50)
    print(f"{'CITY':<15} | {'PORTAL':<10} | {'EXTRACTED':<10} | {'MATCH'}")
    print("-" * 50)
    for stat in summary_stats:
        print(f"{stat['City']:<15} | {stat['Portal Total']:<10} | {stat['Extracted']:<10} | {stat['Status']}")
    print("="*50)

    if master_df_list:
        print("\n🔗 Merging all cities into one Master File...")
        master_df = pd.concat(master_df_list, ignore_index=True)
        if "raw_date" in master_df.columns:
            master_df['sort_date'] = pd.to_datetime(master_df['raw_date'], errors='coerce').fillna(pd.Timestamp.min)
            master_df = master_df.sort_values(by="sort_date", ascending=False).drop(columns=['sort_date'])
        
        master_df['Sr#'] = range(1, len(master_df) + 1)
        month_label = month_input.replace(" ", "_") if month_input else "ALL_HISTORY"
        combined_name = f"COMBINED_ALL_CITIES_{status_input}_{month_label}"
        csv_path = os.path.join(config.OUTPUT_DIR, f"{combined_name}_Full.csv")
        csv_cols = [c for c in COLS_CSV if c in master_df.columns]
        if "City" in master_df.columns: csv_cols.insert(2, "City") 
        master_df[csv_cols].to_csv(csv_path, index=False, encoding='utf-8-sig')
        
        xlsx_path = os.path.join(config.OUTPUT_DIR, f"{combined_name}_Report.xlsx")
        excel_cols = [c for c in COLS_EXCEL if c in master_df.columns]
        if "City" in master_df.columns: excel_cols.insert(2, "City")
        master_df[excel_cols].to_excel(xlsx_path, index=False, sheet_name="All Cities")
        print(f"[OK] GRAND TOTAL: {len(master_df)} Records Saved to:\n   -> {os.path.basename(xlsx_path)}")

    print(f"\n🎉 Total Duration: {time.time() - start_time:.2f}s\n✅ Script Finished.")

if __name__ == "__main__":
    main()