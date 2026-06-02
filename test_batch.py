import urllib.request, json, re

env = open('E:\\saas-project\\billing-saas-app\\.env.local', encoding='utf-8').read()
svc_key = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', env).group(1)
sup_url = "https://qrxbsoqepfaryolwcedk.supabase.co"

# Test batched fetching
all_rows = []
batch_size = 1000
offset = 0

while True:
    url = f"{sup_url}/rest/v1/survey_units?select=survey_id&current_bill_month=eq.MAY2026&uc_name=eq.MC-1%2C%20NEW%20SATELLITE%20TOWN%2C%20BLOCK%20Z%2C%20SARGODHA&order=route_seq.asc.nullslast"
    req = urllib.request.Request(
        url,
        headers={
            'apikey': svc_key,
            'Authorization': f'Bearer {svc_key}',
            'Range': f'{offset}-{offset + batch_size - 1}',
        }
    )
    res = urllib.request.urlopen(req)
    chunk = json.loads(res.read())
    if not chunk:
        break
    all_rows.extend(chunk)
    offset += len(chunk)
    print(f"Fetched {len(chunk)} rows, total: {len(all_rows)}")
    if len(chunk) < batch_size:
        break

print(f"\nTotal: {len(all_rows)}")
