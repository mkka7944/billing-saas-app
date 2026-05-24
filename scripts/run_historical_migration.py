#!/usr/bin/env python3
"""
Historical Data Migration — 3-table design: survey_units + bill_items + payment_history
Phase 0b: Populates from Survey CSVs, Lifecycle XLSX (current month), Payment CSV.

Usage:
    python scripts/run_historical_migration.py              # Full migration
    python scripts/run_historical_migration.py --payments-only  # Daily payment sync
    python scripts/run_historical_migration.py --reset       # Purge tables first
    python scripts/run_historical_migration.py --dry-run     # Preview only
"""

import os, sys, json, math, re
from collections import defaultdict
import pandas as pd
import argparse
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
EXCEL_DUMPS = os.path.join(DATA_DIR, "excel_dumps")
SCRAPED_DATA = os.path.join(DATA_DIR, "scraped_data")
PROCESSED_PDFS = os.path.join(DATA_DIR, "processed_pdfs")
GEO_PATH = os.path.join(SCRIPT_DIR, "geography.json")
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")
COLUMN_MAP_PATH = os.path.join(SCRIPT_DIR, "column_mapping.json")

load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local")
    sys.exit(1)


class HistoricalMigration:
    def __init__(self):
        self.sb = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Column mappings
        self.col_map = {}
        if os.path.exists(COLUMN_MAP_PATH):
            with open(COLUMN_MAP_PATH) as f:
                self.col_map = json.load(f)

        # Lookup maps
        self.sid_enrich = {}         # survey_id -> {monthly_fee, billing_category, city, uc_name}
        self.sid_to_psid = {}        # survey_id -> list of psids (for archived detection)
        self.psid_to_sid = {}        # psid -> survey_id
        self.psid_to_enrich = {}     # psid -> {arrears, deleted_in_portal, start_month, is_issued, amount_due, route_name, route_seq}

        # Geography
        self.geo_config = {}
        if os.path.exists(GEO_PATH):
            with open(GEO_PATH) as f:
                self.geo_config = json.load(f)

        # Output rows
        self.survey_rows = []
        self.bill_items_rows = []
        self.payment_rows = []
        self.seen_survey_ids = set()

        self.session_start = datetime.now()

    # --- Helpers ---
    @staticmethod
    def normalize_sid(sid):
        if not sid or str(sid).lower() == "nan":
            return ""
        s = str(sid).strip().lstrip("0").upper()
        return s if s else "0"

    @staticmethod
    def safe_float(val):
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return None
            return f
        except (ValueError, TypeError):
            return None

    @staticmethod
    def safe_int(val):
        try:
            return int(float(str(val).strip()))
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def parse_date(val):
        if not val:
            return None
        try:
            dt = pd.to_datetime(str(val).strip(), errors="coerce")
            return dt.strftime("%Y-%m-%d") if pd.notna(dt) else None
        except Exception:
            return None

    @staticmethod
    def clean_time(val):
        if not val or str(val).strip().lower() in ("", "nan", "none", "nat"):
            return None
        t = str(val).strip()
        if t.count(":") == 1:
            t = t + ":00"
        return t if ":" in t else None

    @staticmethod
    def normalize_month(m):
        if not m or str(m).lower() == "nan":
            return ""
        return str(m).upper().replace(" ", "")

    @staticmethod
    def get_col_csv(row, aliases):
        if isinstance(aliases, str):
            aliases = [aliases]
        for a in aliases:
            if a in row:
                v = row[a]
                return str(v).strip() if pd.notna(v) else ""
            for k in row.keys():
                if str(k).strip().lower() == a.lower():
                    v = row[k]
                    return str(v).strip() if pd.notna(v) else ""
        return ""

    def resolve_hierarchy(self, raw_district, raw_tehsil):
        rules = self.geo_config.get("mapping_rules", {})
        raw_t = raw_tehsil.upper()
        raw_d = raw_district.upper()
        if raw_t in rules:
            r = rules[raw_t]
            return r["district"], r["tehsil"]
        if raw_d in rules:
            r = rules[raw_d]
            return r["district"], r["tehsil"]
        return raw_district, raw_tehsil

    def find_latest_lifecycle_files(self):
        if not os.path.exists(PROCESSED_PDFS):
            return []
        all_files = sorted(
            f for f in os.listdir(PROCESSED_PDFS)
            if "test_lifecycle" in f.lower() and f.endswith(".xlsx") and not f.startswith("~$")
        )
        city_files = defaultdict(list)
        for f in all_files:
            parts = f.replace(".xlsx", "").split("_")
            if len(parts) >= 4:
                city = parts[3]
                city_files[city].append(f)
        latest = []
        for city, files in city_files.items():
            files.sort(reverse=True)
            latest.append(files[0])
            if len(files) > 1:
                print(f"  {city}: using {files[0]} (skipping {len(files)-1} older files)")
        return sorted(latest)

    # --- Load: Lifecycle XLSX -> bill_items + enrichment ---
    def load_lifecycle(self, month_override=None):
        files = self.find_latest_lifecycle_files()
        if month_override:
            files = [f for f in os.listdir(PROCESSED_PDFS) if month_override in f and f.endswith(".xlsx") and not f.startswith("~$")]
        if not files:
            print("  [SKIP] No lifecycle XLSX files found")
            return

        lc = self.col_map.get("lifecycle", {})
        psid_col = lc.get("psid", "Biller PSID")
        sid_col = lc.get("survey_id", "Survey ID")
        amount_col = lc.get("amount_due", "Total Payable")
        arrears_col = lc.get("arrears", "Arrears")
        deleted_col = lc.get("deleted_in_portal", "Deleted in Portal")
        start_col = lc.get("start_month", "Start Month")
        route_col = lc.get("route_name", "Route Segment")
        route_seq_col = lc.get("route_seq", "Route Seq")
        fee_col = lc.get("monthly_fee", "Monthly Fee")
        cat_col = lc.get("billing_category", "Billing Category")
        uc_col = lc.get("uc_name", "UC")
        city_col = lc.get("city", "City")
        issued_prefix = lc.get("is_issued", "PDF Issued")

        print(f"  Loading {len(files)} lifecycle files...")

        for fi, lf in enumerate(files, 1):
            try:
                match = re.search(r"(Apr|Aug|Dec|Feb|Jan|Jul|Jun|Mar|May|Nov|Oct|Sep)(20[0-9]{2})", lf)
                bill_month = match.group(1).upper()[:3] + match.group(2) if match else "UNKNOWN"

                ldf = pd.read_excel(os.path.join(PROCESSED_PDFS, lf), engine="openpyxl", dtype=str)
                issued_cols = [c for c in ldf.columns if issued_prefix.lower() in c.lower()]

                count = 0
                for _, row in ldf.iterrows():
                    psid_raw = row.get(psid_col, "")
                    if pd.isna(psid_raw):
                        continue
                    psid = f"{int(float(psid_raw))}" if isinstance(psid_raw, (float, int)) else str(psid_raw).strip()
                    if not psid:
                        continue

                    sid = self.normalize_sid(row.get(sid_col, ""))
                    if not sid:
                        continue

                    self.sid_to_psid.setdefault(sid, []).append(psid)
                    self.psid_to_sid[psid] = sid

                    arrears_val = row.get(arrears_col, "0")
                    try:
                        arrears_f = float(arrears_val) if arrears_val and str(arrears_val).lower() != "nan" else 0
                    except (ValueError, TypeError):
                        arrears_f = 0

                    is_issued = False
                    for col in issued_cols:
                        val = str(row.get(col, "")).strip().upper()
                        if val in ("YES", "1", "ISSUED"):
                            is_issued = True
                            break

                    m_fee = self.safe_int(row.get(fee_col, "0"))
                    b_cat = str(row.get(cat_col, "")).strip()
                    if b_cat.lower() == "nan":
                        b_cat = ""

                    uc_val = str(row.get(uc_col, "")).strip()
                    city_val = self.get_col_csv(row, city_col)
                    amount_val = self.safe_float(row.get(amount_col, "0"))

                    self.sid_enrich[sid] = {
                        "monthly_fee": m_fee,
                        "billing_category": b_cat if b_cat and b_cat.lower() != "nan" else "UNKNOWN",
                        "uc_name": uc_val.upper() if uc_val else "",
                        "city": city_val.upper() if city_val else "",
                    }

                    self.psid_to_enrich[psid] = {
                        "arrears": arrears_f,
                        "deleted_in_portal": str(row.get(deleted_col, "")).strip() if pd.notna(row.get(deleted_col)) else None,
                        "start_month": str(row.get(start_col, "")).strip() if pd.notna(row.get(start_col)) else None,
                        "is_issued": is_issued,
                        "amount_due": amount_val,
                        "route_name": str(row.get(route_col, "")).strip() if pd.notna(row.get(route_col)) else None,
                        "route_seq": self.safe_int(row.get(route_seq_col, "0")),
                    }

                    self.bill_items_rows.append({
                        "psid": psid,
                        "survey_id": sid,
                        "bill_month": bill_month,
                        "amount_due": amount_val,
                        "arrears": arrears_f,
                        "monthly_fee": m_fee,
                        "billing_category": b_cat if b_cat and b_cat.lower() != "nan" else "UNKNOWN",
                        "uc_name": uc_val.upper() if uc_val else None,
                        "city": city_val.upper() if city_val else None,
                        "deleted_in_portal": str(row.get(deleted_col, "")).strip() if pd.notna(row.get(deleted_col)) else None,
                        "is_issued": is_issued,
                        "start_month": str(row.get(start_col, "")).strip() if pd.notna(row.get(start_col)) else None,
                        "route_name": str(row.get(route_col, "")).strip() if pd.notna(row.get(route_col)) else None,
                        "route_seq": self.safe_int(row.get(route_seq_col, "0")),
                    })
                    count += 1

                print(f"    [{fi}/{len(files)}] {lf}: {count} rows -> bill_items")
            except Exception as e:
                print(f"    Error loading lifecycle {lf}: {e}")

        print(f"    Total bill_items: {len(self.bill_items_rows)} rows")

    # --- Load: Survey CSVs -> survey_units ---
    def load_surveys(self, max_db_id=0):
        if not os.path.exists(SCRAPED_DATA):
            return

        files = sorted(
            f for f in os.listdir(SCRAPED_DATA)
            if f.endswith(".csv")
            and "SURVEY" in f.upper()
            and "MASTER" not in f.upper()
            and "PAID_ALL_HISTORY" not in f.upper()
            and not f.startswith("~$")
        )
        print(f"  Loading {len(files)} Survey files...")

        cm = self.col_map.get("survey", {})

        for fi, csv_file in enumerate(files, 1):
            try:
                df = pd.read_csv(os.path.join(SCRAPED_DATA, csv_file), encoding="utf-8-sig", engine="python")
                loaded = 0
                skipped = 0
                for _, row in df.iterrows():
                    if loaded > 0 and loaded % 10000 == 0:
                        sys.stdout.write(f"\r    [{fi}/{len(files)}] {csv_file}: {loaded} loaded, {skipped} skipped")
                        sys.stdout.flush()

                    sid = self.normalize_sid(self.get_col_csv(row, cm.get("survey_id", ["Survey ID"])))
                    if not sid or sid in self.seen_survey_ids:
                        skipped += 1
                        continue

                    self.seen_survey_ids.add(sid)
                    try:
                        if max_db_id > 0 and int(sid) <= max_db_id:
                            continue
                    except ValueError:
                        pass

                    lat = self.safe_float(self.get_col_csv(row, cm.get("latitude", ["Latitude", "Lat"])))
                    lon = self.safe_float(self.get_col_csv(row, cm.get("longitude", ["Longitude", "Lng", "Long"])))

                    images = []
                    for key in ["image_url_1", "image_url_2", "image_url_3", "image_url_4"]:
                        url = self.get_col_csv(row, cm.get(key, []))
                        if url and url.lower() != "nan":
                            images.append(url)

                    raw_district = self.get_col_csv(row, cm.get("district", ["District", "City"])).upper()
                    raw_tehsil = self.get_col_csv(row, cm.get("tehsil", ["Tehsil"])).upper()
                    district, tehsil = self.resolve_hierarchy(raw_district, raw_tehsil)

                    enrich = self.sid_enrich.get(sid, {})

                    rec = {
                        "survey_id": sid,
                        "status": "ACTIVE",
                        "city_district": district,
                        "tehsil": tehsil,
                        "uc_name": self.get_col_csv(row, cm.get("uc_name", ["Union Council", "UC", "Area"])).upper(),
                        "uc_type": self.get_col_csv(row, cm.get("uc_type", ["UC Type", "Type"])).upper(),
                        "consumer_name": self.get_col_csv(row, cm.get("consumer_name", ["Name", "Consumer"])),
                        "address": self.get_col_csv(row, cm.get("address", ["Address"])),
                        "house_type": self.get_col_csv(row, cm.get("house_type", ["House Type"])),
                        "unit_type": self.get_col_csv(row, cm.get("unit_type", ["Consumer Type", "Unit Type"])),
                        "lat": lat,
                        "lng": lon,
                        "image_urls": images,
                        "surveyor_name": self.get_col_csv(row, cm.get("surveyor_name", ["Surveyor Name", "Surveyor"])),
                        "survey_date": self.parse_date(self.get_col_csv(row, cm.get("survey_date", ["Survey Date", "Date"]))),
                        "survey_time": self.clean_time(self.get_col_csv(row, cm.get("survey_time", ["Survey Time", "Time"]))),
                        "monthly_fee": enrich.get("monthly_fee", 0),
                        "billing_category": enrich.get("billing_category", "UNKNOWN"),
                    }
                    self.survey_rows.append(rec)
                    loaded += 1

                print(f"\r    [{fi}/{len(files)}] {csv_file}: {loaded} loaded, {skipped} skipped (duplicate SIDs)")
            except Exception as e:
                print(f"\r    Error loading survey {csv_file}: {e}")

        print(f"    Total survey_units: {len(self.survey_rows)} rows")

    # --- Identify ARCHIVED stubs ---
    def identify_archived(self):
        count = 0
        for sid, psids in self.sid_to_psid.items():
            if sid not in self.seen_survey_ids and psids:
                enrich = self.sid_enrich.get(sid, {})
                self.survey_rows.append({
                    "survey_id": sid,
                    "status": "ARCHIVED",
                    "city_district": enrich.get("city", "UNKNOWN"),
                    "tehsil": "UNKNOWN",
                    "uc_name": enrich.get("uc_name", "ARCHIVED_CENTER") or "ARCHIVED_CENTER",
                    "consumer_name": "Archived Biller Data",
                    "address": "Archived Address",
                    "monthly_fee": enrich.get("monthly_fee", 0),
                    "billing_category": enrich.get("billing_category", "UNKNOWN"),
                })
                count += 1
        print(f"  Archived survey stubs: {count}")

    # --- Load: Payment CSV -> payment_history ---
    def load_payments(self):
        if not os.path.exists(SCRAPED_DATA):
            return

        files = sorted(
            f for f in os.listdir(SCRAPED_DATA)
            if f.endswith(".csv") and "PAID_ALL_HISTORY" in f.upper() and not f.startswith("~$")
        )
        files.sort(key=lambda x: (0 if "COMBINED" in x.upper() else 1))

        cm = self.col_map.get("payment", {})
        psid_col = cm.get("psid", "PSID")
        month_col = cm.get("bill_month", "Month")
        amount_col = cm.get("amount_paid", "Paid Amount")
        date_col = cm.get("paid_date", "Paid Date")
        method_col = cm.get("payment_method", "Channel")
        status_col = cm.get("payment_status", "Status")
        fine_col = cm.get("fine", "Fine")

        seen_keys = set()
        total = 0

        for pf in files:
            try:
                pdf = pd.read_csv(os.path.join(SCRAPED_DATA, pf), encoding="utf-8-sig", engine="python")
                for _, row in pdf.iterrows():
                    psid = str(row.get(psid_col, "")).strip()
                    if not psid or psid == "nan":
                        continue
                    m = self.normalize_month(row.get(month_col, ""))
                    if not m:
                        continue
                    key = (psid, m)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    raw_date = row.get(date_col)
                    if pd.notna(raw_date):
                        date_val = self.parse_date(raw_date)
                    else:
                        date_val = None

                    self.payment_rows.append({
                        "psid": psid,
                        "bill_month": m,
                        "amount_paid": self.safe_float(row.get(amount_col, 0)),
                        "paid_date": date_val,
                        "payment_method": str(row.get(method_col, "")).strip() if pd.notna(row.get(method_col)) else None,
                        "payment_status": str(row.get(status_col, "")).strip().lower() if pd.notna(row.get(status_col)) else "unpaid",
                        "fine": self.safe_float(row.get(fine_col, 0)),
                    })
                    total += 1
                print(f"    {pf}: loaded")
            except Exception as e:
                print(f"    Error loading payment {pf}: {e}")

        print(f"    Total payment_history: {len(self.payment_rows)} rows")

    # --- Batch Upsert ---
    def upload_chunked(self, table, rows, chunk_size=500):
        if not rows:
            print(f"  No rows to upload to '{table}'.")
            return

        # Deduplicate for pk-based tables
        if table == "bill_items":
            seen = set()
            deduped = []
            for r in rows:
                pk = r.get("psid", "")
                if pk in seen:
                    continue
                seen.add(pk)
                deduped.append(r)
            if len(deduped) < len(rows):
                print(f"  Deduplicated {len(rows) - len(deduped)} duplicate PSIDs")
            rows = deduped
        elif table == "payment_history":
            seen = set()
            deduped = []
            for r in rows:
                pk = (r.get("psid", ""), r.get("bill_month", ""))
                if pk in seen:
                    continue
                seen.add(pk)
                deduped.append(r)
            if len(deduped) < len(rows):
                print(f"  Deduplicated {len(rows) - len(deduped)} duplicate (psid, month) records")
            rows = deduped

        print(f"  Uploading {len(rows)} rows to '{table}'...")
        ok = 0
        fail = 0
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i:i+chunk_size]
            try:
                self.sb.table(table).upsert(chunk, ignore_duplicates=True).execute()
                ok += len(chunk)
            except Exception as e:
                print(f"    Error at chunk {i}: {e}")
                fail += len(chunk)
            sys.stdout.write(f"\r    Progress: {ok}/{len(rows)} OK, {fail} failed")
            sys.stdout.flush()
        print()

    # --- Purge (delete all rows, try multiple column names) ---
    def purge_tables(self):
        for table in ["payment_history", "bill_items", "survey_units"]:
            print(f"  Purging {table}...")
            for col in ["id", "psid", "survey_id"]:
                try:
                    self.sb.table(table).delete().neq(col, "NONE").neq(col, "00000000-0000-0000-0000-000000000000").execute()
                    print(f"    Purged via {col}")
                    break
                except Exception:
                    continue
        print("  Purge complete.")

    # --- Summary ---
    def print_summary(self):
        elapsed = datetime.now() - self.session_start
        print(f"\n{'='*50}")
        print(f"Migration complete in {elapsed}")
        print(f"  survey_units:    {len(self.survey_rows)} rows prepared")
        print(f"  bill_items:      {len(self.bill_items_rows)} rows prepared")
        print(f"  payment_history: {len(self.payment_rows)} rows prepared")
        print(f"{'='*50}")

    def run(self):
        parser = argparse.ArgumentParser(description="Historical Data Migration -> billing Supabase")
        parser.add_argument("--payments-only", action="store_true", help="Only sync payment_history (daily)")
        parser.add_argument("--reset", action="store_true", help="Purge tables before upload")
        parser.add_argument("--dry-run", action="store_true", help="Process files but skip upload")
        parser.add_argument("--month", type=str, help="Override month filter for lifecycle (e.g. May2026)")
        args = parser.parse_args()

        print(f"Historical Migration — Phase 0b (3-table design)")
        print(f"Supabase: {SUPABASE_URL}")
        print(f"Data:     {DATA_DIR}")

        if args.payments_only:
            print("\n[PAYMENTS-ONLY MODE]")
            print("\n[1/1] Loading Payment History...")
            self.load_payments()
            if args.dry_run:
                print("\n[DRY RUN] Skipping upload.")
                return
            print("\nUploading payment_history...")
            self.upload_chunked("payment_history", self.payment_rows)
            self.print_summary()
            return

        print("\n[1/4] Loading Lifecycle XLSX -> bill_items...")
        self.load_lifecycle(month_override=args.month)

        print("\n[2/4] Loading Survey CSVs -> survey_units...")
        self.load_surveys()

        print("\n[3/4] Identifying archived records...")
        self.identify_archived()

        print("\n[4/4] Loading Payment History -> payment_history...")
        self.load_payments()

        if args.dry_run:
            print("\n[DRY RUN] Skipping upload.")
            self.print_summary()
            return

        if args.reset:
            print("\nPurging existing data...")
            self.purge_tables()

        print("\nUploading to Supabase...")
        self.upload_chunked("survey_units", self.survey_rows)
        self.upload_chunked("bill_items", self.bill_items_rows)
        self.upload_chunked("payment_history", self.payment_rows)

        self.print_summary()


if __name__ == "__main__":
    HistoricalMigration().run()
