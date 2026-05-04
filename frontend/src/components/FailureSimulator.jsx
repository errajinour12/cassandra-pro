import { useState } from "react";

const DC_COLORS = {
  dc1: { primary: "#4f46e5", bg: "#4f46e510", border: "#4f46e550", text: "#818cf8", kill: "#4f46e530" },
  dc2: { primary: "#10b981", bg: "#10b98110", border: "#10b98150", text: "#34d399", kill: "#10b98130" },
};
function getDcColor(dc) { return DC_COLORS[dc] || DC_COLORS.dc1; }

/**
 * Calcule primary + réplicas pour UN DC en suivant l'anneau de tokens (logique Cassandra réelle).
 * Retourne { primaryGlobalIdx, replicaGlobalIdxs } — indices dans le tableau `nodes` global.
 */
function computeDcReplicas(dcNodeEntries, dcNodesWithTokens, selectedUser, dcRf) {
  if (!selectedUser || !dcNodeEntries.length) {
    return { primaryGlobalIdx: dcNodeEntries[0]?.i ?? -1, replicaGlobalIdxs: [] };
  }

  const addrToNWT = new Map((dcNodesWithTokens || []).map(n => [n.address, n]));
  const allTokens = [];
  dcNodeEntries.forEach(({ n, i: globalIdx }, localIdx) => {
    const nwt = addrToNWT.get(n.address) || { tokens: [] };
    (nwt.tokens || []).forEach(tok => allTokens.push({ token: tok, localIdx, globalIdx }));
  });

  if (!allTokens.length) {
    return { primaryGlobalIdx: dcNodeEntries[0]?.i ?? -1, replicaGlobalIdxs: [] };
  }

  try {
    allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
    const ht = BigInt(selectedUser.token);

    // Trouve le premier token >= ht sur l'anneau (primary)
    let primaryPos = allTokens.findIndex(t => ht <= BigInt(t.token));
    if (primaryPos === -1) primaryPos = 0; // wrap-around

    // Parcourt l'anneau en dédupliquant par nœud pour avoir l'ordre réel des nœuds
    const seenLocal = new Set();
    const ringOrder = []; // { localIdx, globalIdx } dans l'ordre de l'anneau à partir du primary
    for (let step = 0; step < allTokens.length && ringOrder.length < dcNodeEntries.length; step++) {
      const entry = allTokens[(primaryPos + step) % allTokens.length];
      if (!seenLocal.has(entry.localIdx)) {
        seenLocal.add(entry.localIdx);
        ringOrder.push(entry);
      }
    }

    const actualRf = Math.min(dcRf, dcNodeEntries.length);
    const primaryGlobalIdx = ringOrder[0]?.globalIdx ?? dcNodeEntries[0]?.i ?? -1;
    const replicaGlobalIdxs = ringOrder.slice(1, actualRf).map(e => e.globalIdx);
    return { primaryGlobalIdx, replicaGlobalIdxs };
  } catch {
    return { primaryGlobalIdx: dcNodeEntries[0]?.i ?? -1, replicaGlobalIdxs: [] };
  }
}

/**
 * Calcule primary + réplicas pour SimpleStrategy (anneau global unique).
 */
function computeSimpleReplicas(nodesWithTokens, selectedUser, rf, nodes) {
  if (!selectedUser || !nodesWithTokens.length) return { primaryNodeIdx: 0, replicaIdxs: [] };

  const allTokens = [];
  nodesWithTokens.forEach((node, idx) =>
    (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx: idx }))
  );

  try {
    allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
    const ht = BigInt(selectedUser.token);

    let primaryPos = allTokens.findIndex(t => ht <= BigInt(t.token));
    if (primaryPos === -1) primaryPos = 0;

    // Ordre des nœuds uniques sur l'anneau à partir du primary
    const seenNode = new Set();
    const ringOrder = [];
    for (let step = 0; step < allTokens.length && ringOrder.length < nodes.length; step++) {
      const entry = allTokens[(primaryPos + step) % allTokens.length];
      if (!seenNode.has(entry.nodeIdx)) {
        seenNode.add(entry.nodeIdx);
        ringOrder.push(entry.nodeIdx);
      }
    }

    const actualRf = Math.min(rf, nodes.length);
    const primaryNodeIdx = ringOrder[0] ?? 0;
    const replicaIdxs = ringOrder.slice(1, actualRf);
    return { primaryNodeIdx, replicaIdxs };
  } catch {
    return { primaryNodeIdx: 0, replicaIdxs: [] };
  }
}

