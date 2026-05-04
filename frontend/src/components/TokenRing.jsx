import { useEffect, useRef } from "react";
import * as d3 from "d3";

// ─── Couleurs par DC ───────────────────────────────────────────────────────────
const DC_PALETTE = {
  dc1: { ring: "#4f46e5", label: "#818cf8", bg: "#4f46e510" },
  dc2: { ring: "#10b981", label: "#34d399", bg: "#10b98110" },
  dc3: { ring: "#f59e0b", label: "#fbbf24", bg: "#f59e0b10" },
  dc4: { ring: "#ef4444", label: "#f87171", bg: "#ef444410" },
};
const DC_DEFAULT = { ring: "#64748b", label: "#94a3b8", bg: "#64748b10" };

// ─── Sous-composant : un anneau SVG pour un DC ────────────────────────────────
function DcRing({ dcName, dcNodes, dcNodesWithTokens, globalIndices, highlightToken, downNodes }) {
  const svgRef = useRef();
  const palette = DC_PALETTE[dcName] || DC_DEFAULT;
  const SIZE = 380;
  const cx = SIZE / 2, cy = SIZE / 2, r = 130;

  useEffect(() => {
    if (!dcNodes.length) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const totalNodes = dcNodes.length;

    const logicalSegments = dcNodes.map((_, i) => ({
      nodeIdx: i,
      startAngle: (i / totalNodes) * 2 * Math.PI - Math.PI / 2,
      endAngle: ((i + 1) / totalNodes) * 2 * Math.PI - Math.PI / 2,
    }));

    // Réordonne dcNodesWithTokens pour qu'il corresponde à dcNodes (même ordre par adresse)
    const addrToNWT = new Map((dcNodesWithTokens || []).map(n => [n.address, n]));
    const orderedNWT = dcNodes.map(n => addrToNWT.get(n.address) || { tokens: [] });

    // Cherche le nœud responsable DANS CE DC uniquement — index local dans dcNodes
    const getResponsibleIdx = (tokenStr) => {
      try {
        const allTokens = [];
        orderedNWT.forEach((node, localIdx) => {
          (node.tokens || []).forEach(tok => allTokens.push({ token: tok, localIdx }));
        });
        allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
        if (!allTokens.length) return 0;
        const t = BigInt(tokenStr);
        for (let i = 0; i < allTokens.length; i++) {
          if (t <= BigInt(allTokens[i].token)) return allTokens[i].localIdx;
        }
        return allTokens[0].localIdx;
      } catch { return 0; }
    };

    // Clamp pour éviter l'accès hors-limites
    let primaryNodeIdx = highlightToken ? getResponsibleIdx(highlightToken) : 0;
    primaryNodeIdx = Math.max(0, Math.min(primaryNodeIdx, dcNodes.length - 1));
    const getNodeColor = (localIdx) => `var(--node-${(globalIndices?.[localIdx] ?? localIdx) % 5})`;

    // ── Warning pannes ─────────────────────────────────────────────────────────
    const downSegs = logicalSegments.filter(seg => {
      const nd = dcNodes[seg.nodeIdx];
      return downNodes.has(nd.address) || !nd.is_up;
    });
    if (downSegs.length > 0) {
      svg.append("rect")
        .attr("x", cx - 140).attr("y", 5).attr("width", 280).attr("height", 24).attr("rx", 7)
        .attr("fill", "var(--error-bg)").attr("stroke", "var(--error-color)").attr("stroke-width", 1);
      svg.append("text")
        .attr("x", cx).attr("y", 17).attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("fill", "var(--error-color)").attr("font-size", 10).attr("font-weight", "700").attr("font-family", "Inter")
        .text(`⚠ ${downSegs.length} nœud(s) en panne`);
    }

    // ── Anneau fond ────────────────────────────────────────────────────────────
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", "none").attr("stroke", "var(--border-light)").attr("stroke-width", 30).attr("opacity", 0.25);

    // ── Segments (couleur par nœud) ────────────────────────────────────────────
    logicalSegments.forEach((seg) => {
      const x1 = cx + r * Math.cos(seg.startAngle);
      const y1 = cy + r * Math.sin(seg.startAngle);
      const x2 = cx + r * Math.cos(seg.endAngle);
      const y2 = cy + r * Math.sin(seg.endAngle);
      const largeArc = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
      const nd = dcNodes[seg.nodeIdx];
      const isDown = downNodes.has(nd.address) || !nd.is_up;
      const isHighlight = highlightToken && primaryNodeIdx === seg.nodeIdx;
      const segColor = getNodeColor(seg.nodeIdx);

      svg.append("path")
        .attr("d", `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`)
        .attr("fill", "none")
        .attr("stroke", isDown ? "var(--text-tertiary)" : segColor)
        .attr("stroke-width", 30)
        .attr("opacity", isDown ? 0.2 : isHighlight ? 1 : 0.45)
        .style("transition", "opacity 0.3s ease");

      // Ticks
      svg.append("line")
        .attr("x1", cx + (r - 16) * Math.cos(seg.startAngle)).attr("y1", cy + (r - 16) * Math.sin(seg.startAngle))
        .attr("x2", cx + (r + 16) * Math.cos(seg.startAngle)).attr("y2", cy + (r + 16) * Math.sin(seg.startAngle))
        .attr("stroke", "var(--bg-surface)").attr("stroke-width", 4).attr("stroke-linecap", "round");
    });

    // ── Nœuds physiques (couleur individuelle) ─────────────────────────────────
    dcNodes.forEach((node, i) => {
      const seg = logicalSegments[i];
      const midAngle = (seg.startAngle + seg.endAngle) / 2;
      const nodeR = r + 48;
      const x = cx + nodeR * Math.cos(midAngle);
      const y = cy + nodeR * Math.sin(midAngle);

      const isPrimary = highlightToken && primaryNodeIdx === i;
      const isSimDown = downNodes.has(node.address);
      const isRealDown = !node.is_up;
      const isDown = isSimDown || isRealDown;
      const nodeColor = getNodeColor(i);

      // Ligne de connexion
      svg.append("line")
        .attr("x1", cx + r * Math.cos(midAngle)).attr("y1", cy + r * Math.sin(midAngle))
        .attr("x2", x).attr("y2", y)
        .attr("stroke", nodeColor).attr("stroke-width", 2).attr("opacity", 0.35).attr("stroke-dasharray", "3,3");

      if (isDown) {
        svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 22)
          .attr("fill", "var(--error-bg)").attr("stroke", "var(--error-color)").attr("stroke-width", 2).attr("opacity", 0.5);
      } else if (isPrimary) {
        const halo = svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 26)
          .attr("fill", "none").attr("stroke", nodeColor).attr("stroke-width", 2);
        halo.node().classList.add("animate-pulse-ring");
      }

      svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 20)
        .attr("fill", isDown ? "var(--text-tertiary)" : "var(--bg-surface)")
        .attr("stroke", isDown ? "var(--border-light)" : nodeColor)
        .attr("stroke-width", 3)
        .style("filter", "drop-shadow(0 4px 6px rgba(0,0,0,0.1))");

      svg.append("text").attr("x", x).attr("y", y + 1)
        .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("fill", isDown ? "white" : nodeColor)
        .attr("font-size", 12).attr("font-weight", "700").attr("font-family", "Inter")
        .text(`N${(globalIndices?.[i] ?? i) + 1}`);

      if (isPrimary) {
        svg.append("rect").attr("x", x - 33).attr("y", y + 25).attr("width", 66).attr("height", 18).attr("rx", 9)
          .attr("fill", nodeColor).style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");
        svg.append("text").attr("x", x).attr("y", y + 35)
          .attr("text-anchor", "middle").attr("fill", "white").attr("font-size", 9).attr("font-weight", "700")
          .attr("letter-spacing", "0.5px").attr("font-family", "Inter").text("PRIMAIRE");
      }
    });

    // ── Point de la donnée ─────────────────────────────────────────────────────
    if (highlightToken != null) {
      const seg = logicalSegments[primaryNodeIdx];
      const midAngle = (seg.startAngle + seg.endAngle) / 2;
      const dr = r - 42;
      const x = cx + dr * Math.cos(midAngle);
      const y = cy + dr * Math.sin(midAngle);
      const primaryColor = getNodeColor(primaryNodeIdx);

      svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 8)
        .attr("fill", "var(--bg-surface)").attr("stroke", primaryColor).attr("stroke-width", 3)
        .style("filter", `drop-shadow(0 0 6px ${primaryColor})`);
      svg.append("line")
        .attr("x1", cx + (r - 15) * Math.cos(midAngle)).attr("y1", cy + (r - 15) * Math.sin(midAngle))
        .attr("x2", x).attr("y2", y)
        .attr("stroke", primaryColor).attr("stroke-width", 2).attr("stroke-dasharray", "3,3").attr("opacity", 0.6);
      svg.append("text").attr("x", x).attr("y", y - 16)
        .attr("text-anchor", "middle").attr("fill", "var(--text-primary)").attr("font-size", 12).attr("font-weight", "700")
        .attr("font-family", "Inter").text("Donnée");
    }

    // ── Centre ─────────────────────────────────────────────────────────────────
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 50)
      .attr("fill", "var(--bg-app)").attr("stroke", palette.ring).attr("stroke-width", 1).attr("opacity", 0.6);
    svg.append("text").attr("x", cx).attr("y", cx - 7)
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("fill", palette.label).attr("font-size", 13).attr("font-weight", "700").attr("font-family", "Inter")
      .text(dcName.toUpperCase());
    svg.append("text").attr("x", cx).attr("y", cx + 10)
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("fill", "var(--text-tertiary)").attr("font-size", 9).attr("font-family", "Inter")
      .text(`${dcNodes.length} nœuds`);

  }, [dcNodes, dcNodesWithTokens, highlightToken, downNodes, globalIndices, palette]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
      background: palette.bg, border: `1.5px solid ${palette.ring}40`,
      borderRadius: 16, padding: "1.25rem 1rem 1rem"
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: palette.label, textTransform: "uppercase", letterSpacing: 1 }}>
        🗄 {dcName.toUpperCase()}
      </div>
      <svg ref={svgRef} width={SIZE} height={SIZE} style={{ overflow: "visible" }} />
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function TokenRing({ nodes, nodesWithTokens, highlightToken, downNodes = new Set(), strategy = "simple" }) {

  // ── Mode NTS : un anneau par DC ─────────────────────────────────────────────
  if (strategy === "nts") {
    const dcs = [...new Set(nodes.map(n => n.datacenter))].sort();

    return (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Anneaux par DC */}
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center" }}>
          {dcs.map(dc => {
            // Préserve l'index global de chaque nœud
            const dcNodeEntries = nodes
              .map((n, globalIdx) => ({ n, globalIdx }))
              .filter(({ n }) => n.datacenter === dc);
            const dcNodes = dcNodeEntries.map(({ n }) => n);
            const globalIndices = dcNodeEntries.map(({ globalIdx }) => globalIdx);
            const dcAddresses = new Set(dcNodes.map(n => n.address));
            const dcNodesWithTokens = nodesWithTokens.filter(n => dcAddresses.has(n.address));
            return (
              <DcRing
                key={dc}
                dcName={dc}
                dcNodes={dcNodes}
                dcNodesWithTokens={dcNodesWithTokens}
                globalIndices={globalIndices}
                highlightToken={highlightToken}
                downNodes={downNodes}
              />
            );
          })}
        </div>

        {/* Légende NTS */}
        <div style={{ maxWidth: 500, margin: "0 auto", background: "var(--bg-app)", padding: "1.2rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
          <h4 style={{ margin: "0 0 0.8rem", color: "var(--text-primary)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🌍 NetworkTopologyStrategy — Multi-DC
          </h4>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: 16 }}>🗄</span>
              <span>Chaque data center possède <strong>son propre anneau de hachage</strong>, indépendant des autres DC.</span>
            </li>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span>Le point indique où la donnée atterrit <strong>dans chaque DC</strong>. Le nœud marqué <em>PRIMAIRE</em> en est responsable localement.</span>
            </li>
            <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span>La réplication inter-DC se fait via le réseau WAN — chaque DC reçoit sa propre copie.</span>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Mode SimpleStrategy : anneau unique (comportement originel) ──────────────
  return <SingleRing nodes={nodes} nodesWithTokens={nodesWithTokens} highlightToken={highlightToken} downNodes={downNodes} />;
}

// ─── Anneau simple (SimpleStrategy) ──────────────────────────────────────────
function SingleRing({ nodes, nodesWithTokens, highlightToken, downNodes }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!nodes.length) return;
    const width = 400, height = 400, cx = 200, cy = 200, r = 130;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const totalNodes = nodes.length;
    const logicalSegments = nodes.map((_, i) => ({
      nodeIdx: i,
      startAngle: (i / totalNodes) * 2 * Math.PI - Math.PI / 2,
      endAngle: ((i + 1) / totalNodes) * 2 * Math.PI - Math.PI / 2,
    }));

    const getResponsibleNodeIdx = (tokenStr) => {
      if (!nodesWithTokens || nodesWithTokens.length === 0) return 0;
      const allTokens = [];
      nodesWithTokens.forEach((node, nodeIdx) => {
        (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx }));
      });
      allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
      if (allTokens.length === 0) return 0;
      const t = BigInt(tokenStr);
      for (let i = 0; i < allTokens.length; i++) {
        if (t <= BigInt(allTokens[i].token)) return allTokens[i].nodeIdx;
      }
      return allTokens[0].nodeIdx;
    };

    let primaryNodeIdx = 0;
    if (highlightToken) primaryNodeIdx = getResponsibleNodeIdx(highlightToken);

    const getNodeColor = (idx) => `var(--node-${idx % 5})`;

    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", "none").attr("stroke", "var(--border-light)").attr("stroke-width", 30).attr("opacity", 0.3);

    const downSegments = logicalSegments.filter(seg => {
      const segNode = nodes[seg.nodeIdx];
      return downNodes.has(segNode.address) || !segNode.is_up;
    });

    if (downSegments.length > 0) {
      svg.append("rect").attr("x", cx - 140).attr("y", 5).attr("width", 280).attr("height", 28).attr("rx", 8)
        .attr("fill", "var(--error-bg)").attr("stroke", "var(--error-color)").attr("stroke-width", 1);
      svg.append("text").attr("x", cx).attr("y", 19).attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("fill", "var(--error-color)").attr("font-size", 11).attr("font-weight", "700").attr("font-family", "Inter")
        .text(`⚠ ${downSegments.length} nœud(s) en panne sur cet anneau`);
    }

    logicalSegments.forEach((seg) => {
      const x1 = cx + r * Math.cos(seg.startAngle);
      const y1 = cy + r * Math.sin(seg.startAngle);
      const x2 = cx + r * Math.cos(seg.endAngle);
      const y2 = cy + r * Math.sin(seg.endAngle);
      const largeArc = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
      const isHighlightSegment = highlightToken !== null && primaryNodeIdx === seg.nodeIdx;
      const segNode = nodes[seg.nodeIdx];
      const isSegDown = downNodes.has(segNode.address) || !segNode.is_up;

      svg.append("path")
        .attr("d", `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`)
        .attr("fill", "none")
        .attr("stroke", isSegDown ? "var(--text-tertiary)" : getNodeColor(seg.nodeIdx))
        .attr("stroke-width", 30)
        .attr("opacity", isSegDown ? 0.3 : isHighlightSegment ? 1 : 0.4)
        .style("transition", "opacity 0.3s ease");

      svg.append("line")
        .attr("x1", cx + (r - 16) * Math.cos(seg.startAngle)).attr("y1", cy + (r - 16) * Math.sin(seg.startAngle))
        .attr("x2", cx + (r + 16) * Math.cos(seg.startAngle)).attr("y2", cy + (r + 16) * Math.sin(seg.startAngle))
        .attr("stroke", "var(--bg-surface)").attr("stroke-width", 4).attr("stroke-linecap", "round");
    });

    nodes.forEach((node, i) => {
      const seg = logicalSegments[i];
      const midAngle = (seg.startAngle + seg.endAngle) / 2;
      const nodeR = r + 45;
      const x = cx + nodeR * Math.cos(midAngle);
      const y = cy + nodeR * Math.sin(midAngle);
      const isPrimary = highlightToken && primaryNodeIdx === i;
      const nodeColor = getNodeColor(i);
      const isSimDown = downNodes.has(node.address);
      const isReallyDown = !node.is_up;
      const isDown = isSimDown || isReallyDown;

      svg.append("line")
        .attr("x1", cx + r * Math.cos(midAngle)).attr("y1", cy + r * Math.sin(midAngle))
        .attr("x2", x).attr("y2", y)
        .attr("stroke", nodeColor).attr("stroke-width", 2).attr("opacity", 0.4).attr("stroke-dasharray", "3,3");

      if (isDown) {
        svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 22)
          .attr("fill", "var(--error-bg)").attr("stroke", "var(--error-color)").attr("stroke-width", 2).attr("opacity", 0.5);
      } else if (isPrimary) {
        const halo = svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 26)
          .attr("fill", "none").attr("stroke", nodeColor).attr("stroke-width", 2);
        halo.node().classList.add("animate-pulse-ring");
      }

      svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 20)
        .attr("fill", !isDown ? "var(--bg-surface)" : "var(--text-tertiary)")
        .attr("stroke", !isDown ? nodeColor : "var(--border-light)").attr("stroke-width", 3)
        .style("filter", "drop-shadow(0 4px 6px rgba(0,0,0,0.1))");

      svg.append("text").attr("x", x).attr("y", y + 1)
        .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("fill", !isDown ? nodeColor : "white")
        .attr("font-size", 13).attr("font-weight", "700").attr("font-family", "Inter")
        .text(`N${i + 1}`);

      if (isPrimary) {
        svg.append("rect").attr("x", x - 35).attr("y", y + 26).attr("width", 70).attr("height", 20).attr("rx", 10)
          .attr("fill", nodeColor).style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");
        svg.append("text").attr("x", x).attr("y", y + 37)
          .attr("text-anchor", "middle").attr("fill", "white").attr("font-size", 10).attr("font-weight", "700")
          .attr("letter-spacing", "0.5px").attr("font-family", "Inter").text("PRIMAIRE");
      }
    });

    if (highlightToken !== null && highlightToken !== undefined) {
      const seg = logicalSegments[primaryNodeIdx];
      const midAngle = (seg.startAngle + seg.endAngle) / 2;
      const dr = r - 40;
      const x = cx + dr * Math.cos(midAngle);
      const y = cy + dr * Math.sin(midAngle);

      svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 8)
        .attr("fill", "var(--bg-surface)").attr("stroke", getNodeColor(primaryNodeIdx)).attr("stroke-width", 3)
        .style("filter", `drop-shadow(0 0 6px ${getNodeColor(primaryNodeIdx)})`);
      svg.append("line")
        .attr("x1", cx + (r - 15) * Math.cos(midAngle)).attr("y1", cy + (r - 15) * Math.sin(midAngle)).attr("x2", x).attr("y2", y)
        .attr("stroke", getNodeColor(primaryNodeIdx)).attr("stroke-width", 2).attr("stroke-dasharray", "3,3").attr("opacity", 0.6);
      svg.append("text").attr("x", x).attr("y", y - 16)
        .attr("text-anchor", "middle").attr("fill", "var(--text-primary)").attr("font-size", 13).attr("font-weight", "700")
        .attr("font-family", "Inter").text("Donnée");
    }

    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 55)
      .attr("fill", "var(--bg-app)").attr("stroke", "var(--border-light)").attr("stroke-width", 1);
    svg.append("text").attr("x", cx).attr("y", cy)
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("fill", "var(--text-tertiary)").attr("font-size", 11).attr("font-weight", "600")
      .attr("font-family", "Inter").attr("letter-spacing", "1px").text("CLUSTER");

  }, [nodes, nodesWithTokens, highlightToken, downNodes]);

  return (
    <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center", justifyContent: "center", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <svg ref={svgRef} width={400} height={400} style={{ overflow: "visible" }} />
      </div>
      <div style={{ maxWidth: 300, background: "var(--bg-app)", padding: "1.2rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
        <h4 style={{ margin: "0 0 0.8rem", color: "var(--text-primary)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px" }}>L'anneau de hachage</h4>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.8rem", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <span style={{ color: "var(--primary-color)", fontSize: 16 }}>⭕</span>
            <span>Pour plus de clarté, l'anneau est divisé en <strong>{nodes.length} parts égales</strong> (une par nœud physique).</span>
          </li>
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <span style={{ color: "var(--primary-color)", fontSize: 16 }}>📍</span>
            <span>Le point indique l'emplacement de ta donnée. Elle tombe naturellement dans la portion gérée par son <strong>Nœud Primaire</strong>.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}