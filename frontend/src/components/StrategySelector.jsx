import { useState } from "react";

// Preview qui remplit tout l'espace qui lui est donné
function SimpleRingPreview() {
  const nodes = 6;
  const cx = 100, cy = 100, r = 72;
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      {/* Halo extérieur */}
      <circle cx={cx} cy={cy} r={r + 18} fill="none" stroke="#4f46e508" strokeWidth="28" />
      {/* Anneau principal */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="6 3" />
      {/* Flèche de rotation */}
      <path d={`M ${cx + r - 8} ${cy - 14} A ${r} ${r} 0 0 1 ${cx + r - 8} ${cy + 14}`}
        fill="none" stroke="#4f46e560" strokeWidth="1.5" markerEnd="url(#arr)" />
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#4f46e560" />
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
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#1e293b" strokeWidth="1" />
            {/* Halo réplique */}
            {isReplica && <circle cx={x} cy={y} r={20} fill="#4f46e508" />}
            <circle cx={x} cy={y} r={16} fill={isReplica ? "#4f46e518" : "#1e293b"} stroke={isReplica ? "#4f46e5" : "#334155"} strokeWidth={isReplica ? 2 : 1} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="11" fill={isReplica ? "#818cf8" : "#475569"} fontWeight="700">N{i + 1}</text>
          </g>
        );
      })}
      {/* Centre */}
      <circle cx={cx} cy={cy} r={22} fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="10" fill="#60a5fa" fontWeight="600">Anneau</text>
    </svg>
  );
}

