import { useState, useEffect, useRef } from "react";
import { Server, Activity, Globe, ShieldAlert, Cpu, HardDrive } from "lucide-react";

// Hook to handle Gossip mesh particles
function useGossipMesh(nodesLayout, active) {
  const [particles, setParticles] = useState([]);
  const timeRef = useRef(null);
  const counterRef = useRef(0);

  useEffect(() => {
    if (!active || !nodesLayout || nodesLayout.length < 2) {
      setParticles([]);
      if (timeRef.current) clearInterval(timeRef.current);
      return;
    }

    // Spawn gossip pings randomly
    timeRef.current = setInterval(() => {
      counterRef.current += 1;
      // Pick random source and target that are UP
      const upNodes = nodesLayout.filter(n => !n.isDown);
      if (upNodes.length < 2) return;

      const srcIdx = Math.floor(Math.random() * upNodes.length);
      let tgtIdx = Math.floor(Math.random() * upNodes.length);
      while (tgtIdx === srcIdx) {
        tgtIdx = Math.floor(Math.random() * upNodes.length);
      }

      const src = upNodes[srcIdx];
      const tgt = upNodes[tgtIdx];
      const isRemote = src.datacenter !== tgt.datacenter;

      setParticles(prev => [
        ...prev.slice(-25),
        {
          id: counterRef.current,
          x1: src.x, y1: src.y,
          x2: tgt.x, y2: tgt.y,
          progress: 0,
          color: isRemote ? "#8b5cf6" : "#10b981", // purple for inter-DC, green for local
          born: Date.now(),
          duration: isRemote ? 3500 : 2000, // SLOWED DOWN for readability
        }
      ]);
    }, 1200); // Less frequent spawning so it's not a cluttered mess

    return () => clearInterval(timeRef.current);
  }, [active, JSON.stringify(nodesLayout)]);

  useEffect(() => {
    if (particles.length === 0) return;
    const raf = requestAnimationFrame(() => {
      const now = Date.now();
      setParticles(prev =>
        prev
          .map(p => ({ ...p, progress: Math.min(1, (now - p.born) / p.duration) }))
          .filter(p => p.progress < 1)
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [particles]);

  return particles;
}

function GossipParticle({ p, w, h }) {
  const px = (p.x1 + (p.x2 - p.x1) * p.progress) * w;
  const py = (p.y1 + (p.y2 - p.y1) * p.progress) * h;
  const opacity = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.85 ? (1 - p.progress) * 6.67 : 1;

  return (
    <g opacity={opacity}>
      <circle cx={px} cy={py} r={10} fill={p.color} opacity={0.2} />
      <circle cx={px} cy={py} r={5} fill={p.color} opacity={0.5} />
      <circle cx={px} cy={py} r={2} fill="white" />
    </g>
  );
}

function MeshCanvas({ nodesLayout, particles }) {
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = dims;

  // Draw lines between all nodes
  const lines = [];
  for (let i = 0; i < nodesLayout.length; i++) {
    for (let j = i + 1; j < nodesLayout.length; j++) {
      const n1 = nodesLayout[i];
      const n2 = nodesLayout[j];
      const isCrossDc = n1.datacenter !== n2.datacenter;
      lines.push(
        <line
          key={`${i}-${j}`}
          x1={n1.x * w} y1={n1.y * h}
          x2={n2.x * w} y2={n2.y * h}
          stroke={isCrossDc ? "#cbd5e1" : "#e2e8f0"}
          strokeWidth={isCrossDc ? 1.5 : 1}
          strokeDasharray={isCrossDc ? "4 4" : "none"}
          opacity={isCrossDc ? 0.3 : 0.4}
        />
      );
    }
  }

  // Draw Datacenter backgrounds
  const dcGroups = {};
  nodesLayout.forEach(n => {
    if (!dcGroups[n.datacenter]) dcGroups[n.datacenter] = [];
    dcGroups[n.datacenter].push(n);
  });

  const dcBg = Object.entries(dcGroups).map(([dc, nodes], idx) => {
    if (Object.keys(dcGroups).length === 1) return null; // No border if only 1 DC
    const xs = nodes.map(n => n.x * w);
    const minX = Math.min(...xs) - 130;
    const maxX = Math.max(...xs) + 130;
    const minY = 50;
    const maxY = h - 50;

    return (
      <g key={dc}>
        <rect
          x={minX} y={minY} width={maxX - minX} height={maxY - minY}
          fill="rgba(241, 245, 249, 0.3)" stroke="#94a3b8" strokeWidth="2" strokeDasharray="8 6" rx="20"
        />
        <text x={minX + 20} y={minY + 25} fill="#64748b" fontSize="14" fontWeight="bold" fontFamily="monospace">
          DATACENTER: {dc.toUpperCase()}
        </text>
      </g>
    );
  });

  return (
    <div ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
        {dcBg}
        {lines}
        {particles.map(p => <GossipParticle key={p.id} p={p} w={w} h={h} />)}
      </svg>
    </div>
  );
}

export default function Architecture({ nodes, strategy, downNodes = new Set() }) {
  // Compute layout
  const dcNames = [...new Set(nodes.map(n => n.datacenter || "dc1"))];
  
  const nodesLayout = nodes.map((node, i) => {
    const dcIdx = dcNames.indexOf(node.datacenter || "dc1");
    const dcNodes = nodes.filter(n => (n.datacenter || "dc1") === (node.datacenter || "dc1"));
    const idxInDc = dcNodes.findIndex(n => n.address === node.address);

    let x = 0.5;
    let y = 0.5;

    if (dcNames.length === 1) {
      // 1 DC : massive circle
      const angle = (idxInDc / dcNodes.length) * 2 * Math.PI - Math.PI / 2;
      x = 0.5 + 0.38 * Math.cos(angle);
      y = 0.5 + 0.38 * Math.sin(angle);
    } else {
      // Multi DC : Vertical columns to avoid any overlap, giving maximum breathing room
      const dcX = dcNames.length === 2 
        ? (dcIdx === 0 ? 0.30 : 0.70)
        : (0.15 + (dcIdx * (0.70 / (dcNames.length - 1))));
      
      x = dcX;
      // Vertically space out nodes between 15% and 85% of height
      y = 0.15 + (idxInDc * (0.70 / Math.max(dcNodes.length - 1, 1)));
    }

    return {
      ...node,
      globalIdx: i,
      x,
      y,
      isDown: downNodes.has(node.address) || !node.is_up,
    };
  });

  const particles = useGossipMesh(nodesLayout, true);

  return (
    <div style={{ display: "flex", gap: "2rem", width: "100%" }}>
      {/* ── Main Canvas Area ── */}
      <div className="card" style={{ flex: 1, position: "relative", minHeight: "950px", padding: 0, overflow: "hidden", background: "#ffffff" }}>
        <MeshCanvas nodesLayout={nodesLayout} particles={particles} />

        {/* ── Render Nodes ── */}
        {nodesLayout.map(n => (
          <NodeCard key={n.address} node={n} />
        ))}
        
        {/* Status Legend */}
        <div style={{ position: "absolute", bottom: "1.5rem", left: "1.5rem", background: "white", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", gap: "1rem", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
            Traffic Local (Gossip)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#8b5cf6", boxShadow: "0 0 6px #8b5cf6" }} />
            Traffic Inter-DC (WAN)
          </div>
        </div>
      </div>

      {/* ── Side Educational Panel ── */}
      <div style={{ width: "320px", display: "flex", flexDirection: "column", gap: "1.5rem", flexShrink: 0 }}>
        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)" }}>
            <Globe size={20} color="var(--primary-color)" />
            Topologie du Cluster
          </h3>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1rem" }}>
            Cassandra utilise une architecture <strong>Masterless</strong> (P2P). Tous les nœuds sont égaux. Il n'y a pas de nœud central "Maître" qui peut tomber en panne.
          </p>
          <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <strong style={{ color: "var(--text-primary)" }}>Stratégie :</strong>
              <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>{strategy.toUpperCase()}</span>
            </li>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <strong style={{ color: "var(--text-primary)" }}>Datacenters :</strong>
              <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>{dcNames.length}</span>
            </li>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <strong style={{ color: "var(--text-primary)" }}>Total Nœuds :</strong>
              <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>{nodes.length}</span>
            </li>
          </ul>
        </div>

        <div className="card" style={{ padding: "1.5rem", background: "var(--primary-light)", border: "1px solid var(--primary-border)" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--primary-hover)" }}>
            <Activity size={20} />
            Protocole Gossip
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
            Les impulsions que vous voyez voyager entre les nœuds représentent le protocole <strong>Gossip</strong>. 
            Toutes les secondes, chaque nœud discute avec 1 à 3 autres nœuds aléatoires pour échanger des informations sur l'état du cluster (qui est en ligne, qui est mort, état de la charge).
          </p>
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)" }}>
            <ShieldAlert size={20} color="#ef4444" />
            Tolérance aux Pannes
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
            {strategy === "nts" ? (
              "Le réseau est conçu pour survivre à des partitions géographiques. Si un lien WAN est coupé entre deux datacenters, les nœuds locaux continuent de servir les requêtes. Une fois la connexion rétablie, les données se synchronisent automatiquement (Hinted Handoff / Repair)."
            ) : (
              "Le cluster peut survivre à la perte de plusieurs nœuds simultanément sans aucune perte de données. Tant que le niveau de consistance (ex: QUORUM) est respecté par les réplicas encore en ligne, le système continuera de fonctionner normalement."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node }) {
  return (
    <div style={{
      position: "absolute",
      left: `${node.x * 100}%`,
      top: `${node.y * 100}%`,
      transform: "translate(-50%, -50%)",
      width: "140px",
      background: node.isDown ? "#fff1f2" : "#ffffff",
      border: `2px solid ${node.isDown ? "#fecdd3" : "#e2e8f0"}`,
      borderRadius: "12px",
      boxShadow: node.isDown ? "none" : "0 4px 15px rgba(0,0,0,0.06)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0.75rem",
      zIndex: 10,
      transition: "all 0.3s ease"
    }}>
      {/* Status Indicator */}
      <div style={{ position: "absolute", top: "-6px", right: "-6px", background: node.isDown ? "#ef4444" : "#10b981", color: "white", fontSize: "9px", fontWeight: 800, padding: "2px 6px", borderRadius: "10px", boxShadow: `0 0 8px ${node.isDown ? "#ef4444" : "#10b981"}` }}>
        {node.isDown ? "DOWN" : "UP"}
      </div>

      <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: node.isDown ? "#fee2e2" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: node.isDown ? "#ef4444" : "#64748b", marginBottom: "0.5rem", border: `1px solid ${node.isDown ? "#fca5a5" : "#e2e8f0"}` }}>
        <Server size={24} />
      </div>

      <div style={{ fontSize: "0.85rem", fontWeight: 800, color: node.isDown ? "#991b1b" : "#1e293b", marginBottom: "2px" }}>
        Nœud {node.globalIdx + 1}
      </div>
      <div style={{ fontSize: "0.65rem", color: "#64748b", fontFamily: "monospace", fontWeight: 600 }}>
        {node.address}
      </div>

      {/* Hardware LEDs (Only if UP) */}
      {!node.isDown && (
        <div style={{ display: "flex", gap: "8px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f1f5f9", width: "100%", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Activité CPU">
            <Cpu size={10} color="#94a3b8" />
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", animation: "ledPulse 1.5s ease-in-out infinite" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Activité Réseau">
            <Activity size={10} color="#94a3b8" />
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", animation: "ledPulse 0.8s ease-in-out infinite 0.3s" }} />
          </div>
        </div>
      )}
    </div>
  );
}