// ── Calcule si une requête peut aboutir ──────────────────────────────────────
function computeCanRespond({ consistency, nodesHoldingData, nodes, downNodes, rfPerDc, byDc, strategy }) {
  const isNts = strategy === "nts";
  if (!isNts) {
    const actualRf = nodesHoldingData.length;
    let up = 0;
    nodesHoldingData.forEach(idx => {
      const n = nodes[idx];
      if (n && !downNodes.has(n.address) && n.is_up) up++;
    });
    const needed = consistency === "ONE" ? 1 : consistency === "ALL" ? actualRf : Math.floor(actualRf / 2) + 1;
    return { canRespond: up >= needed, details: `${up} / ${needed} réplicas disponibles`, upCount: up, needed };
  }

  // NTS : calcul par DC
  const upByDc = {};
  const rfByDcCalc = {};
  Object.entries(byDc).forEach(([dc, dcNodes]) => {
    const dcRf = rfPerDc?.[dc] ?? 1;
    rfByDcCalc[dc] = dcRf;
    upByDc[dc] = dcNodes.filter(({ n }) => !downNodes.has(n.address) && n.is_up).length;
  });

  const dcList = Object.keys(byDc);
  if (consistency === "LOCAL_QUORUM") {
    const localDc = dcList[0];
    const needed = Math.floor(rfByDcCalc[localDc] / 2) + 1;
    const up = upByDc[localDc] ?? 0;
    return { canRespond: up >= needed, details: `${localDc.toUpperCase()} : ${up}/${needed} requis (LOCAL_QUORUM)`, upCount: up, needed };
  }
  if (consistency === "LOCAL_ONE") {
    const localDc = dcList[0];
    const up = upByDc[localDc] ?? 0;
    return { canRespond: up >= 1, details: `${localDc.toUpperCase()} : ${up}/1 requis (LOCAL_ONE)`, upCount: up, needed: 1 };
  }
  if (consistency === "EACH_QUORUM") {
    const results = dcList.map(dc => {
      const needed = Math.floor(rfByDcCalc[dc] / 2) + 1;
      return { dc, up: upByDc[dc] ?? 0, needed, ok: (upByDc[dc] ?? 0) >= needed };
    });
    const allOk = results.every(r => r.ok);
    const details = results.map(r => `${r.dc.toUpperCase()}: ${r.up}/${r.needed}`).join(" | ");
    return { canRespond: allOk, details: `EACH_QUORUM — ${details}`, upCount: 0, needed: 0 };
  }
  const totalUp = Object.values(upByDc).reduce((s, v) => s + v, 0);
  const totalRf = Object.values(rfByDcCalc).reduce((s, v) => s + v, 0);
  const needed = consistency === "ONE" ? 1 : consistency === "ALL" ? totalRf : Math.floor(totalRf / 2) + 1;
  return { canRespond: totalUp >= needed, details: `Global : ${totalUp}/${needed}`, upCount: totalUp, needed };
}

