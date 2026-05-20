import { useState, useEffect } from "react";
import { Settings, Server, Flame, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlowCanvas, NodeCard, StepTimeline,
  getReplicas, buildDcsLayout, getConsistencyText
} from "./FlowShared";

const STEP_LABELS = ["Demande", "Localisation", "Propagation", "Marquage", "Quorum", "Résultat"];

const STEP_DESCRIPTIONS = [
  "Le client veut supprimer une donnée. Cassandra n'efface pas immédiatement — c'est trop lent et trop risqué en environnement distribué. Il utilise un mécanisme spécial : le Tombstone ⚰️.",
  "Le Coordinateur hache la clé primaire pour localiser les nœuds responsables de cette donnée. La logique est identique à une écriture normale.",
  "Au lieu d'un ordre d'effacement, le Coordinateur envoie un Tombstone ⚰️ — une donnée spéciale qui 'masque' la valeur réelle. Il est propagé aux réplicas exactement comme une écriture.",
  "Les réplicas actifs écrivent le Tombstone dans le Commit Log (disque) puis dans la Memtable (RAM). La donnée n'est pas encore supprimée du disque — elle est juste masquée.",
  null,
  null,
];

const ACCENT = "#dc2626";
const ACK_COLOR = "#10b981";

export default function DeletePath({ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }) {
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
        ? `✅ Tombstone posé avec succès. La donnée est masquée selon le niveau "${consistency}". Elle sera physiquement effacée lors d'une prochaine Compaction (après le délai gc_grace_seconds).`
        : `❌ Suppression échouée. Trop de réplicas sont hors ligne pour satisfaire le niveau de consistance "${consistency}".`)
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
              background: "#fff8f8",
              border: "1px solid #fecaca",
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

        <NodeCard
          label="Client"
          sublabel={selectedUser?.user_id || "—"}
          icon={<Terminal size={22} />}
          isActive={step >= 1}
          dimmed={step >= 2 && step < 5}
          statusColor={ACCENT}
          style={{ left: `${CLIENT_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "DELETE" : step === 5 ? (isGlobalSuccess ? "OK ✓" : "ERR ✗") : null}
          badgeColor={step === 5 ? (isGlobalSuccess ? ACK_COLOR : "#ef4444") : ACCENT}
        />

        <NodeCard
          label="Coordinateur"
          sublabel="Nœud Entrant"
          icon={<Settings size={22} />}
          isActive={step >= 1 && step < 5}
          isRadar={step === 1 || step === 4}
          dimmed={false}
          statusColor={ACCENT}
          style={{ left: `${COORD_POS.x * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
          badge={step === 1 ? "Hash Murmur3" : step === 4 ? consistency : step >= 2 ? "⚰️ Tombstone" : null}
          badgeColor={ACCENT}
        />

        {dcsLayout.map(dc =>
          dc.replicas.map((rp) => {
            const hasTombstone = step >= 3;
            const isMarkingNow = step === 3;

            return (
              <NodeCard
                key={rp.nodeIdx}
                label={`Nœud ${rp.nodeIdx + 1}`}
                sublabel={`DC: ${dc.name}`}
                icon={rp.isDown ? <Flame size={22} /> : <Server size={22} />}
                isActive={step >= 2 && !rp.isDown}
                isDown={rp.isDown}
                isVibrating={isMarkingNow && !rp.isDown}
                dimmed={step < 2 && !rp.isDown}
                statusColor={rp.isDown ? "#ef4444" : ACCENT}
                style={{ left: `${rp.x * 100}%`, top: `${rp.y * 100}%`, transform: "translate(-50%, -50%)" }}
                badge={rp.isDown ? "DOWN" : (hasTombstone ? "⚰️ Tombstone" : null)}
                badgeColor={rp.isDown ? "#ef4444" : ACCENT}
                leds={!rp.isDown ? { disk: hasTombstone, ram: hasTombstone, blink: isMarkingNow } : null}
              />
            );
          })
        )}

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
