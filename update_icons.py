import os
files = [
    "frontend/src/components/WritePath.jsx",
    "frontend/src/components/UpdatePath.jsx",
    "frontend/src/components/DeletePath.jsx"
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "import { Settings" not in content:
        content = content.replace('import { useState, useEffect } from "react";', 
            'import { useState, useEffect } from "react";\nimport { Settings, Server, Flame, HardDrive, Cpu, Mail, CheckCircle2, XCircle, Terminal, Trash2, Edit2 } from "lucide-react";')
    
    content = content.replace('💻', '<Terminal size={32} />')
    content = content.replace('⚙️', '<Settings size={40} color="var(--text-tertiary)" />')
    content = content.replace('🔥', '<Flame size={24} color="var(--error-color)" />')
    content = content.replace('🖥️', '<Server size={24} color="var(--text-secondary)" />')
    content = content.replace('💽', '<HardDrive size={14} style={{ marginRight: 4 }}/>')
    content = content.replace('🧠', '<Cpu size={14} style={{ marginRight: 4 }}/>')
    content = content.replace('✉️', '<Mail size={14} />')
    content = content.replace('✅ ACK', '<CheckCircle2 size={14} style={{ marginRight: 4 }}/> ACK')
    content = content.replace('❌ ERREUR', '<XCircle size={14} style={{ marginRight: 4 }}/> ERREUR')
    content = content.replace('🎉 SUCCÈS', '<CheckCircle2 size={14} style={{ marginRight: 4 }}/> SUCCÈS')
    content = content.replace('💀', '<Trash2 size={14} style={{ marginRight: 4 }}/>')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
print("Updated animation paths")
