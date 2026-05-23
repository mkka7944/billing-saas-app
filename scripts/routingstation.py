#!/usr/bin/env python3
"""
Modern Mobile-First Field Staff Map Generator
Optimized for performance and mobile experience.
"""

import pandas as pd
import numpy as np
import os
import json
import re
from collections import defaultdict
import sys
import warnings
import zipfile
import xml.etree.ElementTree as ET
import datetime
import codecs
import shutil
import time
from dotenv import load_dotenv
from supabase import create_client
import subprocess

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(ENV_PATH)

warnings.simplefilter(action='ignore', category=UserWarning) # Silence pandas date guessing warnings

# Configuration
INPUT_FOLDER = os.path.join(os.path.dirname(__file__), "..", "outputs", "scraped_data")
KML_FOLDER = os.path.join(os.path.dirname(__file__), "..", "inputs", "klm_files")
BILLER_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "inputs", "excel_dumps"))
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(os.path.dirname(SCRIPTS_DIR))
OUTPUT_DIR = os.path.join(BASE_DIR, "local_test_server") # Local test server
GITHUB_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "Routing-Station-Pro") # GitHub Pages Repo Folder

# --- TEST & DEV MODE TOGGLES ---
# TEST_MODE: Limits map to 500 markers and disables all sync prompts for rapid UI testing.
TEST_MODE = False

# DEV_MODE: Set to True for fast generation (skips Billers/Paid, limits Survey rows)
# Automatically enabled if TEST_MODE is active.
DEV_MODE = False

# Admin Customization for MC Layers (Tooltips/Watermarks)
# Format: { "Layer Name": "Custom HTML/Text" }
# Leave empty or omit layers to use default descriptions.
KML_METADATA = {
    "MC1": "<b>MC-01 District</b><br>Primary Industrial Zone",
    "MC 2": "<b>MC-02 District</b><br>Residential Hub",
    "MC3": "<b>MC-03 District</b><br>Commercial Core"
}

