import urllib.request, json, re

env = open('E:\\saas-project\\billing-saas-app\\.env.local', encoding='utf-8').read()
svc_key = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', env).group(1)

url = "https://qrxbsoqepfaryolwcedk.supabase.co/rest/v1/survey_units"

# Test with larger range
req = urllib.request.Request(
    f"{url}?select=survey_id&current_bill_month=eq.MAY2026&uc_name=eq.MC-1%2C%20NEW%20SATELLITE%20TOWN%2C%20BLOCK%20Z%2C%20SARGODHA&order=route_seq.asc.nullslast",
    headers={
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
        'Range': '0-4999',
    }
)
res = urllib.request.urlopen(req)
data = json.loads(res.read())

# Check content-range header
content_range = res.headers.get('Content-Range', 'N/A')
print(f"Range requested: 0-4999")
print(f"Rows returned: {len(data)}")
print(f"Content-Range header: {content_range}")
