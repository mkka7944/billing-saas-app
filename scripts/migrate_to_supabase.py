#!/usr/bin/env python3
"""
Migration Script: Local CSVs -> Supabase
Adapts the logic from 'modern-map-broken-archive-data.py' to populate the database.
"""

import pandas as pd
import os
import json
import re
from collections import defaultdict
import datetime
import math
import argparse
# Try importing utils
try:
    from supabase import create_client, Client
except ImportError:
    print("Error: 'supabase' package not found. Please run: pip install supabase")
    exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: 'python-dotenv' package not found. Please run: pip install python-dotenv")
    exit(1)

# Configuration
INPUT_FOLDER = os.path.join(os.path.dirname(__file__), "..", "outputs", "scraped_data")
BILLER_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "inputs", "excel_dumps"))
ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "02_Cloud_App", ".env"))

# Load Env
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
    print(f"Loaded credentials from {ENV_PATH}")
else:
    print(f"Warning: .env not found at {ENV_PATH}")

# Supabase Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment.")
    exit(1)

MASTER_LIST_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "outputs", "processed_pdfs", "Combined_Dec2025_Master_List.xlsx"))

class MigrationEngine:
    def __init__(self):
        self.data_by_location = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        self.seen_survey_ids = set()
        self.sid_to_psid = {} 
        self.psid_to_sid = {} 
        self.psid_to_payment = {} 
        self.billing_history = defaultdict(list) 
        self.archived_data = [] 
        self.master_print_status = defaultdict(dict)
        
        self.records_to_upload = [] # Flat list of survey units
        self.bills_to_upload = []   # Flat list of bills
        self.lifecycle_data = defaultdict(lambda: defaultdict(bool)) # {psid: {month: is_issued}}
        
        # Load Centralized Geography
        self.GEO_CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config", "geography.json"))
        if os.path.exists(self.GEO_CONFIG_PATH):
            with open(self.GEO_CONFIG_PATH, 'r') as f:
                self.geo_config = json.load(f)
            print(f"Loaded geography config from {self.GEO_CONFIG_PATH}")
        else:
            print(f"Warning: geography.json not found at {self.GEO_CONFIG_PATH}")
            self.geo_config = {"mapping_rules": {}}
        
        # Financial Data Lookup {sid: {fee, cat}}
        self.survey_financials = {}

    def normalize_sid(self, sid):
        if not sid or str(sid).lower() == 'nan': return ""
        s = str(sid).strip().lstrip('0').upper()
        return s if s else "0"

    def connect_db(self):
        if "YOUR_" in SUPABASE_URL:
            print("Please set SUPABASE_URL and SUPABASE_KEY environment variables.")
            return None
        return create_client(SUPABASE_URL, SUPABASE_KEY)

    def fetch_max_survey_id(self, db):
        try:
            res = db.table('survey_units').select('survey_id').order('survey_id', desc=True).limit(1).execute()
            if res.data and len(res.data) > 0:
                print(f"   Max DB Survey ID: {res.data[0]['survey_id']}")
                return int(res.data[0]['survey_id'])
        except Exception as e:
            print(f"   ⚠️ Could not fetch max ID ({e}). Defaulting to Full Sync.")
        return 0

    # --- LOGIC COPIED & ADAPTED FROM modern-map-broken-archive-data.py ---
    
    def process_csvs(self, max_db_id=0):
        """
        Read and process records. 
        If max_db_id > 0, skips any Survey ID <= max_db_id (Incremental Mode).
        """
        print("1. Loading Data Sources...")
        
        # 1. Load Biller Data
        if os.path.exists(BILLER_FOLDER):
            biller_files = [f for f in os.listdir(BILLER_FOLDER) if f.endswith('.csv') and 'BILLER' in f.upper() and not f.startswith('~$')]
            print(f"Loading {len(biller_files)} Biller Data files...")
            for bf in biller_files:
                try:
                    bdf = pd.read_csv(os.path.join(BILLER_FOLDER, bf), encoding='utf-8-sig', engine='python')
                    file_month = "DEC2025" # Default or extract from filename
                    match = re.search(r'([A-Z]{3}20[0-9]{2})', bf.upper())
                    if match: file_month = match.group(1)
                    
                    if 'Survey ID' in bdf.columns and 'Biller PSID' in bdf.columns:
                        # Infer location from filename e.g. Biller_Sargodha_Nov2025.csv
                        bf_up = bf.upper()
                        inf_district = "UNKNOWN"
                        inf_tehsil = "UNKNOWN"
                        
                        # Better extraction logic
                        rules = self.geo_config.get('mapping_rules', {})
                        for key, rule in rules.items():
                            if key in bf_up:
                                inf_district = rule['district']
                                inf_tehsil = rule['tehsil']
                                break
                        
                        for _, row in bdf.iterrows():
                            sid = self.normalize_sid(row.get('Survey ID', ''))
                            psid = str(row.get('Biller PSID', '')).strip()
                            if sid and psid:
                                total_payable = str(row.get('Total Payable', '0')).strip()
                                self.billing_history[sid].append({
                                    'm': file_month,
                                    'psid': psid,
                                    'amt': total_payable,
                                    'date': str(row.get('Bill Date', '')).strip(),
                                    'src': 'biller',
                                    'inf_d': inf_district,
                                    'inf_t': inf_tehsil
                                })
                                self.sid_to_psid[sid] = {'psid': psid, 'total_payable': total_payable, 'inf_d': inf_district, 'inf_t': inf_tehsil}
                                self.psid_to_sid[psid] = sid
                                
                                # Capture Financials (Revenue & Tariff)
                                m_fee = self.safe_int(row.get('Monthly Fee', '0'))
                                b_cat = str(row.get('Billing Category', '')).strip()
                                
                                # Only update if we have meaningful data (prioritize latest file loop if duplicates exist)
                                self.survey_financials[sid] = {
                                    'monthly_fee': m_fee if m_fee is not None else 0,
                                    'billing_category': b_cat if b_cat and b_cat.lower() != 'nan' else 'UNKNOWN'
                                }
                except Exception as e:
                    print(f"    Error loading biller {bf}: {e}")

        # 2. Load Paid History
        if os.path.exists(INPUT_FOLDER):
            paid_files = [f for f in os.listdir(INPUT_FOLDER) if f.endswith('.csv') and 'PAID_ALL_HISTORY' in f.upper() and not f.startswith('~$')]
            paid_files.sort(key=lambda x: 'COMBINED' in x.upper())
            for pf in paid_files:
                try:
                    pdf = pd.read_csv(os.path.join(INPUT_FOLDER, pf), encoding='utf-8-sig', engine='python')
                    if 'Paid Date' in pdf.columns:
                        pdf['Paid Date'] = pd.to_datetime(pdf['Paid Date'], errors='coerce').dt.strftime('%Y-%m-%d')
                    
                    month_col = 'Month' if 'Month' in pdf.columns else None
                    psid_col = 'PSID' if 'PSID' in pdf.columns else ('Biller PSID' if 'Biller PSID' in pdf.columns else None)
                    if psid_col:
                        for _, row in pdf.iterrows():
                            psid = str(row.get(psid_col, '')).strip()
                            if psid:
                                m = self.normalize_month(row.get(month_col, '')) if month_col else "UNKNOWN"
                                self.psid_to_payment[(psid, m)] = {
                                    'status': str(row.get('Status', 'unpaid')).strip().lower(),
                                    'amount': str(row.get('Paid Amount', '0')).strip(),
                                    'date': str(row.get('Paid Date', '-')).strip(),
                                    'method': str(row.get('Channel', '-')).strip()
                                }
                except Exception as e: print(f"    Error loading paid history {pf}: {e}")
        
        # 2.5 Load Test Lifecycle (Printing History)
        LIFECYCLE_FOLDER = os.path.join(os.path.dirname(__file__), "..", "outputs", "processed_pdfs")
        if os.path.exists(LIFECYCLE_FOLDER):
            lifecycle_files = [f for f in os.listdir(LIFECYCLE_FOLDER) if 'test_lifecycle' in f.lower() and f.endswith('.xlsx') and not f.startswith('~$')]
            print(f"Loading {len(lifecycle_files)} Lifecycle files...")
            for lf in lifecycle_files:
                try:
                    ldf = pd.read_excel(os.path.join(LIFECYCLE_FOLDER, lf), engine='openpyxl')
                    # Find PSID column
                    psid_col = 'Biller PSID' if 'Biller PSID' in ldf.columns else None
                    if psid_col:
                        # Find PDF Issued columns
                        issued_cols = [c for c in ldf.columns if 'PDF Issued' in c]
                        for _, row in ldf.iterrows():
                            psid_val = row.get(psid_col, '')
                            if pd.isna(psid_val): psid = ""
                            elif isinstance(psid_val, (float, int)): psid = f"{int(psid_val)}"
                            else: psid = str(psid_val).strip()
                            
                            if psid:
                                for col in issued_cols:
                                    # Extract month from column name e.g. "Oct-25 PDF Issued" -> "OCT2025"
                                    match = re.search(r'([A-Z]{3})-([0-9]{2})', col.upper())
                                    if match:
                                        m_norm = f"{match.group(1)}20{match.group(2)}"
                                        val = str(row.get(col, '')).strip().upper()
                                        is_issued = (val == 'YES' or val == '1' or val == 'ISSUED')
                                        self.lifecycle_data[psid][m_norm] = is_issued
                except Exception as e:
                    print(f"    Error loading lifecycle {lf}: {e}")

        # 3. Process Survey CSVs
        csv_files = [f for f in os.listdir(INPUT_FOLDER) if f.endswith('.csv') and 'SURVEY' in f.upper() and 'MASTER' not in f.upper() and 'PAID_ALL_HISTORY' not in f.upper() and not f.startswith('~$')]
        
        print(f"2. Processing {len(csv_files)} Survey Files...")
        for csv_file in csv_files:
            try:
                df = pd.read_csv(os.path.join(INPUT_FOLDER, csv_file), encoding='utf-8-sig', engine='python')
                for _, row in df.iterrows():
                    sid = self.normalize_sid(self.get_col(row, ['Survey ID', 'SurveyID', 'SID']))
                    if not sid or sid in self.seen_survey_ids: continue
                    
                    self.seen_survey_ids.add(sid) # CRITICAL: Mark as seen even if we skip processing!

                    # Incremental Check (Fast Mode)
                    try:
                        if max_db_id > 0 and int(sid) <= max_db_id:
                            continue
                    except: pass
                    
                    # Extract Data
                    lat = self.safe_float(self.get_col(row, ['Latitude', 'Lat']))
                    lon = self.safe_float(self.get_col(row, ['Longitude', 'Lng', 'Long']))
                    
                    images = []
                    for i in range(1, 4):
                        url = str(self.get_col(row, [f'Image URL {i}', f'URL {i}'])).strip()
                        if url and url.lower() != 'nan': images.append(url)
                    
                    raw_district = str(self.get_col(row, ['District', 'City'])).strip().upper()
                    raw_tehsil = str(self.get_col(row, ['Tehsil'])).strip().upper()
                    
                    # Fix Hierarchy
                    district = raw_district
                    tehsil = raw_tehsil
                    rules = self.geo_config.get('mapping_rules', {})
                    
                    if raw_tehsil in rules:
                        district = rules[raw_tehsil]['district']
                        tehsil = rules[raw_tehsil]['tehsil']
                    elif raw_district in rules:
                        district = rules[raw_district]['district']
                        tehsil = rules[raw_district]['tehsil']

                    self.records_to_upload.append({
                        'survey_id': sid,
                        'status': 'ACTIVE',
                        'city_district': district,
                        'tehsil': tehsil,
                        'uc_name': str(self.get_col(row, ['Union Council', 'UC', 'Area'])).strip().upper(),
                        'uc_type': str(self.get_col(row, ['UC Type', 'Type'])).strip().upper(),
                        'consumer_name': str(self.get_col(row, ['Name', 'Consumer'])).strip(),
                        'address': str(self.get_col(row, ['Address'])).strip(),
                        'house_type': str(self.get_col(row, ['House Type'])).strip(),
                        'unit_type': str(self.get_col(row, ['Consumer Type', 'Unit Type'])).strip(),
                        'lat': lat,
                        'lng': lon,
                        'image_urls': images,
                        # Added Fields
                        'surveyor_name': str(self.get_col(row, ['Surveyor Name', 'Surveyor'])).strip(),
                        'survey_date': self.parse_date(self.get_col(row, ['Survey Date', 'Date'])),
                        'survey_time': self.parse_time(self.get_col(row, ['Survey Time', 'Time'])),
                        # Financials Injection
                        'monthly_fee': self.survey_financials.get(sid, {}).get('monthly_fee', 0),
                        'billing_category': self.survey_financials.get(sid, {}).get('billing_category', 'UNKNOWN')
                    })
            except Exception as e: print(f"    Error in {csv_file}: {e}")

    def get_col(self, row, aliases):
        for a in aliases:
            if a in row: return str(row[a]).strip()
            # Case insensitive check
            for k in row.keys():
                if k.lower() == a.lower(): return str(row[k]).strip()
        return ""

    def safe_float(self, val):
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f): return None
            return f
        except: return None

    def safe_int(self, val):
        try:
            f = float(val) # specific case for "500.0" strings
            if math.isnan(f) or math.isinf(f): return 0
            return int(f)
        except: return 0

    def parse_date(self, val):
        if not val: return None
        try:
            dt = pd.to_datetime(str(val).strip(), errors='coerce')
            if pd.isnull(dt): return None
            return dt.strftime('%Y-%m-%d')
        except: return None

    def parse_time(self, val):
        if not val: return None
        s = str(val).strip().lower()
        if s == 'nan' or s == '': return None
        return s

    def normalize_month(self, m):
        if not m or str(m).lower() == 'nan': return "UNKNOWN"
        # Convert 'Oct 2025' or 'OCT2025' to 'OCT2025'
        return str(m).upper().replace(' ', '')

    def reconcile_history(self):
        print("3. Reconciling & Identifying Duplicates...")
        
        for sid, entries in self.billing_history.items():
            psid_groups = defaultdict(list)
            for e in entries: psid_groups[e['psid']].append(e)
            
            unique_psids = list(psid_groups.keys())
            winner_psid = unique_psids[0]
            
            if len(unique_psids) > 1:
                # Conflict Resolution Logic
                psid_payment_date = {}
                for psid in unique_psids:
                    # Note: Conflict resolution here is tricky without month context, 
                    # but we'll try to find any month that has a payment as a proxy for 'winner'
                    # Or just keep it as is if needed.
                    pay_info = None
                    # Search all months for this PSID in the payment dict
                    for (p, m), info in self.psid_to_payment.items():
                        if p == psid and info['status'] == 'paid':
                            pay_info = info
                            break
                    
                    psid_payment_date[psid] = pay_info['date'] if pay_info else None
                
                sorted_psids = sorted(unique_psids, key=lambda p: (
                    1 if psid_payment_date[p] else 0,
                    psid_payment_date[p] or '0000-00-00',
                    p
                ), reverse=True)
                winner_psid = sorted_psids[0]

            # Create Bill Records
            for e in entries:
                is_win = (e['psid'] == winner_psid)
                m_norm = self.normalize_month(e['m'])
                pay_info = self.psid_to_payment.get((e['psid'], m_norm), {})
                
                self.bills_to_upload.append({
                    'psid': e['psid'],
                    'bill_month': e['m'],
                    'survey_id': sid,
                    'amount_due': self.safe_float(e['amt']),
                    'payment_status': pay_info.get('status', 'UNPAID').upper(),
                    'paid_date': pay_info.get('date', None) if pay_info.get('date', '-') != '-' else None,
                    'payment_method': pay_info.get('method', None),
                    'amount_paid': self.safe_float(pay_info.get('amount', 0)), # FIXED: paid_amount -> amount_paid
                    'is_primary': is_win,
                    'is_issued': self.lifecycle_data.get(e['psid'], {}).get(e['m'], False),
                    'recon_notes': 'Original' if is_win else 'Duplicate'
                })

    def identify_archived(self):
        print("4. Identifying Archived Records...")
        count = 0
        for sid, entries in self.billing_history.items():
            if sid not in self.seen_survey_ids:
                # Archived!
                # Construct minimal record from biller info
                sample = entries[0]
                self.records_to_upload.append({
                    'survey_id': sid,
                    'status': 'ARCHIVED',
                    'city_district': sample.get('inf_d', 'UNKNOWN'),
                    'tehsil': sample.get('inf_t', 'UNKNOWN'),
                    'uc_name': 'ARCHIVED_CENTER',
                    'consumer_name': 'Archived Biller Data',
                    'address': 'Archived Address'
                })
                count += 1
        print(f"   Found {count} Archived records.")

    def upload_chunked(self, supabase, table, data, chunk_size=1000):
        total = len(data)
        print(f"   Uploading {total} records to '{table}'...")
        for i in range(0, total, chunk_size):
            chunk = data[i:i+chunk_size]
            try:
                supabase.table(table).upsert(chunk).execute()
                print(f"     Processed {i+len(chunk)}/{total}")
            except Exception as e:
                print(f"     ❌ Error chunk {i}: {e}")

    def run(self):
        parser = argparse.ArgumentParser(description='Migrate Survey Data to Supabase')
        parser.add_argument('--fast', action='store_true', help='Incremental Sync: Only upload new records (Skip existing IDs)')
        args = parser.parse_args()

        db = self.connect_db()
        
        max_id = 0
        if args.fast:
            print("🚀 FAST MODE ENABLED: Checking Max ID for Incremental Sync...")
            if db:
                max_id = self.fetch_max_survey_id(db)
            else:
                print("   ⚠️ No DB connection, cannot fetch Max ID. Falling back to processed files check (if any).")

        self.process_csvs(max_db_id=max_id)
        self.reconcile_history()
        self.identify_archived()
        
        print("5. Starting Upload...")
        # db = self.connect_db() # Already connected
        if not db:
            print("   Skipping upload (No DB Config). Dumping to JSON for review.")
            with open("migrated_data_survey_units.json", "w") as f:
                json.dump(self.records_to_upload, f, default=str)
            with open("migrated_data_bills.json", "w") as f:
                json.dump(self.bills_to_upload, f, default=str)
            return

        # Reset Data if needed
        RESET_DATABASE = False
        if RESET_DATABASE:
            print("❗ RESET_DATABASE set to True. Purging existing records...")
            try:
                db.table('bills').delete().neq('survey_id', 'NONE').execute()
                db.table('survey_units').delete().neq('survey_id', 'NONE').execute()
                
                # Verify purge
                res = db.table('survey_units').select('*', count='exact', head=True).execute()
                print(f"   Database purged successfully. Remaining records: {res.count}")
            except Exception as e:
                print(f"   ❌ Error purging database: {e}")

        # Reset Hierarchy - SKIPPED (It's a SQL View, updates automatically via Refresh or is static)
        # print("6. Updating location_hierarchy from survey data...")
        # try:
        #     # db.table('location_hierarchy').delete().neq('city_district', 'NONE').execute()
        #     # self.upload_chunked(db, 'location_hierarchy', hierarchy_data, chunk_size=500)
        #     pass
        # except Exception as e:
        #     print(f"   ❌ Error updating hierarchy: {e}")

        # Upload
        self.upload_chunked(db, 'survey_units', self.records_to_upload)
        self.upload_chunked(db, 'bills', self.bills_to_upload)
        print("Done!")

if __name__ == "__main__":
    MigrationEngine().run()
