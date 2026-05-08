import os

base = r"c:\Users\pc\OneDrive\Documents\simcassandra\cassandra-pro\frontend\src\components"

def get_base_content(name, title, steps_json, particle_color, ack_color, client_badge, server_success_badge, show_tombstone=False):
    tombstone_jsx = '{tombstone && <span style={{ position: "absolute", bottom: -8, right: -8, fontSize: "16px" }}>⚰️</span>}' if show_tombstone else ''
    
    return f"""import {{ useState, useEffect, useRef }} from "react";
import {{ Settings, Server, Flame, HardDrive, Cpu, Terminal, ShieldAlert }} from "lucide-react";

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
        ...prev.slice(-30), // max 30 particles on screen
        {{
          id: counterRef.current,
          ...flow,
          progress: 0,
          color,
          born: Date.now(),
          duration: flow.duration || 1200,
        }}
      ]);
    }}, 250);

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

function Particle({{ p }}) {{
  const x = p.x1 + (p.x2 - p.x1) * p.progress;
  const y = p.y1 + (p.y2 - p.y1) * p.progress;
  const opacity = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.85 ? (1 - p.progress) * 6.67 : 1;

  return (
    <g opacity={{opacity}}>
      <circle cx={{x}} cy={{y}} r={{14}} fill={{p.color}} opacity={{0.15}} />
      <circle cx={{x}} cy={{y}} r={{8}} fill={{p.color}} opacity={{0.3}} />
      <circle cx={{x}} cy={{y}} r={{5}} fill="white" />
      <circle cx={{x}} cy={{y}} r={{3}} fill={{p.color}} />
    </g>
  );
}}

function FlowCanvas({{ step, dcsLayout, clientPos, coordPos, particleColor, ackColor }}) {{
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({{ w: 800, h: 500 }});

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

  const dataFlows = [];
  const ackFlows = [];

  const cPos = {{ x: clientPos.x * w, y: clientPos.y * h }};
  const crdPos = {{ x: coordPos.x * w, y: coordPos.y * h }};

  if (step === 1) {{
    dataFlows.push({{ x1: cPos.x, y1: cPos.y, x2: crdPos.x, y2: crdPos.y, duration: 800 }});
  }}

  dcsLayout.forEach((dc, dcIdx) => {{
    // Extra duration for remote DCs to simulate network latency
    const isRemote = dcIdx > 0;
    const baseDuration = isRemote ? 1800 : 1200;

    dc.replicas.forEach(rp => {{
      const rpX = rp.x * w;
      const rpY = rp.y * h;

      if (step === 2 && !rp.isDown) {{
        dataFlows.push({{ x1: crdPos.x, y1: crdPos.y, x2: rpX, y2: rpY, duration: baseDuration }});
      }}
      if (step === 4 && !rp.isDown && rp.blocksSuccess) {{
        // Only ACKs that block success are shown going to the coordinator during step 4
        ackFlows.push({{ x1: rpX, y1: rpY, x2: crdPos.x, y2: crdPos.y, duration: baseDuration * 0.7 }});
      }}
    }});
  }});

  // Success step
  if (step === 5) {{
    const allReqMet = dcsLayout.every(dc => dc.successMet);
    if (allReqMet) {{
      ackFlows.push({{ x1: crdPos.x, y1: crdPos.y, x2: cPos.x, y2: cPos.y, duration: 800 }});
    }}
  }}

  const dataParticles = useParticles(dataFlows.length > 0, dataFlows, particleColor);
  const ackParticles  = useParticles(ackFlows.length > 0, ackFlows, ackColor);

  return (
    <div ref={{canvasRef}} style={{{{ position: "absolute", inset: 0 }}}}>
      <svg width={{w}} height={{h}} style={{{{ position: "absolute", top: 0, left: 0, zIndex: 5, pointerEvents: "none", overflow: "visible" }}}}>
        {{/* Client to Coord Cable */}}
        <line
          x1={{cPos.x}} y1={{cPos.y}} x2={{crdPos.x}} y2={{crdPos.y}}
          stroke={{step >= 1 ? particleColor : "#e2e8f0"}} strokeWidth={{step >= 1 ? 2 : 1.5}} strokeDasharray={{step >= 1 ? "6 4" : "none"}} opacity={{step >= 1 ? 0.5 : 0.6}}
          style={{{{ transition: "stroke 0.4s" }}}}
        />

        {{/* Datacenter Zones & Cables */}}
        {{dcsLayout.map((dc, i) => {{
          const minX = dc.replicas[0].x * w - 80;
          const maxX = dc.replicas[0].x * w + 80;
          const minY = 40;
          const maxY = h - 40;

          return (
            <g key={{`dc-${{i}}`}}>
              {{/* Datacenter Bounding Box */}}
              <rect
                x={{minX}} y={{minY}} width={{maxX - minX}} height={{maxY - minY}}
                fill="rgba(241, 245, 249, 0.4)" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="8 4" rx="16"
              />
              <text x={{minX + 16}} y={{minY + 24}} fill="#64748b" fontSize="12" fontWeight="bold" fontFamily="monospace">
                ZONE: {{dc.name.toUpperCase()}}
              </text>

              {{/* Cables to nodes */}}
              {{dc.replicas.map((rp, j) => (
                <line key={{`c-${{i}}-${{j}}`}}
                  x1={{crdPos.x}} y1={{crdPos.y}} x2={{rp.x * w}} y2={{rp.y * h}}
                  stroke={{step >= 2 ? particleColor : "#e2e8f0"}} strokeWidth={{step >= 2 ? 2 : 1.5}} strokeDasharray={{step >= 2 ? "6 4" : "none"}} opacity={{step >= 2 ? 0.4 : 0.5}}
                  style={{{{ transition: "stroke 0.4s" }}}}
                />
              ))}}
            </g>
          );
        }})}}

        {{/* Particles */}}
        {{dataParticles.map(p => <Particle key={{p.id}} p={{p}} />)}}
        {{ackParticles.map(p => <Particle key={{p.id}} p={{p}} />)}}
      </svg>
    </div>
  );
}}

export default function {name}({{ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }}) {{
  const [step, setStep] = useState(0);

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
  
  // Build DC Layout
  const dcNames = [...new Set(replicas.map(r => r.datacenter || "dc1"))];
  const dcsLayout = dcNames.map((dcName, dcIdx) => {{
    const dcReplicas = replicas.filter(r => (r.datacenter || "dc1") === dcName);
    
    // Assign X based on DC index
    let dcX = 0.70;
    if (dcNames.length === 2) dcX = dcIdx === 0 ? 0.55 : 0.85;
    else if (dcNames.length > 2) dcX = 0.55 + (dcIdx * (0.40 / (dcNames.length - 1)));

    // Calculate requirements for this DC
    let reqAcks = 0;
    let isRequiredForGlobalSuccess = false;

    // Simulate coordinator is always in first DC (dcIdx === 0)
    const isLocalDc = dcIdx === 0;
    const rfPerDc = dcReplicas.length;

    if (consistency === "LOCAL_QUORUM") {{
      if (isLocalDc) {{ reqAcks = Math.floor(rfPerDc / 2) + 1; isRequiredForGlobalSuccess = true; }}
    }} else if (consistency === "LOCAL_ONE") {{
      if (isLocalDc) {{ reqAcks = 1; isRequiredForGlobalSuccess = true; }}
    }} else if (consistency === "EACH_QUORUM") {{
      reqAcks = Math.floor(rfPerDc / 2) + 1;
      isRequiredForGlobalSuccess = true;
    }} else if (consistency === "QUORUM") {{
      // For global QUORUM, we just need global acks, but we represent it locally for visualization
      reqAcks = Math.floor(replicas.length / 2) + 1;
      isRequiredForGlobalSuccess = true; // Handled globally later
    }} else if (consistency === "ALL") {{
      reqAcks = rfPerDc;
      isRequiredForGlobalSuccess = true;
    }} else if (consistency === "ONE") {{
      reqAcks = 1;
      isRequiredForGlobalSuccess = true; // Handled globally later
    }}

    let upCount = 0;
    const positionedReplicas = dcReplicas.map((r, i) => {{
      const isSimDown = downNodes.has(r.address);
      const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
      const isDown = isSimDown || isReallyDown;
      if (!isDown) upCount++;
      return {{
        ...r,
        isDown,
        x: dcX,
        y: 0.15 + i * (0.70 / Math.max(dcReplicas.length - 1, 1)),
        blocksSuccess: isRequiredForGlobalSuccess && !isDown
      }};
    }});

    return {{
      name: dcName,
      replicas: positionedReplicas,
      isLocal: isLocalDc,
      upCount,
      reqAcks,
      successMet: (consistency === "QUORUM" || consistency === "ONE") ? true : (upCount >= reqAcks || !isRequiredForGlobalSuccess) // For global, evaluated separately
    }};
  }});

  // Global evaluation for QUORUM and ONE
  let isGlobalSuccess = dcsLayout.every(dc => dc.successMet);
  const totalUp = dcsLayout.reduce((acc, dc) => acc + dc.upCount, 0);
  
  if (consistency === "QUORUM") {{
    isGlobalSuccess = totalUp >= (Math.floor(replicas.length / 2) + 1);
    dcsLayout.forEach(dc => dc.successMet = isGlobalSuccess);
  }} else if (consistency === "ONE") {{
    isGlobalSuccess = totalUp >= 1;
    dcsLayout.forEach(dc => dc.successMet = isGlobalSuccess);
  }}

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
      }}, 4000);
      return () => clearInterval(interval);
    }}
  }}, [autoPlayId]);

  const getDynamicConsistencyText = () => {{
    if (consistency === "LOCAL_QUORUM") return "Le Coordinateur attend le quorum UNIQUEMENT dans le Datacenter local. Les ACKs des DCs distants sont asynchrones.";
    if (consistency === "EACH_QUORUM") return "Le Coordinateur attend que CHAQUE Datacenter atteigne son propre quorum interne.";
    if (consistency === "LOCAL_ONE") return "Le Coordinateur valide dès le PREMIER ACK reçu de son propre Datacenter.";
    if (consistency === "ALL") return "Le Coordinateur attend les ACKs de TOUS les réplicas sur tous les Datacenters. Trés lent mais 100% sûr.";
    if (consistency === "ONE") return "Le Coordinateur valide dès le PREMIER ACK reçu de n'importe quel réplica (local ou distant).";
    return `Le Coordinateur attend un quorum GLOBAL (majorité absolue) sur l'ensemble des réplicas, peu importe leur Datacenter.`;
  }};

  const stepDescriptions = {steps_json};

  const stepColors = {{
    color: "{particle_color}",
    ack: "{ack_color}",
  }};

  const clientPos = {{ x: 0.05, y: 0.5 }};
  const coordPos  = {{ x: 0.25, y: 0.5 }};

  return (
    <div className="flow-dashboard">
      <div className="flow-header" style={{{{ borderBottom: "2px solid " + stepColors.color }}}}>
        <div style={{{{ flex: 1 }}}}>
          <h2 style={{{{ margin: "0 0 0.25rem", color: "var(--text-primary)", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}}}>
            <span style={{{{ background: stepColors.color, color: "white", width: "26px", height: "26px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "13px", fontWeight: 700 }}}}>
              {{step}}
            </span>
            {title}
          </h2>
          <p style={{{{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.5 }}}}>
            {{step === 4 ? getDynamicConsistencyText() : stepDescriptions[step]?.desc}}
          </p>
        </div>
        <div style={{{{ display: "flex", gap: "0.75rem", marginLeft: "2rem", flexShrink: 0 }}}}>
          <button className="btn btn-outline" onClick={{prevStep}} disabled={{step === 0}}>◀ Précédent</button>
          <button className="btn" onClick={{nextStep}} disabled={{step === 5}} style={{{{ background: stepColors.color, color: "white" }}}}>Suivant ▶</button>
        </div>
      </div>

      <div className="flow-canvas" style={{{{ position: "relative", minHeight: "600px" }}}}>
        <FlowCanvas
          step={{step}}
          dcsLayout={{dcsLayout}}
          clientPos={{clientPos}}
          coordPos={{coordPos}}
          particleColor={{stepColors.color}}
          ackColor={{stepColors.ack}}
        />

        {{/* NODE: Client */}}
        <NodeCard
          label="Client"
          sublabel={{(updatedUser || selectedUser)?.user_id || "—"}}
          icon={{<Terminal size={{24}} />}}
          isActive={{step >= 1}}
          statusColor={{stepColors.color}}
          style={{{{ left: "5%", top: "50%", transform: "translate(-50%, -50%)" }}}}
          badge={{step === 1 ? "{client_badge}" : step === 5 ? (isGlobalSuccess ? "ACK ✓" : "ERR ✗") : null}}
          badgeColor={{step === 5 ? (isGlobalSuccess ? "{ack_color}" : "#ef4444") : stepColors.color}}
        />

        {{/* NODE: Coordinator */}}
        <NodeCard
          label="Coordinateur"
          sublabel="Nœud Entrant"
          icon={{<Settings size={{24}} />}}
          isActive={{step >= 1 && step < 5}}
          isRadar={{step === 1 || step === 4}}
          statusColor={{stepColors.color}}
          style={{{{ left: "25%", top: "50%", transform: "translate(-50%, -50%)" }}}}
          badge={{step === 4 ? `Consistance: ${{consistency}}` : null}}
          badgeColor={{stepColors.color}}
        />

        {{/* NODES: Replicas grouped by DC */}}
        {{dcsLayout.map(dc => 
          dc.replicas.map((rp, j) => {{
            const hasWritten = step >= 3;
            const isWritingNow = step === 3;

            return (
              <NodeCard
                key={{rp.nodeIdx}}
                label={{`Nœud ${{rp.nodeIdx + 1}}`}}
                sublabel={{`DC: ${{dc.name}}`}}
                icon={{rp.isDown ? <Flame size={{24}} /> : <Server size={{24}} />}}
                isActive={{step >= 2 && !rp.isDown}}
                isDown={{rp.isDown}}
                isVibrating={{isWritingNow && !rp.isDown}}
                statusColor={{stepColors.color}}
                style={{{{ left: `${{rp.x * 100}}%`, top: `${{rp.y * 100}}%`, transform: "translate(-50%, -50%)" }}}}
                badge={{rp.isDown ? "DOWN" : (hasWritten && !rp.isDown ? "{server_success_badge}" : null)}}
                badgeColor={{rp.isDown ? "#ef4444" : "{ack_color}"}}
                leds={{!rp.isDown ? {{ disk: hasWritten, ram: hasWritten, blink: isWritingNow }} : null}}
                tombstone={{{'true' if show_tombstone else 'false'}}}
              />
            );
          }})
        )}}
      </div>
    </div>
  );
}}

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
      {{isRadar && (
        <div style={{{{ position: "absolute", inset: "-10px", borderRadius: "50%", border: `1.5px dashed ${{statusColor}}`, animation: "radarSweep 2.5s linear infinite", opacity: 0.5 }}}} />
      )}}

      {{badge && (
        <div style={{{{ position: "absolute", top: "-10px", right: "-10px", background: badgeColor, color: "white", fontSize: "9px", fontWeight: 800, padding: "2px 6px", borderRadius: "10px", zIndex: 20, letterSpacing: "0.3px", textAlign: "center" }}}}>
          {{badge}}
        </div>
      )}}

      <div style={{{{ position: "relative", width: "44px", height: "44px", borderRadius: "50%", background: isActive ? (isDown ? "#fee2e2" : `${{statusColor}}18`) : "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5rem", color: isActive ? (isDown ? "#ef4444" : statusColor) : "#94a3b8", border: `1px solid ${{isActive ? (isDown ? "#fca5a5" : statusColor + "40") : "#e2e8f0"}}`, flexShrink: 0 }}}}>
        {{icon}}
        {tombstone_jsx}
      </div>

      <div style={{{{ fontSize: "0.78rem", fontWeight: 700, color: isDown ? "#ef4444" : "#1e293b", textAlign: "center" }}}}>{{label}}</div>
      <div style={{{{ fontSize: "0.62rem", color: "#94a3b8", fontWeight: 600, textAlign: "center", marginTop: "0.15rem" }}}}>{{sublabel}}</div>

      {{leds && (
        <div style={{{{ display: "flex", gap: "6px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f1f5f9", width: "100%", justifyContent: "center" }}}}>
          <div style={{{{ display: "flex", alignItems: "center", gap: "3px" }}}}>
            <HardDrive size={{9}} color="#94a3b8" />
            <div style={{{{ width: "7px", height: "7px", borderRadius: "50%", background: leds.disk ? (leds.blink ? "#10b981" : "#10b981") : "#e2e8f0", boxShadow: leds.disk ? "0 0 6px #10b981" : "none", animation: leds.blink ? "ledPulse 0.3s ease-in-out infinite" : "none" }}}} />
          </div>
          <div style={{{{ display: "flex", alignItems: "center", gap: "3px" }}}}>
            <Cpu size={{9}} color="#94a3b8" />
            <div style={{{{ width: "7px", height: "7px", borderRadius: "50%", background: leds.ram ? "#10b981" : "#e2e8f0", boxShadow: leds.ram ? "0 0 6px #10b981" : "none", animation: leds.blink ? "ledPulse 0.3s ease-in-out infinite 0.15s" : "none" }}}} />
          </div>
        </div>
      )}}
    </div>
  );
}}
"""

