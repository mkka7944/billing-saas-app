#!/usr/bin/env python3
"""
Advanced Survey Extractor v6 - Multi-District/Tehsil Support
- Reads survey data by fetching a specified number of pages
- Processes multiple district/tehsil combinations:
  1. District Khushab (16) / Tehsil Khushab (133)
  2. District Sargodha (32) / Tehsil Sargodha (143)
  3. District Sargodha (32) / Tehsil Bhalwal (139)
- Outputs separate Excel/CSV files for each combination
- Outputs to Excel with clickable image URLs
- FIX: Aggressively hunts for 'Answers' in multiple possible keys (json/table/str).
- FIX: Force-parses stringified JSON to ensure nested fields appear as columns.
"""

import requests
import csv
import os
import time
import re
import json
import pandas as pd
from datetime import datetime, timedelta
from urllib.parse import urlparse, urljoin
from tqdm import tqdm
import sys

if sys.platform == "win32":
    import codecs
    sys.stdout.reconfigure(encoding='utf-8')

# -----------------------------
# USER CONFIG
# -----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FOLDER = os.path.join(BASE_DIR, "..", "outputs", "scraped_data")
AREAS_CSV = os.path.join(BASE_DIR, "..", "inputs", "config_files", "areas_export.csv")

LOGIN_URL = "https://suthra.punjab.gov.pk/suthra-punjab/backend/public/api/login"
GET_SURVEY_URL = "https://suthra.punjab.gov.pk/suthra-punjab/backend/public/api/autoform/get-item-listing"
BASE_HOST = "https://suthra.punjab.gov.pk"

# Credentials
CNIC = "3840111639195"
PASSWORD = "SGD2006@MHassan"
USER_TYPE = "HRMIS_USER"

# Networking
PAGE_SIZE = 250  # Increased from 50 to 250 records per page
REQUEST_RETRIES = 3
SESSION_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/96.0.4664.110 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://suthra.punjab.gov.pk',
    'Referer': 'https://suthra.punjab.gov.pk/survey-app/view/survey-submissions',
}

# Standard Columns required by API
DISPLAY_COLUMNS_ALL = [
    {"key":"sr_no","column":True,"value":"Sr#"}, {"key":"added_by","column":True,"value":"Submitted By"},
    {"key":"id","column":True,"value":"Survey ID"}, {"key":"district_id","column":True,"value":"District"},
    {"key":"tehsil_id","column":True,"value":"Tehsil"}, {"key":"uc_type","column":True,"value":"UC Type"},
    {"key":"village_id","column":True,"value":"Village/Beat"}, {"key":"uc_id","column":True,"value":"UC"},
    {"key":"location","column":True,"value":"Location"}, {"key":"answers_table","column":True,"value":"Answers"},
    {"key":"billers_list","column":True,"value":"Total Billers"}, {"key":"new_str","column":True,"value":"Attachment"},
    {"key":"added_by_str","column":False,"value":"Added By"}, {"key":"added_date_time","column":False,"value":"Added Date&Time"},
    {"key":"app_version","column":True,"value":"App Version"}, {"key":"action","column":True,"value":"Action"},
]

# District/Tehsil combinations to process
DISTRICT_TEHSIL_COMBINATIONS = [
    {"district_id": 16, "tehsil_id": 133, "district_name": "Khushab", "tehsil_name": "Khushab"},
    {"district_id": 32, "tehsil_id": 143, "district_name": "Sargodha", "tehsil_name": "Sargodha"},
    {"district_id": 32, "tehsil_id": 139, "district_name": "Sargodha", "tehsil_name": "Bhalwal"}
]

# -----------------------------
# HELPER FUNCTIONS
# -----------------------------
def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def sanitize_filename(name):
    if not isinstance(name, str): name = str(name)
    name = re.sub(r'[/\\]', '-', name)
    return re.sub(r'[:*?"<>|]', '', name)