class KMLRouter:
    """Handles discovery and parsing of KML/KMZ files."""
    
    def __init__(self, root_dir):
        self.root_dir = root_dir
        self.layers = defaultdict(dict) # {City: {LayerName: GeoJSON}}
        
    def scan_and_parse(self):
        """Recursively scan inputs folder for KMZ files."""
        print(f"Scanning {self.root_dir}...")
        log_path = os.path.join(OUTPUT_DIR, "kml_import_log.txt")
        
        with open(log_path, "w", encoding="utf-8") as log:
            log.write(f"KML Import Log - {datetime.datetime.now()}\n")
            log.write(f"Scanning: {self.root_dir}\n")
            log.write("-" * 50 + "\n")
            
            if not os.path.exists(self.root_dir):
                print("   [WARN] KML Input folder not found.")
                log.write("ERROR: Input folder not found.\n")
                return {}
            
            count = 0
            found_layers = 0
            
            for root, dirs, files in os.walk(self.root_dir):
                for file in files:
                    ext = file.lower()
                    if ext.endswith('.kmz') or ext.endswith('.kml'):
                        full_path = os.path.join(root, file)
                        if self._process_kmz(full_path, log):
                            found_layers += 1
                        count += 1
            
            log.write("-" * 50 + "\n")
            log.write(f"Total Files Scanned: {count}\n")
            log.write(f"Total Layers Loaded: {found_layers}\n")
            print(f"   Processed {count} KMZ files. Loaded {found_layers} layers.")
            
        return self.layers

    def _process_kmz(self, kmz_path, log):
        """Extract and parse a single KMZ file with namespace stripping."""
        try:
            # Robust Name Extraction
            folder_name = os.path.basename(os.path.dirname(kmz_path))
            city_name = folder_name.replace("Final KML", "").replace("PROJECT", "").strip().upper()
            layer_name = os.path.splitext(os.path.basename(kmz_path))[0]
            
            if kmz_path.lower().endswith('.kmz'):
                with zipfile.ZipFile(kmz_path, 'r') as z:
                    kml_files = [f for f in z.namelist() if f.endswith('.kml')]
                    if not kml_files: 
                        log.write(f"SKIP: {os.path.basename(kmz_path)} (No KML inside)\n")
                        return False
                    
                    with z.open(kml_files[0]) as f:
                        # Read content
                        content = f.read().decode('utf-8-sig') # Handle BOM if present
                        
                        # 1. Remove XML declarations
                        content = re.sub(r'<\?xml[^>]+\?>', '', content)
                        
                        # 2. Remove all xmlns definitions
                        content = re.sub(r'\sxmlns(:[a-zA-Z0-9_\-]+)?="[^"]+"', '', content)
                        
                        # 3. Remove namespaced attributes (e.g. gx:altitudeMode="...") 
                        # This prevents unbound prefix errors for attributes
                        content = re.sub(r'\s[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+="[^"]+"', '', content)
                        
                        # 4. Remove namespace prefixes from tags (<kml:Placemark> -> <Placemark>)
                        content = re.sub(r'(<[/]?)[a-zA-Z0-9_\-]+:', r'\1', content)
                        
                        root = ET.fromstring(content)
                        
                        if layer_name.upper() == "MC MAP":
                            # Split by Placemark for "Mc Map" to create separate selectable layers
                            log.write(f"SPLITTING: {city_name} | {layer_name} into individual MC layers\n")
                            pm_count = 0
                            for pm in root.findall('.//Placemark'):
                                name_node = pm.find('name')
                                p_name = name_node.text if name_node is not None else "Unnamed MC"
                                
                                # Create a mini-root for this placemark
                                p_geojson = self._kml_to_geojson_single(pm)
                                if p_geojson['features']:
                                    self.layers[city_name][p_name] = p_geojson
                                    pm_count += 1
                            
                            log.write(f"OK: {city_name} | {layer_name} (Created {pm_count} sub-layers)\n")
                            return True
                        else:
                            geojson = self._kml_to_geojson(root)
                            if geojson['features']:
                                self.layers[city_name][layer_name] = geojson
                                log.write(f"OK: {city_name} | {layer_name} ({len(geojson['features'])} shapes)\n")
                                return True
                            else:
                                log.write(f"EMPTY: {city_name} | {layer_name}\n")
                                return False

            else:
                # Handle raw .kml files directly
                with codecs.open(kmz_path, 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                    # Apply same cleaning logic
                    content = re.sub(r'<\?xml[^>]+\?>', '', content)
                    content = re.sub(r'\sxmlns(:[a-zA-Z0-9_\-]+)?="[^"]+"', '', content)
                    content = re.sub(r'\s[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+="[^"]+"', '', content)
                    content = re.sub(r'(<[/]?)[a-zA-Z0-9_\-]+:', r'\1', content)
                    
                    root = ET.fromstring(content)
                    
                    if layer_name.upper() == "MC MAP":
                        log.write(f"SPLITTING KML: {city_name} | {layer_name}\n")
                        pm_count = 0
                        for pm in root.findall('.//Placemark'):
                            name_node = pm.find('name')
                            p_name = name_node.text if name_node is not None else "Unnamed MC"
                            p_geojson = self._kml_to_geojson_single(pm)
                            if p_geojson['features']:
                                self.layers[city_name][p_name] = p_geojson
                                pm_count += 1
                        log.write(f"OK: {city_name} | {layer_name} (Created {pm_count} sub-layers)\n")
                        return True
                    else:
                        geojson = self._kml_to_geojson(root)
                        if geojson['features']:
                            self.layers[city_name][layer_name] = geojson
                            log.write(f"OK: {city_name} | {layer_name} ({len(geojson['features'])} shapes)\n")
                            return True
                        else:
                            log.write(f"EMPTY: {city_name} | {layer_name}\n")
                            return False

        except Exception as e:
            msg = f"ERROR: {os.path.basename(kmz_path)} - {str(e)}"
            print(f"   ❌ {msg}")
            log.write(f"{msg}\n")
            return False

    def _kml_to_geojson_single(self, placemark):
        """Helper to convert a single Placemark to a FeatureCollection."""
        features = []
        name = placemark.find('name')
        name_text = name.text if name is not None else "Unnamed"
        
        def add_poly(coords, name_val, fid):
            features.append({
                "type": "Feature",
                "properties": {"name": name_val, "fid": fid},
                "geometry": {"type": "Polygon", "coordinates": [coords]}
            })

        fid_counter = 0
        
        # Look for Polygon
        polygon = placemark.find('.//Polygon')
        if polygon is not None:
            coords_node = polygon.find('.//coordinates')
            if coords_node is not None and coords_node.text:
                coords = self._parse_coords(coords_node.text)
                if coords:
                    fid_counter += 1
                    add_poly(coords, name_text, fid_counter)

        # Look for MultiGeometry
        multigeo = placemark.find('.//MultiGeometry')
        if multigeo is not None:
            for poly in multigeo.findall('.//Polygon'):
                 coords_node = poly.find('.//coordinates')
                 if coords_node is not None and coords_node.text:
                     coords = self._parse_coords(coords_node.text)
                     if coords:
                        fid_counter += 1
                        add_poly(coords, name_text, fid_counter)
        
        return {"type": "FeatureCollection", "features": features}

    def _kml_to_geojson(self, xml_root):
        """Convert KML XML to simple GeoJSON (ignoring namespaces)."""
        features = []
        fid_counter = 0
        
        for placemark in xml_root.findall('.//Placemark'):
            name = placemark.find('name')
            name_text = name.text if name is not None else "Unnamed"
            
            # Helper to create feature
            def add_poly(coords, name_val, fid):
                features.append({
                    "type": "Feature",
                    "properties": {"name": name_val, "fid": fid},
                    "geometry": {"type": "Polygon", "coordinates": [coords]}
                })

            # Look for Polygon
            polygon = placemark.find('.//Polygon')
            if polygon is not None:
                coords_node = polygon.find('.//coordinates')
                if coords_node is not None and coords_node.text:
                    coords = self._parse_coords(coords_node.text)
                    if coords:
                        fid_counter += 1
                        add_poly(coords, name_text, fid_counter)
                        continue

            # Look for MultiGeometry
            multigeo = placemark.find('.//MultiGeometry')
            if multigeo is not None:
                for poly in multigeo.findall('.//Polygon'):
                     coords_node = poly.find('.//coordinates')
                     if coords_node is not None and coords_node.text:
                         coords = self._parse_coords(coords_node.text)
                         if coords:
                            fid_counter += 1
                            add_poly(coords, name_text, fid_counter)
        
        return {"type": "FeatureCollection", "features": features}

    def _parse_coords(self, coords_str):
        """Parse 'lon,lat,alt' string to [[lon, lat], ...]"""
        try:
            points = []
            for pair in coords_str.strip().split():
                parts = pair.split(',')
                if len(parts) >= 2:
                    lon = float(parts[0])
                    lat = float(parts[1])
                    points.append([lon, lat])
            return points
        except:
            return []

class ModernMapGenerator:
    def __init__(self):
        self.data_by_location = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        self.seen_survey_ids = set()
        self.sid_to_psid = {} # {Survey ID: {psid, total_payable}}
        self.psid_to_sid = {} # {PSID: Survey ID} - for mapping back
        self.psid_to_payment = {} # {PSID: {status, amount, date, method}}
        self.sid_to_mc = {}    # {Survey ID: MC_UC_Name}
        self.paid_data = [] # Full payment history for dashboard
        self.duplicates_count = 0
        self.total_records = 0
        self.feather_cache_dir = os.path.join(os.path.dirname(__file__), ".feather_cache")
        if not os.path.exists(self.feather_cache_dir):
            os.makedirs(self.feather_cache_dir)

    def get_feather_path(self, csv_path):
        """Get the cached feather path for a CSV."""
        base = os.path.basename(csv_path)
        return os.path.join(self.feather_cache_dir, base.replace(".csv", ".feather"))

    def load_df_fast(self, csv_path):
        """Loads via Feather if cache is fresh, else CSV and updates Feather."""
        f_path = self.get_feather_path(csv_path)
        
        # Check if Feather exists and is newer than CSV
        if os.path.exists(f_path) and os.path.getmtime(f_path) >= os.path.getmtime(csv_path):
            try:
                return pd.read_feather(f_path)
            except Exception as e:
                print(f"    [WARN] Feather read failed, falling back to CSV: {e}")

        # Load CSV and Cache to Feather
        try:
            df = pd.read_csv(csv_path, encoding='utf-8-sig', engine='python')
            df.to_feather(f_path)
            return df
        except Exception as e:
            print(f"    [ERROR] CSV load failed for {csv_path}: {e}")
            return None
        
    def get_marker_color(self, identifier):
        """Generate consistent robust colors"""
        hash_val = hash(identifier) % 360
        hue_spread = (hash_val * 137.508) % 360
        saturation = 75 + (hash_val % 25)
        lightness = 45 + (hash_val % 15)
        return f"hsl({hue_spread}, {saturation}%, {lightness}%)"

    def shorten_name(self, name, district, tehsil):
        """Smart name shortener for filters"""
        original = name
        name = name.replace(f"{district} - ", "").replace(f"{tehsil} - ", "")
        
        # Don't shorten for Khushab
        if district.upper() == 'KHUSHAB':
            return name.strip()
            
        # Match patterns like MC-1, UC-4
        match = re.search(r'((?:MC|UC|Zone|Ward)[-\s]*\d+)', name, re.IGNORECASE)
        if match:
            # Ensure standard format with hyphen: MC-1, UC-4
            val = match.group(1).upper()
            val = re.sub(r'(MC|UC|ZONE|WARD)\s*(\d+)', r'\1-\2', val)
            return val
        
        # Fallback to first word or comma split
        return name.split(',')[0].strip().split()[0]

    def normalize_month(self, m):
        if not m or str(m).lower() == 'nan': return "UNKNOWN"
        return str(m).upper().replace(' ', '')

    def process_csvs(self):
        """Read and process records with deduplication and payment merging"""
        # 1. Load Biller Data (Vectorized)
        if os.path.exists(BILLER_FOLDER):
            biller_files = [os.path.join(BILLER_FOLDER, f) for f in os.listdir(BILLER_FOLDER) 
                           if f.endswith('.csv') and 'BILLER' in f.upper()]
            if biller_files:
                print(f"Loading {len(biller_files)} Biller mapping files...")
                biller_dfs = []
                for bf in biller_files:
                    try:
                        bdf = pd.read_csv(bf, encoding='utf-8-sig', engine='python')
                        if 'Survey ID' in bdf.columns and 'Biller PSID' in bdf.columns:
                            biller_dfs.append(bdf[['Survey ID', 'Biller PSID', 'Total Payable']])
                    except Exception as e:
                        print(f"    Error loading biller {bf}: {e}")
                
                if biller_dfs:
                    full_biller_df = pd.concat(biller_dfs).drop_duplicates('Survey ID', keep='last')
                    full_biller_df['Survey ID'] = full_biller_df['Survey ID'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
                    full_biller_df['Biller PSID'] = full_biller_df['Biller PSID'].astype(str).str.strip().str.rstrip('"')
                    
                    # Create dicts for fast mapping later
                    self.sid_to_psid = full_biller_df.set_index('Survey ID')[['Biller PSID', 'Total Payable']].to_dict('index')
                    self.psid_to_sid = full_biller_df.set_index('Biller PSID')['Survey ID'].to_dict()

        # 2. Load Paid History Data (Vectorized)
        if os.path.exists(INPUT_FOLDER):
            paid_files = [os.path.join(INPUT_FOLDER, f) for f in os.listdir(INPUT_FOLDER) 
                         if f.endswith('.csv') and 'PAID_ALL_HISTORY' in f.upper()]
            if paid_files:
                paid_files.sort(key=lambda x: 'COMBINED' in x.upper())
                print(f"Loading {len(paid_files)} Paid History files...")
                
                paid_dfs = []
                for pf in paid_files:
                    try:
                        pdf = pd.read_csv(pf, encoding='utf-8-sig', engine='python')
                        # Normalize columns
                        psid_col = next((c for c in ['PSID', 'Biller PSID'] if c in pdf.columns), None)
                        if not psid_col: continue

                        pdf = pdf.rename(columns={psid_col: 'PSID'})
                        pdf['PSID'] = pdf['PSID'].astype(str).str.strip().str.rstrip('"')
                        
                        if 'Paid Date' in pdf.columns:
                            pdf['Paid Date'] = pd.to_datetime(pdf['Paid Date'], errors='coerce').dt.strftime('%Y-%m-%d')
                        
                        if 'COMBINED' in pf.upper():
                            pdf['SID'] = pdf['PSID'].map(self.psid_to_sid).fillna("Deleted ID")
                            cols = ['Sr#', 'SID', 'PSID', 'City', 'Month', 'Office', 'UC', 'Billing Category', 'Amount', 'Fine', 'Channel', 'Paid Date', 'Paid Amount']
                            existing_cols = [c for c in cols if c in pdf.columns]
                            self.paid_data = pdf[existing_cols].fillna('-').astype(str).values.tolist()
                        
                        paid_dfs.append(pdf)
                    except Exception as e:
                        print(f"    Error loading paid history {pf}: {e}")
                
                if paid_dfs:
                    full_paid_df = pd.concat(paid_dfs).drop_duplicates('PSID', keep='last')
                    
                    # Map to psid_to_payment
                    self.psid_to_payment = full_paid_df.set_index('PSID')[['Status', 'Paid Amount', 'Paid Date', 'Channel']].to_dict('index')
                    self.psid_to_payment = {
                        str(k).strip(): {
                            'status': str(v['Status']).lower(),
                            'amount': str(v['Paid Amount']),
                            'date': str(v['Paid Date']),
                            'method': str(v['Channel'])
                        } for k, v in self.psid_to_payment.items()
                    }
                    print(f"  - Extracted {len(self.psid_to_payment)} unique Payment maps")

        # 3. Process Survey CSVs
        if not os.path.exists(INPUT_FOLDER):
            print(f"Input folder not found: {INPUT_FOLDER}")
            return False

        csv_files = [f for f in os.listdir(INPUT_FOLDER) 
                     if f.endswith('.csv') 
                     and 'SURVEY' in f.upper() 
                     and 'MASTER' not in f.upper()
                     and 'PAID_ALL_HISTORY' not in f.upper()]
        
        if not csv_files:
            print("No suitable CSV files found.")
            return False

        print(f"Processing {len(csv_files)} Survey files...")
        
        for csv_file in csv_files:
            file_path = os.path.join(INPUT_FOLDER, csv_file)
            print(f"  - {csv_file}")
            
            try:
                # FAST MODE: Use binary load_df_fast for sub-second reads
                df = self.load_df_fast(file_path)
                if df is None: continue

                if False: # TEST_MODE or DEV_MODE:
                    limit = 2000 if TEST_MODE else 15000
                    print(f"    [{'TEST_MODE' if TEST_MODE else 'DEV_MODE'}] Limiting to {limit} rows...")
                    df = df.head(limit)

                
                # Validation
                req_cols = ['Latitude', 'Longitude', 'District', 'Tehsil', 'Union Council']
                if not all(col in df.columns for col in req_cols):
                    print(f"    Skipping: Missing columns")
                    continue
                
                # Vectorized Cleaning
                df['Survey ID'] = df['Survey ID'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
                df = df[~df['Survey ID'].isin(['', 'nan', 'None', 'None.0'])].copy()
                
                # deduplication (Vectorized)
                initial_len = len(df)
                df = df[~df['Survey ID'].isin(self.seen_survey_ids)].copy()
                self.duplicates_count += (initial_len - len(df))
                self.seen_survey_ids.update(df['Survey ID'].tolist())
                
                # Geographic Names (Vectorized)
                df['District'] = df['District'].fillna('').astype(str).str.strip().str.upper()
                df['Tehsil'] = df['Tehsil'].fillna('').astype(str).str.strip().str.upper()
                df['Union Council'] = df['Union Council'].fillna('').astype(str).str.strip()
                
                df['MC_UC_Name'] = np.where(df['Union Council'].fillna('') != '', 
                                           df['Union Council'],
                                           df['Tehsil'])
                
                # Normalize MC/UC Name to remove District prefix if present (Frontend cleanMCName expects MC-1 or MC 1)
                def clean_mc_name(val, dist):
                    val = str(val).strip()
                    prefix = f"{dist} - "
                    if val.startswith(prefix):
                        return val[len(prefix):].strip()
                    return val
                df['MC_UC_Name'] = df.apply(lambda r: clean_mc_name(r['MC_UC_Name'], r['District']), axis=1)
                    
                df['Surveyor Name'] = df['Surveyor Name'].fillna('').astype(str).str.strip()
                df['Survey Time'] = df['Survey Time'].fillna('').astype(str).str.strip()
                df['Latitude'] = pd.to_numeric(df['Latitude'], errors='coerce')
                df['Longitude'] = pd.to_numeric(df['Longitude'], errors='coerce')
                df = df.dropna(subset=['Latitude', 'Longitude'])

                df['Survey Date'] = pd.to_datetime(df['Survey Date'], errors='coerce').dt.strftime('%Y-%m-%d').fillna('')

                # 4. Payment Mapping (Fast Vectorized Map)
                if self.sid_to_psid:
                    def get_pay_status(sid):
                        b_info = self.sid_to_psid.get(sid, {})
                        psid = b_info.get('Biller PSID')
                        total_payable = b_info.get('Total Payable', '0')
                        if not psid: return 'Not Billed', '0', '-', '-', total_payable, '-'
                        pay_info = self.psid_to_payment.get(str(psid), None)
                        if not pay_info: return 'unpaid', '0', '-', '-', total_payable, psid
                        return pay_info['status'], pay_info['amount'], pay_info['date'], pay_info['method'], total_payable, psid

                    pay_results = df['Survey ID'].apply(get_pay_status).apply(pd.Series)
                    pay_results.columns = ['p_status', 'p_amount', 'p_date', 'p_method', 'total_payable', 'psid']
                    df = pd.concat([df, pay_results], axis=1)
                else:
                    df['p_status'] = 'Not Billed'
                    df['p_amount'], df['p_date'], df['p_method'], df['total_payable'], df['psid'] = '0', '-', '-', '0', '-'

                # 5. Extract Image URLs efficiently
                image_cols = [c for c in df.columns if c.startswith('Image URL')]
                def collect_images(row_dict):
                    imgs = []
                    for c in image_cols:
                        val = str(row_dict.get(c, '')).strip()
                        if val and val.lower() not in ['nan', 'none', '-', '']:
                            imgs.append(val)
                    return imgs
                df['imgs_list'] = [collect_images(r) for r in df.to_dict('records')]

                # 6. Prepare column indices for fast row access in itertuples
                cols = list(df.columns)
                ci = {name: i for i, name in enumerate(cols)}
                
                # Helper for safe column access
                def get_v(r, col_name, fallback=''):
                    idx = ci.get(col_name)
                    return str(r[idx]).strip() if idx is not None else fallback

                print(f"    Processing {len(df)} records...")
                for row in df.itertuples(index=False):
                    sid = get_v(row, 'Survey ID').replace('.0', '')
                    if not sid or sid == 'nan': continue

                    d = get_v(row, 'District').upper()
                    t = get_v(row, 'Tehsil').upper()
                    mu = get_v(row, 'MC_UC_Name')
                    
                    record = {
                        'id': sid,
                        'lat': float(row[ci['Latitude']]),
                        'lng': float(row[ci['Longitude']]),
                        'd': d, 't': t, 'mu': mu,
                        'type': get_v(row, 'Consumer Type', get_v(row, 'Type', 'N/A')),
                        'name': get_v(row, 'Name', get_v(row, 'Owner Name', 'N/A')),
                        'addr': get_v(row, 'Address', '-'),
                        'house': get_v(row, 'House Type', '-'),
                        's_name': get_v(row, 'Surveyor Name', '-'),
                        'date': get_v(row, 'Survey Date', '-'),
                        'time': get_v(row, 'Survey Time', '-'),
                        'imgs': row[ci['imgs_list']],
                        'uc_type': get_v(row, 'UC Type', 'N/A'),
                        'psid': get_v(row, 'psid', '-'),
                        'p_status': get_v(row, 'p_status', 'Not Billed'),
                        'p_amount': get_v(row, 'p_amount', '0'),
                        'p_date': get_v(row, 'p_date', '-'),
                        'p_method': get_v(row, 'p_method', '-'),
                        'total_payable': get_v(row, 'total_payable', '0')
                    }
                    self.data_by_location[d][t][mu].append(record)
                    self.total_records += 1
                    self.sid_to_mc[sid] = mu
                    
            except Exception as e:
                print(f"    Error processing record: {e}")
            
            if DEV_MODE: break
        
        return True


    def generate_optimized_json(self):
        """
        Convert complex dict structure to flat array for client-side processing.
        """
        flat_records = []
        hierarchy = {} 
        
        print("Optimizing data structure...")
        
        for district, tehsils in self.data_by_location.items():
            hierarchy[district] = {}
            for tehsil, mcucs in tehsils.items():
                hierarchy[district][tehsil] = {}
                for mcuc_name, records in mcucs.items():
                    color = self.get_marker_color(mcuc_name)
                    short = self.shorten_name(mcuc_name, district, tehsil)
                    
                    hierarchy[district][tehsil][mcuc_name] = {
                        'c': color,
                        's': short,
                        'cnt': len(records)
                    }
                    
                    for r in records:
                        is_com = 1 if r['type'].lower() == 'commercial' else 0
                        flat_records.append([
                            r['id'],           # 0
                            r['lat'],          # 1
                            r['lng'],          # 2
                            is_com,            # 3
                            r['name'],         # 4 (Raw)
                            r['addr'],         # 5 (Raw)
                            r['s_name'],       # 6
                            r['date'],         # 7
                            r['time'],         # 8
                            r['imgs'],         # 9
                            district,          # 10
                            tehsil,            # 11
                            mcuc_name,         # 12
                            r['house'],        # 13
                            r['uc_type'],      # 14
                            r['psid'] if r['psid'] else '-', # 15 (Raw)
                            r['p_status'],     # 16
                            r['p_amount'],     # 17
                            r.get('p_date', '-'), # 18
                            r.get('p_method', '-'), # 19
                            r.get('total_payable', '0') # 20
                        ])
                        
        return flat_records, hierarchy

    def generate_html(self, output_file="index.html"):
        records, hierarchy = self.generate_optimized_json()
        
        # Process KML Layers
        print("Processing KML Layers...")
        router = KMLRouter(KML_FOLDER)
        geo_layers = router.scan_and_parse()
        
        # Calculate timestamp
        timestamp = datetime.datetime.now().strftime("%d-%b %I:%M %p")
        
        # Prepare Admin Metadata for Injection
        kml_meta_json = json.dumps(KML_METADATA, ensure_ascii=False)
        
        # EXTERNALIZED DATA WRITING
        import codecs
        import math
        print("Externalizing data to JSON files...")
        
        def sanitize_for_json(obj):
            if isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
            elif isinstance(obj, list):
                return [sanitize_for_json(x) for x in obj]
            elif isinstance(obj, dict):
                return {k: sanitize_for_json(v) for k, v in obj.items()}
            return obj

        def write_json(fname, data):
            clean_data = sanitize_for_json(data)
            # Write to Local
            path_local = os.path.join(OUTPUT_DIR, fname)
            with codecs.open(path_local, 'w', encoding='utf-8') as f:
                json.dump(clean_data, f, ensure_ascii=False)
            
            # Write to GitHub Repo
            if os.path.exists(GITHUB_DIR):
                path_github = os.path.join(GITHUB_DIR, fname)
                with codecs.open(path_github, 'w', encoding='utf-8') as f:
                    json.dump(clean_data, f, ensure_ascii=False)
                
            print(f"  -> Written {fname} ({len(data)} items)")
            
        # CLEANUP: Remove old part files to prevent "Ghost Data" when switching modes
        print(f"  - Cleaning old data parts...")
        for target in [OUTPUT_DIR, GITHUB_DIR] if os.path.exists(GITHUB_DIR) else [OUTPUT_DIR]:
            for f in os.listdir(target):
                if f.startswith("data_part") and f.endswith(".json"):
                    try: os.remove(os.path.join(target, f))
                    except: pass

        # Chunking data.json to bypass GitHub 50MB limit
        chunk_size = 15000
        data_chunks = [records[i:i + chunk_size] for i in range(0, len(records), chunk_size)]
        chunk_count = len(data_chunks)
        
        # Build-Specific Metadata
        data_version = f"v{datetime.datetime.now().strftime('%Y.%m.%d.%H%M')}"
        print(f"  - Build Version: {data_version}")
        print(f"  - Chunk Count: {chunk_count}")
        
        for i, chunk in enumerate(data_chunks):
            write_json(f"data_part{i+1}.json", chunk)
            
        write_json("data.json", []) 
        
        write_json("paid_data.json", self.paid_data)
        write_json("hierarchy.json", hierarchy)
        write_json("geo_layers.json", geo_layers)
        

        print("\n[Phase 5] Invoking modular build.py to assemble HTML...")
        import subprocess, sys
        build_script = os.path.join(BASE_DIR, "routing-station-src", "build.py")
        subprocess.run([sys.executable, build_script], check=True)
        
        # Load the assembled index.html to inject dynamic KML metadata and routes
        raw_html_path = os.path.join(OUTPUT_DIR, "index.html")
        with open(raw_html_path, "r", encoding="utf-8") as html_f:
            html = html_f.read()

        # Clean up double escaped backslashes that sometimes occur in JS module concatenation
        html = html.replace(r'/\\\\\\\\d+/', r'/\d+/')
        html = html.replace(r'/\\\\d+/', r'/\d+/')
        
        dev_mode_script = f"<script>window.DEV_MODE = {'true' if TEST_MODE else 'false'};</script>"
        
        # USE DIRECT REPLACE for reliability with large JSON strings
        # We handle both spaced and non-spaced variants to be safe across different source files
        for key, val in {
            "dev_mode": dev_mode_script,
            "data_version": data_version,
            "data_chunks_count": str(chunk_count),
            "kml_metadata": kml_meta_json
        }.items():
            html = html.replace(f"% {key} %", val)
            html = html.replace(f"%{key}%", val)
            html = html.replace(f"[% {key} %]", val)
            html = html.replace(f"[%{key}%]", val)

        # Load Saved Routes from saved_routes/ folder (Source of Truth)
        routes_data = []
        scripts_dir = os.path.dirname(__file__)
        routes_path = os.path.join(scripts_dir, "routes.json")
        saved_routes_dir = os.path.join(scripts_dir, "saved_routes")
        
        if not os.path.exists(saved_routes_dir):
            os.makedirs(saved_routes_dir)
            print(f"  - Created saved_routes/ folder")
        
        # Scan and load ALL individual route files with Natural Sorting
        def natural_sort_key(s):
            return [int(text) if text.isdigit() else text.lower()
                    for text in re.split('([0-9]+)', s)]

        route_files = sorted([f for f in os.listdir(saved_routes_dir) if f.endswith('.json')], key=natural_sort_key)
        for rf in route_files:
            try:
                with open(os.path.join(saved_routes_dir, rf), "r", encoding="utf-8") as f:
                    route_obj = json.load(f)
                    if isinstance(route_obj, dict) and route_obj.get('name'):
                        # ENRICHMENT: Add pre-calculated area for sidebar grouping (Measure 1)
                        if not route_obj.get('area') and route_obj.get('sequence'):
                            seq = route_obj['sequence']
                            if len(seq) > 0:
                                first_sid = str(seq[0].get('surveyId') or seq[0].get('id'))
                                if first_sid in self.sid_to_mc:
                                    route_obj['area'] = self.sid_to_mc[first_sid]
                        
                        routes_data.append(route_obj)
            except Exception as e:
                print(f"  [WARNING] Could not load {rf}: {e}")
        
        # Write back to routes.json (sync master file)
        with open(routes_path, "w", encoding="utf-8") as f:
            json.dump(routes_data, f, ensure_ascii=False)
        
        saved_routes_json = json.dumps(routes_data, ensure_ascii=False)
        print(f"  - Loaded {len(routes_data)} routes from saved_routes/ folder")
        
        html = html.replace("% saved_routes %", saved_routes_json)
        html = html.replace("%saved_routes%", saved_routes_json)
        
        # --- PHASE 6: DEEP SYNC PWA ASSETS ---
        # Ensure all core PWA files and the user login database (roles.json) are synced to GitHub
        pwa_assets = [
            'roles.json', 
            'sw.js', 
            'manifest.json', 
            'icon-192.png', 
            'icon-512.png',
            'favicon.ico'
        ]
        
        print("\n[Phase 6] Synchronizing core PWA assets to GitHub Repo...")
        for asset in pwa_assets:
            src_path = os.path.join(OUTPUT_DIR, asset)
            if os.path.exists(src_path):
                dest_path = os.path.join(GITHUB_DIR, asset)
                try:
                    shutil.copy2(src_path, dest_path)
                    print(f"  + Synced: {asset}")
                except Exception as e:
                    print(f"  [WARN] Failed to copy {asset}: {e}")
            else:
                # If roles.json is missing from OUTPUT_DIR, check SCRIPTS_DIR or routing-station-src
                alt_src = os.path.join(SCRIPTS_DIR, asset)
                if os.path.exists(alt_src):
                    shutil.copy2(alt_src, os.path.join(GITHUB_DIR, asset))
                    print(f"  + Synced (from SCRIPTS_DIR): {asset}")
                elif asset == 'roles.json':
                    print(f"  [ERROR] roles.json NOT FOUND! Authentication will fail on GitHub.")
        
        # Write to Local
        output_path = os.path.join(OUTPUT_DIR, output_file)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Generated {output_path} ({os.path.getsize(output_path) / (1024*1024):.2f} MB)")

        # Write to GitHub Repo
        if os.path.exists(GITHUB_DIR):
            github_path = os.path.join(GITHUB_DIR, output_file)
            with open(github_path, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"Synced {github_path} to GitHub local folder")
        
        # Externalize roles.json and routes.json
        for extra_file in ["roles.json", "routes.json"]:
            src = os.path.join(os.path.dirname(__file__), extra_file)
            if os.path.exists(src):
                # Copy to Local
                dst = os.path.join(OUTPUT_DIR, extra_file)
                shutil.copy2(src, dst)
                print(f"  - Copied {extra_file} to {dst}")
                
                # Copy to GitHub
                if os.path.exists(GITHUB_DIR):
                    dst_git = os.path.join(GITHUB_DIR, extra_file)
                    shutil.copy2(src, dst_git)
                    print(f"  - Copied {extra_file} to GitHub Folder: {dst_git}")

    def sync_to_github(self):
        """Automatically commits and pushes changes to the GitHub repository."""
        print("\nStarting GitHub Sync...")
        try:
            # 0. Ensure .gitignore excludes temporary files
            git_ignore_path = os.path.join(OUTPUT_DIR, ".gitignore")
            ignore_content = ".tmp.driveupload/\n"
            
            if not os.path.exists(git_ignore_path):
                with open(git_ignore_path, "w") as f:
                    f.write(ignore_content)
                print("  - Created .gitignore to exclude temporary files.")
            else:
                with open(git_ignore_path, "r") as f:
                    existing = f.read()
                if ".tmp.driveupload/" not in existing:
                    with open(git_ignore_path, "a") as f:
                        f.write("\n" + ignore_content)
                    print("  - Updated .gitignore to exclude temporary files.")

            # Change directory to the repository
            os.chdir(GITHUB_DIR)
            
            # Git Commands
            commands = [
                ['git', 'add', '.'],
                ['git', 'commit', '-m', f"Automated Update: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"],
                ['git', 'push', 'origin', 'main']
            ]
            
            for cmd in commands:
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    if "nothing to commit" in result.stdout or "nothing to commit" in result.stderr:
                        print("  - No changes to commit.")
                        continue
                    print(f"  [ERROR] Git Command Failed: {' '.join(cmd)}")
                    print(f"  {result.stderr}")
                    return False
                else:
                    print(f"  - Successfully ran: {' '.join(cmd)}")
            
            print("GitHub Sync Complete!\n")
            return True
            
        except Exception as e:
            print(f"  [ERROR] Sync failed: {e}")
            return False

    def update_supabase_version(self):
        """Automatically updates the data_version in Supabase app_settings."""
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not url or not key:
            print("\n[SKIP] Supabase update bypassed: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env")
            return

        try:
            # Generate new version string based on current time
            new_version = f"v{datetime.datetime.now().strftime('%Y.%m.%d.%H%M')}"
            print(f"\n[SUPABASE] Updating data version to: {new_version}...")
            
            supabase = create_client(url, key)
            
            # Upsert the data_version record
            result = supabase.table("app_settings").upsert(
                {"key": "data_version", "value": new_version},
                on_conflict="key"
            ).execute()
            
            if result:
                print(f"   \u2705 Data version successfully synced to Supabase: {new_version}")
            else:
                print("   \u26a0\ufe0f Data version update failed (No response from server).")
        
        except Exception as e:
            print(f"   \u274c [ERROR] Supabase sync failed: {str(e)}")
            print("     (The app will still work, but mobile cache won't refresh automatically.)")

    def run_survey_sync(self):
        """Runs the survey_filtered.py script in deployment mode with real-time logging."""
        print("\n[SYNC] Checking for recent survey records...")
        try:
            script_path = os.path.join(os.path.dirname(__file__), "survey_filtered.py")
            # Ensure we use python.exe even if launched from a GUI (pythonw.exe)
            exe = sys.executable.replace('pythonw.exe', 'python.exe')
            
            # Use Popen to stream output in real-time to the dashboard
            process = subprocess.Popen(
                [exe, script_path, "--deploy"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                bufsize=1, # Line buffered
                universal_newlines=True
            )
            
            for line in process.stdout:
                print(line, end='', flush=True)
                
            process.wait()
            if process.returncode == 0:
                print("\n[SYNC] Survey sync completed successfully.\n")
                return True
            else:
                print(f"\n[ERROR] Survey sync failed with return code {process.returncode}")
                return False
                
        except Exception as e:
            print(f"[ERROR] An unexpected error occurred during sync: {e}")
            return False

import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Modern Mobile-First Field Staff Map Generator")
    parser.add_argument("--test", action="store_true", help="Enable TEST_MODE (limits markers, avoids syncs)")
    parser.add_argument("--sync-github", action="store_true", help="Automatically sync to GitHub after generation")
    args = parser.parse_args()

    # Override internal toggles with CLI arguments if provided
    if args.test:
        TEST_MODE = True
        DEV_MODE = True
        print("[CLI] TEST_MODE enabled via argument.")

    generator = ModernMapGenerator()
    
    # Automatically run Survey Sync if NOT in TEST_MODE
    if not TEST_MODE:
        print("[FULL_MODE] Running recent survey records sync from portal...")
        generator.run_survey_sync()
    else:
        print("[TEST_MODE] Sync bypassed. Skipping portal check.")

    if generator.process_csvs():
        generator.generate_html("index.html")
        
        # Only update Supabase version if everything else succeeded and NOT in TEST_MODE
        if not TEST_MODE:
            generator.update_supabase_version()
        else:
            print("\n[TEST_MODE] Supabase version update bypassed.")
            
        # GitHub Sync Automation
        if args.sync_github:
            generator.sync_to_github()
        else:
            print("\n[LOCAL] Local files generated successfully. GitHub sync bypassed.")