write_steps = """[
    { title: "Prêt à insérer", desc: "Le client prépare l'envoi d'une nouvelle donnée. Il peut se connecter à n'importe quel nœud du cluster, qui agira alors comme Coordinateur pour cette requête." },
    { title: "Phase 1 : Partitionnement", desc: "Le Client envoie la donnée au Coordinateur. Celui-ci hache la clé primaire (Murmur3) pour obtenir un Token. Grâce à ce Token, il sait exactement quels nœuds sont responsables de cette donnée sur chaque Datacenter." },
    { title: "Phase 2 : Réplication", desc: `Le Coordinateur transfère en parallèle aux nœuds réplicas responsables. Dans un environnement NTS, il envoie souvent les données à un coordinateur local dans chaque DC distant.` },
    { title: "Phase 3 : Moteur de Stockage", desc: "Sur CHAQUE réplica, la donnée est écrite dans le CommitLog (sur disque, pour la durabilité) puis ajoutée dans la Memtable (en RAM, pour l'accès rapide)." },
    { title: "Phase 4 : Attente du Quorum", desc: `(Texte dynamique selon consistance)` },
    { title: "Phase 5 : Résultat", desc: "Le Coordinateur renvoie l'acquittement global au Client. L'écriture est considérée comme un succès ou un échec en fonction des ACKs reçus." }
  ]"""