export default function FailureSimulator({ nodes, nodesWithTokens, selectedUser, rf, rfPerDc, strategy, consistency, downNodes, setDownNodes }) {
  const isNts = strategy === "nts";

  // ── Grouper par DC ───────────────────────────────────────────────────────
  const byDc = {};
  nodes.forEach((n, i) => {
    const dc = n.datacenter || "dc1";
    if (!byDc[dc]) byDc[dc] = [];
    byDc[dc].push({ n, i });
  });

  // ── Calcul des réplicas selon la stratégie ───────────────────────────────
  let primaryNodeIdxs = [];
  let replicaIdxs = [];

  if (isNts) {
    // NTS : calcul indépendant par DC sur l'anneau de tokens local
    Object.entries(byDc).forEach(([dc, dcNodeEntries]) => {
      const dcAddresses = new Set(dcNodeEntries.map(({ n }) => n.address));
      const dcNWT = nodesWithTokens.filter(n => dcAddresses.has(n.address));
      const dcRf = rfPerDc?.[dc] ?? 1;
      const { primaryGlobalIdx, replicaGlobalIdxs } = computeDcReplicas(dcNodeEntries, dcNWT, selectedUser, dcRf);
      if (primaryGlobalIdx >= 0) primaryNodeIdxs.push(primaryGlobalIdx);
      replicaGlobalIdxs.forEach(idx => replicaIdxs.push(idx));
    });
    replicaIdxs = [...new Set(replicaIdxs)];
  } else {
    const result = computeSimpleReplicas(nodesWithTokens, selectedUser, rf, nodes);
    if (result.primaryNodeIdx >= 0) primaryNodeIdxs.push(result.primaryNodeIdx);
    replicaIdxs = result.replicaIdxs;
  }

  const nodesHoldingData = [...primaryNodeIdxs, ...replicaIdxs];

  // ── Actions ──────────────────────────────────────────────────────────────
  const toggle = (addr) => {
    const s = new Set(downNodes);
    s.has(addr) ? s.delete(addr) : s.add(addr);
    setDownNodes(s);
  };

  const killDc = (dc) => {
    const s = new Set(downNodes);
    const dcNodes = byDc[dc] || [];
    const allDown = dcNodes.every(({ n }) => s.has(n.address));
    dcNodes.forEach(({ n }) => allDown ? s.delete(n.address) : s.add(n.address));
    setDownNodes(s);
  };

  const { canRespond, details } = computeCanRespond({ consistency, nodesHoldingData, nodes, downNodes, rfPerDc, byDc, strategy });

  // ── Rendu d'un nœud ──────────────────────────────────────────────────────
  const renderNode = ({ n, i }) => {
    const isPrimary = primaryNodeIdxs.includes(i);
    const isReplica = replicaIdxs.includes(i);
    const hasData = isPrimary || isReplica;
    const nodeColor = `var(--node-${i % 5})`;
    const isSimDown = downNodes.has(n.address);
    const isReallyDown = !n.is_up;
    const isDown = isSimDown || isReallyDown;

    return (
      <div key={n.address} onClick={() => !isReallyDown && toggle(n.address)}
        style={{
          width: 130, padding: "1rem 0.75rem", borderRadius: 12, textAlign: "center",
          cursor: isReallyDown ? "not-allowed" : "pointer", userSelect: "none",
          background: isDown ? "var(--error-bg)" : hasData ? "var(--bg-surface)" : "var(--bg-app)",
          border: `2px solid ${isDown ? "var(--error-color)" : hasData ? nodeColor : "var(--border-light)"}`,
          opacity: isDown ? 0.8 : hasData ? 1 : 0.5,
          transform: isDown ? "scale(0.95)" : "scale(1)",
          transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
          position: "relative", overflow: "hidden"
        }}>
        {hasData && !isDown && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: nodeColor }} />}
        <div style={{ fontWeight: 700, fontSize: 15, color: isDown ? "var(--error-color)" : "var(--text-primary)" }}>N{i + 1}</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "monospace", marginTop: 2 }}>{n.address}</div>
        <div style={{ marginTop: "0.6rem" }}>
          {isReallyDown
            ? <span className="badge badge-error" style={{ fontSize: 10 }}>PANNE RÉELLE</span>
            : isSimDown
              ? <span className="badge badge-error" style={{ fontSize: 10 }}>SIMULÉE</span>
              : hasData
                ? <span className="badge" style={{ fontSize: 10, background: `${nodeColor}15`, color: nodeColor, border: `1px solid ${nodeColor}40` }}>
                    {isPrimary ? "⭐ PRIMARY" : "🔄 REPLICA"}
                  </span>
                : <span className="badge badge-neutral" style={{ fontSize: 10 }}>Vide</span>}
        </div>
        {!isReallyDown && (
          <div style={{ marginTop: 6, fontSize: 10, color: isDown ? "var(--error-color)" : "var(--text-tertiary)", textDecoration: "underline", opacity: 0.7 }}>
            {isDown ? "Remettre en ligne" : "Simuler panne"}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "2rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>Simulation de Pannes</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, maxWidth: 700 }}>
              {isNts
                ? "Clique sur un nœud ou utilise les boutons « Kill DC » pour simuler une panne de datacenter entier. Observer l'impact selon le niveau de consistance."
                : `Clique sur un nœud pour simuler une panne. Observe si la consistance ${consistency} peut être maintenue.`}
            </p>
          </div>
          <button onClick={() => setDownNodes(new Set())} className="btn btn-outline">↺ Réinitialiser</button>
        </div>

        {/* Dashboard RF / Consistency */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem", background: "var(--bg-app)", padding: "0.875rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
          {isNts && Object.entries(rfPerDc || {}).map(([dc, r]) => (
            <div key={dc} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>RF {dc.toUpperCase()}</span>
              <span className="badge badge-neutral" style={{ fontSize: 13 }}>{r}</span>
            </div>
          ))}
          {!isNts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>RF</span>
              <span className="badge badge-neutral" style={{ fontSize: 13 }}>{Math.min(rf, nodes.length)}</span>
            </div>
          )}
          <div style={{ width: 1, background: "var(--border-light)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>Consistance</span>
            <span className="badge badge-neutral" style={{ fontSize: 13 }}>{consistency}</span>
          </div>
          <div style={{ width: 1, background: "var(--border-light)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>Statut</span>
            <span className={`badge ${canRespond ? "badge-success" : "badge-error"}`} style={{ fontSize: 13 }}>{details}</span>
          </div>
        </div>

        {/* ── Nœuds groupés par DC (NTS) ou à plat (Simple) ── */}
        {isNts ? (
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
            {Object.entries(byDc).map(([dc, dcNodes]) => {
              const colors = getDcColor(dc);
              const allDcDown = dcNodes.every(({ n }) => downNodes.has(n.address) || !n.is_up);
              return (
                <div key={dc} style={{ flex: 1, minWidth: 280, background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: 16, padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: colors.primary }}>🏢 {dc.toUpperCase()}</span>
                    <button onClick={() => killDc(dc)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${colors.border}`, background: allDcDown ? colors.kill : "transparent", color: allDcDown ? colors.primary : colors.text, fontWeight: 600, transition: "all 0.2s" }}>
                      {allDcDown ? "✅ Remettre DC" : "☠️ Kill DC"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
                    {dcNodes.map(renderNode)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
            {nodes.map((n, i) => renderNode({ n, i }))}
          </div>
        )}

        {/* Résultat final */}
        <div style={{ borderRadius: "var(--radius-lg)", padding: "1.25rem", background: canRespond ? "var(--success-bg)" : "var(--error-bg)", border: `1px solid ${canRespond ? "#6ee7b7" : "#fca5a5"}`, display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ fontSize: "1.5rem" }}>{canRespond ? "✅" : "❌"}</div>
          <div>
            <h3 style={{ margin: "0 0 0.5rem", color: canRespond ? "var(--success-color)" : "var(--error-color)", fontSize: "1.1rem" }}>
              {canRespond ? "SUCCÈS — La requête passera" : "ÉCHEC — UnavailableException"}
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: canRespond ? "#065f46" : "#991b1b" }}>
              {canRespond
                ? `Assez de nœuds disponibles pour satisfaire la consistance ${consistency}. (${details})`
                : `Requête rejetée. Niveau ${consistency} non atteignable avec les pannes actuelles. (${details})`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}