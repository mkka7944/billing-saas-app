import os
import pandas as pd
import numpy as np
from supabase import create_client
from dotenv import load_dotenv
import glob
import re
from tqdm import tqdm

# --- CONFIG ---
BASE_DIR = r"f:\qoder\billing-system"
ENV_PATH = os.path.join(BASE_DIR, "03_Frontend_App", ".env")
OUTPUT_DIR = os.path.join(BASE_DIR, "01_Local_Engine", "outputs", "processed_pdfs")
SCRAPED_DATA_DIR = os.path.join(BASE_DIR, "01_Local_Engine", "outputs", "scraped_data")

MASTER_FILE = os.path.join(OUTPUT_DIR, "Combined_Dec2025_Master_List.xlsx")

# --- SUPABASE INIT ---
load_dotenv(ENV_PATH)
URL = os.environ.get("VITE_SUPABASE_URL")
KEY = os.environ.get("VITE_SUPABASE_KEY")

if not URL or not KEY:
    print("[!] Error: Supabase Credentials missing in .env")
    exit(1)

supabase = create_client(URL, KEY)

def clean_amount(val):
    """Safely converts string/float currency to float."""
    if pd.isna(val) or val == '' or val == '-':
        return 0.0
    s = str(val).replace(',', '').replace(' ', '')
    try:
        return float(s)
    except:
        return 0.0

def normalize_sid(sid):
    """Normalizes Survey ID to match strings."""
    if pd.isna(sid) or not str(sid).strip(): return ""
    return str(sid).strip().lstrip('0').upper()

def load_payment_history():
    """Loads and sums payments by PSID."""
    pattern = os.path.join(SCRAPED_DATA_DIR, "COMBINED_ALL_CITIES_paid_ALL_HISTORY*Full.csv")
    files = glob.glob(pattern)
    if not files:
        print(f"[!] No Payment History found! Searched: {pattern}")
        return {}
    
    latest = max(files, key=os.path.getmtime)
    print(f"[*] Loading Payment History: {os.path.basename(latest)}")
    
    df = pd.read_csv(latest, usecols=['PSID', 'Paid Amount', 'Status', 'Month'], low_memory=False)
    df.columns = [c.strip() for c in df.columns]

    # Filter Paid
    df = df[df['Status'].str.lower() == 'paid']
    
    # Clean PSID & Amount
    df['PSID'] = df['PSID'].astype(str).str.strip()
    df['CleanAmount'] = df['Paid Amount'].apply(clean_amount)
    
    # Sum and Count payments per PSID
    results = df.groupby('PSID')['CleanAmount'].agg(['sum', 'count']).to_dict('index')
    
    # Transform to simpler dict {psid: {'amount': x, 'count': y}}
    final_map = {str(k): {'amount': v['sum'], 'count': v['count']} for k, v in results.items()}
    
    print(f"    -> Mapped payments for {len(final_map)} PSIDs.")
    return final_map

def load_survey_metadata():
    """Loads Images, Lat/Lng from Survey CSVs into a lookup map."""
    print("[*] Loading Survey Metadata (Images, Coordinates)...")
    survey_map = {}
    
    # Find all Survey Data CSVs
    pattern = os.path.join(SCRAPED_DATA_DIR, "*SURVEY_DATA.csv")
    files = glob.glob(pattern)
    
    for f in files:
        print(f"    -> Reading {os.path.basename(f)}")
        try:
            df = pd.read_csv(f, encoding='utf-8-sig', low_memory=False)
            df.columns = [c.strip() for c in df.columns]
            
            # Identify columns
            sid_col = next((c for c in df.columns if c.lower() in ['survey id', 'surveyid', 'sid']), None)
            lat_col = next((c for c in df.columns if c.lower() in ['lat', 'latitude']), None)
            lng_col = next((c for c in df.columns if c.lower() in ['lng', 'longitude', 'long']), None)
            
            if not sid_col: continue

            for _, row in df.iterrows():
                sid = normalize_sid(row.get(sid_col))
                if not sid: continue
                
                # Metadata extraction
                images = []
                for i in range(1, 4):
                    url = str(row.get(f'Image URL {i}', '')).strip()
                    if url and url.lower() != 'nan' and url != '':
                        images.append(url)
                
                try:
                    lat = float(row.get(lat_col)) if lat_col and pd.notna(row.get(lat_col)) else None
                    lng = float(row.get(lng_col)) if lng_col and pd.notna(row.get(lng_col)) else None
                except:
                    lat, lng = None, None

                survey_map[sid] = {
                    'image_urls': images,
                    'lat': lat,
                    'lng': lng,
                    'surveyor_name': str(row.get('Surveyor Name', '')).strip(),
                    'survey_date': str(row.get('Survey Date', '')).strip(),
                    'survey_time': str(row.get('Survey Time', '')).strip(),
                    'house_type': str(row.get('House Type', '')).strip(),
                    'unit_type': str(row.get('Consumer Type', '')).strip(),
                }
        except Exception as e:
            print(f"    [!] Error loading {f}: {e}")
            
    print(f"    -> Cached metadata for {len(survey_map)} survey IDs.")
    return survey_map

