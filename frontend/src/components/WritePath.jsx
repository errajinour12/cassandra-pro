import { useState, useEffect } from "react";
import { Settings, Server, Flame, Terminal, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlowCanvas, NodeCard, StepTimeline,
  getReplicas, buildDcsLayout, getConsistencyText
} from "./FlowShared";

const STEP_LABELS = ["Ready", "Partitioning", "Replication", "Storage", "Quorum", "Result"];

const STEP_DESCRIPTIONS = [
  "The client is ready to send new data. It can connect to any node in the cluster, which will then act as the Coordinator for this request.",
  "The Coordinator receives the data and hashes the primary key via Murmur3 to get a Token. This Token determines exactly which nodes are responsible for the data.",
  "The Coordinator sends the data in parallel to the responsible replicas in each Datacenter. Distant replicas receive the data via an inter-DC link.",
  "On EACH active replica: 1) The data is first written to the Commit Log (disk durability). 2) It is then added to the Memtable (fast RAM access).",
  null, // Dynamic consistency text
  null, // Dynamic success/fail text
];

const ACCENT = "#2563eb";
const ACK_COLOR = "#10b981";

export default function WritePath({ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }) {
  const [step, setStep] = useState(0);

  const replicas = getReplicas(selectedUser, nodesWithTokens, nodes, rf);
  const { dcsLayout, isGlobalSuccess, canvasMinHeight } = buildDcsLayout(replicas, nodes, downNodes, consistency);

  useEffect(() => { setStep(0); }, [selectedUser, updatedUser, rf, consistency, JSON.stringify([...downNodes])]);

  useEffect(() => {
    if (autoPlayId > 0) {
      setStep(0);
      let cur = 0;
      const iv = setInterval(() => {
        cur++;
        if (cur > 5) clearInterval(iv);
        else setStep(cur);
      }, 4200);
      return () => clearInterval(iv);
    }
  }, [autoPlayId]);

  const nextStep = () => setStep(s => Math.min(5, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  const stepDesc = step === 4
    ? getConsistencyText(consistency)
    : step === 5
      ? (isGlobalSuccess
        ? `✅ Write SUCCESS. The Coordinator received enough ACKs according to consistency level "${consistency}".`
        : `❌ Write FAILED. Too many replicas are offline to satisfy consistency level "${consistency}".`)
      : STEP_DESCRIPTIONS[step];

  const CLIENT_POS  = { x: 0.07, y: 0.5 };
  const COORD_POS   = { x: 0.28, y: 0.5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 560 }}>
      {/* ── Timeline ── */}
      <StepTimeline step={step} totalSteps={6} labels={STEP_LABELS} accentColor={ACCENT} />

      {/* ── Step description card ── */}
      {/* Description + Nav */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "stretch" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            style={{
              flex: 1,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderLeft: `3px solid ${ACCENT}`,
              borderRadius: 10,
              padding: "0.75rem 1rem",
              fontSize: "0.845rem",
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            <span style={{ fontWeight: 700, color: "#1e293b", marginRight: "0.4rem" }}>{STEP_LABELS[step]} —</span>
            {stepDesc}
          </motion.div>
        </AnimatePresence>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flexShrink: 0 }}>
          <button className="btn btn-outline" onClick={prevStep} disabled={step === 0} style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>◀ Prev</button>
          <button className="btn" onClick={nextStep} disabled={step === 5}
            style={{ background: ACCENT, color: "white", border: "none", padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>Next ▶</button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative", minHeight: canvasMinHeight, borderRadius: 14, background: "#fafbfc", border: "1px solid #e2e8f0", overflow: "hidden", transition: "min-height 0.4s ease" }}>
        <FlowCanvas
          step={step}
          dcsLayout={dcsLayout}
          clientPos={CLIENT_POS}
          coordPos={COORD_POS}
          particleColor={ACCENT}
          ackColor={ACK_COLOR}
        />

        {/* ── Client node ── */}
        <NodeCard
          label="Client"
          sublabel={(updatedUser || selectedUser)?.user_id || "—"}
          icon={<Terminal size={22} />}
          isActive={step >= 1}
          dimmed={step >= 2 && step < 5}
          statusColor={ACCENT}
          style={{ left: `${CLIENT_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "DATA" : step === 5 ? (isGlobalSuccess ? "ACK ✓" : "ERR ✗") : null}
          badgeColor={step === 5 ? (isGlobalSuccess ? ACK_COLOR : "#ef4444") : ACCENT}
        />

        {/* ── Coordinator node ── */}
        <NodeCard
          label="Coordinator"
          sublabel="Entry Node"
          icon={<Settings size={22} />}
          isActive={step >= 1 && step < 5}
          isRadar={step === 1 || step === 4}
          dimmed={false}
          statusColor={ACCENT}
          style={{ left: `${COORD_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "Hash Murmur3" : step === 4 ? consistency : null}
          badgeColor={ACCENT}
        />

        {/* ── Replica nodes ── */}
        {dcsLayout.map(dc =>
          dc.replicas.map((rp) => {
            const hasWritten = step >= 3;
            const isWritingNow = step === 3;

            return (
              <NodeCard
                key={rp.nodeIdx}
                label={`Node ${rp.nodeIdx + 1}`}
                sublabel={`DC: ${dc.name}`}
                icon={rp.isDown ? <Flame size={22} /> : <Server size={22} />}
                isActive={step >= 2 && !rp.isDown}
                isDown={rp.isDown}
                isVibrating={isWritingNow && !rp.isDown}
                dimmed={step < 2 && !rp.isDown}
                statusColor={rp.isDown ? "#ef4444" : ACCENT}
                style={{ left: `${rp.x * 100}%`, top: `${rp.y * 100}%`, transform: "translate(-50%, -50%)" }}
                badge={rp.isDown ? "DOWN" : (hasWritten ? "✓ Written" : null)}
                badgeColor={rp.isDown ? "#ef4444" : ACK_COLOR}
                leds={!rp.isDown ? { disk: hasWritten, ram: hasWritten, blink: isWritingNow } : null}
              />
            );
          })
        )}

        {/* ── Success overlay ── */}
        <AnimatePresence>
          {step === 5 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "absolute", inset: 0,
                background: isGlobalSuccess
                  ? "radial-gradient(ellipse at center, rgba(16,185,129,0.06) 0%, transparent 70%)"
                  : "radial-gradient(ellipse at center, rgba(239,68,68,0.06) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
