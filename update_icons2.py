import os
import re

files = [
    "frontend/src/components/Replication.jsx",
    "frontend/src/components/Partitionnement.jsx",
    "frontend/src/components/TokenRing.jsx"
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "import { " not in content[:200]:
        content = content.replace('import {', 'import { Star, RefreshCw, AlertTriangle, Building2, Globe, Server as ServerIcon } from "lucide-react";\nimport {', 1)
    else:
        if "Star" not in content:
            content = content.replace('import { useState', 'import { Star, RefreshCw, AlertTriangle, Building2, Globe, Server as ServerIcon } from "lucide-react";\nimport { useState')
    
    content = content.replace('⭐ PRIMAIRE', '<><Star size={12} style={{marginRight:4}}/> PRIMAIRE</>')
    content = content.replace('🔄 RÉPLIQUE', '<><RefreshCw size={12} style={{marginRight:4}}/> RÉPLIQUE</>')
    content = content.replace('⚠️ <strong>{downNodes.size}', '<AlertTriangle size={14} style={{marginRight:4}}/> <strong>{downNodes.size}')
    content = content.replace('🏢 {dc.toUpperCase()}', '<><Building2 size={16} style={{marginRight:4}}/> {dc.toUpperCase()}</>')
    content = content.replace('⚠️ RF', '<AlertTriangle size={14} style={{marginRight:4}}/> RF')
    
    content = content.replace('🌍 Partitionnement', '<><Globe size={18} style={{marginRight:6}}/> Partitionnement</>')
    content = content.replace('🌍 NetworkTopologyStrategy', '<><Globe size={14} style={{marginRight:4}}/> NetworkTopologyStrategy</>')
    content = content.replace('🔵 SimpleStrategy', '<><ServerIcon size={14} style={{marginRight:4}}/> SimpleStrategy</>')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
print("Updated other components")