def read_areas_csv(path):
    if not os.path.exists(path):
        print(f"❌ Error: areas_export.csv not found at: {path}")
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def build_full_attachment_url(fragment):
    if not fragment: return None
    fragment = fragment.strip().replace('public//', 'public/')
    if fragment.startswith(("http://", "https://")):
        return fragment
    return urljoin(BASE_HOST, f"/suthra-punjab/backend/public{fragment}")

def extract_attachment_urls_from_record(rec):
    urls = []
    att_field = rec.get("attachment") or rec.get("new_str") or ""
    if isinstance(att_field, str):
        hrefs = re.findall(r"href=['\"](.*?)['\"]", att_field)
        if hrefs:
            for h in hrefs: urls.append(build_full_attachment_url(h))
        else:
            parts = [p.strip() for p in att_field.split(",") if p.strip()]
            for p in parts: urls.append(build_full_attachment_url(p))
    return [u for u in urls if u]

def clean_surveyor_name(rec):
    raw_name = rec.get("added_by")
    if isinstance(raw_name, str) and not raw_name.isdigit():
        return raw_name.strip()
    composite = rec.get("added_by_str", "")
    if composite:
        clean = re.split(r'[/(\-]', composite)[0]
        return clean.strip()
    return ""

def create_clickable_link(url, link_text="View Image"):
    """Create Excel clickable hyperlink formula"""
    if not url:
        return ""
    # Escape any quotes in the URL
    escaped_url = url.replace('"', '""')
    return f'=HYPERLINK("{escaped_url}", "{link_text}")'

def split_timestamp(timestamp):
    """Split timestamp into separate date and time components"""
    if not timestamp:
        return "", ""
    
    # Handle various timestamp formats
    try:
        # Try to parse the timestamp
        # Common formats: "YYYY-MM-DD HH:MM:SS" or "DD/MM/YYYY HH:MM:SS"
        if ' ' in timestamp:
            date_part, time_part = timestamp.split(' ', 1)
            return date_part, time_part
        else:
            # If no space, assume it's just a date
            return timestamp, ""
    except:
        # If parsing fails, return as-is
        return timestamp, ""

# -----------------------------
# LOGIN & FETCH
# -----------------------------
def do_login():
    s = requests.Session()
    s.headers.update(SESSION_HEADERS)
    try:
        print("[KEY] Authenticating with Portal...", end="\r")
        resp = s.post(LOGIN_URL, json={"cnic": CNIC, "password": PASSWORD, "user_type": USER_TYPE}, timeout=25)
        resp.raise_for_status()
        token = resp.json().get("data", {}).get("token")
        if not token: raise RuntimeError("Token not found")
        s.headers.update({"Authorization": f"Bearer {token}"})
        print("[OK] Authentication Successful!       ")
        return s
    except Exception as e:
        raise RuntimeError(f"Login failed: {e}")

