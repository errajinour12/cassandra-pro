import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import TokenRing from "./components/TokenRing";
import Replication from "./components/Replication";
import FailureSimulator from "./components/FailureSimulator";
import Partitionnement from "./components/Partitionnement";
import WritePath from "./components/WritePath";
import DeletePath from "./components/DeletePath";
import UpdatePath from "./components/UpdatePath";
import StrategySelector from "./components/StrategySelector";
import OperationModal from "./components/OperationModal";
import "./index.css";

const API = "http://127.0.0.1:8000";

const TABS = [
  { id: "partitionnement", label: "1. Partitionnement" },
  { id: "ring", label: "2. Token Ring" },
  { id: "replication", label: "3. Réplication" },
  { id: "failure", label: "4. Pannes & Quorum" },
  { id: "writepath", label: "5. Écriture" },
  { id: "deletepath", label: "6. Suppression 💀" },
  { id: "updatepath", label: "7. Modification ✏️" },
];

export default function App() {
  // ── Stratégie ──────────────────────────────────────────────────────────────
  const [strategyConfig, setStrategyConfig] = useState(null);

  // ── Cluster ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("partitionnement");
  const [nodes, setNodes] = useState([]);
  const [nodesWithTokens, setNodesWithTokens] = useState([]);
  const [allData, setAllData] = useState([]);
  const [backendStatus, setBackendStatus] = useState("loading");
  const [selectedUser, setSelectedUser] = useState(null);
  const [consistency, setConsistency] = useState("QUORUM");
  const [downNodes, setDownNodes] = useState(new Set());
  const [autoPlayId, setAutoPlayId] = useState(0);

  // ── Formulaire d'insertion ─────────────────────────────────────────────────
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState("");

  // ── Modaux CRUD ────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");   // ✅ NOUVEAU
  const [autoDeleteId, setAutoDeleteId] = useState(0);
  const [autoUpdateId, setAutoUpdateId] = useState(0);
  const [updatedUser, setUpdatedUser] = useState(null);

  // ── Fermeture propre du modal (reset erreur) ───────────────────────────────
  const closeModal = () => {
    setModal(null);
    setModalError("");  // ✅ reset l'erreur à chaque fermeture
  };

  // ── Polling cluster ────────────────────────────────────────────────────────
  const fetchCluster = useCallback(async () => {
    try {
      const [nodesRes, tokensRes, dataRes] = await Promise.all([
        axios.get(`${API}/cluster/nodes`),
        axios.get(`${API}/cluster/tokens`),
        axios.get(`${API}/data/all`),
      ]);
      setNodes(nodesRes.data.nodes);
      setNodesWithTokens(tokensRes.data.nodes);
      const newData = dataRes.data.users;
      setAllData(newData);
      if (!selectedUser && newData.length > 0) setSelectedUser(newData[newData.length - 1]);
      setBackendStatus("ok");
    } catch {
      setBackendStatus("error");
      setNodes([]); setNodesWithTokens([]);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (!strategyConfig) return;
    fetchCluster();
    const id = setInterval(fetchCluster, 10000);
    return () => clearInterval(id);
  }, [fetchCluster, strategyConfig]);

  useEffect(() => { setDownNodes(new Set()); }, [nodes.length]);

  // ── Filtrage des nœuds par stratégie ──────────────────────────────────────
  const filteredNodes = useMemo(() => {
    if (!strategyConfig || strategyConfig.strategy === "nts") return nodes;
    const dcs = [...new Set(nodes.map(n => n.datacenter))].sort();
    if (!dcs.length) return nodes;
    const localDc = dcs[0];
    return nodes.filter(n => n.datacenter === localDc);
  }, [nodes, strategyConfig]);

  const filteredNodesWithTokens = useMemo(() => {
    if (!strategyConfig || strategyConfig.strategy === "nts") return nodesWithTokens;
    const dcs = [...new Set(nodes.map(n => n.datacenter))].sort();
    if (!dcs.length) return nodesWithTokens;
    const localDc = dcs[0];
    const localAddresses = new Set(nodes.filter(n => n.datacenter === localDc).map(n => n.address));
    return nodesWithTokens.filter(n => localAddresses.has(n.address));
  }, [nodesWithTokens, nodes, strategyConfig]);

  // ── Consistency options selon la stratégie ─────────────────────────────────
  const consistencyOptions = strategyConfig?.strategy === "nts"
    ? ["LOCAL_ONE", "LOCAL_QUORUM", "EACH_QUORUM", "ONE", "QUORUM", "ALL"]
    : ["ONE", "QUORUM", "ALL"];

  // ── Vérification de consistance AVANT appel API ────────────────────────────
  const checkConsistency = useCallback((user) => {
    if (!downNodes.size || !user?.token) return { can: true, up: 0, needed: 0 };

    const allTokens = [];
    filteredNodesWithTokens.forEach((node, nodeIdx) =>
      (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }))
    );
    allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
    if (!allTokens.length) return { can: true, up: 0, needed: 0 };

    const t = BigInt(user.token);
    let primaryIdx = 0;
    for (let i = 0; i < allTokens.length; i++) {
      if (t <= BigInt(allTokens[i].token)) { primaryIdx = i; break; }
    }

    const isNts = strategyConfig?.strategy === "nts";
    const rfPerDc = strategyConfig?.rfPerDc ?? {};
    let replicas = [];

    if (!isNts) {
      const rf = strategyConfig?.rf ?? 3;
      const seen = new Set();
      let curr = primaryIdx;
      while (replicas.length < rf && replicas.length < filteredNodes.length) {
        const node = allTokens[curr];
        if (!seen.has(node.nodeIdx)) { seen.add(node.nodeIdx); replicas.push(node); }
        curr = (curr + 1) % allTokens.length;
      }
    } else {
      const byDcNodes = {};
      filteredNodesWithTokens.forEach((node, nodeIdx) => {
        const dc = node.datacenter || "dc1";
        if (!byDcNodes[dc]) byDcNodes[dc] = [];
        byDcNodes[dc].push({ node, nodeIdx });
      });

      Object.entries(byDcNodes).forEach(([dc, dcNodes]) => {
        const dcTokens = [];
        dcNodes.forEach(({ node, nodeIdx }) => {
          (node.tokens || []).forEach(tok => dcTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }));
        });
        if (!dcTokens.length) return;
        dcTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));

        let localPrimaryIdx = 0;
        for (let i = 0; i < dcTokens.length; i++) {
          if (t <= BigInt(dcTokens[i].token)) { localPrimaryIdx = i; break; }
        }

        const dcRf = rfPerDc[dc] ?? 3;
        const dcReplicas = [];
        const seen = new Set();
        let curr = localPrimaryIdx;

        while (dcReplicas.length < dcRf && dcReplicas.length < dcNodes.length) {
          const node = dcTokens[curr];
          if (!seen.has(node.nodeIdx)) { seen.add(node.nodeIdx); dcReplicas.push(node); }
          curr = (curr + 1) % dcTokens.length;
        }
        replicas.push(...dcReplicas);
      });
    }

    if (!isNts) {
      const up = replicas.filter(r => !downNodes.has(r.address)).length;
      const needed = consistency === "ONE" ? 1 : consistency === "ALL" ? rf : Math.floor(rf / 2) + 1;
      return { can: up >= needed, up, needed };
    }

    // NTS : calcul par DC
    const byDc = {};
    replicas.forEach(r => {
      const dc = r.datacenter || "dc1";
      if (!byDc[dc]) byDc[dc] = { total: 0, up: 0 };
      byDc[dc].total++;
      if (!downNodes.has(r.address)) byDc[dc].up++;
    });
    const dcList = Object.keys(byDc);

    if (consistency === "LOCAL_QUORUM") {
      const dc = dcList[0];
      const needed = Math.floor((rfPerDc[dc] ?? 1) / 2) + 1;
      return { can: (byDc[dc]?.up ?? 0) >= needed, up: byDc[dc]?.up ?? 0, needed };
    }
    if (consistency === "LOCAL_ONE") {
      const dc = dcList[0];
      return { can: (byDc[dc]?.up ?? 0) >= 1, up: byDc[dc]?.up ?? 0, needed: 1 };
    }
    if (consistency === "EACH_QUORUM") {
      const results = dcList.map(dc => {
        const needed = Math.floor((rfPerDc[dc] ?? 1) / 2) + 1;
        return (byDc[dc]?.up ?? 0) >= needed;
      });
      const totalUp = dcList.reduce((s, dc) => s + (byDc[dc]?.up ?? 0), 0);
      return { can: results.every(Boolean), up: totalUp, needed: 0 };
    }
    const totalUp = dcList.reduce((s, dc) => s + (byDc[dc]?.up ?? 0), 0);
    const totalRf = dcList.reduce((s, dc) => s + (rfPerDc[dc] ?? 1), 0);
    const needed = consistency === "ALL" ? totalRf : consistency === "ONE" ? 1 : Math.floor(totalRf / 2) + 1;
    return { can: totalUp >= needed, up: totalUp, needed };
  }, [downNodes, filteredNodesWithTokens, filteredNodes, strategyConfig, consistency]);

  // ── Insertion ──────────────────────────────────────────────────────────────
  const insertUser = async () => {
    if (!userId || !name) return;
    setInsertError("");

    // ✅ Vérifier doublon AVANT tout
    const alreadyExists = allData.some(d => d.user_id === userId);
    if (alreadyExists) {
      setInsertError(`"${userId}" existe déjà dans la base !`);
      return;
    }

    setInsertLoading(true);
    const currentEmail = email || `${userId}@example.com`;

    // ✅ Vérifier consistance (proxy sur selectedUser car token inconnu avant insertion)
    if (downNodes.size > 0 && selectedUser) {
      const check = checkConsistency(selectedUser);
      if (!check.can) {
        setInsertError(`UnavailableException simulée — ${consistency} requiert ${check.needed} nœud(s), seulement ${check.up} disponible(s). Désactivez les pannes ou changez le niveau de consistance.`);
        setInsertLoading(false);
        return;
      }
    }

    try {
      const res = await axios.post(
        `${API}/data/insert?user_id=${encodeURIComponent(userId)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(currentEmail)}`
      );
      const newUser = { user_id: res.data.user_id, token: res.data.token, name, email: currentEmail };
      setAllData(prev => [...prev.filter(d => d.user_id !== newUser.user_id), newUser]);
      setSelectedUser(newUser);
      setUserId(""); setName(""); setEmail("");
      setTab("writepath");
      setAutoPlayId(prev => prev + 1);
    } catch (e) {
      const msg = e.response?.data?.detail || "Erreur lors de l'insertion";
      setInsertError(msg);
    }
    setInsertLoading(false);
  };

  // ── Mise à jour ────────────────────────────────────────────────────────────
  const confirmUpdate = async ({ name: newName, email: newEmail }) => {
    setModalLoading(true);

    // ✅ Vérifier consistance AVANT d'appeler le backend
    if (downNodes.size > 0) {
      const check = checkConsistency(modal.user);
      if (!check.can) {
        setModalError(`UnavailableException simulée — ${consistency} requiert ${check.needed} nœud(s), seulement ${check.up} disponible(s). La modification est bloquée.`);
        setModalLoading(false);
        return;
      }
    }

    const userBeforeUpdate = { ...modal.user };
    try {
      await axios.put(
        `${API}/data/update?user_id=${encodeURIComponent(modal.user.user_id)}&name=${encodeURIComponent(newName)}&email=${encodeURIComponent(newEmail)}`
      );
      const updated = { ...modal.user, name: newName, email: newEmail };
      setAllData(prev => prev.map(d => d.user_id === updated.user_id ? updated : d));
      setSelectedUser(userBeforeUpdate);
      setUpdatedUser(updated);
      closeModal();
      setTab("updatepath");
      setAutoUpdateId(prev => prev + 1);

      setTimeout(() => {
        setSelectedUser(updated);
        setUpdatedUser(null);
      }, 23000);
    } catch (e) {
      console.error("Update error", e);
    }
    setModalLoading(false);
  };

  // ── Suppression ────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    setModalLoading(true);

    // ✅ Vérifier consistance AVANT d'appeler le backend
    if (downNodes.size > 0) {
      const check = checkConsistency(modal.user);
      if (!check.can) {
        setModalError(`UnavailableException simulée — ${consistency} requiert ${check.needed} nœud(s), seulement ${check.up} disponible(s). La suppression est bloquée.`);
        setModalLoading(false);
        return; // ← le backend n'est PAS appelé
      }
    }

    const userToDelete = modal.user;
    try {
      await axios.delete(`${API}/data/delete/${encodeURIComponent(userToDelete.user_id)}`);
      const remaining = allData.filter(d => d.user_id !== userToDelete.user_id);
      setAllData(remaining);
      setSelectedUser(userToDelete);
      closeModal();
      setTab("deletepath");
      setAutoDeleteId(prev => prev + 1);

      setTimeout(() => {
        setSelectedUser(prev => {
          if (prev?.user_id === userToDelete.user_id) {
            return remaining.length > 0 ? remaining[remaining.length - 1] : null;
          }
          return prev;
        });
      }, 23000);
    } catch (e) {
      console.error("Delete error", e);
    }
    setModalLoading(false);
  };

  const statusBadge = {
    loading: { cls: "badge-warning", text: "Connexion..." },
    ok: { cls: "badge-success", text: `${filteredNodes.length} Nœuds Actifs` },
    error: { cls: "badge-error", text: "Hors ligne" },
  }[backendStatus];

  const strategyLabel = strategyConfig?.strategy === "nts" ? "NetworkTopologyStrategy" : "SimpleStrategy";
  const strategyColor = strategyConfig?.strategy === "nts" ? "#10b981" : "#4f46e5";

  // ─────────────────────────────────────────────────────────────────────────
  // ÉCRAN SÉLECTION DE STRATÉGIE
  // ─────────────────────────────────────────────────────────────────────────
  if (!strategyConfig) {
    return <StrategySelector onSelect={cfg => { setStrategyConfig(cfg); setConsistency(cfg.strategy === "nts" ? "LOCAL_QUORUM" : "QUORUM"); }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPLICATION PRINCIPALE
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Modal CRUD */}
      {modal && (
        <OperationModal
          type={modal.type}
          user={modal.user}
          loading={modalLoading}
          error={modalError}          // ✅ NOUVEAU
          onCancel={closeModal}       // ✅ utilise closeModal pour reset l'erreur
          onConfirm={modal.type === "delete" ? confirmDelete : confirmUpdate}
        />
      )}

      {/* ── Header ── */}
      <header style={{ background: "var(--bg-surface)", padding: "0.75rem 2rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "var(--shadow-sm)", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>
            <span style={{ color: "var(--primary-color)" }}>Sim</span>Cassandra
          </h1>
          <span className={`badge ${statusBadge.cls}`}>{statusBadge.text}</span>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "white", background: strategyColor, padding: "3px 10px", borderRadius: 20 }}>
              {strategyConfig.strategy === "nts" ? "🌍 NTS" : "🔵 Simple"}
            </span>
            <button className="btn btn-outline" style={{ padding: "0.2rem 0.6rem", fontSize: 11 }} onClick={() => setStrategyConfig(null)}>
              Changer
            </button>
          </div>

          <button className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: 12 }} onClick={fetchCluster}>↺ Refresh</button>
        </div>

        {/* Consistency */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Consistency</label>
            <select value={consistency} onChange={e => setConsistency(e.target.value)} className="input-field" style={{ padding: "0.4rem 2rem 0.4rem 0.8rem", width: "auto" }}>
              {consistencyOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 300, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-light)", display: "flex", flexDirection: "column", zIndex: 10 }}>

          {/* Formulaire insertion */}
          <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-light)", background: "var(--bg-app)" }}>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Injecter de la donnée
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <input className="input-field" placeholder="Clé primaire (ex: user_42)" value={userId} onChange={e => { setUserId(e.target.value); setInsertError(""); }} />
              <input className="input-field" placeholder="Nom" value={name} onChange={e => setName(e.target.value)} />
              <input className="input-field" placeholder="Email (optionnel)" value={email} onChange={e => setEmail(e.target.value)} />

              {insertError && (
                <div style={{ background: "var(--error-bg)", border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", padding: "0.6rem 0.8rem", fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
                  ❌ {insertError}
                </div>
              )}

              <button className="btn btn-primary" onClick={insertUser} disabled={insertLoading || backendStatus !== "ok" || !userId || !name} style={{ width: "100%" }}>
                {insertLoading ? "Écriture..." : "Insérer dans Cassandra"}
              </button>
            </div>
          </div>

          {/* Liste des données */}
          <div style={{ padding: "1rem 1.25rem", flex: 1, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Base de données</h3>
              <span className="badge badge-neutral">{allData.length} lignes</span>
            </div>

            {allData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-tertiary)" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
                <div style={{ fontSize: 13 }}>La table est vide</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {allData.map(d => {
                  const isSelected = selectedUser?.user_id === d.user_id;
                  return (
                    <div key={d.user_id} onClick={() => setSelectedUser(d)} className="card card-interactive"
                      style={{ padding: "0.75rem", cursor: "pointer", background: isSelected ? "var(--primary-light)" : "var(--bg-surface)", borderColor: isSelected ? "var(--primary-color)" : "var(--border-light)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: isSelected ? "var(--primary-hover)" : "var(--text-primary)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.user_id}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{d.name}</div>
                        </div>
                        {/* Boutons modifier / supprimer — reset modalError à l'ouverture */}
                        <div style={{ display: "flex", gap: "0.3rem", marginLeft: "0.5rem" }} onClick={e => e.stopPropagation()}>
                          <button title="Modifier" onClick={() => { setModalError(""); setModal({ type: "edit", user: d }); }}
                            style={{ width: 26, height: 26, borderRadius: 6, background: "none", border: "1px solid var(--border-light)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                          <button title="Supprimer" onClick={() => { setModalError(""); setModal({ type: "delete", user: d }); }}
                            style={{ width: 26, height: 26, borderRadius: 6, background: "none", border: "1px solid #fca5a5", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6, fontFamily: "monospace", background: isSelected ? "rgba(255,255,255,0.6)" : "var(--bg-app)", padding: "3px 5px", borderRadius: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Token: {d.token}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", position: "relative" }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 2rem 0", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-light)", position: "sticky", top: 0, zIndex: 10 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? "active" : ""}`}>{t.label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto", width: "100%" }}>

            {!selectedUser ? (
              <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", borderStyle: "dashed" }}>
                <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>👈</div>
                <h2 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>Sélectionne une donnée</h2>
                <p style={{ color: "var(--text-secondary)", maxWidth: 500, margin: "0 auto" }}>
                  Insère une donnée ou clique sur un enregistrement existant pour démarrer la simulation visuelle.
                </p>
              </div>
            ) : (
              <>
                {/* Fil conducteur */}
                <div className="card" style={{ background: "var(--primary-light)", borderLeft: "4px solid var(--primary-color)", padding: "0.875rem 1.5rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--primary-hover)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      Analyse — {strategyLabel}
                    </div>
                    <div style={{ fontSize: 15, color: "var(--text-primary)" }}>
                      Clé : <strong style={{ color: "var(--primary-color)" }}>{selectedUser.user_id}</strong>
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", padding: "0.4rem 0.9rem", borderRadius: "var(--radius-md)", fontSize: 11, border: "1px solid var(--border-light)", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                    Token Murmur3 : <strong>{selectedUser.token}</strong>
                  </div>
                </div>

                {tab === "partitionnement" && <Partitionnement nodes={strategyConfig.strategy === "nts" ? nodes : filteredNodes} nodesWithTokens={strategyConfig.strategy === "nts" ? nodesWithTokens : filteredNodesWithTokens} selectedUser={selectedUser} allData={allData} strategy={strategyConfig.strategy} />}

                {tab === "ring" && (
                  <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "3rem" }}>
                    <div style={{ width: "100%", maxWidth: 800, marginBottom: "2rem" }}>
                      <h2 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)" }}>Où atterrit le token ?</h2>
                      <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        Cassandra utilise le hachage cohérent. Le hash de <strong>{selectedUser.user_id}</strong> détermine le nœud responsable
                        {strategyConfig.strategy === "nts" ? " dans chaque Data Center." : "."}
                      </p>
                    </div>
                    <TokenRing
                      nodes={strategyConfig.strategy === "nts" ? nodes : filteredNodes}
                      nodesWithTokens={strategyConfig.strategy === "nts" ? nodesWithTokens : filteredNodesWithTokens}
                      highlightToken={selectedUser.token}
                      downNodes={downNodes}
                      strategy={strategyConfig.strategy}
                    />
                  </div>
                )}

                {tab === "replication" && (
                  <Replication nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} selectedUser={selectedUser}
                    rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} downNodes={downNodes} />
                )}

                {tab === "failure" && (
                  <FailureSimulator nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} selectedUser={selectedUser}
                    rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy}
                    consistency={consistency} downNodes={downNodes} setDownNodes={setDownNodes} />
                )}

                {tab === "writepath" && (
                  <WritePath selectedUser={selectedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens}
                    rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy}
                    consistency={consistency} autoPlayId={autoPlayId} downNodes={downNodes} />
                )}

                {tab === "deletepath" && (
                  <DeletePath selectedUser={selectedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens}
                    rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy}
                    consistency={consistency} downNodes={downNodes} autoPlayId={autoDeleteId} />
                )}

                {tab === "updatepath" && (
                  <UpdatePath selectedUser={selectedUser} updatedUser={updatedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens}
                    rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy}
                    consistency={consistency} downNodes={downNodes} autoPlayId={autoUpdateId} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}