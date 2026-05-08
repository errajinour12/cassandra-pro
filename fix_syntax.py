import os

files = [
    "frontend/src/components/WritePath.jsx",
    "frontend/src/components/UpdatePath.jsx",
    "frontend/src/components/DeletePath.jsx"
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the conditional JSX errors
    content = content.replace('"{isDown ? \\"\\""', '{isDown ? \\"')
    content = content.replace('"? \\"<Flame', '? <Flame')
    content = content.replace('\\" />\\" : \\"<Server', '/> : <Server')
    content = content.replace('\\" />\\"}"', '/>}')
    # Wait, let's just do a simple replace
    content = content.replace('isDown ? "<Flame size={24} color=\\"var(--error-color)\\" />" : "<Server size={24} color=\\"var(--text-secondary)\\" />"', 
                              'isDown ? <Flame size={24} color="var(--error-color)" /> : <Server size={24} color="var(--text-secondary)" />')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed syntax errors")
