import { Globe } from "lucide-react";

// ─── Palette DC ────────────────────────────────────────────────────────────────
const DC_PALETTE = {
  dc1: { ring: "#4f46e5", label: "#818cf8", bg: "#4f46e510" },
  dc2: { ring: "#10b981", label: "#34d399", bg: "#10b98110" },
  dc3: { ring: "#f59e0b", label: "#fbbf24", bg: "#f59e0b10" },
  dc4: { ring: "#ef4444", label: "#f87171", bg: "#ef444410" },
};
const DC_DEFAULT = { ring: "#64748b", label: "#94a3b8", bg: "#64748b10" };

// ─── Utilitaire : trouve l'index du nœud responsable dans une liste ────────────
function getResponsibleIdx(tokenStr, nodesWithTokens) {
  if (!nodesWithTokens || nodesWithTokens.length === 0) return 0;
  const allTokens = [];
  nodesWithTokens.forEach((node, nodeIdx) => {
    (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx }));
  });
  allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
  if (!allTokens.length) return 0;
  const t = BigInt(tokenStr);
  for (let i = 0; i < allTokens.length; i++) {
    if (t <= BigInt(allTokens[i].token)) return allTokens[i].nodeIdx;
  }
  return allTokens[0].nodeIdx;
}

// ─── Sous-composant : anneau SVG pour un seul DC ──────────────────────────────
function DcPartitionRing({ dcName, dcNodes, dcNodesWithTokens, globalIndices, allData, selectedUser }) {
  const palette = DC_PALETTE[dcName] || DC_DEFAULT;
  const SIZE = 340;
  const cx = SIZE / 2, cy = SIZE / 2, r = 120;
  const totalNodes = dcNodes.length || 1;

  const logicalSegments = dcNodes.map((_, i) => ({
    nodeIdx: i,
    startAngle: (i / totalNodes) * 2 * Math.PI - Math.PI / 2,
    endAngle: ((i + 1) / totalNodes) * 2 * Math.PI - Math.PI / 2,
  }));

  // Réordonne dcNodesWithTokens pour correspondre à dcNodes (même ordre par adresse)
  const addrToNWT = new Map((dcNodesWithTokens || []).map(n => [n.address, n]));
  const orderedNWT = dcNodes.map(n => addrToNWT.get(n.address) || { tokens: [] });

  // Trouve le nœud responsable par index LOCAL dans ce DC (avec protection BigInt)
  const getIdx = (tokenStr) => {
    try {
      return getResponsibleIdx(tokenStr, orderedNWT);
    } catch { return 0; }
  };
  const dcData = allData;
  const getNodeColor = (localIdx) => `var(--node-${(globalIndices?.[localIdx] ?? localIdx) % 5})`;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem",
      background: palette.bg, border: `1.5px solid ${palette.ring}40`,
      borderRadius: 16, padding: "1.25rem 1rem 1rem", flex: "0 0 auto"
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: palette.label, textTransform: "uppercase", letterSpacing: 1 }}>
        🗄 {dcName.toUpperCase()} — {dcNodes.length} Nodes
      </div>

      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))" }}>
        {/* Anneau de fond */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-light)" strokeWidth={28} opacity={0.25} />

        {/* Segments (couleur par nœud) */}
        {logicalSegments.map((seg, i) => {
          const x1 = cx + r * Math.cos(seg.startAngle);
          const y1 = cy + r * Math.sin(seg.startAngle);
          const x2 = cx + r * Math.cos(seg.endAngle);
          const y2 = cy + r * Math.sin(seg.endAngle);
          const largeArc = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
          const nodeColor = getNodeColor(seg.nodeIdx);
          return (
            <path key={`seg-${i}`}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none" stroke={nodeColor} strokeWidth={28} opacity={0.8} />
          );
        })}

        {/* Séparateurs */}
        {logicalSegments.map((seg, i) => (
          <line key={`tick-${i}`}
            x1={cx + (r - 15) * Math.cos(seg.startAngle)} y1={cy + (r - 15) * Math.sin(seg.startAngle)}
            x2={cx + (r + 15) * Math.cos(seg.startAngle)} y2={cy + (r + 15) * Math.sin(seg.startAngle)}
            stroke="var(--bg-surface)" strokeWidth={4} strokeLinecap="round" />
        ))}

        {/* Labels nœuds (numéro global) */}
        {logicalSegments.map((seg, i) => {
          const midAngle = (seg.startAngle + seg.endAngle) / 2;
          const lx = cx + (r + 32) * Math.cos(midAngle);
          const ly = cy + (r + 32) * Math.sin(midAngle);
          const nodeColor = getNodeColor(seg.nodeIdx);
          return (
            <text key={`lbl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
              fill={nodeColor} fontSize={12} fontWeight="700">N{(globalIndices?.[seg.nodeIdx] ?? seg.nodeIdx) + 1}</text>
          );
        })}

        {/* Points de données (couleur du nœud propriétaire) */}
        {dcData.map((d) => {
          const nodeIdx = getIdx(d.token);
          const seg = logicalSegments[nodeIdx];
          if (!seg) return null;

          const nodeDataCount = dcData.filter(x => getIdx(x.token) === nodeIdx).length;
          const myIndexInNode = dcData.filter(x => getIdx(x.token) === nodeIdx).findIndex(x => x.user_id === d.user_id);
          const angleOffset = (seg.endAngle - seg.startAngle) * ((myIndexInNode + 1) / (nodeDataCount + 1));
          const visualAngle = seg.startAngle + angleOffset;
          const dr = r - 38;
          const x = cx + dr * Math.cos(visualAngle);
          const y = cy + dr * Math.sin(visualAngle);
          const isSelected = selectedUser && d.user_id === selectedUser.user_id;
          const nodeColor = `var(--node-${nodeIdx % 5})`;

          return (
            <g key={d.user_id}>
              <circle cx={x} cy={y} r={isSelected ? 10 : 5}
                fill={nodeColor} stroke="var(--bg-surface)" strokeWidth={2}
                opacity={isSelected ? 1 : 0.75}
                style={{ transition: "all 0.3s ease", filter: isSelected ? `drop-shadow(0 0 6px ${nodeColor})` : "none" }} />
              {isSelected && (
                <text x={x} y={y - 15} textAnchor="middle" fill="var(--text-primary)" fontSize={11} fontWeight="700">
                  {d.user_id}
                </text>
              )}
            </g>
          );
        })}

        {/* Centre */}
        <circle cx={cx} cy={cy} r={48} fill="var(--bg-app)" stroke={palette.ring} strokeWidth={1} opacity={0.6} />
        <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="central"
          fill={palette.label} fontSize={12} fontWeight="700">{dcName.toUpperCase()}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central"
          fill="var(--text-tertiary)" fontSize={9}>{dcNodes.length} nodes</text>
      </svg>
    </div>
  );
}

// ─── Charge par nœud pour un DC ───────────────────────────────────────────────
function DcLoadTable({ dcName, dcNodes, dcNodesWithTokens, globalIndices, allData, selectedUser }) {
  const palette = DC_PALETTE[dcName] || DC_DEFAULT;
  // Réordonne pour correspondre à dcNodes (même ordre par adresse)
  const addrToNWT = new Map((dcNodesWithTokens || []).map(n => [n.address, n]));
  const orderedNWT = dcNodes.map(n => addrToNWT.get(n.address) || { tokens: [] });
  const getIdx = (tokenStr) => {
    try { return getResponsibleIdx(tokenStr, orderedNWT); } catch { return 0; }
  };

  return (
    <div style={{ border: `1px solid ${palette.ring}30`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: palette.bg, padding: "0.6rem 1rem", borderBottom: `1px solid ${palette.ring}30`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: palette.ring }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: palette.label }}>{dcName.toUpperCase()}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 4 }}>{dcNodes.length} nodes</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.75rem" }}>
        {dcNodes.map((n, i) => {
          const nodeColor = `var(--node-${(globalIndices?.[i] ?? i) % 5})`;
          const nodeKeys = allData.filter(d => getIdx(d.token) === i);
          const percentage = allData.length > 0 ? Math.round((nodeKeys.length / allData.length) * 100) : 0;
          return (
            <div key={i} style={{ padding: "0.75rem", borderRadius: 8, border: `1px solid ${nodeColor}30`, background: `${nodeColor}08` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: nodeColor }} />
                  <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>N{(globalIndices?.[i] ?? i) + 1}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>({n.address})</span>
                </div>
                <span className="badge" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", fontSize: 11 }}>
                  {nodeKeys.length} key(s)
                </span>
              </div>
              <div style={{ width: "100%", height: 5, background: "var(--bg-surface)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border-light)" }}>
                <div style={{ width: `${percentage}%`, height: "100%", background: nodeColor, transition: "width 0.5s ease" }} />
              </div>
              {nodeKeys.length > 0 && (
                <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {nodeKeys.map(k => {
                    const isSel = selectedUser?.user_id === k.user_id;
                    return (
                      <span key={k.user_id} style={{
                        fontSize: 11, padding: "2px 7px", borderRadius: "var(--radius-md)", fontWeight: isSel ? 600 : 500,
                        background: isSel ? nodeColor : "var(--bg-surface)",
                        color: isSel ? "white" : "var(--text-secondary)",
                        border: `1px solid ${isSel ? nodeColor : "var(--border-light)"}`,
                        boxShadow: isSel ? "var(--shadow-sm)" : "none",
                      }}>{k.user_id}</span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function Partitionnement({ nodes, nodesWithTokens, selectedUser, allData, strategy = "simple" }) {

  // ── Mode NTS : un anneau + tableau de charge par DC ─────────────────────────
  if (strategy === "nts") {
    const dcs = [...new Set(nodes.map(n => n.datacenter))].sort();

    return (
      <div>
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)", fontSize: "1.25rem" }}>
            <><Globe size={18} style={{marginRight:6}}/> Partitioning</> — NetworkTopologyStrategy
          </h2>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
            In <strong>NTS</strong>, each Data Center has <strong>its own hash ring</strong>.
            Data is replicated independently in each DC according to its <em>Replication Factor</em>.
            The points represent your data in each local ring.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Anneaux côte à côte */}
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            {dcs.map(dc => {
              const dcNodeEntries = nodes
                .map((n, globalIdx) => ({ n, globalIdx }))
                .filter(({ n }) => n.datacenter === dc);
              const dcNodes = dcNodeEntries.map(({ n }) => n);
              const globalIndices = dcNodeEntries.map(({ globalIdx }) => globalIdx);
              const dcAddresses = new Set(dcNodes.map(n => n.address));
              const dcNWT = nodesWithTokens.filter(n => dcAddresses.has(n.address));
              return (
                <DcPartitionRing key={dc}
                  dcName={dc} dcNodes={dcNodes} dcNodesWithTokens={dcNWT}
                  globalIndices={globalIndices}
                  allData={allData} selectedUser={selectedUser} />
              );
            })}
          </div>

          {/* Charge par nœud, par DC */}
          <div className="card">
            <h3 style={{ margin: "0 0 1rem", fontSize: 16, color: "var(--text-primary)" }}>
              Load by Node — per Data Center
            </h3>
            <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
              {dcs.map(dc => {
                const dcNodeEntries = nodes
                  .map((n, globalIdx) => ({ n, globalIdx }))
                  .filter(({ n }) => n.datacenter === dc);
                const dcNodes = dcNodeEntries.map(({ n }) => n);
                const globalIndices = dcNodeEntries.map(({ globalIdx }) => globalIdx);
                const dcAddresses = new Set(dcNodes.map(n => n.address));
                const dcNWT = nodesWithTokens.filter(n => dcAddresses.has(n.address));
                return (
                  <div key={dc} style={{ flex: "1 1 260px" }}>
                    <DcLoadTable dcName={dc} dcNodes={dcNodes} dcNodesWithTokens={dcNWT}
                      globalIndices={globalIndices}
                      allData={allData} selectedUser={selectedUser} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Mode SimpleStrategy : comportement original (anneau unique) ──────────────
  const cx = 180, cy = 180, r = 130;
  const totalNodes = nodes.length || 1;
  const logicalSegments = nodes.map((_, i) => ({
    nodeIdx: i,
    startAngle: (i / totalNodes) * 2 * Math.PI - Math.PI / 2,
    endAngle: ((i + 1) / totalNodes) * 2 * Math.PI - Math.PI / 2,
  }));
  const getIdx = (tokenStr) => getResponsibleIdx(tokenStr, nodesWithTokens);

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)", fontSize: "1.25rem" }}>Global Partitioning</h2>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
          To simplify understanding, this ring is divided into <strong>{totalNodes} equal parts</strong> (one per node).
          When data is inserted, Cassandra calculates its <em>Hash</em> and sends it to the responsible node.
          The points below represent your data assigned to their respective nodes.
        </p>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div className="card" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: "1rem", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>Simplified Logical Ring</div>
            <svg width={360} height={360} viewBox="0 0 360 360" style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))" }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-light)" strokeWidth={30} opacity={0.3} />

              {logicalSegments.map((seg, i) => {
                const x1 = cx + r * Math.cos(seg.startAngle);
                const y1 = cy + r * Math.sin(seg.startAngle);
                const x2 = cx + r * Math.cos(seg.endAngle);
                const y2 = cy + r * Math.sin(seg.endAngle);
                const largeArc = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
                return (
                  <path key={`segment-${i}`}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                    fill="none" stroke={`var(--node-${seg.nodeIdx % 5})`} strokeWidth={30} opacity={0.8} />
                );
              })}

              {logicalSegments.map((seg, i) => (
                <line key={`tick-${i}`}
                  x1={cx + (r - 16) * Math.cos(seg.startAngle)} y1={cy + (r - 16) * Math.sin(seg.startAngle)}
                  x2={cx + (r + 16) * Math.cos(seg.startAngle)} y2={cy + (r + 16) * Math.sin(seg.startAngle)}
                  stroke="var(--bg-surface)" strokeWidth={4} strokeLinecap="round" />
              ))}

              {logicalSegments.map((seg, i) => {
                const midAngle = (seg.startAngle + seg.endAngle) / 2;
                const lx = cx + (r + 35) * Math.cos(midAngle);
                const ly = cy + (r + 35) * Math.sin(midAngle);
                return (
                  <text key={`label-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                    fill={`var(--node-${seg.nodeIdx % 5})`} fontSize={14} fontWeight="700">
                    Node {i + 1}
                  </text>
                );
              })}

              {allData.map((d) => {
                const nodeIdx = getIdx(d.token);
                const seg = logicalSegments[nodeIdx];
                if (!seg) return null;
                const nodeDataCount = allData.filter(x => getIdx(x.token) === nodeIdx).length;
                const myIndexInNode = allData.filter(x => getIdx(x.token) === nodeIdx).findIndex(x => x.user_id === d.user_id);
                const angleOffset = (seg.endAngle - seg.startAngle) * ((myIndexInNode + 1) / (nodeDataCount + 1));
                const visualAngle = seg.startAngle + angleOffset;
                const dr = r - 40;
                const x = cx + dr * Math.cos(visualAngle);
                const y = cy + dr * Math.sin(visualAngle);
                const isSelected = selectedUser && d.user_id === selectedUser.user_id;
                const nodeColor = `var(--node-${nodeIdx % 5})`;
                return (
                  <g key={d.user_id}>
                    <circle cx={x} cy={y} r={isSelected ? 10 : 5}
                      fill={nodeColor} stroke="var(--bg-surface)" strokeWidth={2}
                      opacity={isSelected ? 1 : 0.8}
                      style={{ transition: "all 0.3s ease", filter: isSelected ? `drop-shadow(0 0 6px ${nodeColor})` : 'none' }} />
                    {isSelected && (
                      <text x={x} y={y - 15} textAnchor="middle" fill="var(--text-primary)" fontSize={12} fontWeight="700">
                        {d.user_id}
                      </text>
                    )}
                  </g>
                );
              })}

              <circle cx={cx} cy={cy} r={55} fill="var(--bg-app)" stroke="var(--border-light)" strokeWidth={1} />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                fill="var(--text-tertiary)" fontSize={11} fontWeight="600" letterSpacing="1px">CLUSTER</text>
            </svg>

            <div style={{ marginTop: "1.5rem", background: "var(--bg-app)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", width: "100%", maxWidth: 400 }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: 13, color: "var(--text-secondary)" }}>
                <li><strong style={{ color: "var(--text-primary)" }}>Colors:</strong> Each color represents a node's territory.</li>
                <li><strong style={{ color: "var(--text-primary)" }}>Points:</strong> Your data. They are placed in the territory of the node that manages them.</li>
              </ul>
            </div>
          </div>

          <div className="card" style={{ flex: "1 1 300px" }}>
            <h3 style={{ margin: "0 0 1.5rem", fontSize: 16, color: "var(--text-primary)" }}>Load per Node (Load Balancing)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {nodes.map((n, i) => {
                const nodeColor = `var(--node-${i % 5})`;
                const nodeKeys = allData.filter(d => getIdx(d.token) === i);
                const percentage = allData.length > 0 ? Math.round((nodeKeys.length / allData.length) * 100) : 0;
                return (
                  <div key={i} style={{ padding: "1rem", borderRadius: "var(--radius-lg)", border: `1px solid ${nodeColor}30`, background: `${nodeColor}08` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.8rem", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: nodeColor }} />
                        <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>Node {i + 1}</strong>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>({n.address})</span>
                      </div>
                      <span className="badge" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                        {nodeKeys.length} key(s)
                      </span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--bg-surface)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border-light)" }}>
                      <div style={{ width: `${percentage}%`, height: "100%", background: nodeColor, transition: "width 0.5s ease" }} />
                    </div>
                    {nodeKeys.length > 0 && (
                      <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {nodeKeys.map(k => {
                          const isSelected = selectedUser?.user_id === k.user_id;
                          return (
                            <span key={k.user_id} style={{
                              fontSize: 11, padding: "3px 8px", borderRadius: "var(--radius-md)", fontWeight: isSelected ? 600 : 500,
                              background: isSelected ? nodeColor : "var(--bg-surface)",
                              color: isSelected ? "white" : "var(--text-secondary)",
                              border: `1px solid ${isSelected ? nodeColor : "var(--border-light)"}`,
                              boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                            }}>{k.user_id}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}