import { useState } from "react";
import { Globe, Server, Play, Loader2 } from "lucide-react";

// Preview qui remplit tout l'espace qui lui est donné
function SimpleRingPreview() {
  const nodes = 6;
  const cx = 100, cy = 100, r = 72;
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      {/* Halo extérieur */}
      <circle cx={cx} cy={cy} r={r + 18} fill="none" stroke="var(--primary-light)" strokeWidth="28" />
      {/* Anneau principal */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-light)" strokeWidth="2" strokeDasharray="6 3" />
      {/* Flèche de rotation */}
      <path d={`M ${cx + r - 8} ${cy - 14} A ${r} ${r} 0 0 1 ${cx + r - 8} ${cy + 14}`}
        fill="none" stroke="var(--primary-light)" strokeWidth="1.5" markerEnd="url(#arr)" />
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="var(--primary-light)" />
        </marker>
      </defs>
      {Array.from({ length: nodes }).map((_, i) => {
        const angle = (i / nodes) * 2 * Math.PI - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const isReplica = i < 3;
        return (
          <g key={i}>
            {/* Ligne radiale */}
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-light)" strokeWidth="1" />
            {/* Halo réplique */}
            {isReplica && <circle cx={x} cy={y} r={20} fill="var(--primary-light)" />}
            <circle cx={x} cy={y} r={16} fill={isReplica ? "var(--primary-light)" : "var(--bg-surface)"} stroke={isReplica ? "var(--primary-color)" : "var(--border-light)"} strokeWidth={isReplica ? 2 : 1} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="11" fill={isReplica ? "var(--primary-color)" : "var(--text-secondary)"} fontWeight="700">N{i + 1}</text>
          </g>
        );
      })}
      {/* Centre */}
      <circle cx={cx} cy={cy} r={22} fill="var(--bg-surface)" stroke="var(--border-light)" strokeWidth="1.5" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="10" fill="var(--primary-color)" fontWeight="600">Anneau</text>
    </svg>
  );
}

function NtsPreview() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 280 200" preserveAspectRatio="xMidYMid meet">
      {/* DC1 */}
      <rect x="8" y="20" width="108" height="162" rx="14" fill="var(--primary-light)" stroke="var(--primary-color)" strokeWidth="2" strokeDasharray="5 3" />
      <text x="62" y="14" textAnchor="middle" fontSize="13" fill="var(--primary-color)" fontWeight="800">DC1</text>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={62} cy={50 + i * 46} r={18} fill="var(--bg-surface)" stroke="var(--primary-color)" strokeWidth="2" />
          <text x={62} y={55 + i * 46} textAnchor="middle" fontSize="11" fill="var(--primary-color)" fontWeight="700">N{i + 1}</text>
        </g>
      ))}
      {/* Lien WAN animé */}
      <line x1="116" y1="100" x2="164" y2="100" stroke="var(--border-light)" strokeWidth="2.5" strokeDasharray="5 3" />
      <circle cx="140" cy="100" r="10" fill="var(--bg-surface)" stroke="var(--border-light)" strokeWidth="1.5" />
      <text x="140" y="104" textAnchor="middle" fontSize="7" fill="var(--text-secondary)" fontWeight="700">WAN</text>
      {/* Flèches */}
      <polygon points="161,96 171,100 161,104" fill="var(--border-light)" opacity="0.8" />
      <polygon points="119,104 109,100 119,96" fill="var(--border-light)" opacity="0.8" />
      {/* DC2 */}
      <rect x="164" y="20" width="108" height="162" rx="14" fill="var(--success-bg)" stroke="var(--success-color)" strokeWidth="2" strokeDasharray="5 3" />
      <text x="218" y="14" textAnchor="middle" fontSize="13" fill="var(--success-color)" fontWeight="800">DC2</text>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={218} cy={50 + i * 46} r={18} fill="var(--bg-surface)" stroke="var(--success-color)" strokeWidth="2" />
          <text x={218} y={55 + i * 46} textAnchor="middle" fontSize="11" fill="var(--success-color)" fontWeight="700">N{i + 4}</text>
        </g>
      ))}
    </svg>
  );
}

