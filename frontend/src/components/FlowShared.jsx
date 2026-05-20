import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HardDrive, Cpu } from "lucide-react";

// ─── Bezier curve math ────────────────────────────────────────────────────────
export function getBezierPath(x1, y1, x2, y2) {
  // Control point: halfway horizontally, biased toward source Y for elegant sweep
  const cx = x1 + (x2 - x1) * 0.55;
  const cy = y1 + (y2 - y1) * 0.15;
  return { cx, cy, path: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}` };
}

function bezierPoint(t, x1, y1, cx, cy, x2, y2) {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

// ─── Particle system ──────────────────────────────────────────────────────────
export function useParticles(active, flows, color) {
  const [particles, setParticles] = useState([]);
  const timeRef = useRef(null);
  const counterRef = useRef(0);

  useEffect(() => {
    if (!active || !flows || flows.length === 0) {
      setParticles([]);
      if (timeRef.current) clearInterval(timeRef.current);
      return;
    }
    timeRef.current = setInterval(() => {
      counterRef.current += 1;
      const flow = flows[counterRef.current % flows.length];
      const { cx, cy } = getBezierPath(flow.x1, flow.y1, flow.x2, flow.y2);
      setParticles(prev => [
        ...prev.slice(-18),
        { id: counterRef.current, ...flow, cx, cy, progress: 0, color, born: Date.now(), duration: flow.duration || 1500 },
      ]);
    }, 420);
    return () => clearInterval(timeRef.current);
  }, [active, JSON.stringify(flows), color]);

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

export function Particle({ p }) {
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  let x, y;
  
  if (p.midX !== undefined) {
    if (p.progress < 0.5) {
      const t = p.progress * 2;
      const bez = getBezierPath(p.x1, p.y1, p.midX, p.midY);
      const pt = bezierPoint(ease(t), p.x1, p.y1, bez.cx, bez.cy, p.midX, p.midY);
      x = pt.x; y = pt.y;
    } else {
      const t = (p.progress - 0.5) * 2;
      const bez = getBezierPath(p.midX, p.midY, p.x2, p.y2);
      const pt = bezierPoint(ease(t), p.midX, p.midY, bez.cx, bez.cy, p.x2, p.y2);
      x = pt.x; y = pt.y;
    }
  } else {
    const pt = bezierPoint(ease(p.progress), p.x1, p.y1, p.cx, p.cy, p.x2, p.y2);
    x = pt.x; y = pt.y;
  }

  const opacity = p.progress < 0.08 ? p.progress / 0.08 : p.progress > 0.88 ? (1 - p.progress) / 0.12 : 1;
  return (
    <g opacity={opacity}>
      <circle cx={x} cy={y} r={18} fill={p.color} opacity={0.08} />
      <circle cx={x} cy={y} r={10} fill={p.color} opacity={0.2} />
      <circle cx={x} cy={y} r={5.5} fill="white" />
      <circle cx={x} cy={y} r={3.5} fill={p.color} />
    </g>
  );
}

// ─── FlowCanvas ───────────────────────────────────────────────────────────────
export function FlowCanvas({ step, dcsLayout, clientPos, coordPos, particleColor, ackColor }) {
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 480 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries)
        setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = dims;
  const cPos  = { x: clientPos.x  * w, y: clientPos.y  * h };
  const crdPos = { x: coordPos.x * w, y: coordPos.y * h };

  const dataFlows = [], ackFlows = [];
  if (step === 1) dataFlows.push({ x1: cPos.x, y1: cPos.y, x2: crdPos.x, y2: crdPos.y, duration: 1100 });

  dcsLayout.forEach((dc, dcIdx) => {
    const baseDur = dcIdx > 0 ? 2400 : 1800;
    const dcMidX = dc.dcEntry.x * w;
    const dcMidY = dc.dcEntry.y * h;
    
    dc.replicas.forEach(rp => {
      const rpX = rp.x * w, rpY = rp.y * h;
      if (step === 2 && !rp.isDown) dataFlows.push({ x1: crdPos.x, y1: crdPos.y, midX: dcMidX, midY: dcMidY, x2: rpX, y2: rpY, duration: baseDur });
      if (step === 4 && !rp.isDown && rp.blocksSuccess) ackFlows.push({ x1: rpX, y1: rpY, midX: dcMidX, midY: dcMidY, x2: crdPos.x, y2: crdPos.y, duration: baseDur * 0.7 });
    });
  });

  if (step === 5) {
    if (dcsLayout.every(dc => dc.successMet))
      ackFlows.push({ x1: crdPos.x, y1: crdPos.y, x2: cPos.x, y2: cPos.y, duration: 1100 });
  }

  const dataParticles = useParticles(dataFlows.length > 0, dataFlows, particleColor);
  const ackParticles  = useParticles(ackFlows.length  > 0, ackFlows,  ackColor);
  const clientCoordBez = getBezierPath(cPos.x, cPos.y, crdPos.x, crdPos.y);

  return (
    <div ref={canvasRef} style={{ position: "absolute", inset: 0 }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", overflow: "visible" }}>
        <defs>
          <marker id="arr-data" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={particleColor} opacity="0.55" />
          </marker>
          <marker id="arr-ack" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={ackColor} opacity="0.55" />
          </marker>
        </defs>

        {/* Client → Coordinator */}
        <path
          d={clientCoordBez.path} fill="none"
          stroke={step >= 1 ? particleColor : "#cbd5e1"}
          strokeWidth={step >= 1 ? 2.5 : 1.5}
          strokeDasharray={step >= 1 ? "8 6" : "none"}
          opacity={step >= 1 ? 0.6 : 0.25}
          style={{ transition: "all 0.6s ease" }}
          markerEnd={step >= 1 ? "url(#arr-data)" : undefined}
        />

        {/* DC zones + replica cables */}
        {dcsLayout.map((dc, i) => {
          const xs = dc.replicas.map(r => r.x * w);
          const ys = dc.replicas.map(r => r.y * h);
          const pad = { x: 85, yT: 75, yB: 75 };
          const minX = Math.min(...xs) - pad.x;
          const maxX = Math.max(...xs) + pad.x;
          const minY = Math.min(...ys) - pad.yT;
          const maxY = Math.max(...ys) + pad.yB;

          return (
            <g key={`dc-${i}`}>
              {/* DC bounding box - highly transparent */}
              <rect
                x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                fill={dc.isLocal ? "rgba(248,250,252,0.5)" : "rgba(248,250,252,0.2)"}
                stroke={dc.isLocal ? "#e2e8f0" : "transparent"}
                strokeWidth="1" strokeDasharray="4 4" rx="30"
                style={{ transition: "all 0.5s" }}
              />
              {/* DC label - very subtle */}
              <text
                x={minX + 24} y={minY + 28}
                fill="#cbd5e1"
                fontSize="12" fontWeight="700" fontFamily="monospace" letterSpacing="1.5"
              >
                {dc.name.toUpperCase()} {dc.isLocal ? "(LOCAL)" : "(REMOTE)"}
              </text>

              {/* Trunk Cable to DC Entry */}
              {dc.replicas.some(r => step >= 2 && !r.isDown) && (
                <path
                  d={getBezierPath(crdPos.x, crdPos.y, dc.dcEntry.x * w, dc.dcEntry.y * h).path}
                  fill="none" stroke={particleColor} strokeWidth="2.5"
                  strokeDasharray="6 4" opacity="0.6"
                  style={{ transition: "all 0.6s ease" }}
                />
              )}
              {!dc.replicas.some(r => step >= 2 && !r.isDown) && (
                <path
                  d={getBezierPath(crdPos.x, crdPos.y, dc.dcEntry.x * w, dc.dcEntry.y * h).path}
                  fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.2"
                />
              )}

              {/* Branch Cables to replicas */}
              {dc.replicas.map((rp, j) => {
                const bez = getBezierPath(dc.dcEntry.x * w, dc.dcEntry.y * h, rp.x * w, rp.y * h);
                const isActiveFlow = step >= 2 && !rp.isDown;
                return (
                  <path
                    key={`cable-${i}-${j}`}
                    d={bez.path} fill="none"
                    stroke={isActiveFlow ? particleColor : "#e2e8f0"}
                    strokeWidth={isActiveFlow ? 1.5 : 1}
                    strokeDasharray={isActiveFlow ? "6 4" : "none"}
                    opacity={isActiveFlow ? 0.4 : 0.15}
                    style={{ transition: "all 0.6s ease" }}
                    markerEnd={isActiveFlow ? "url(#arr-data)" : undefined}
                  />
                );
              })}
            </g>
          );
        })}

        {dataParticles.map(p => <Particle key={p.id} p={p} />)}
        {ackParticles.map(p  => <Particle key={p.id} p={p} />)}
      </svg>
    </div>
  );
}

// ─── Step Timeline ────────────────────────────────────────────────────────────
export function StepTimeline({ step, labels, accentColor }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 0,
      padding: "0 0 1.5rem 0", overflowX: "auto",
      msOverflowStyle: "none", scrollbarWidth: "none",
    }}>
      {labels.map((label, i) => {
        const isDone   = i < step;
        const isActive = i === step;
        const isFuture = i > step;
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", minWidth: 80 }}>
              <motion.div
                animate={{
                  backgroundColor: isDone ? accentColor : isActive ? accentColor : "#f8fafc",
                  scale: isActive ? 1.25 : 1,
                  boxShadow: isActive ? `0 0 0 6px ${accentColor}15` : "none",
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "13px", fontWeight: 800,
                  color: isDone || isActive ? "white" : "#94a3b8",
                  border: `2px solid ${isDone || isActive ? accentColor : "#e2e8f0"}`,
                  flexShrink: 0,
                }}
              >
                {isDone ? "✓" : i + 1}
              </motion.div>
              <span style={{
                fontSize: "11px", fontWeight: 700, textAlign: "center",
                color: isActive ? "#0f172a" : isFuture ? "#cbd5e1" : "#64748b",
                lineHeight: 1.3, maxWidth: 80, display: "block",
                letterSpacing: "0.2px"
              }}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div style={{
                width: 54, height: 3, flexShrink: 0, borderRadius: 2,
                background: i < step ? accentColor : "#f1f5f9",
                margin: "15px -6px 0",
                transition: "background 0.5s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────
export function NodeCard({ label, sublabel, icon, isActive, isDown, isVibrating, isRadar, statusColor, style, badge, badgeColor, leds, extra, dimmed }) {
  return (
    <motion.div
      animate={{
        opacity: dimmed ? 0.35 : 1,
        scale: isActive && !isDown ? (label === "Coordinateur" ? 1.15 : 1.05) : (label === "Coordinateur" ? 1.08 : 1),
        y: isActive && !isDown ? -4 : 0,
        filter: dimmed ? "grayscale(0.6) opacity(0.7)" : "grayscale(0) opacity(1)",
      }}
      transition={{ duration: 0.5, ease: [0.3, 0, 0.2, 1] }}
      style={{
        position: "absolute",
        display: "flex", flexDirection: "column", alignItems: "center",
        width: label === "Coordinateur" ? 150 : 136,
        background: isActive ? (isDown ? "#fff5f5" : "#ffffff") : "#ffffff",
        border: `2px solid ${isActive ? (isDown ? "#ef4444" : statusColor) : "#e2e8f0"}`,
        borderRadius: 16,
        boxShadow: isActive
          ? `0 0 0 5px ${isDown ? "#ef444415" : statusColor + "15"}, 0 10px 30px rgba(0,0,0,0.06)`
          : "0 2px 10px rgba(0,0,0,0.03)",
        animation: isVibrating ? "serverVibrate 0.15s infinite" : (isRadar ? "pulseCoord 2s infinite" : "none"),
        zIndex: label === "Coordinateur" ? 20 : 10, cursor: "default",
        overflow: "hidden",
        ...style,
      }}
      whileHover={{ scale: dimmed ? 1 : (label === "Coordinateur" ? 1.18 : 1.07), y: -6 }}
    >
      <div style={{ padding: "1rem 0.75rem 0.85rem", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        {isRadar && (
          <div style={{
            position: "absolute", inset: -12, borderRadius: "50%",
            border: `1.5px dashed ${statusColor}`,
            animation: "radarSweep 2.5s linear infinite", opacity: 0.4,
          }} />
        )}
        <div style={{
          width: 54, height: 54, borderRadius: "50%",
          background: isActive ? (isDown ? "#fee2e2" : `${statusColor}0a`) : "#f8fafc",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "0.7rem",
          color: isActive ? (isDown ? "#ef4444" : statusColor) : "#94a3b8",
          border: `1px solid ${isActive ? (isDown ? "#fca5a5" : statusColor + "25") : "#e2e8f0"}`,
          transition: "all 0.4s",
          flexShrink: 0,
        }}>
          {icon}
        </div>

      <div style={{ fontSize: "0.85rem", fontWeight: 800, color: isDown ? "#ef4444" : "#0f172a", textAlign: "center", letterSpacing: "0.2px" }}>{label}</div>
      <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600, textAlign: "center", marginTop: 3 }}>{sublabel}</div>

      {/* Storage Pedagogy UI */}
      {leds && !isDown && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px dashed #e2e8f0", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: leds.disk ? 1 : 0.35, transition: "opacity 0.4s ease" }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: leds.disk ? "#10b98120" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HardDrive size={10} color={leds.disk ? "#10b981" : "#94a3b8"} />
            </div>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: leds.disk ? "#10b981" : "#64748b" }}>1. Commit Log</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: leds.ram ? 1 : 0.35, transition: "opacity 0.4s ease 0.2s" }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: leds.ram ? "#10b98120" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cpu size={10} color={leds.ram ? "#10b981" : "#94a3b8"} />
            </div>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: leds.ram ? "#10b981" : "#64748b" }}>2. Memtable</span>
          </div>
        </div>
      )}

      {extra}
      </div>

      {/* Integrated Bottom Badge */}
      {badge && (
        <div style={{
          width: "100%", padding: "0.35rem 0", background: badgeColor, color: "white",
          fontSize: "0.65rem", fontWeight: 800, textAlign: "center", letterSpacing: "0.5px",
          textTransform: "uppercase"
        }}>
          {badge}
        </div>
      )}
    </motion.div>
  );
}

// ─── Shared business logic ────────────────────────────────────────────────────
export function getReplicas(selectedUser, nodesWithTokens, nodes, rf) {
  if (!nodesWithTokens || nodesWithTokens.length === 0 || !selectedUser) return [];
  const t = BigInt(selectedUser.token);
  const dcs = [...new Set(nodesWithTokens.map(n => n.datacenter || "dc1"))];

  if (dcs.length <= 1) {
    const allTokens = [];
    nodesWithTokens.forEach((node, nodeIdx) =>
      (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }))
    );
    allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
    if (!allTokens.length) return [];
    let pri = allTokens.findIndex(tok => t <= BigInt(tok.token));
    if (pri === -1) pri = 0;
    const replicas = [], seen = new Set(); let curr = pri;
    while (replicas.length < rf && replicas.length < nodes.length) {
      const node = allTokens[curr];
      if (!seen.has(node.nodeIdx)) { seen.add(node.nodeIdx); replicas.push(node); }
      curr = (curr + 1) % allTokens.length;
    }
    return replicas;
  }

  const replicas = [], byDc = {};
  nodesWithTokens.forEach((node, nodeIdx) => {
    const dc = node.datacenter || "dc1";
    if (!byDc[dc]) byDc[dc] = [];
    byDc[dc].push({ node, nodeIdx });
  });
  Object.entries(byDc).forEach(([, dcNodes]) => {
    const dcTokens = [];
    dcNodes.forEach(({ node, nodeIdx }) =>
      (node.tokens || []).forEach(tok => dcTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }))
    );
    if (!dcTokens.length) return;
    dcTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
    let pri = dcTokens.findIndex(tok => t <= BigInt(tok.token));
    if (pri === -1) pri = 0;
    const dcReplicas = [], seen = new Set(); let curr = pri;
    while (dcReplicas.length < (rf || 3) && dcReplicas.length < dcNodes.length) {
      const node = dcTokens[curr];
      if (!seen.has(node.nodeIdx)) { seen.add(node.nodeIdx); dcReplicas.push(node); }
      curr = (curr + 1) % dcTokens.length;
    }
    replicas.push(...dcReplicas);
  });
  return replicas;
}

export function buildDcsLayout(replicas, nodes, downNodes, consistency) {
  const dcNames = [...new Set(replicas.map(r => r.datacenter || "dc1"))];

  const cols = 2; // Replicas per row inside a DC
  const ROW_HEIGHT = 220;
  const COL_WIDTH = 0.16; // 16% of canvas width
  const PAD_TOP = 130;
  const PAD_BOTTOM = 130;
  const DC_GAP = 80; // Vertical gap between DCs

  // 1. Calculate rows per DC
  const dcRowCounts = dcNames.map(dcName => {
    const count = replicas.filter(r => (r.datacenter || "dc1") === dcName).length;
    return Math.ceil(count / cols);
  });

  const totalRows = dcRowCounts.reduce((a, b) => a + b, 0);
  const totalDcGaps = Math.max(0, dcNames.length - 1) * DC_GAP;
  const canvasMinHeight = Math.max(560, totalRows * ROW_HEIGHT + totalDcGaps + PAD_TOP + PAD_BOTTOM - ROW_HEIGHT);

  let currentYpx = PAD_TOP;

  const dcsLayout = dcNames.map((dcName, dcIdx) => {
    const dcReplicas = replicas.filter(r => (r.datacenter || "dc1") === dcName);
    const rowsForThisDc = dcRowCounts[dcIdx];

    // Base X for the DC grid (left aligned block on the right side)
    const dcBaseX = 0.66; 

    // Calculate DC vertical center for the Entry Point (Router)
    const dcCenterYpx = currentYpx + (rowsForThisDc * ROW_HEIGHT - ROW_HEIGHT) / 2;
    const dcEntry = { x: dcBaseX - 0.14, y: dcCenterYpx / canvasMinHeight };

    let upCount = 0;
    const positionedReplicas = dcReplicas.map((r, i) => {
      const isDown = downNodes.has(r.address) || nodes.find(n => n.address === r.address)?.is_up === false;
      if (!isDown) upCount++;

      const rRow = Math.floor(i / cols);
      const rCol = i % cols;

      // Center the last row if it's not full
      const replicasInThisRow = (rRow === rowsForThisDc - 1) ? (dcReplicas.length % cols || cols) : cols;
      const rowOffsetX = (cols - replicasInThisRow) * COL_WIDTH / 2;

      const rX = dcBaseX + rCol * COL_WIDTH + rowOffsetX;
      const rYpx = currentYpx + rRow * ROW_HEIGHT;

      // Quorum requirement check
      const isLocalDc = dcIdx === 0;
      const rfPerDc = dcReplicas.length;
      let isReqGlobal = false;
      if (consistency === "LOCAL_QUORUM") { if (isLocalDc) isReqGlobal = true; }
      else if (consistency === "LOCAL_ONE") { if (isLocalDc) isReqGlobal = true; }
      else if (consistency === "EACH_QUORUM") { isReqGlobal = true; }
      else if (consistency === "QUORUM") { isReqGlobal = true; }
      else if (consistency === "ALL") { isReqGlobal = true; }
      else if (consistency === "ONE") { isReqGlobal = true; }

      return { ...r, isDown, x: rX, y: rYpx / canvasMinHeight, blocksSuccess: isReqGlobal && !isDown };
    });

    currentYpx += rowsForThisDc * ROW_HEIGHT + DC_GAP;

    const isLocalDc = dcIdx === 0;
    const rfPerDc = dcReplicas.length;
    let reqAcks = 0, isReqGlobal = false;
    if (consistency === "LOCAL_QUORUM") { if (isLocalDc) { reqAcks = Math.floor(rfPerDc / 2) + 1; isReqGlobal = true; } }
    else if (consistency === "LOCAL_ONE") { if (isLocalDc) { reqAcks = 1; isReqGlobal = true; } }
    else if (consistency === "EACH_QUORUM") { reqAcks = Math.floor(rfPerDc / 2) + 1; isReqGlobal = true; }
    else if (consistency === "QUORUM") { reqAcks = Math.floor(replicas.length / 2) + 1; isReqGlobal = true; }
    else if (consistency === "ALL") { reqAcks = rfPerDc; isReqGlobal = true; }
    else if (consistency === "ONE") { reqAcks = 1; isReqGlobal = true; }

    return {
      name: dcName, replicas: positionedReplicas, isLocal: isLocalDc, upCount, reqAcks,
      dcEntry,
      successMet: (consistency === "QUORUM" || consistency === "ONE")
        ? true : (upCount >= reqAcks || !isReqGlobal),
    };
  });

  const totalUp = dcsLayout.reduce((a, d) => a + d.upCount, 0);
  let isGlobalSuccess = dcsLayout.every(dc => dc.successMet);
  if (consistency === "QUORUM") {
    isGlobalSuccess = totalUp >= Math.floor(replicas.length / 2) + 1;
    dcsLayout.forEach(dc => dc.successMet = isGlobalSuccess);
  } else if (consistency === "ONE") {
    isGlobalSuccess = totalUp >= 1;
    dcsLayout.forEach(dc => dc.successMet = isGlobalSuccess);
  }

  return { dcsLayout, isGlobalSuccess, canvasMinHeight };
}

export function getConsistencyText(consistency) {
  if (consistency === "LOCAL_QUORUM") return "Le Coordinateur attend le quorum uniquement dans le DC local. Les réplicas distants reçoivent la donnée en arrière-plan (asynchrone).";
  if (consistency === "EACH_QUORUM") return "Le Coordinateur attend que chaque Datacenter atteigne son propre quorum interne avant de valider.";
  if (consistency === "LOCAL_ONE")   return "Le Coordinateur valide dès le premier ACK reçu de son propre Datacenter.";
  if (consistency === "ALL")         return "Le Coordinateur attend les ACKs de tous les réplicas sur tous les DCs. Plus lent mais 100% sûr.";
  if (consistency === "ONE")         return "Le Coordinateur valide dès le premier ACK reçu de n'importe quel réplica.";
  return "Le Coordinateur attend un quorum global : majorité absolue sur l'ensemble des réplicas.";
}
