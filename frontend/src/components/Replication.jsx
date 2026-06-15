import { Star, RefreshCw, AlertTriangle, Building2 } from "lucide-react";

const DC_COLORS = {
  dc1: { primary: "#4f46e5", bg: "#4f46e510", border: "#4f46e540", text: "#818cf8" },
  dc2: { primary: "#10b981", bg: "#10b98110", border: "#10b98140", text: "#34d399" },
};

function getDcColor(dc) {
  return DC_COLORS[dc] || DC_COLORS.dc1;
}

/** Calculates the primary node and replicas from tokens — for SimpleStrategy (global) */
function computeReplicas(nodesWithTokens, selectedUser, rf, nodes) {
  if (!selectedUser || nodesWithTokens.length === 0) return { primaryNodeIdx: 0, replicaIdxs: [] };
  const allTokens = [];
  nodesWithTokens.forEach((node, nodeIdx) => {
    (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx }));
  });
  allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));

  const ht = BigInt(selectedUser.token);
  let primaryIdx = 0;
  for (let i = 0; i < allTokens.length; i++) {
    if (ht <= BigInt(allTokens[i].token)) { primaryIdx = allTokens[i].nodeIdx; break; }
  }
  if (primaryIdx === 0 && allTokens.length > 0 && ht > BigInt(allTokens[allTokens.length - 1].token)) {
    primaryIdx = allTokens[0].nodeIdx;
  }

  const actualRf = Math.min(rf, nodes.length || 1);
  const replicaIdxs = [];
  for (let i = 1; i < actualRf; i++) {
    replicaIdxs.push((primaryIdx + i) % (nodes.length || 1));
  }
  return { primaryNodeIdx: primaryIdx, replicaIdxs };
}

/** Calculates replicas for ONE DC (NTS) — returns { primaryLocalIdx, replicaLocalIdxs } */
function computeDcReplicas(dcNodesWithTokens, selectedUser, dcRf, dcNodeCount) {
  if (!selectedUser || !dcNodesWithTokens.length) return { primaryLocalIdx: 0, replicaLocalIdxs: [] };
  const allTokens = [];
  dcNodesWithTokens.forEach((node, localIdx) => {
    (node.tokens || []).forEach(tok => allTokens.push({ token: tok, localIdx }));
  });
  allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));

  const ht = BigInt(selectedUser.token);
  let primaryLocalIdx = 0;
  for (let i = 0; i < allTokens.length; i++) {
    if (ht <= BigInt(allTokens[i].token)) { primaryLocalIdx = allTokens[i].localIdx; break; }
  }
  if (primaryLocalIdx === 0 && allTokens.length > 0 && ht > BigInt(allTokens[allTokens.length - 1].token)) {
    primaryLocalIdx = allTokens[0].localIdx;
  }

  const actualRf = Math.min(dcRf, dcNodeCount || 1);
  const replicaLocalIdxs = [];
  for (let i = 1; i < actualRf; i++) {
    replicaLocalIdxs.push((primaryLocalIdx + i) % (dcNodeCount || 1));
  }
  return { primaryLocalIdx, replicaLocalIdxs };
}

// ── Composant nœud ────────────────────────────────────────────────────────────
function NodeCard({ n, i, isPrimary, isReplica, isDown, isSimDown, isReallyDown, nodeColor, selectedUser }) {
  const hasData = isPrimary || isReplica;
  return (
    <div className="card node-card" style={{
      width: 152, padding: "1.25rem 0.75rem", textAlign: "center",
      "--node-color": nodeColor,
      background: isDown ? "var(--error-bg)" : "var(--bg-surface)",
      borderColor: isDown ? "var(--error-color)" : hasData ? nodeColor : "var(--border-light)",
      boxShadow: hasData && !isDown ? `0 6px 20px ${nodeColor}30` : "var(--shadow-sm)",
      opacity: isDown ? 0.7 : 1,
      transform: hasData && !isDown ? "translateY(-4px)" : "none",
      transition: "all 0.2s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, background: hasData && !isDown ? `${nodeColor}18` : "var(--bg-app)", color: hasData && !isDown ? nodeColor : isDown ? "var(--error-color)" : "var(--text-tertiary)", border: `2px solid ${hasData && !isDown ? nodeColor : isDown ? "var(--error-color)" : "var(--border-light)"}` }}>
          N{i + 1}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace", marginBottom: "0.75rem", overflow: "hidden", textOverflow: "ellipsis" }}>{n.address}</div>
      {isReallyDown ? <span className="badge badge-error">REAL DOWN</span>
        : isSimDown ? <span className="badge badge-error">SIMULATED DOWN</span>
        : hasData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "center" }}>
            <span className="badge" style={{
              background: isPrimary ? nodeColor : "var(--bg-surface)",
              color: isPrimary ? "white" : nodeColor,
              border: `1px solid ${nodeColor}`,
              fontSize: isPrimary ? 9.5 : 10,
              whiteSpace: "nowrap",
              padding: "0.2rem 0.5rem"
            }}>
              {isPrimary ? <><Star size={12} style={{marginRight:4}}/> PRIMARY REPLICA</> : <><RefreshCw size={12} style={{marginRight:4}}/> REPLICA</>}
            </span>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-app)", padding: "2px 6px", borderRadius: 4 }}>
              {selectedUser?.user_id}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Empty for this key</div>
        )}
    </div>
  );
}

