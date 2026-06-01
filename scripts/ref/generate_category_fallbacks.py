import os
import pandas as pd
import glob
from datetime import datetime

# Define base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRAPED_DATA_DIR = os.path.join(BASE_DIR, 'outputs', 'scraped_data')
EXCEL_DUMPS_DIR = os.path.join(BASE_DIR, 'inputs', 'excel_dumps')

def generate_fallbacks():
    print(f"Starting Category Fallback Generation...")
    
    # Target files mapping for the 3 cities
    target_cities = {
        'SARGODHA': 'SARGODHA_SARGODHA_SURVEY_DATA.csv',
        'BHALWAL': 'SARGODHA_BHALWAL_SURVEY_DATA.csv',
        'KHUSHAB': 'KHUSHAB_KHUSHAB_SURVEY_DATA.csv'
    }

    # Generate a dynamic month string like 'feb2026'
    # Currently setting it to 'feb2026' as requested in plan, but can be made dynamic
    current_month_str = "may2026" 

    for city, filename in target_cities.items():
        file_path = os.path.join(SCRAPED_DATA_DIR, filename)
        
        if not os.path.exists(file_path):
            print(f"WARNING: Survey data file not found for {city}: {file_path}")
            continue
            
        print(f"\nProcessing {city}...")
        
        try:
            # Read the master survey data
            df = pd.read_csv(file_path, low_memory=False)
            
            # We need these columns minimally to do the mapping
            required_cols = ['Survey ID', 'UC Type', 'Consumer Type']
            missing_cols = [col for col in required_cols if col not in df.columns]
            
            if missing_cols:
                print(f"ERROR: Missing required columns {missing_cols} in {filename}")
                continue
                
            # Create the fallback dataframe
            fallback_data = []
            
            for index, row in df.iterrows():
                sid = row.get('Survey ID', '')
                if pd.isna(sid) or sid == '':
                    continue
                    
                uc_type = row.get('UC Type', '')
                consumer_type = row.get('Consumer Type', '')
                
                # Default empty categories
                category = uc_type if not pd.isna(uc_type) else ''
                sub_category = consumer_type if not pd.isna(consumer_type) else ''
                billing_category = ''
                
                # Apply mapping logic for Billing Category
                if str(consumer_type).strip().lower() == 'domestic':
                    area = row.get('Area', '')
                    billing_category = area if not pd.isna(area) else ''
                elif str(consumer_type).strip().lower() == 'commercial':
                    level = row.get('Level', '')
                    billing_category = level if not pd.isna(level) else ''
                    
                # The portal output has "Sr#", "Biller Added", "Survey ID", "WMC", "Division", "District", "Tehsil", "Office", "UC", "Name", "CNIC", "Mobile", "Address", "Category", "Sub Category", "Billing Category"
                # We will output all 16 columns with dummy/empty data for the fields we don't need, to perfectly match the portal format.
                
                fallback_data.append({
                    "Sr#": index + 1,
                    "Biller Added": "-",
                    "Survey ID": sid,
                    "WMC": "Generated Fallback",
                    "Division": "-",
                    "District": city,
                    "Tehsil": "-",
                    "Office": "-",
                    "UC": "-",
                    "Name": "-",
                    "CNIC": "-",
                    "Mobile": "-",
                    "Address": "-",
                    "Category": category,
                    "Sub Category": sub_category,
                    "Billing Category": billing_category
                })
                
            fallback_df = pd.DataFrame(fallback_data)
            
            # Ensure the columns are in the exact order as the portal output
            columns_order = [
                "Sr#", "Biller Added", "Survey ID", "WMC", "Division", "District", 
                "Tehsil", "Office", "UC", "Name", "CNIC", "Mobile", "Address", 
                "Category", "Sub Category", "Billing Category"
            ]
            fallback_df = fallback_df[columns_order]
            
            # The portal's actual fallback output file pattern is `biller_data_{city}_{month}.csv`
            output_filename = f"biller_data_{city.lower()}_{current_month_str}.csv"
            output_path = os.path.join(EXCEL_DUMPS_DIR, output_filename)
            
            # Make sure excel_dumps directory exists
            os.makedirs(EXCEL_DUMPS_DIR, exist_ok=True)
            
            fallback_df.to_csv(output_path, index=False)
            print(f"SUCCESS: Generated {len(fallback_df)} fallback records -> {output_filename}")
            
        except Exception as e:
            print(f"ERROR: Failed to process {city}. Exception: {e}")

if __name__ == "__main__":
    generate_fallbacks()
