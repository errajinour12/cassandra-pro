import os

def generate_component(filepath, name, title, desc, particle_color, ack_color, is_delete=False, is_update=False):
    tombstone_jsx = ""
    if is_delete:
        tombstone_jsx = '{tombstone && <span style={{ position: "absolute", bottom: -8, right: -8, fontSize: "16px" }}>⚰️</span>}'

    content = f"""import {{ useState, useEffect, useRef }} from "react";
import {{ Settings, Server, Flame, HardDrive, Cpu, Terminal }} from "lucide-react";

// Shared canvas-based particle system
function useParticles(active, flows, color) {{
  const [particles, setParticles] = useState([]);
  const timeRef = useRef(null);
  const counterRef = useRef(0);

  useEffect(() => {{
    if (!active || !flows || flows.length === 0) {{
      setParticles([]);
      if (timeRef.current) clearInterval(timeRef.current);
      return;
    }}

    // Spawn particles continuously
    timeRef.current = setInterval(() => {{
      counterRef.current += 1;
      const flow = flows[counterRef.current % flows.length];
      setParticles(prev => [
        ...prev.slice(-20), // max 20 particles on screen
        {{
          id: counterRef.current,
          ...flow,
          progress: 0,
          color,
          born: Date.now(),
          duration: flow.duration || 1200,
        }}
      ]);
    }}, 350);

    return () => clearInterval(timeRef.current);
  }}, [active, JSON.stringify(flows), color]);

  // Animate progress
  useEffect(() => {{
    if (particles.length === 0) return;
    const raf = requestAnimationFrame(() => {{
      const now = Date.now();
      setParticles(prev =>
        prev
          .map(p => ({{ ...p, progress: Math.min(1, (now - p.born) / p.duration) }}))
          .filter(p => p.progress < 1)
      );
    }});
    return () => cancelAnimationFrame(raf);
  }}, [particles]);

  return particles;
}}

// Individual particle rendered on SVG
function Particle({{ p }}) {{
  const x = p.x1 + (p.x2 - p.x1) * p.progress;
  const y = p.y1 + (p.y2 - p.y1) * p.progress;
  const opacity = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.85 ? (1 - p.progress) * 6.67 : 1;

  return (
    <g opacity={{opacity}}>
      {{/* Glow halo */}}
      <circle cx={{x}} cy={{y}} r={{14}} fill={{p.color}} opacity={{0.15}} />
      <circle cx={{x}} cy={{y}} r={{8}} fill={{p.color}} opacity={{0.3}} />
      {{/* Core dot */}}
      <circle cx={{x}} cy={{y}} r={{5}} fill="white" />
      <circle cx={{x}} cy={{y}} r={{3}} fill={{p.color}} />
    </g>
  );
}}

function FlowCanvas({{ step, replicas, downNodes, nodes, isSuccess, particleColor, ackColor }}) {{
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({{ w: 800, h: 500 }});

  // Track container size
  useEffect(() => {{
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {{
      for (const entry of entries) {{
        setDims({{ w: entry.contentRect.width, h: entry.contentRect.height }});
      }}
    }});
    ro.observe(el);
    return () => ro.disconnect();
  }}, []);

  const {{ w, h }} = dims;

  // Node positions in pixels
  const clientPos  = {{ x: w * 0.08, y: h * 0.5 }};
  const coordPos   = {{ x: w * 0.38, y: h * 0.5 }};
  const replicaPositions = replicas.map((r, i) => ({{
    x: w * 0.80,
    y: h * (0.15 + i * (0.70 / Math.max(replicas.length - 1, 1))),
    ...r
  }}));

  // Active flows per step
  const dataFlows = [];
  const ackFlows = [];

  if (step === 1) {{
    dataFlows.push({{ x1: clientPos.x, y1: clientPos.y, x2: coordPos.x, y2: coordPos.y }});
  }}
  if (step === 2) {{
    replicaPositions.forEach(rp => {{
      const isDown = downNodes.has(rp.address) || nodes.find(n => n.address === rp.address)?.is_up === false;
      if (!isDown) dataFlows.push({{ x1: coordPos.x, y1: coordPos.y, x2: rp.x, y2: rp.y }});
    }});
  }}
  if (step === 4) {{
    replicaPositions.forEach(rp => {{
      const isDown = downNodes.has(rp.address) || nodes.find(n => n.address === rp.address)?.is_up === false;
      if (!isDown) ackFlows.push({{ x1: rp.x, y1: rp.y, x2: coordPos.x, y2: coordPos.y, duration: 900 }});
    }});
  }}
  if (step === 5) {{
    ackFlows.push({{ x1: coordPos.x, y1: coordPos.y, x2: clientPos.x, y2: clientPos.y, duration: 900 }});
  }}

  const dataParticles = useParticles(dataFlows.length > 0, dataFlows, particleColor);
  const ackParticles  = useParticles(ackFlows.length > 0, ackFlows, ackColor);

  return (
    <div ref={{canvasRef}} style={{{{ position: "absolute", inset: 0 }}}}>
      <svg width={{w}} height={{h}} style={{{{ position: "absolute", top: 0, left: 0, zIndex: 5, pointerEvents: "none", overflow: "visible" }}}}>
        {{/* ── Cable lines ── */}}
        <line
          x1={{clientPos.x}} y1={{clientPos.y}}
          x2={{coordPos.x}}  y2={{coordPos.y}}
          stroke={{step >= 1 ? particleColor : "#e2e8f0"}} strokeWidth={{step >= 1 ? 2 : 1.5}} strokeDasharray={{step >= 1 ? "6 4" : "none"}} opacity={{step >= 1 ? 0.5 : 0.6}}
          style={{{{ transition: "stroke 0.4s" }}}}
        />
        {{replicaPositions.map((rp, i) => (
          <line key={{i}}
            x1={{coordPos.x}} y1={{coordPos.y}}
            x2={{rp.x}} y2={{rp.y}}
            stroke={{step >= 2 ? particleColor : "#e2e8f0"}} strokeWidth={{step >= 2 ? 2 : 1.5}} strokeDasharray={{step >= 2 ? "6 4" : "none"}} opacity={{step >= 2 ? 0.5 : 0.6}}
            style={{{{ transition: "stroke 0.4s" }}}}
          />
        ))}}

        {{/* ── Particles ── */}}
        {{dataParticles.map(p => <Particle key={{p.id}} p={{p}} />)}}
        {{ackParticles.map(p => <Particle key={{p.id}} p={{p}} />)}}
      </svg>
    </div>
  );
}}

export default function {name}({{ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }}) {{
  const [step, setStep] = useState(0);
  const [isSuccess, setIsSuccess] = useState(true);

  const stepDescriptions = [
    {{ title: "Prêt à écrire", desc: "Le client prépare l'envoi de la donnée. Dans Cassandra, le client peut se connecter à n'importe quel nœud du cluster, qui agira alors comme Coordinateur pour cette requête." }},
    {{ title: "Phase 1 : Partitionnement", desc: "Le Client envoie la donnée au Coordinateur. Celui-ci hache la clé primaire (Murmur3) pour obtenir un Token. Grâce à ce Token, il sait exactement quel nœud est le propriétaire principal de cette donnée sur l'anneau." }},
    {{ title: "Phase 2 : Réplication", desc: `Le Coordinateur transfère en parallèle aux ${{rf}} nœuds réplicas responsables (RF=${{rf}}). Chaque réplica reçoit une copie de la donnée.` }},
    {{ title: "Phase 3 : Moteur de Stockage", desc: "Sur CHAQUE réplica, la donnée est écrite dans le CommitLog (disque) puis dans la Memtable (RAM). C'est la durabilité garantie de Cassandra." }},
    {{ title: "Phase 4 : Consistance & Pannes", desc: `Le Coordinateur attend les ACKs. Avec consistance ${{consistency}}, il attend le Quorum. Si un nœud est DOWN, la requête peut quand même réussir.` }},
    {{ title: "Phase 5 : Résultat", desc: isSuccess ? "✅ Quorum atteint ! Le Coordinateur confirme l'action au Client. La donnée est sûre et répliquée." : "❌ ÉCHEC : Trop de nœuds hors ligne, Quorum impossible. UnavailableException renvoyée au Client." }},
  ];

  useEffect(() => {{ setStep(0); }}, [selectedUser, updatedUser, rf, consistency, downNodes]);

  const nextStep = () => setStep(s => Math.min(5, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  useEffect(() => {{
    if (autoPlayId > 0) {{
      setStep(0);
      let currentStep = 0;
      const interval = setInterval(() => {{
        currentStep++;
        if (currentStep > 5) clearInterval(interval);
        else setStep(currentStep);
      }}, 3500);
      return () => clearInterval(interval);
    }}
  }}, [autoPlayId]);

  const getReplicas = () => {{
    if (!nodesWithTokens || nodesWithTokens.length === 0 || !selectedUser) return [];
    const t = BigInt(selectedUser.token);
    const dcs = [...new Set(nodesWithTokens.map(n => n.datacenter || "dc1"))];
    const isActuallyNts = dcs.length > 1;

    if (!isActuallyNts) {{
      const allTokens = [];
      nodesWithTokens.forEach((node, nodeIdx) =>
        (node.tokens || []).forEach(tok => allTokens.push({{ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }}))
      );
      allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
      if (!allTokens.length) return [];
      let primaryIdx = allTokens.findIndex(tok => t <= BigInt(tok.token));
      if (primaryIdx === -1) primaryIdx = 0;
      const replicas = [], seen = new Set();
      let curr = primaryIdx;
      while (replicas.length < rf && replicas.length < nodes.length) {{
        const node = allTokens[curr];
        if (!seen.has(node.nodeIdx)) {{ seen.add(node.nodeIdx); replicas.push(node); }}
        curr = (curr + 1) % allTokens.length;
      }}
      return replicas;
    }}

    const replicas = [];
    const byDc = {{}};
    nodesWithTokens.forEach((node, nodeIdx) => {{
      const dc = node.datacenter || "dc1";
      if (!byDc[dc]) byDc[dc] = [];
      byDc[dc].push({{ node, nodeIdx }});
    }});
    const simulatedRfPerDc = rf || 3;
    Object.entries(byDc).forEach(([dc, dcNodes]) => {{
      const dcTokens = [];
      dcNodes.forEach(({{ node, nodeIdx }}) => {{
        (node.tokens || []).forEach(tok => dcTokens.push({{ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }}));
      }});
      if (!dcTokens.length) return;
      dcTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
      let primaryIdx = dcTokens.findIndex(tok => t <= BigInt(tok.token));
      if (primaryIdx === -1) primaryIdx = 0;
      const dcReplicas = [];
      const seen = new Set();
      let curr = primaryIdx;
      while (dcReplicas.length < simulatedRfPerDc && dcReplicas.length < dcNodes.length) {{
        const node = dcTokens[curr];
        if (!seen.has(node.nodeIdx)) {{ seen.add(node.nodeIdx); dcReplicas.push(node); }}
        curr = (curr + 1) % dcTokens.length;
      }}
      replicas.push(...dcReplicas);
    }});
    return replicas;
  }};

  const replicas = getReplicas();
  const dcs = [...new Set(replicas.map(r => r.datacenter || "dc1"))];
  const isActualNts = dcs.length > 1;

  const getRequiredAcks = () => {{
    if (!isActualNts) {{
      if (consistency === "ONE") return 1;
      if (consistency === "ALL") return rf;
      return Math.floor(rf / 2) + 1;
    }}
    if (consistency === "LOCAL_QUORUM") return Math.floor(rf / 2) + 1;
    if (consistency === "LOCAL_ONE") return 1;
    if (consistency === "EACH_QUORUM") return dcs.length * (Math.floor(rf / 2) + 1);
    if (consistency === "ALL") return replicas.length;
    if (consistency === "ONE") return 1;
    return Math.floor(rf / 2) + 1;
  }};
  const requiredAcks = getRequiredAcks();

  useEffect(() => {{
    let upReplicasCount = 0;
    replicas.forEach(r => {{
      const isSimDown = downNodes.has(r.address);
      const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
      if (!isSimDown && !isReallyDown) upReplicasCount++;
    }});
    setTimeout(() => setIsSuccess(upReplicasCount >= requiredAcks), 0);
  }}, [replicas, downNodes, requiredAcks, nodes]);

  const stepColors = {{
    color: "{particle_color}",
    ack: "{ack_color}",
  }};

  return (
    <div className="flow-dashboard">
      {{/* Control Bar */}}
      <div className="flow-header" style={{{{ borderBottom: "2px solid " + stepColors.color }}}}>
        <div style={{{{ flex: 1 }}}}>
          <h2 style={{{{ margin: "0 0 0.25rem", color: "var(--text-primary)", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}}}>
            <span style={{{{ background: stepColors.color, color: "white", width: "26px", height: "26px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "13px", fontWeight: 700 }}}}>
              {{step}}
            </span>
            {title}
          </h2>
          <p style={{{{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.5 }}}}>
            {{stepDescriptions[step].desc}}
          </p>
        </div>
        <div style={{{{ display: "flex", gap: "0.75rem", marginLeft: "2rem", flexShrink: 0 }}}}>
          <button className="btn btn-outline" onClick={{prevStep}} disabled={{step === 0}}>◀ Précédent</button>
          <button className="btn" onClick={{nextStep}} disabled={{step === 5}} style={{{{ background: stepColors.color, color: "white" }}}}>Suivant ▶</button>
        </div>
      </div>

      {{/* Canvas Zone */}}
      <div className="flow-canvas" style={{{{ position: "relative", minHeight: "500px" }}}}>
        {{/* Particle / Line animation layer */}}
        <FlowCanvas
          step={{step}}
          replicas={{replicas}}
          downNodes={{downNodes}}
          nodes={{nodes}}
          isSuccess={{isSuccess}}
          particleColor={{stepColors.color}}
          ackColor={{stepColors.ack}}
        />

        {{/* ── NODE: Client ── */}}
        <NodeCard
          label="Client"
          sublabel={{(updatedUser || selectedUser)?.user_id || "—"}}
          icon={{<Terminal size={{24}} />}}
          isActive={{step >= 1}}
          statusColor={{stepColors.color}}
          style={{{{ left: "8%", top: "50%", transform: "translate(-50%, -50%)" }}}}
          badge={{step === 1 ? "DATA" : step === 5 ? (isSuccess ? "ACK ✓" : "ERR ✗") : null}}
          badgeColor={{step === 5 ? (isSuccess ? "{ack_color}" : "#ef4444") : stepColors.color}}
        />

        {{/* ── NODE: Coordinator ── */}}
        <NodeCard
          label="Coordinateur"
          sublabel="Murmur3 Hashing"
          icon={{<Settings size={{24}} />}}
          isActive={{step >= 1 && step < 5}}
          isRadar={{step === 1 || step === 4}}
          statusColor={{stepColors.color}}
          style={{{{ left: "38%", top: "50%", transform: "translate(-50%, -50%)" }}}}
          badge={{step === 4 ? `⏳ ${{requiredAcks}} ACKs` : null}}
          badgeColor={{stepColors.color}}
        />

        {{/* ── NODES: Replicas ── */}}
        {{replicas.map((r, i) => {{
          const topPct = 15 + i * (70 / Math.max(replicas.length - 1, 1));
          const isSimDown = downNodes.has(r.address);
          const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
          const isDown = isSimDown || isReallyDown;
          const hasWritten = step >= 3;
          const isWritingNow = step === 3;

          return (
            <NodeCard
              key={{r.nodeIdx}}
              label={{`Nœud ${{r.nodeIdx + 1}}`}}
              sublabel={{isActualNts ? `DC: ${{r.datacenter}}` : (i === 0 ? "Primaire" : "Réplica")}}
              icon={{isDown ? <Flame size={{24}} /> : <Server size={{24}} />}}
              isActive={{step >= 2 && !isDown}}
              isDown={{isDown}}
              isVibrating={{isWritingNow && !isDown}}
              statusColor={{stepColors.color}}
              style={{{{ left: "80%", top: `${{topPct}}%`, transform: "translate(-50%, -50%)" }}}}
              badge={{isDown ? "DOWN" : (hasWritten && !isDown ? "✓ Écrit" : null)}}
              badgeColor={{isDown ? "#ef4444" : "{ack_color}"}}
              leds={{!isDown ? {{ disk: hasWritten, ram: hasWritten, blink: isWritingNow }} : null}}
              tombstone={{{'true' if is_delete else 'false'}}}
            />
          );
        }})}}
      </div>
    </div>
  );
}}

// Reusable Node Card Component
function NodeCard({{ label, sublabel, icon, isActive, isDown, isVibrating, isRadar, statusColor, style, badge, badgeColor, leds, tombstone }}) {{
  return (
    <div style={{{{
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "120px",
      padding: "0.75rem 0.5rem",
      background: isActive ? (isDown ? "#fff5f5" : `${{statusColor}}08`) : "white",
      border: `2px solid ${{isActive ? (isDown ? "#ef4444" : statusColor) : "#e2e8f0"}}`,
      borderRadius: "12px",
      boxShadow: isActive ? `0 0 0 3px ${{isDown ? "#ef444430" : statusColor + "30"}}, 0 4px 12px rgba(0,0,0,0.08)` : "0 2px 6px rgba(0,0,0,0.04)",
      transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
      animation: isVibrating ? "serverVibrate 0.15s infinite" : "none",
      zIndex: 10,
      ...style,
    }}}}>
      {{/* Radar ring */}}
      {{isRadar && (
        <div style={{{{
          position: "absolute",
          inset: "-10px",
          borderRadius: "50%",
          border: `1.5px dashed ${{statusColor}}`,
          animation: "radarSweep 2.5s linear infinite",
          opacity: 0.5,
        }}}} />
      )}}

      {{/* Badge */}}
      {{badge && (
        <div style={{{{
          position: "absolute",
          top: "-10px",
          right: "-10px",
          background: badgeColor,
          color: "white",
          fontSize: "9px",
          fontWeight: 800,
          padding: "2px 6px",
          borderRadius: "10px",
          zIndex: 20,
          letterSpacing: "0.3px",
        }}}}>
          {{badge}}
        </div>
      )}}

      {{/* Icon */}}
      <div style={{{{
        position: "relative",
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        background: isActive ? (isDown ? "#fee2e2" : `${{statusColor}}18`) : "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "0.5rem",
        color: isActive ? (isDown ? "#ef4444" : statusColor) : "#94a3b8",
        border: `1px solid ${{isActive ? (isDown ? "#fca5a5" : statusColor + "40") : "#e2e8f0"}}`,
        flexShrink: 0,
      }}}}>
        {{icon}}
        {tombstone_jsx}
      </div>

      <div style={{{{ fontSize: "0.78rem", fontWeight: 700, color: isDown ? "#ef4444" : "#1e293b", textAlign: "center" }}}}>{{label}}</div>
      <div style={{{{ fontSize: "0.62rem", color: "#94a3b8", fontWeight: 600, textAlign: "center", marginTop: "0.15rem" }}}}>{{sublabel}}</div>

      {{/* LEDs */}}
      {{leds && (
        <div style={{{{ display: "flex", gap: "6px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f1f5f9", width: "100%", justifyContent: "center" }}}}>
          <div style={{{{ display: "flex", alignItems: "center", gap: "3px" }}}}>
            <HardDrive size={{9}} color="#94a3b8" />
            <div style={{{{
              width: "7px", height: "7px", borderRadius: "50%",
              background: leds.disk ? (leds.blink ? "#10b981" : "#10b981") : "#e2e8f0",
              boxShadow: leds.disk ? "0 0 6px #10b981" : "none",
              animation: leds.blink ? "ledPulse 0.3s ease-in-out infinite" : "none",
            }}}} />
          </div>
          <div style={{{{ display: "flex", alignItems: "center", gap: "3px" }}}}>
            <Cpu size={{9}} color="#94a3b8" />
            <div style={{{{
              width: "7px", height: "7px", borderRadius: "50%",
              background: leds.ram ? "#10b981" : "#e2e8f0",
              boxShadow: leds.ram ? "0 0 6px #10b981" : "none",
              animation: leds.blink ? "ledPulse 0.3s ease-in-out infinite 0.15s" : "none",
            }}}} />
          </div>
        </div>
      )}}
    </div>
  );
}}
"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

base = r"c:\Users\pc\OneDrive\Documents\simcassandra\cassandra-pro\frontend\src\components"
generate_component(f"{base}/WritePath.jsx", "WritePath", "L'Anatomie d'une Écriture", "Découvrez comment Cassandra combine Partitionnement, Réplication et Consistance.", "#2563eb", "#10b981", False, False)
generate_component(f"{base}/UpdatePath.jsx", "UpdatePath", "L'Anatomie d'une Modification", "Découvrez comment Cassandra gère la Modification (LWW).", "#f59e0b", "#10b981", False, True)
generate_component(f"{base}/DeletePath.jsx", "DeletePath", "L'Anatomie d'une Suppression", "Découvrez comment Cassandra gère la Suppression (Tombstone).", "#dc2626", "#10b981", True, False)

print("Files completely rewritten with requestAnimationFrame canvas.")