export default function Replication({ nodes, nodesWithTokens, selectedUser, rf, rfPerDc, strategy, downNodes = new Set() }) {
  const isNts = strategy === "nts";
  const { primaryNodeIdx, replicaIdxs } = computeReplicas(nodesWithTokens, selectedUser, rf, nodes);
  const actualRf = Math.min(rf, nodes.length || 1);

  // Regrouper les nœuds par datacenter pour NTS
  const byDc = {};
  nodes.forEach((n, i) => {
    const dc = n.datacenter || "dc1";
    if (!byDc[dc]) byDc[dc] = [];
    byDc[dc].push({ n, i });
  });

  const renderNodeCard = ({ n, i }) => {
    const isPrimary = i === primaryNodeIdx;
    const isReplica = replicaIdxs.includes(i);
    const isSimDown = downNodes.has(n.address);
    const isReallyDown = !n.is_up;
    const isDown = isSimDown || isReallyDown;
    const nodeColor = `var(--node-${i % 5})`;
    return (
      <NodeCard key={i} n={n} i={i} isPrimary={isPrimary} isReplica={isReplica}
        isDown={isDown} isSimDown={isSimDown} isReallyDown={isReallyDown}
        nodeColor={nodeColor} selectedUser={selectedUser} />
    );
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)", fontSize: "1.5rem" }}>Replication</h2>
        <p style={{ margin: "0 0 1.5rem", color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6 }}>
          {isNts
            ? <>In <strong>NetworkTopologyStrategy</strong>, each datacenter has its own Replication Factor. Replicas stay in their respective DC, ensuring <strong>geographical tolerance</strong>.</>
            : <>In <strong>SimpleStrategy</strong>, Cassandra places replicas on consecutive nodes in the ring. Current RF: <strong>{rf}</strong> for <strong style={{ color: "var(--primary-color)" }}>{selectedUser.user_id}</strong>.</>
          }
        </p>

        {downNodes.size > 0 && (
          <div style={{ padding: "0.75rem 1rem", background: "var(--warning-bg)", borderLeft: "4px solid var(--warning-color)", borderRadius: "var(--radius-md)", color: "#92400e", marginBottom: "1.5rem", fontSize: 13 }}>
            <AlertTriangle size={14} style={{marginRight:4}}/> <strong>{downNodes.size} simulated failure(s)</strong> reflected here.
          </div>
        )}

        {nodes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-tertiary)" }}>Waiting for nodes...</div>
        ) : isNts ? (
          /* ── Vue NTS : un groupe par DC avec répliques calculées par DC ── */
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
            {Object.entries(byDc).map(([dc, dcNodes]) => {
              const colors = getDcColor(dc);
              const dcRf = rfPerDc?.[dc] ?? 1;
              // Calcul des répliques spécifique à ce DC
              const dcAddresses = new Set(dcNodes.map(({ n }) => n.address));
              const dcNWT = nodesWithTokens.filter(n => dcAddresses.has(n.address));
              const { primaryLocalIdx, replicaLocalIdxs } = computeDcReplicas(dcNWT, selectedUser, dcRf, dcNodes.length);

              return (
                <div key={dc} style={{ flex: 1, minWidth: 260, background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: 16, padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: colors.primary }}><><Building2 size={16} style={{marginRight:4}}/> {dc.toUpperCase()}</></span>
                    <span style={{ fontSize: 12, color: colors.text, background: `${colors.primary}18`, padding: "2px 10px", borderRadius: 20, border: `1px solid ${colors.border}` }}>
                      RF = {dcRf}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
                    {dcNodes.map(({ n, i: globalI }, localI) => {
                      const isPrimary = localI === primaryLocalIdx;
                      const isReplica = replicaLocalIdxs.includes(localI);
                      const isSimDown = downNodes.has(n.address);
                      const isReallyDown = !n.is_up;
                      const isDown = isSimDown || isReallyDown;
                      const nodeColor = `var(--node-${globalI % 5})`;
                      return (
                        <NodeCard key={globalI} n={n} i={globalI} isPrimary={isPrimary} isReplica={isReplica}
                          isDown={isDown} isSimDown={isSimDown} isReallyDown={isReallyDown}
                          nodeColor={nodeColor} selectedUser={selectedUser} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Vue SimpleStrategy : liste plate ── */
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
            {nodes.map((n, i) => renderNodeCard({ n, i }))}
          </div>
        )}

        {/* Résumé */}
        <div style={{ background: "var(--primary-light)", borderRadius: "var(--radius-lg)", padding: "1.25rem", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
          <div style={{ fontWeight: 600, color: "var(--primary-hover)", marginBottom: 6, fontSize: 14 }}>📊 Distribution Summary</div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>
            {isNts ? (
              <>The data <strong>{selectedUser.user_id}</strong> is replicated in each datacenter according to its own RF.
                {Object.entries(rfPerDc || {}).map(([dc, r]) => (
                  <span key={dc}> — <strong style={{ color: getDcColor(dc).primary }}>{dc.toUpperCase()}</strong> : {r} copy(ies)</span>
                ))}.
              </>
            ) : (
              <>The data <strong>{selectedUser.user_id}</strong> is stored on <strong>{actualRf} node(s)</strong>: Node {primaryNodeIdx + 1} (Primary Replica) + {actualRf - 1} replica(s).
                {rf > nodes.length && <span style={{ color: "var(--error-color)", display: "block", marginTop: 4 }}><AlertTriangle size={14} style={{marginRight:4}}/> RF ({rf}) &gt; number of nodes ({nodes.length}). Cassandra can only make {nodes.length} copies.</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}