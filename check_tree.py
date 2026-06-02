import json
d = json.load(open('tree_test.json'))
first_city = d['data'][0]
first_uc = first_city['ucs'][0]
print(f"City: {first_city['city']}")
print(f"First UC: {first_uc['uc']}")
print(f"Routes ({len(first_uc['routes'])}):")
for r in first_uc['routes'][:7]:
    print(f"  {r['route_name']} ({r['unit_count']})")
uc_count = sum(len(c['ucs']) for c in d['data'])
print(f"UCs shown: {uc_count}")