def fetch_survey_page(session, page, size, district_id, tehsil_id):
    payload = {
        "slug": "survey-submissions", "page": page, "size": size, 
        "displayedColumnsAll": DISPLAY_COLUMNS_ALL,
        "filters_data": {
            "district_id": str(district_id or ""), 
            "tehsil_id": str(tehsil_id or "")
        },
        "id": "0", "search_keyword": "", 
        "requesting_url": "/survey-app/view/survey-submissions", 
        "sorting": "", "user_type": "contractor", "plateform": "web"
    }
    
    for attempt in range(REQUEST_RETRIES):
        try:
            # Increase timeout to 60 seconds to handle slow responses
            r = session.post(GET_SURVEY_URL, json=payload, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            time.sleep(1)
    return {}

def extract_records_from_response(data):
    if not data: return []
    payload = data.get("data", data)
    if isinstance(payload, dict):
        # First check for the known path 'listings' which is where survey data is located
        if isinstance(payload.get("listings"), list): return payload["listings"]
        
        # Then check other possible keys
        for key in ("items", "records", "data"):
            if isinstance(payload.get(key), list): return payload[key]
        
        # If we didn't find any of the expected keys, let's check all keys
        for key, value in payload.items():
            if isinstance(value, list) and len(value) > 0:
                # Let's check if this looks like survey data
                if isinstance(value[0], dict) and ('id' in value[0] or 'survey_id' in value[0]):
                    return value
    return payload if isinstance(payload, list) else []

# -----------------------------
# NEW FUNCTION TO GET TOTAL RECORDS COUNT
# -----------------------------
def get_total_records_count(session, district_id, tehsil_id):
    """Get the total number of records available for a district/tehsil combination"""
    try:
        # Request just the first page with a small size (10) to quickly get pagination info
        data = fetch_survey_page(session, 1, 10, district_id, tehsil_id)
        if data and isinstance(data, dict):
            # Look for pagination info in various possible locations in the response
            payload = data.get("data", data)
            if isinstance(payload, dict):
                # Check for totalInDB field which contains the total record count
                if "totalInDB" in payload:
                    return payload["totalInDB"]
                
                # Check for pagination information first
                if "pagination" in payload and isinstance(payload["pagination"], dict):
                    pagination = payload["pagination"]
                    # Look for totalPages or similar pagination info
                    for key in ("totalPages", "total_pages", "lastPage", "last_page"):
                        if key in pagination:
                            total_pages = pagination[key]
                            # Calculate total records based on pages and page size
                            return total_pages * PAGE_SIZE
                    
                    # Look for total records count directly
                    for key in ("total", "count", "totalCount", "recordCount", "total_records"):
                        if key in pagination:
                            return pagination[key]
                        
                # Check for total count in the main payload
                for key in ("total", "count", "totalCount", "recordCount", "total_records"):
                    if key in payload:
                        return payload[key]
                        
    except Exception as e:
        print(f"   ⚠️ Could not determine total records: {e}")
    except Exception as e:
        print(f"   ⚠️ Could not determine total records: {e}")
    return None

def get_local_file_stats(district_name, tehsil_name):
    """Get the latest Survey ID and Record Count from the existing CSV file"""
    filename_base = f"{district_name.upper()}_{tehsil_name.upper()}_SURVEY_DATA"
    csv_filename = os.path.join(OUTPUT_FOLDER, f"{filename_base}.csv")
    
    if not os.path.exists(csv_filename):
        return 0, 0
        
    try:
        # Read only the Survey ID column to save memory
        df = pd.read_csv(csv_filename, usecols=['Survey ID'], low_memory=False)
        if df.empty:
            return 0, 0
            
        record_count = len(df)
        # Clean and convert to numeric
        max_id = pd.to_numeric(df['Survey ID'], errors='coerce').max()
        
        if pd.isna(max_id):
            return 0, record_count
            
        return int(max_id), record_count
    except Exception as e:
        # If column doesn't exist or file is corrupt
        return 0, 0

def process_district_tehsil_combination(session, district_id, tehsil_id, district_name, tehsil_name, num_pages, fetch_all=False, last_known_id=0, local_count=0):
    """Process a single district/tehsil combination and return the data"""
    first_page_data = None
    first_page_records = None
    stop_fetching = False
    
    # --- STRICT SYNC PRE-CHECK ---
    # --- STRICT SYNC PRE-CHECK ---
    if fetch_all:
        print(f"\n[SYNC] STARTING SYNC FOR {district_name.upper()} DISTRICT/{tehsil_name.upper()} TEHSIL...")
        
        # 1. Get Latest Server ID (The Source of Truth)
        # Fetch just 1 record to see what the latest ID is
        latest_server_id = 0
        try:
            peek_data = fetch_survey_page(session, 1, 10, district_id, tehsil_id)
            peek_recs = extract_records_from_response(peek_data)
            if peek_recs:
                latest_server_id = int(peek_recs[0].get('id', 0))
        except Exception as e:
            print(f"   [WARN] Could not fetch latest ID: {e}")

        # 2. Compare with Local
        print(f"   [STATS] SYNC CHECK:")
        print(f"      - Latest Server ID: {latest_server_id}")
        print(f"      - Local Max ID:     {last_known_id}")
        
        # Logic: If Server ID > Local ID, we NEED to sync.
        # Even if totals match (or local is higher due to duplicates), ID is the authority.
        
        if last_known_id > 0 and latest_server_id <= last_known_id:
             print(f"   [OK] UP TO DATE. Latest Server ID ({latest_server_id}) is not newer than Local ({last_known_id}).")
             print(f"      Skipping download.")
             return []
        
        if last_known_id == 0:
            print("   [INFO] First time download (or no local data). Fetching ALL.")
            # Try to get total pages for progress bar
            try:
                total_in_db = get_total_records_count(session, district_id, tehsil_id)
                if total_in_db:
                    num_pages = (total_in_db // PAGE_SIZE) + 2
                else:
                    num_pages = 1000
            except:
                num_pages = 1000
        else:
            print(f"   [DATA] New data available. Starting Smart Sync until last known ID ({last_known_id}) is reached.")
            
            # We don't know exactly how many pages because IDs might skip, 
            # but we set a high limit and rely on the 'stop_fetching' logic in the loop.
            num_pages = 1000 
    else:

        print(f"\n[SYNC] FETCHING DATA FROM {district_name.upper()} DISTRICT/{tehsil_name.upper()} TEHSIL FOR {num_pages} PAGES...\n")
        if last_known_id > 0:
            print(f"   [SYNC] Incremental Mode: Will stop if Survey ID <= {last_known_id} is encountered")
    
    area_records_raw = []
    
    # Fetch specified number of pages
    if fetch_all:
        print(f"   [IN] Scanning for new records (Max limit: {num_pages} pages)...")
    else:
        print(f"   [IN] Fetching {num_pages} pages of data...")
    total_records_fetched = 0
    
    # Create a progress bar for pages
    with tqdm(total=num_pages, desc="   [PAGE] Fetching pages", leave=True) as page_bar:
        for page in range(1, num_pages + 1):
            page_bar.set_description(f"   [PAGE] Fetching page {page}/{num_pages}")
            
            # Use first page data if we already fetched it for pagination info
            if fetch_all and page == 1 and first_page_records:
                recs = first_page_records
            else:
                data = fetch_survey_page(session, page, PAGE_SIZE, district_id, tehsil_id)
                recs = extract_records_from_response(data)
            
            if not recs: 
                print(f"   [WARN] No more records found on page {page}")
                break
            
            # Filter records if we have a last_known_id
            page_records = []
            for rec in recs:
                rec_id = int(rec.get('id', 0))
                if last_known_id > 0 and rec_id <= last_known_id:
                    stop_fetching = True
                    # Don't break immediately here if we want to process earlier records in this page?
                    # No, assumption is descending order (newest first). 
                    # If we hit an old record, we are done.
                    break 
                page_records.append(rec)
            
            area_records_raw.extend(page_records)
            total_records_fetched += len(page_records)
            page_bar.update(1)
            
            if stop_fetching:
                print(f"\n   [STOP] Reached known Survey ID {last_known_id}. Stopping fetch.")
                break
                
            time.sleep(0.2)
    
    print()  # New line after progress updates
    
    if not area_records_raw:
        print(f"   ⚠️ No records found for {district_name} District/{tehsil_name} Tehsil.")
        return []
        
    processed_area_data = []
    for raw in area_records_raw:
        # Extract location information from the record
        uc_name = raw.get('sw_areas.uc_id.name', 'Unknown UC')
        
        flat_row = flatten_record(raw, district_name, tehsil_name, uc_name)
        processed_area_data.append(flat_row)
    
    if not processed_area_data:
        print(f"   ⚠️ No records found for {district_name} District/{tehsil_name} Tehsil.")
        return []
        
    return processed_area_data

# -----------------------------
# DATA PROCESSOR (Deep Drill Logic)
# -----------------------------
def flatten_record(rec, district_name, tehsil_name, uc_name):
    # Parse GPS coordinates into separate lat/long columns for mymapp
    gps_coords = rec.get("location", "")
    latitude = ""
    longitude = ""
    if gps_coords and "," in gps_coords:
        try:
            lat_str, long_str = gps_coords.split(",", 1)
            latitude = lat_str.strip()
            longitude = long_str.strip()
        except:
            pass  # Keep empty if parsing fails
    
    flat = {
        "Survey ID": rec.get("id") or rec.get("survey_id"),
        "Surveyor Name": clean_surveyor_name(rec),
        "Latitude": latitude,
        "Longitude": longitude,
        "District": district_name,
        "Tehsil": tehsil_name,
        "Union Council": uc_name,
        "UC Type": rec.get("uc_type"),
    }    
    # Split timestamp into date and time
    timestamp = rec.get("added_date_time", "")
    date_part, time_part = split_timestamp(timestamp)
    flat["Survey Date"] = date_part
    flat["Survey Time"] = time_part
    
    # Images - Extract URLs
    urls = extract_attachment_urls_from_record(rec)
    flat["Image URLs"] = " | ".join(urls)
    
    # Create separate clickable link columns for up to 3 images (for Excel only)
    for i in range(3):
        if i < len(urls):
            flat[f"Clickable Image {i+1}"] = create_clickable_link(urls[i], f"Image {i+1}")
        else:
            flat[f"Clickable Image {i+1}"] = ""
    
    # Create separate URL columns for up to 4 images (for CSV only)
    for i in range(4):
        if i < len(urls):
            flat[f"Image URL {i+1}"] = urls[i]
        else:
            flat[f"Image URL {i+1}"] = ""
    
    # --- DEEP DRILL FOR ANSWERS ---
    # Try all possible keys where answers might hide
    answers = rec.get("answers_json") or rec.get("answers_table") or rec.get("answers")
    
    # If it's a string that looks like a dict, try to parse it
    if isinstance(answers, str) and answers.strip().startswith("{"):
        try:
            answers = json.loads(answers)
        except:
            pass # Keep as string if parse fails

    # Initialize consumer type as domestic by default
    consumer_type = "Domestic"
    
    # Track if we have house type and type fields
    house_type_value = ""
    type_value = ""
    
    # Case A: Dictionary (Ideal)
    if isinstance(answers, dict):
        for k, v in answers.items():
            clean_key = k.replace("_", " ").title()
            # Handle if value is a list or dict
            if isinstance(v, (dict, list)): v = str(v)
            flat[clean_key] = str(v).strip()
            
            # Capture house type and type field values for consumer classification
            if clean_key.lower() == "house type":
                house_type_value = str(v).strip()
            elif clean_key.lower() == "type":
                type_value = str(v).strip().lower()
                
        # Apply the simplified consumer type logic:
        # - If House Type field is empty -> Commercial
        # - If House Type field contains any value -> Domestic
        if house_type_value == '' or house_type_value.lower() == 'nan' or house_type_value.lower() == 'none':
            consumer_type = "Commercial"
        else:
            consumer_type = "Domestic"
                
    # Case B: Pipe Separated String (Legacy)
    elif isinstance(answers, str) and "|" in answers:
        parts = answers.split("|")
        house_type_value = ""
        type_value = ""
        
        for part in parts:
            if ":" in part:
                k, v = part.split(":", 1)
                flat[k.strip()] = v.strip()
                
                # Capture house type and type field values for consumer classification
                if k.lower().strip() == "house type":
                    house_type_value = v.strip()
                elif k.lower().strip() == "type":
                    type_value = v.strip().lower()
            else:
                flat["Additional Info"] = flat.get("Additional Info", "") + " " + part.strip()
                
        # Apply the simplified consumer type logic:
        # - If House Type field is empty -> Commercial
        # - If House Type field contains any value -> Domestic
        if house_type_value == '' or house_type_value.lower() == 'nan' or house_type_value.lower() == 'none':
            consumer_type = "Commercial"
        else:
            consumer_type = "Domestic"
    
    # Add the consumer type column
    flat["Consumer Type"] = consumer_type
    
    return flat

# -----------------------------
# MAIN WORKFLOW
# -----------------------------

def save_data_to_files(data, district_name, tehsil_name):
    """Save data to separate Excel and CSV files"""
    if not data:
        print(f"   ⚠️ No data to save for {district_name} District/{tehsil_name} Tehsil.")
        return
        
    print(f"\n🔗 Generating Files for {district_name} District/{tehsil_name} Tehsil (Please wait)...")
    df = pd.DataFrame(data)
    df.insert(0, "Sr#", range(1, len(df) + 1))
    
    # Use descriptive filename based on district/tehsil
    filename_base = f"{district_name.upper()}_{tehsil_name.upper()}_SURVEY_DATA"
    csv_filename = os.path.join(OUTPUT_FOLDER, f"{filename_base}.csv")
    
    # Sort by Survey Date if available
    if "Survey Date" in df.columns:
         df.sort_values(by=["Survey Date", "Survey Time"], ascending=False, inplace=True)
    
    # Check if existing file exists to append
    try:
        if os.path.exists(csv_filename):
            print(f"   [SYNC] Merging with existing data...")
            existing_df = pd.read_csv(csv_filename, low_memory=False)
            
            # Combine and remove duplicates based on Survey ID
            combined_df = pd.concat([df, existing_df], ignore_index=True)
            
            # Ensure proper types for duplicate dropping
            if 'Survey ID' in combined_df.columns:
                combined_df.drop_duplicates(subset=['Survey ID'], keep='first', inplace=True)
            else:
                combined_df.drop_duplicates(inplace=True)
                
            # Re-sort
            if "Survey Date" in combined_df.columns:
                 combined_df.sort_values(by=["Survey Date", "Survey Time"], ascending=False, inplace=True)
                 
            # Re-assign Sr#
            combined_df['Sr#'] = range(1, len(combined_df) + 1)
            
            df = combined_df # Update df to point to combined data for Excel writing
            df_csv = df.copy() # CSV version
            
            print(f"   [STATS] Total unique records after merge: {len(df)}")
            
        else:
            # If new file, just prepare for CSV logic below
            df_csv = df.copy()
            
    except Exception as e:
        print(f"   [WARN] Error merging with existing file: {e}. Saving new data only.")
        df_csv = df.copy()

    # Create Excel file with clickable links (Overwrite with full combined data)
    excel_filename = os.path.join(OUTPUT_FOLDER, f"{filename_base}.xlsx")
    
    # Truncate sheet name to 31 chars (Excel limit)
    sheet_title = f'{district_name} {tehsil_name} Survey Data'
    if len(sheet_title) > 31:
        sheet_title = sheet_title[:31]
        
    with pd.ExcelWriter(excel_filename, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_title)
    
    # Create CSV file with separate image URL columns and no clickable links
    # Remove clickable link columns for CSV and exclude the combined "Image URLs" column
    csv_columns = [col for col in df.columns if not col.startswith("Clickable Image") and col != "Image URLs"]
    df_csv = df_csv[csv_columns]
    
    # Reorder columns to put Image URL columns at the end
    image_url_columns = [col for col in csv_columns if col.startswith("Image URL")]
    other_columns = [col for col in csv_columns if not col.startswith("Image URL")]
    reordered_columns = other_columns + image_url_columns
    df_csv = df_csv[reordered_columns]        
    
    # Add error handling for file writing
    try:
        df_csv.to_csv(csv_filename, index=False, encoding='utf-8-sig')
    except PermissionError:
        print(f"[ERROR] Permission denied when writing CSV file: {csv_filename}")
        print("   Please close any applications that might be using this file and try again.")
        print("   Common causes: Excel has the file open, or Google Drive is syncing the file.")
        return
    except Exception as e:
        print(f"[ERROR] Error writing CSV file: {e}")
        return
    
    print(f"   [FILE] Records:   {len(data)}")
    print(f"   [FILE] EXCEL FILE: {excel_filename}")
    print(f"   [FILE] CSV FILE:   {csv_filename}")

def main():
    print("================================================")
    print("   Advanced Survey Extractor v6 (MULTI-DISTRICT)   ")
    print("================================================\n")
    ensure_dir(OUTPUT_FOLDER)
    
    # Read areas data from CSV
    areas = read_areas_csv(AREAS_CSV)
    if not areas:
        print("❌ Error: Could not read areas data")
        return
    
    # Get user choice for download mode
    if "--auto" in sys.argv:
        print(" [AUTO] AUTO MODE DETECTED: Defaulting to Option 3 (Strict Sync)")
        choice = "3"
    elif "--deploy" in sys.argv:
        print(" [DEPLOY] DEPLOY MODE DETECTED: Defaulting to Option 4 (Strict Sync - No Master)")
        choice = "4"
    elif "--all" in sys.argv:
        print(" [ALL] ALL MODE DETECTED: Defaulting to Option 2 (Fresh Download)")
        choice = "2"
    elif any(arg.startswith("--pages=") for arg in sys.argv):
        print(" [PAGES] PAGE LIMIT DETECTED: Defaulting to Option 1")
        choice = "1"
    else:
        print("Download Options:")
        print("1. Download specific number of pages")
        print("2. Download ALL available data (Fresh Download - ignores existing)")
        print("3. Strict Sync (Checks Portal Total vs Local Total -> Fetches only missing)")
        print("4. Deployment Mode (Strict Sync - No Master File)")
        choice = input("Select option (1, 2, 3, or 4): ").strip()
    
    fetch_all = False
    num_pages = 5  # Default
    incremental_mode = False
    skip_master_update = False

    
    if choice == "2":
        fetch_all = True
        print("Selected: Download ALL available data (Fresh Download)")
    elif choice == "3":
        fetch_all = True
        incremental_mode = True
        print("Selected: Strict Sync")
    elif choice == "4":
        fetch_all = True
        incremental_mode = True
        skip_master_update = True
        print("Selected: Deployment Mode (Strict Sync - No Master File)")
    else:
        # Get the number of pages to fetch
        pages_val = None
        for arg in sys.argv:
            if arg.startswith("--pages="):
                try: pages_val = int(arg.split("=")[1])
                except: pass
        if pages_val is not None:
            num_pages = pages_val
            print(f"Selected: Download specific number of pages -> {num_pages} pages")
        else:
            pages_input = input("Enter number of pages to fetch (e.g., 5 for 1250 records): ").strip()
            try:
                num_pages = int(pages_input)
                if num_pages <= 0:
                    print("Invalid number of pages. Using default of 5 pages.")
                    num_pages = 5
            except ValueError:
                print("Invalid input. Using default of 5 pages.")
                num_pages = 5

    session = do_login()
    
    # Process each district/tehsil combination
    all_processed_data = []
    
    for combo in DISTRICT_TEHSIL_COMBINATIONS:
        district_id = combo["district_id"]
        tehsil_id = combo["tehsil_id"]
        district_name = combo["district_name"]
        tehsil_name = combo["tehsil_name"]
        
        print(f"{'='*50}")
        print(f"Processing: {district_name} District/{tehsil_name} Tehsil")
        print(f"{'='*50}")
        
        # Determine last known ID for incremental fetch
        last_id = 0
        local_count = 0
        if incremental_mode:
            last_id, local_count = get_local_file_stats(district_name, tehsil_name)
            if last_id > 0:
                print(f"   🔍 Found existing data. Latest Survey ID: {last_id} | Total Records: {local_count}")
        
        # Process this combination
        processed_data = process_district_tehsil_combination(
            session, district_id, tehsil_id, district_name, tehsil_name, num_pages, fetch_all, last_id, local_count)
        
        # Save separate files for this combination
        save_data_to_files(processed_data, district_name, tehsil_name)
        
        # Add to master collection
        all_processed_data.extend(processed_data)
    
    # Create combined master files
    if skip_master_update:
        print("\n" + "="*50)
        print("SKIPPING MASTER FILE UPDATE (Deployment Mode)")
        print("="*50)
        return

    # REBUILD MASTER FROM ALL CITY FILES to ensure consistency
    print("\n" + "="*50)
    print("GENERATING COMBINED MASTER FILES (Rebuilding from City Files)")
    print("="*50)
    
    master_frames = []
    
    for combo in DISTRICT_TEHSIL_COMBINATIONS:
         d_name = combo["district_name"].upper()
         t_name = combo["tehsil_name"].upper()
         fname = f"{d_name}_{t_name}_SURVEY_DATA.csv"
         fpath = os.path.join(OUTPUT_FOLDER, fname)
         
         if os.path.exists(fpath):
             print(f"   📖 Reading {fname}...")
             try:
                 # Read string to handle various types safely
                 cdf = pd.read_csv(fpath, dtype=str)
                 master_frames.append(cdf)
             except Exception as e:
                 print(f"   ⚠️ Error reading {fname}: {e}")
    
    if master_frames:
        print("\n[LINK] Merging all data (Please wait)...")
        # Concat all frames
        df_master = pd.concat(master_frames, ignore_index=True)
        
        # Convert IDs back to numeric for sorting
        if "Survey ID" in df_master.columns:
            df_master["Survey ID Numeric"] = pd.to_numeric(df_master["Survey ID"], errors='coerce')
        
        # Sort
        if "Survey Date" in df_master.columns:
             # Try to respect Survey Date, then ID
             df_master.sort_values(by=["Survey Date", "Survey Time"], ascending=False, inplace=True)
             
        # Remove temporary sort column
        if "Survey ID Numeric" in df_master.columns:
            df_master.drop(columns=["Survey ID Numeric"], inplace=True)
            
        # Re-assign Sr# - Drop existing first to avoid error
        if "Sr#" in df_master.columns:
            df_master.drop(columns=["Sr#"], inplace=True)
            
        df_master.insert(0, "Sr#", range(1, len(df_master) + 1))
        
        # Use fixed filename for master files
        fixed_name = "ALL_DISTRICTS_TEHSILS_MASTER"
        
        # Sort by Survey Date if available
        if "Survey Date" in df_master.columns:
             df_master.sort_values(by=["Survey Date", "Survey Time"], ascending=False, inplace=True)
        
        # Create Excel file with clickable links
        excel_filename = os.path.join(OUTPUT_FOLDER, f"{fixed_name}.xlsx")
        with pd.ExcelWriter(excel_filename, engine='openpyxl') as writer:
            df_master.to_excel(writer, index=False, sheet_name='All Survey Data')
        
        # Create CSV file with separate image URL columns and no clickable links
        csv_filename = os.path.join(OUTPUT_FOLDER, f"{fixed_name}.csv")
        
        # Remove clickable link columns for CSV and exclude the combined "Image URLs" column
        csv_columns = [col for col in df_master.columns if not col.startswith("Clickable Image") and col != "Image URLs"]
        df_csv = df_master[csv_columns]
        
        # Reorder columns to put Image URL columns at the end
        image_url_columns = [col for col in csv_columns if col.startswith("Image URL")]
        other_columns = [col for col in csv_columns if not col.startswith("Image URL")]
        reordered_columns = other_columns + image_url_columns
        df_csv = df_csv[reordered_columns]        
        
        # Add error handling for file writing
        try:
            df_csv.to_csv(csv_filename, index=False, encoding='utf-8-sig')
        except PermissionError:
            print(f"[ERROR] Permission denied when writing CSV file: {csv_filename}")
            print("   Please close any applications that might be using this file and try again.")
            print("   Common causes: Excel has the file open, or Google Drive is syncing the file.")
            return
        except Exception as e:
            print(f"[ERROR] Error writing CSV file: {e}")
            return
        
        print("\n" + "="*50)
        print("--- MISSION ACCOMPLISHED ---")
        if fetch_all:
            print(f"[FILE] Grand Total Records: {len(all_processed_data)} (ALL available data downloaded)")
        else:
            print(f"[FILE] Grand Total Records: {len(all_processed_data)}")
            print(f"[FILE] Pages Fetched:       {num_pages} pages ({PAGE_SIZE} records per page)")
        print(f"[FILE] MASTER EXCEL FILE:   {excel_filename}")
        print(f"[FILE] MASTER CSV FILE:     {csv_filename}")
        print("="*50)
    else:
        print("\n⚠️ No data found in any city files.")

if __name__ == "__main__":
    main()