update_steps = """[
    { title: "Prêt à modifier (Upsert)", desc: "Dans Cassandra, il n'y a pas de vraie 'Mise à jour' in-place. Le client prépare une NOUVELLE valeur associée à un Timestamp (horodatage) précis." },
    { title: "Phase 1 : Partitionnement", desc: "Le Coordinateur hache la clé primaire. L'objectif est d'aller stocker cette nouvelle version exactement sur les mêmes nœuds que l'ancienne donnée." },
    { title: "Phase 2 : Réplication de la nouvelle version", desc: `Le Coordinateur transfère la donnée modifiée avec son Timestamp aux réplicas dans tous les datacenters concernés.` },
    { title: "Phase 3 : Last Write Wins (LWW)", desc: "Cassandra n'efface pas l'ancienne valeur sur le disque ! Il ajoute simplement cette nouvelle version (Upsert). Lors d'une future lecture, c'est la règle 'Last Write Wins' (le Timestamp le plus récent) qui l'emportera." },
    { title: "Phase 4 : Attente du Quorum", desc: `(Texte dynamique selon consistance)` },
    { title: "Phase 5 : Résultat", desc: "Le niveau de consistance requis a été évalué. Si l'opération réussit, l'ancienne donnée sera nettoyée plus tard par la compaction." }
  ]"""

