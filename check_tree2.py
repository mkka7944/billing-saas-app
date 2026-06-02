import json
d = json.load(open('tree_test.json'))

# Find first UC with routes
for city in d['data']:
    for uc in city['ucs']:
        if uc['routes']:
            print(f"UC: {uc['uc']}")
            for r in uc['routes'][:10]:
                print(f"  {r['route_name']} ({r['unit_count']})")
            print(f"  ... total routes: {len(uc['routes'])}")
            print(f"  unrouted: {uc['unrouted']}")
            break
    else:
        continue
    break

# Check if MC-1 MANZOOR (0 routes) is still in response
uc_zero = [uc for city in d['data'] for uc in city['ucs'] if uc['uc'].startswith('MC-1, MANZ')]
print(f"\nMC-1 MANZOOR in response: {len(uc_zero)} UCs, routes={uc_zero[0]['routes'] if uc_zero else 'N/A'}")