export default function StrategySelector({ onSelect }) {
  const [simpleRf, setSimpleRf] = useState(3);
  const [rfDc1, setRfDc1] = useState(3);
  const [rfDc2, setRfDc2] = useState(3);
  const [loading, setLoading] = useState(null);

  const launch = (strategy) => {
    setLoading(strategy);
    const config = {
      strategy,
      rf: strategy === "simple" ? simpleRf : Math.max(rfDc1, rfDc2),
      rfPerDc: { dc1: rfDc1, dc2: rfDc2 }
    };
    const body = strategy === "simple"
      ? { strategy: "simple", replication_factor: simpleRf, dc_options: {} }
      : { strategy: "nts", replication_factor: 0, dc_options: { dc1: rfDc1, dc2: rfDc2 } };
    fetch("http://127.0.0.1:8000/cluster/strategy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(e => console.warn("Backend strategy change:", e));
    setTimeout(() => { onSelect(config); setLoading(null); }, 300);
  };

  const rfRow = (label, val, set, max) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-app)", borderRadius: 10, padding: "0.6rem 1rem", border: "1px solid var(--border-light)" }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button onClick={() => set(v => Math.max(1, v - 1))} style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border-light)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", minWidth: 20, textAlign: "center" }}>{val}</span>
        <button onClick={() => set(v => Math.min(max, v + 1))} style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border-light)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
      </div>
    </div>
  );

  return (
    <div style={{
      height: "100vh", width: "100vw", overflow: "hidden", boxSizing: "border-box",
      background: "var(--bg-app)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "1.5vh 1.5vw 1vh", fontFamily: "'Inter', sans-serif", gap: "1.5vh",
    }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", flexShrink: 0, marginTop: "2vh" }}>
        <h1 style={{ margin: 0, fontSize: "2.5rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>
          <span style={{ color: "var(--primary-color)" }}>Sim</span>Cassandra
        </h1>
        <p style={{ margin: "0.75rem 0 0", color: "var(--text-secondary)", fontSize: 16, maxWidth: 500 }}>
          Choisissez une <strong style={{ color: "var(--text-primary)" }}>stratégie de réplication</strong> pour démarrer la simulation visuelle
        </p>
      </div>

      {/* ── Conteneur des deux cards ── */}
      <div style={{
        flex: 1, minHeight: 0, width: "100%", maxWidth: 860,
        display: "flex", gap: "clamp(1rem, 2vw, 2rem)", alignItems: "stretch",
        marginTop: "1.5vh"
      }}>

        {/* ══ SimpleStrategy ══ */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-light)", borderRadius: 20,
          padding: "clamp(1rem, 2.5vh, 1.75rem) clamp(1rem, 2vw, 1.5rem)",
          display: "flex", flexDirection: "column", gap: "clamp(0.5rem, 1.2vh, 0.9rem)",
          boxShadow: "var(--shadow-sm)",
        }}>
          {/* Titre */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-light)", border: "1px solid var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Server size={22} color="var(--primary-color)" />
            </div>
            <div>
              <div style={{ fontSize: "clamp(14px, 2vh, 17px)", fontWeight: 700, color: "var(--text-primary)" }}>SimpleStrategy</div>
              <div style={{ fontSize: "clamp(11px, 1.4vh, 13px)", color: "var(--text-secondary)", marginTop: 2 }}>Cluster homogène — anneau unique</div>
            </div>
          </div>

          {/* Preview — REMPLIT l'espace */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "1rem 0" }}>
            <SimpleRingPreview />
          </div>

          {/* Description */}
          <div style={{ fontSize: "clamp(11px, 1.5vh, 13px)", color: "var(--text-secondary)", lineHeight: 1.65, background: "var(--bg-app)", borderRadius: 10, padding: "0.7rem 1rem", border: "1px solid var(--border-light)", flexShrink: 0 }}>
            Les réplicas sont placés sur les <strong style={{ color: "var(--text-primary)" }}>nœuds consécutifs</strong> de l'anneau. Idéal pour un datacenter unique. Simple à configurer.
          </div>

          {/* RF */}
          <div style={{ flexShrink: 0 }}>{rfRow("Replication Factor", simpleRf, setSimpleRf, 6)}</div>

          {/* Bouton */}
          <button
            onClick={() => launch("simple")} disabled={loading !== null}
            style={{ flexShrink: 0, width: "100%", padding: "clamp(0.6rem, 1.3vh, 0.85rem)", borderRadius: 12, background: loading === "simple" ? "var(--text-tertiary)" : "var(--primary-color)", border: "none", color: "white", fontWeight: 700, fontSize: "clamp(13px, 1.6vh, 15px)", cursor: loading !== null ? "not-allowed" : "pointer", transition: "all 0.2s", boxShadow: loading === "simple" ? "none" : "0 4px 14px rgba(59, 130, 246, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            {loading === "simple" ? <><Loader2 size={16} /> Connexion...</> : <><Play size={16} /> Simuler SimpleStrategy</>}
          </button>
        </div>

        {/* ══ NetworkTopologyStrategy ══ */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-light)", borderRadius: 20,
          padding: "clamp(1rem, 2.5vh, 1.75rem) clamp(1rem, 2vw, 1.5rem)",
          display: "flex", flexDirection: "column", gap: "clamp(0.5rem, 1.2vh, 0.9rem)",
          boxShadow: "var(--shadow-sm)",
        }}>
          {/* Titre */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--success-bg)", border: "1px solid var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Globe size={22} color="var(--success-color)" />
            </div>
            <div>
              <div style={{ fontSize: "clamp(14px, 2vh, 17px)", fontWeight: 700, color: "var(--text-primary)" }}>NetworkTopologyStrategy</div>
              <div style={{ fontSize: "clamp(11px, 1.4vh, 13px)", color: "var(--text-secondary)", marginTop: 2 }}>Multi-datacenter — tolérance géographique</div>
            </div>
          </div>

          {/* Preview — REMPLIT l'espace */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "1rem 0" }}>
            <NtsPreview />
          </div>

          {/* Description */}
          <div style={{ fontSize: "clamp(11px, 1.5vh, 13px)", color: "var(--text-secondary)", lineHeight: 1.65, background: "var(--bg-app)", borderRadius: 10, padding: "0.7rem 1rem", border: "1px solid var(--border-light)", flexShrink: 0 }}>
            Chaque datacenter a <strong style={{ color: "var(--text-primary)" }}>son propre RF</strong>. Survit à la panne totale d'un datacenter. Recommandé en production.
          </div>

          {/* RF par DC */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", flexShrink: 0 }}>
            {rfRow("RF — DC1 (Indigo)", rfDc1, setRfDc1, 3)}
            {rfRow("RF — DC2 (Émeraude)", rfDc2, setRfDc2, 3)}
          </div>

          {/* Bouton */}
          <button
            onClick={() => launch("nts")} disabled={loading !== null}
            style={{ flexShrink: 0, width: "100%", padding: "clamp(0.6rem, 1.3vh, 0.85rem)", borderRadius: 12, background: loading === "nts" ? "var(--text-tertiary)" : "var(--success-color)", border: "none", color: "white", fontWeight: 700, fontSize: "clamp(13px, 1.6vh, 15px)", cursor: loading !== null ? "not-allowed" : "pointer", transition: "all 0.2s", boxShadow: loading === "nts" ? "none" : "0 4px 14px rgba(16, 185, 129, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            {loading === "nts" ? <><Loader2 size={16} /> Connexion...</> : <><Play size={16} /> Simuler NTS</>}
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <p style={{ margin: 0, flexShrink: 0, color: "var(--text-secondary)", fontSize: "clamp(10px, 1.3vh, 13px)", marginTop: "1vh" }}>
        Vous pourrez changer de stratégie à tout moment depuis l'interface principale
      </p>
    </div>
  );
}
