import { useState, useEffect } from "react";
import { Settings, Server, Flame, Terminal, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlowCanvas, NodeCard, StepTimeline,
  getReplicas, buildDcsLayout, getConsistencyText
} from "./FlowShared";

const STEP_LABELS = ["Prêt", "Localisation", "Envoi", "Upsert", "Quorum", "Résultat"];

const STEP_DESCRIPTIONS = [
  "Le client veut modifier une donnée existante. Dans Cassandra, une mise à jour est techniquement identique à une nouvelle insertion — on appelle cela un Upsert. Il n'y a pas de 'lecture avant écriture'.",
  "Le Coordinateur hache la clé primaire pour identifier les réplicas responsables de la donnée, exactement comme lors d'une insertion initiale.",
  "Le Coordinateur envoie la nouvelle valeur aux réplicas. Chaque paquet contient un timestamp (horodatage en microsecondes). C'est ce timestamp qui arbitre quel est le 'dernier' état valide.",
  "Sur chaque réplica : la nouvelle version est écrite dans le Commit Log puis dans la Memtable. L'ancienne valeur reste sur disque (SSTable) jusqu'à la prochaine Compaction — le timestamp la rend obsolète à la lecture.",
  null,
  null,
];

const ACCENT = "#7c3aed";
const ACK_COLOR = "#10b981";

export default function UpdatePath({ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }) {
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
        ? `✅ Mise à jour validée selon le niveau "${consistency}". La nouvelle valeur (${updatedUser?.name || "—"}) est maintenant la version canonique grâce à son timestamp plus récent.`
        : `❌ Mise à jour échouée. Insuffisamment de réplicas disponibles pour le niveau de consistance "${consistency}".`)
      : STEP_DESCRIPTIONS[step];

  const CLIENT_POS = { x: 0.07, y: 0.5 };
  const COORD_POS  = { x: 0.28, y: 0.5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 560 }}>
      <StepTimeline step={step} totalSteps={6} labels={STEP_LABELS} accentColor={ACCENT} />

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
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
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
          <button className="btn btn-outline" onClick={prevStep} disabled={step === 0} style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>◀ Préc.</button>
          <button className="btn" onClick={nextStep} disabled={step === 5}
            style={{ background: ACCENT, color: "white", border: "none", padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}>Suiv. ▶</button>
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: canvasMinHeight, borderRadius: 14, background: "#fafbfc", border: "1px solid #e2e8f0", overflow: "hidden", transition: "min-height 0.4s ease" }}>
        <FlowCanvas
          step={step}
          dcsLayout={dcsLayout}
          clientPos={CLIENT_POS}
          coordPos={COORD_POS}
          particleColor={ACCENT}
          ackColor={ACK_COLOR}
        />

        {/* Client */}
        <NodeCard
          label="Client"
          sublabel={selectedUser?.user_id || "—"}
          icon={<Terminal size={22} />}
          isActive={step >= 1}
          dimmed={step >= 2 && step < 5}
          statusColor={ACCENT}
          style={{ left: `${CLIENT_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "UPDATE" : step === 5 ? (isGlobalSuccess ? "OK ✓" : "ERR ✗") : null}
          badgeColor={step === 5 ? (isGlobalSuccess ? ACK_COLOR : "#ef4444") : ACCENT}
          extra={updatedUser && step >= 1 ? (
            <div style={{
              marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9",
              width: "100%", fontSize: "0.65rem", color: "#64748b", textAlign: "center"
            }}>
              <span style={{ color: "#94a3b8", textDecoration: "line-through" }}>{selectedUser?.name}</span>
              <br />
              <span style={{ color: ACCENT, fontWeight: 700 }}>→ {updatedUser?.name}</span>
            </div>
          ) : null}
        />

        {/* Coordinator */}
        <NodeCard
          label="Coordinateur"
          sublabel="Nœud Entrant"
          icon={<Settings size={22} />}
          isActive={step >= 1 && step < 5}
          isRadar={step === 1 || step === 4}
          dimmed={false}
          statusColor={ACCENT}
          style={{ left: `${COORD_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "Hash Murmur3" : step === 2 ? "Timestamp →" : step === 4 ? consistency : null}
          badgeColor={ACCENT}
        />

        {/* Replicas */}
        {dcsLayout.map(dc =>
          dc.replicas.map((rp) => {
            const hasUpdated = step >= 3;
            const isUpdatingNow = step === 3;

            return (
              <NodeCard
                key={rp.nodeIdx}
                label={`Nœud ${rp.nodeIdx + 1}`}
                sublabel={`DC: ${dc.name}`}
                icon={rp.isDown ? <Flame size={22} /> : <Server size={22} />}
                isActive={step >= 2 && !rp.isDown}
                isDown={rp.isDown}
                isVibrating={isUpdatingNow && !rp.isDown}
                dimmed={step < 2 && !rp.isDown}
                statusColor={rp.isDown ? "#ef4444" : ACCENT}
                style={{ left: `${rp.x * 100}%`, top: `${rp.y * 100}%`, transform: "translate(-50%, -50%)" }}
                badge={rp.isDown ? "DOWN" : (hasUpdated ? "✓ Upsert" : null)}
                badgeColor={rp.isDown ? "#ef4444" : ACK_COLOR}
                leds={!rp.isDown ? { disk: hasUpdated, ram: hasUpdated, blink: isUpdatingNow } : null}
              />
            );
          })
        )}

        {/* Success overlay */}
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
