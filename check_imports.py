import os
import re

components_dir = 'frontend/src/components'
files = [os.path.join(components_dir, f) for f in os.listdir(components_dir) if f.endswith('.jsx')]
files.append('frontend/src/App.jsx')

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all components used like <Component 
    used_components = set(re.findall(r'<([A-Z][a-zA-Z0-9]+)\b', content))
    
    # Find all imports
    imports = set(re.findall(r'import\s+{([^}]+)}\s+from', content))
    imported_vars = set()
    for imp in imports:
        for var in imp.split(','):
            var = var.strip()
            if ' as ' in var:
                var = var.split(' as ')[1].strip()
            if var:
                imported_vars.add(var)
    
    # Check if used components are imported or defined locally
    local_defs = set(re.findall(r'(?:class|function|const)\s+([A-Z][a-zA-Z0-9]+)\b', content))
    
    missing = used_components - imported_vars - local_defs
    # Ignore standard html tags if they accidentally start with uppercase (though rare)
    if missing:
        print(f"{file} missing: {missing}")
