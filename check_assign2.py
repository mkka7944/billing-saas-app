import json
with open('E:\\saas-project\\billing-saas-app\\test_assign.json', encoding='utf-8') as f:
    d = json.load(f)
print('total:', d.get('total'))
print('data length:', len(d.get('data', [])))
