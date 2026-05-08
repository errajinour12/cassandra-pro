import os

files = [
    "frontend/src/components/WritePath.jsx",
    "frontend/src/components/UpdatePath.jsx",
    "frontend/src/components/DeletePath.jsx"
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We replace: {isDown ? "<Flame size={24} color="var(--error-color)" />" : "<Server size={24} color="var(--text-secondary)" />"}
    # with:       {isDown ? <Flame size={24} color="var(--error-color)" /> : <Server size={24} color="var(--text-secondary)" />}
    
    old_str = '{isDown ? "<Flame size={24} color="var(--error-color)" />" : "<Server size={24} color="var(--text-secondary)" />"}'
    new_str = '{isDown ? <Flame size={24} color="var(--error-color)" /> : <Server size={24} color="var(--text-secondary)" />}'
    
    content = content.replace(old_str, new_str)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed syntax errors")
