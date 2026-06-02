import urllib.request, json

url = "https://qrxbsoqepfaryolwcedk.supabase.co/rest/v1/survey_units"
svc_key = open('E:\\saas-project\\billing-saas-app\\.env.local').read().split('SUPABASE_SERVICE_ROLE_KEY=')[1].split('\n')[0].strip()

# Test 1: Range 0-4 (should return 5)
req1 = urllib.request.Request(
    f"{url}?select=survey_id&current_bill_month=eq.MAY2026&uc_name=eq.MC-1%2C%20NEW%20SATELLITE%20TOWN%2C%20BLOCK%20Z%2C%20SARGODHA&limit=5",
    headers={
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
    }
)
res1 = urllib.request.urlopen(req1)
data1 = json.loads(res1.read())
print(f"Test 1 (limit=5): {len(data1)} rows")

# Test 2: Range 0-999 (should return 1000)
req2 = urllib.request.Request(
    f"{url}?select=survey_id&current_bill_month=eq.MAY2026&uc_name=eq.MC-1%2C%20NEW%20SATELLITE%20TOWN%2C%20BLOCK%20Z%2C%20SARGODHA&order=route_seq.asc.nullslast",
    headers={
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
        'Range': '0-999',
    }
)
res2 = urllib.request.urlopen(req2)
data2 = json.loads(res2.read())
print(f"Test 2 (Range 0-999): {len(data2)} rows")

# Test 3: No Range (should return 1000 by default?)
req3 = urllib.request.Request(
    f"{url}?select=survey_id&current_bill_month=eq.MAY2026&uc_name=eq.MC-1%2C%20NEW%20SATELLITE%20TOWN%2C%20BLOCK%20Z%2C%20SARGODHA&order=route_seq.asc.nullslast",
    headers={
        'apikey': svc_key,
        'Authorization': f'Bearer {svc_key}',
    }
)
res3 = urllib.request.urlopen(req3)
data3 = json.loads(res3.read())
print(f"Test 3 (No Range): {len(data3)} rows")
