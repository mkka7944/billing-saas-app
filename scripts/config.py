"""
Global Configuration for SGWMC Billing System
"""
import os

# ====================================================
# 1. CREDENTIALS
# ====================================================
CREDENTIALS = {
    "PROFILE_SARGODHA": {
        "CNIC": "3840111639195",
        "PASSWORD": "SGD2006@MHassan",
        "USER_TYPE": "HRMIS_USER"
    },
    "PROFILE_KB": {
        "CNIC": "3230307561839",
        "PASSWORD": "sac@awk938100",
        "USER_TYPE": "HRMIS_USER"
    }
}

# ====================================================
# 2. TARGET JOBS
# ====================================================
TARGET_JOBS = [
    {
        "city_name": "Sargodha",
        "profile": "PROFILE_SARGODHA", 
        "division_id": "9",
        "district_id": "32",
        "office_id": "",
        "designation_id": None,
        "workers": 5,    # Restored to original parallel speed
        "sorting": "",   # No sorting for stability
        "size": 250      # Large pages for speed
    },
    {
        "city_name": "Khushab",
        "profile": "PROFILE_KB", 
        "division_id": "9",
        "district_id": "16",
        "office_id": "",         
        "designation_id": 160449,
        "workers": 10,   # Parallel for Speed on MEDIUM City
        "sorting": "",
        "size": 250
    },
    {
        "city_name": "Bhalwal",
        "profile": "PROFILE_KB", 
        "division_id": "9",
        "district_id": "32",
        "office_id": "",         
        "designation_id": 160443,
        "workers": 5,    # Increased from 2: Safe once server-side sorting is removed
        "sorting": "",   # Removed: Rely on script's local Pandas sorting to avoid timeouts
        "size": 250      # Increased from 50: Standardized for better portal throughput
    },
    # Test job for Sahiwal Sgd (Returns 0 records - likely needs specific designation_id)
    # {
    #     "city_name": "Sahiwal_Sgd",
    #     "profile": "PROFILE_SARGODHA", 
    #     "division_id": "9",
    #     "district_id": "32",
    #     "office_id": "142",
    #     "designation_id": None,
    #     "workers": 5,
    #     "sorting": "",
    #     "size": 250
    # }
]

# ====================================================
# 3. PATHS
# ====================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "..", "outputs", "scraped_data")
AREAS_CSV_PATH = os.path.join(BASE_DIR, "..", "inputs", "config_files", "areas_export.csv")