function NtsPreview() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 280 200" preserveAspectRatio="xMidYMid meet">
      {/* DC1 */}
      <rect x="8" y="20" width="108" height="162" rx="14" fill="#4f46e510" stroke="#4f46e5" strokeWidth="2" strokeDasharray="5 3" />
      <text x="62" y="14" textAnchor="middle" fontSize="13" fill="#818cf8" fontWeight="800">DC1</text>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={62} cy={50 + i * 46} r={18} fill="#4f46e518" stroke="#4f46e5" strokeWidth="2" />
          <text x={62} y={55 + i * 46} textAnchor="middle" fontSize="11" fill="#818cf8" fontWeight="700">N{i + 1}</text>
        </g>
      ))}
      {/* Lien WAN animé */}
      <line x1="116" y1="100" x2="164" y2="100" stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="5 3" />
      <circle cx="140" cy="100" r="10" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.5" />
      <text x="140" y="104" textAnchor="middle" fontSize="7" fill="#60a5fa" fontWeight="700">WAN</text>
      {/* Flèches */}
      <polygon points="161,96 171,100 161,104" fill="#60a5fa" opacity="0.8" />
      <polygon points="119,104 109,100 119,96" fill="#60a5fa" opacity="0.8" />
      {/* DC2 */}
      <rect x="164" y="20" width="108" height="162" rx="14" fill="#10b98110" stroke="#10b981" strokeWidth="2" strokeDasharray="5 3" />
      <text x="218" y="14" textAnchor="middle" fontSize="13" fill="#34d399" fontWeight="800">DC2</text>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={218} cy={50 + i * 46} r={18} fill="#10b98118" stroke="#10b981" strokeWidth="2" />
          <text x={218} y={55 + i * 46} textAnchor="middle" fontSize="11" fill="#34d399" fontWeight="700">N{i + 4}</text>
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", borderRadius: 10, padding: "0.6rem 1rem", border: "1px solid #334155" }}>
      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button onClick={() => set(v => Math.max(1, v - 1))} style={{ width: 28, height: 28, borderRadius: "50%", background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", minWidth: 20, textAlign: "center" }}>{val}</span>
        <button onClick={() => set(v => Math.min(max, v + 1))} style={{ width: 28, height: 28, borderRadius: "50%", background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
      </div>
    </div>
  );

  return (
    <div style={{
      height: "100vh", width: "100vw", overflow: "hidden", boxSizing: "border-box",
      background: "radial-gradient(ellipse at 20% 50%, #1e1b4b 0%, #0f172a 60%, #042f2e 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "1.5vh 1.5vw 1vh", fontFamily: "'Inter', sans-serif", gap: "1.5vh",
    }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: "2.5rem", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-1px" }}>
          <span style={{ color: "#60a5fa" }}>Sim</span>Cassandra
        </h1>
        <p style={{ margin: "0.75rem 0 0", color: "#64748b", fontSize: 16, maxWidth: 500 }}>
          Choisissez une <strong style={{ color: "#94a3b8" }}>stratégie de réplication</strong> pour démarrer la simulation visuelle
        </p>
      </div>

      {/* ── Conteneur des deux cards ── */}
      <div style={{
        flex: 1, minHeight: 0, width: "100%", maxWidth: 860,
        display: "flex", gap: "clamp(1rem, 2vw, 2rem)", alignItems: "stretch",
      }}>

        {/* ══ SimpleStrategy ══ */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          background: "linear-gradient(145deg, #1e293b, #0f172a)",
          border: "1px solid #4f46e540", borderRadius: 20,
          padding: "clamp(1rem, 2.5vh, 1.75rem) clamp(1rem, 2vw, 1.5rem)",
          display: "flex", flexDirection: "column", gap: "clamp(0.5rem, 1.2vh, 0.9rem)",
          boxShadow: "0 0 40px #4f46e512",
        }}>
          {/* Titre */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#4f46e520", border: "1px solid #4f46e560", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🔵</div>
            <div>
              <div style={{ fontSize: "clamp(14px, 2vh, 17px)", fontWeight: 700, color: "#e2e8f0" }}>SimpleStrategy</div>
              <div style={{ fontSize: "clamp(11px, 1.4vh, 13px)", color: "#64748b", marginTop: 2 }}>Cluster homogène — anneau unique</div>
            </div>
          </div>

          {/* Preview — REMPLIT l'espace */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SimpleRingPreview />
          </div>

          {/* Description */}
          <div style={{ fontSize: "clamp(11px, 1.5vh, 13px)", color: "#64748b", lineHeight: 1.65, background: "#0f172a", borderRadius: 10, padding: "0.7rem 1rem", border: "1px solid #1e293b", flexShrink: 0 }}>
            Les réplicas sont placés sur les <strong style={{ color: "#94a3b8" }}>nœuds consécutifs</strong> de l'anneau. Idéal pour un datacenter unique. Simple à configurer.
          </div>

          {/* RF */}
          <div style={{ flexShrink: 0 }}>{rfRow("Replication Factor", simpleRf, setSimpleRf, 6)}</div>

          {/* Bouton */}
          <button
            onClick={() => launch("simple")} disabled={loading !== null}
            style={{ flexShrink: 0, width: "100%", padding: "clamp(0.6rem, 1.3vh, 0.85rem)", borderRadius: 12, background: loading === "simple" ? "#334155" : "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none", color: "white", fontWeight: 700, fontSize: "clamp(13px, 1.6vh, 15px)", cursor: loading !== null ? "not-allowed" : "pointer", transition: "all 0.2s", boxShadow: "0 4px 20px #4f46e540" }}
          >
            {loading === "simple" ? "⏳ Connexion..." : "▶ Simuler SimpleStrategy"}
          </button>
        </div>

        {/* ══ NetworkTopologyStrategy ══ */}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0,
          background: "linear-gradient(145deg, #1e293b, #0f172a)",
          border: "1px solid #10b98140", borderRadius: 20,
          padding: "clamp(1rem, 2.5vh, 1.75rem) clamp(1rem, 2vw, 1.5rem)",
          display: "flex", flexDirection: "column", gap: "clamp(0.5rem, 1.2vh, 0.9rem)",
          boxShadow: "0 0 40px #10b98112",
        }}>
          {/* Titre */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#10b98120", border: "1px solid #10b98160", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🌍</div>
            <div>
              <div style={{ fontSize: "clamp(14px, 2vh, 17px)", fontWeight: 700, color: "#e2e8f0" }}>NetworkTopologyStrategy</div>
              <div style={{ fontSize: "clamp(11px, 1.4vh, 13px)", color: "#64748b", marginTop: 2 }}>Multi-datacenter — tolérance géographique</div>
            </div>
          </div>

          {/* Preview — REMPLIT l'espace */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <NtsPreview />
          </div>

          {/* Description */}
          <div style={{ fontSize: "clamp(11px, 1.5vh, 13px)", color: "#64748b", lineHeight: 1.65, background: "#0f172a", borderRadius: 10, padding: "0.7rem 1rem", border: "1px solid #1e293b", flexShrink: 0 }}>
            Chaque datacenter a <strong style={{ color: "#94a3b8" }}>son propre RF</strong>. Survit à la panne totale d'un datacenter. Recommandé en production.
          </div>

          {/* RF par DC */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", flexShrink: 0 }}>
            {rfRow("RF — DC1 (Indigo)", rfDc1, setRfDc1, 3)}
            {rfRow("RF — DC2 (Émeraude)", rfDc2, setRfDc2, 3)}
          </div>

          {/* Bouton */}
          <button
            onClick={() => launch("nts")} disabled={loading !== null}
            style={{ flexShrink: 0, width: "100%", padding: "clamp(0.6rem, 1.3vh, 0.85rem)", borderRadius: 12, background: loading === "nts" ? "#334155" : "linear-gradient(135deg, #059669, #10b981)", border: "none", color: "white", fontWeight: 700, fontSize: "clamp(13px, 1.6vh, 15px)", cursor: loading !== null ? "not-allowed" : "pointer", transition: "all 0.2s", boxShadow: "0 4px 16px #10b98140" }}
          >
            {loading === "nts" ? "⏳ Connexion..." : "▶ Simuler NetworkTopologyStrategy"}
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <p style={{ margin: 0, flexShrink: 0, color: "#334155", fontSize: "clamp(10px, 1.3vh, 13px)" }}>
        Vous pourrez changer de stratégie à tout moment depuis l'interface principale
      </p>
    </div>
  );
}