delete_steps = """[
    { title: "Demande de Suppression", desc: "Le client veut effacer une donnée. Particularité de Cassandra : il ne va pas chercher sur le disque pour l'effacer, c'est trop lent ! Il va écrire un marqueur de mort appelé Tombstone." },
    { title: "Phase 1 : Partitionnement", desc: "Le Coordinateur identifie les nœuds responsables de la donnée cible via le hash Murmur3." },
    { title: "Phase 2 : Propagation du Tombstone", desc: `Au lieu d'un ordre d'effacement, le Coordinateur envoie une donnée spéciale (le Tombstone ⚰️) aux réplicas à travers les datacenters.` },
    { title: "Phase 3 : Écriture du Marqueur", desc: "Les réplicas écrivent le Tombstone dans la Memtable et le CommitLog, exactement comme une donnée normale. Ce Tombstone 'masquera' l'ancienne donnée lors des lectures." },
    { title: "Phase 4 : Attente du Quorum", desc: `(Texte dynamique selon consistance)` },
    { title: "Phase 5 : Résultat", desc: "Tombstone placé selon les règles de consistance. La donnée sera physiquement supprimée du disque plus tard, lors d'une Compaction (gc_grace_seconds)." }
  ]"""

with open(f"{base}/WritePath.jsx", "w", encoding="utf-8") as f:
    f.write(get_base_content("WritePath", "L'Anatomie d'une Insertion (Write)", write_steps, "#2563eb", "#10b981", "DATA", "✓ Écrit"))

with open(f"{base}/UpdatePath.jsx", "w", encoding="utf-8") as f:
    f.write(get_base_content("UpdatePath", "L'Anatomie d'une Modification (Upsert / LWW)", update_steps, "#f59e0b", "#10b981", "DATA + TS", "✓ Version LWW"))

with open(f"{base}/DeletePath.jsx", "w", encoding="utf-8") as f:
    f.write(get_base_content("DeletePath", "L'Anatomie d'une Suppression (Tombstone)", delete_steps, "#dc2626", "#10b981", "TOMBSTONE", "⚰️ Tombstone", True))

print("Successfully generated NTS Multi-Datacenter spatial layout with strict consistency rules.")