def main():
    print("=== MIGRATION: LIFECYCLE FIRST (ENHANCED) ===")
    
    if not os.path.exists(MASTER_FILE):
        print(f"[!] Master List not found: {MASTER_FILE}")
        return

    # 1. Load Data
    master_df = pd.read_excel(MASTER_FILE, dtype=str)
    master_df.columns = [c.strip() for c in master_df.columns]
    print(f"[*] Loaded Master List: {len(master_df)} rows.")

    payment_map = load_payment_history()
    survey_meta = load_survey_metadata()

    # deduplication
    seen_survey_ids = set()
    
    # buffers
    survey_buffer = []
    bills_buffer = []
    BATCH_SIZE = 1000

    print("[*] Migrating records to Supabase...")
    for _, row in tqdm(master_df.iterrows(), total=len(master_df), unit="row"):
        
        psid = str(row.get('Biller PSID', '')).strip()
        survey_id_raw = row.get('Survey ID', '')
        sid_norm = normalize_sid(survey_id_raw)
        
        if not psid or not sid_norm: continue

        # --- FINANCIALS ---
        current_bill = clean_amount(row.get('Monthly Fee', 0))
        arrears = clean_amount(row.get('Arrears', 0))
        total_payable = clean_amount(row.get('Total Payable', 0))
        if total_payable == 0: total_payable = current_bill + arrears
        
        pay_info = payment_map.get(psid, {'amount': 0.0, 'count': 0})
        paid_amt = pay_info['amount']
        pay_count = pay_info['count']
        
        pay_status = 'pending'
        if paid_amt >= total_payable and total_payable > 0: pay_status = 'paid'
        elif paid_amt > 0: pay_status = 'partial'

        # --- ENRICHMENT ---
        meta = survey_meta.get(sid_norm, {})
        
        deleted_flag = str(row.get('Deleted in Portal', 'No'))
        # STATUS FIX: DB expects ARCHIVED, not INACTIVE
        status = 'ARCHIVED' if deleted_flag == 'Yes' or deleted_flag == '1' else 'ACTIVE'

        # --- SURVEY UNIT OBJECT (Deduplicated) ---
        if sid_norm not in seen_survey_ids:
            s_date = meta.get('survey_date')
            if pd.isna(s_date) or str(s_date).lower() == 'nan' or not str(s_date).strip():
                s_date = None
            else:
                try: 
                    s_date = pd.to_datetime(s_date).strftime('%Y-%m-%d')
                except: s_date = None

            s_time = meta.get('survey_time')
            if pd.isna(s_time) or str(s_time).lower() == 'nan' or not str(s_time).strip():
                s_time = None
            else:
                s_time = str(s_time).strip()

            survey_buffer.append({
                'survey_id': sid_norm,
                'consumer_name': str(row.get('Name', 'Unknown')).strip(),
                'address': str(row.get('Address', 'Unknown')).strip(),
                'monthly_fee': int(current_bill),
                'city_district': str(row.get('District', '')).strip(),
                'tehsil': str(row.get('Tehsil', '')).strip(),
                'uc_name': str(row.get('UC', '')).strip(),
                'status': status,
                'category': str(row.get('Category', '')).strip(),
                'sub_category': str(row.get('Sub Category', '')).strip(),
                'billing_category': str(row.get('Billing Category', '')).strip(),
                'lat': meta.get('lat'),
                'lng': meta.get('lng'),
                'image_urls': meta.get('image_urls', []),
                'surveyor_name': meta.get('surveyor_name', ''),
                'survey_date': s_date, 
                'survey_time': s_time, # Cleaned Time
                'house_type': meta.get('house_type', ''),
                'unit_type': meta.get('unit_type', '')
            })
            seen_survey_ids.add(sid_norm)

        # --- BILL OBJECT ---
        bills_buffer.append({
            'psid': psid,
            'survey_id': sid_norm,
            'bill_month': 'Dec-2025',
            'current_bill': current_bill,
            'arrears': arrears,
            'total_payable': total_payable,
            'amount_paid': paid_amt,
            'payment_count': pay_count, # NEW FIELD
            'payment_status': pay_status,
            'is_issued': True,
            'is_primary': True,
            'deleted_in_portal': deleted_flag,
            'category': str(row.get('Category', '')).strip(),
            'sub_category': str(row.get('Sub Category', '')).strip(),
            'billing_category': str(row.get('Billing Category', '')).strip(),
            'start_month': str(row.get('Start Month', ''))
        })

        if len(survey_buffer) >= BATCH_SIZE:
            flush(survey_buffer, 'survey_units')
            survey_buffer = []

        if len(bills_buffer) >= BATCH_SIZE:
            flush(bills_buffer, 'bills')
            bills_buffer = []

    if survey_buffer: flush(survey_buffer, 'survey_units')
    if bills_buffer: flush(bills_buffer, 'bills')
    print("\n[COMPLETE] All data synchronized.")

def flush(data, table):
    try:
        supabase.table(table).upsert(data).execute()
    except Exception as e:
        print(f"\n[!] Error in {table}: {e}")

if __name__ == "__main__":
    main()
