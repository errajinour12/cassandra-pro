import json
with open('frontend/eslint.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for file in data:
    for msg in file['messages']:
        if msg['severity'] == 2:
            print(file['filePath'].split('frontend\\\\')[-1] + ':' + str(msg['line']) + ' - ' + msg['message'])
