import os

files = [
    "frontend/src/components/Replication.jsx",
    "frontend/src/components/Partitionnement.jsx",
    "frontend/src/components/TokenRing.jsx"
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix imports if missing
    if "lucide-react" not in content:
        content = content.replace('import {', 'import { Star, RefreshCw, AlertTriangle, Building2, Globe, Server as ServerIcon } from "lucide-react";\nimport {', 1)
    
    # Fix quotes around the JSX
    content = content.replace('"<><Star size={12} style={{marginRight:4}}/> PRIMAIRE</>"', '<><Star size={12} style={{marginRight:4}}/> PRIMAIRE</>')
    content = content.replace('"<><RefreshCw size={12} style={{marginRight:4}}/> RÉPLIQUE</>"', '<><RefreshCw size={12} style={{marginRight:4}}/> RÉPLIQUE</>')
    content = content.replace('"<AlertTriangle size={14} style={{marginRight:4}}/> <strong>{downNodes.size}"', '<AlertTriangle size={14} style={{marginRight:4}}/> <strong>{downNodes.size}')
    content = content.replace('"<><Building2 size={16} style={{marginRight:4}}/> {dc.toUpperCase()}</>"', '<><Building2 size={16} style={{marginRight:4}}/> {dc.toUpperCase()}</>')
    content = content.replace('"<AlertTriangle size={14} style={{marginRight:4}}/> RF"', '<AlertTriangle size={14} style={{marginRight:4}}/> RF')
    
    content = content.replace('"<><Globe size={18} style={{marginRight:6}}/> Partitionnement</>"', '<><Globe size={18} style={{marginRight:6}}/> Partitionnement</>')
    content = content.replace('"<><Globe size={14} style={{marginRight:4}}/> NetworkTopologyStrategy</>"', '<><Globe size={14} style={{marginRight:4}}/> NetworkTopologyStrategy</>')
    content = content.replace('"<><ServerIcon size={14} style={{marginRight:4}}/> SimpleStrategy</>"', '<><ServerIcon size={14} style={{marginRight:4}}/> SimpleStrategy</>')

    # also check if the emoji string replacements caused any issues in other places.
    # Like: "⭐ PRIMAIRE" was inside {isPrimary ? "⭐ PRIMAIRE" : "🔄 RÉPLIQUE"} 
    # The python script did content.replace('⭐ PRIMAIRE', '<><Star size={12} style={{marginRight:4}}/> PRIMAIRE</>')
    # So the result was {isPrimary ? "<><Star .../> PRIMAIRE</>" : "<><RefreshCw .../> RÉPLIQUE</>"}
    # My python script above removes the double quotes from the whole thing.
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed syntax errors in other components")
