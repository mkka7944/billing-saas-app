import json
d = json.load(open('test_assign.json'))
print(f"total field: {d.get('total')}")
print(f"data length: {len(d.get('data', []))}")
print(f"keys in data[0]: {list(d.get('data', [{}])[0].keys())}")
