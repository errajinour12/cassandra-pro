import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import { Database, PlusCircle, Trash2, Edit2, LayoutGrid, PieChart, CircleDashed, Copy, ShieldAlert, ArrowLeftRight, Server, RotateCcw, AlertTriangle, Globe } from "lucide-react";
import TokenRing from "./components/TokenRing";
import Replication from "./components/Replication";
import FailureSimulator from "./components/FailureSimulator";
import Partitionnement from "./components/Partitionnement";
import WritePath from "./components/WritePath";
import DeletePath from "./components/DeletePath";
import UpdatePath from "./components/UpdatePath";
import StrategySelector from "./components/StrategySelector";
import OperationModal from "./components/OperationModal";
import PageHeader from "./components/PageHeader";
import Architecture from "./components/Architecture";
import Tooltip from "./components/Tooltip";
import FullScreenModal from "./components/FullScreenModal";
import "./index.css";

const API = "http://localhost:8000";

const TABS = [
  { id: "cluster", label: "Architecture", icon: <LayoutGrid size={18} /> },
  { id: "partitionnement", label: "Partitioning", icon: <PieChart size={18} /> },
  { id: "ring", label: "Token Ring", icon: <CircleDashed size={18} /> },
  { id: "replication", label: "Replication", icon: <Copy size={18} /> },
  { id: "writepath", label: "Write Path", icon: <ArrowLeftRight size={18} /> },
  { id: "updatepath", label: "Update Path", icon: <Edit2 size={18} /> },
  { id: "deletepath", label: "Delete Path", icon: <Trash2 size={18} /> },
  { id: "failure", label: "Failures & Quorum", icon: <ShieldAlert size={18} /> },
];

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        if (key === "simcass_downNodes") return new Set(JSON.parse(item));
        return JSON.parse(item);
      }
    } catch (error) {
      console.error(error);
    }
    return initialValue;
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (key === "simcass_downNodes") {
        window.localStorage.setItem(key, JSON.stringify(Array.from(valueToStore)));
      } else {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

export default function App() {
  const clearCache = () => {
    ["simcass_strategy", "simcass_tab", "simcass_nodes", "simcass_tokens", 
     "simcass_allData", "simcass_selectedUser", "simcass_consistency", "simcass_downNodes"].forEach(k => localStorage.removeItem(k));
  };

  const [strategyConfig, setStrategyConfig] = useLocalStorage("simcass_strategy", null);
  const [tab, setTab] = useLocalStorage("simcass_tab", "cluster");
  const [consistency, setConsistency] = useLocalStorage("simcass_consistency", "QUORUM");
  const [downNodes, setDownNodes] = useLocalStorage("simcass_downNodes", new Set());
  const [selectedUser, setSelectedUser] = useLocalStorage("simcass_selectedUser", null);

  const [nodes, setNodes] = useState([]);
  const [nodesWithTokens, setNodesWithTokens] = useState([]);
  const [allData, setAllData] = useState([]);

  const [backendStatus, setBackendStatus] = useState("loading");
  const [autoPlayId, setAutoPlayId] = useState(0);

  // Forms
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState("");

  // Modals
  const [modal, setModal] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [autoDeleteId, setAutoDeleteId] = useState(0);
  const [autoUpdateId, setAutoUpdateId] = useState(0);
  const [updatedUser, setUpdatedUser] = useState(null);

  const closeModal = () => {
    setModal(null);
    setModalError("");
  };

  const selectedUserRef = useRef(selectedUser);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

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

      const current = selectedUserRef.current;
      if (!current && newData.length > 0) setSelectedUser(newData[newData.length - 1]);
      else if (current && !newData.some(u => u.user_id === current.user_id)) setSelectedUser(null);
      setBackendStatus("ok");
    } catch {
      setBackendStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!strategyConfig) return;
    fetchCluster();
    const id = setInterval(fetchCluster, 10000);
    return () => clearInterval(id);
  }, [fetchCluster, strategyConfig]);

  const handleChangeStrategy = () => {
    if (window.confirm("⚠️ Returning to home will erase the current cluster. Continue?")) {
      clearCache();
      setStrategyConfig(null);
      setSelectedUser(null);
      setAllData([]);
      setDownNodes(new Set());
    }
  };

  const resetSimulation = () => {
    if (window.confirm("🚨 Do you really want to reset the entire simulation?")) {
      clearCache();
      window.location.reload();
    }
  };

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

  const consistencyOptions = strategyConfig?.strategy === "nts"
    ? ["LOCAL_ONE", "LOCAL_QUORUM", "EACH_QUORUM", "ONE", "QUORUM", "ALL"]
    : ["ONE", "QUORUM", "ALL"];

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
    const rf = strategyConfig?.rf ?? 3;
    let replicas = [];

    if (!isNts) {
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

  const insertUser = async () => {
    if (!userId || !name) return;
    setInsertError("");

    if (allData.some(d => d.user_id === userId)) {
      setInsertError(`"${userId}" already exists in the database!`);
      return;
    }

    setInsertLoading(true);
    const currentEmail = email || `${userId}@example.com`;

    if (downNodes.size > 0 && selectedUser) {
      const check = checkConsistency(selectedUser);
      if (!check.can) {
        setInsertError(`Consistency Failure (${consistency}): ${check.up}/${check.needed} nodes required.`);
        setInsertLoading(false);
        return;
      }
    }

    try {
      const res = await axios.post(`${API}/data/insert`, { user_id: userId, name, email: currentEmail });
      const newUser = { user_id: res.data.user_id, token: res.data.token, name, email: currentEmail };
      setAllData(prev => [...prev.filter(d => d.user_id !== newUser.user_id), newUser]);
      setSelectedUser(newUser);
      setUserId(""); setName(""); setEmail("");
      setTab("writepath");
      setAutoPlayId(prev => prev + 1);
    } catch (e) {
      setInsertError(e.response?.data?.detail || "Erreur réseau.");
    }
    setInsertLoading(false);
  };

  const confirmUpdate = async ({ name: newName, email: newEmail }) => {
    setModalLoading(true);
    if (downNodes.size > 0) {
      const check = checkConsistency(modal.user);
      if (!check.can) {
        setModalError(`Consistency Failure (${consistency}).`);
        setModalLoading(false);
        return;
      }
    }

    const userBeforeUpdate = { ...modal.user };
    try {
      await axios.put(`${API}/data/update/${encodeURIComponent(modal.user.user_id)}`, { name: newName, email: newEmail });
      const updated = { ...modal.user, name: newName, email: newEmail };
      setAllData(prev => prev.map(d => d.user_id === updated.user_id ? updated : d));
      setSelectedUser(userBeforeUpdate);
      setUpdatedUser(updated);
      closeModal();
      setTab("updatepath");
      setAutoUpdateId(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
    setModalLoading(false);
  };

  const confirmDelete = async () => {
    setModalLoading(true);
    if (downNodes.size > 0) {
      const check = checkConsistency(modal.user);
      if (!check.can) {
        setModalError(`Consistency Failure (${consistency}).`);
        setModalLoading(false);
        return;
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
    } catch (e) {
      console.error(e);
    }
    setModalLoading(false);
  };

  if (!strategyConfig) {
    return <StrategySelector onSelect={cfg => { setStrategyConfig(cfg); setConsistency(cfg.strategy === "nts" ? "LOCAL_QUORUM" : "QUORUM"); }} />;
  }

  const strategyLabel = strategyConfig?.strategy === "nts" ? "NTS" : "Simple";

  return (
    <div className="app-container">
      {modal && (
        <OperationModal
          type={modal.type}
          user={modal.user}
          loading={modalLoading}
          error={modalError}
          onCancel={closeModal}
          onConfirm={modal.type === "delete" ? confirmDelete : confirmUpdate}
        />
      )}

      {/* ── Left Sidebar ── */}
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2.5rem" }}>
          <div style={{ background: "var(--primary-light)", padding: "0.5rem", borderRadius: "var(--radius-md)" }}>
            <Database size={24} color="var(--primary-color)" />
          </div>
          <div>
            <h1 style={{ fontSize: "1.1rem" }}>SimCassandra</h1>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Educational Dashboard</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem", marginTop: "0.5rem" }}>
            Visualizations
          </div>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`nav-item ${tab === t.id ? "active" : ""}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "2rem", borderTop: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Cluster
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Strategy</span>
              <span style={{ fontWeight: 600 }}>{strategyLabel}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Status</span>
              <span className={`badge ${backendStatus === "ok" ? "badge-success" : "badge-error"}`}>
                {backendStatus === "ok" ? "Connected" : "Offline"}
              </span>
            </div>
          </div>
          <button className="btn btn-outline" style={{ width: "100%", marginTop: "1rem" }} onClick={handleChangeStrategy}>
            Return to Home
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-app)" }}>
        
        {/* Topbar */}
        <header style={{ height: "70px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{TABS.find(t => t.id === tab)?.label}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Consistency :</label>
              <select value={consistency} onChange={e => setConsistency(e.target.value)} className="input-field" style={{ padding: "0.3rem 0.75rem", width: "auto" }}>
                {consistencyOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <button className="btn btn-outline" style={{ padding: "0.4rem 0.75rem" }} onClick={fetchCluster}>
              <RotateCcw size={14} /> Refresh
            </button>
          </div>
        </header>

        {/* Content & Right Sidebar wrapper */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          
          <main className="main-content">
                      {/* Architecture is always rendered in background */}
              <div className="content-wrapper">
                <PageHeader 
                  title="Global Architecture & Gossip" 
                  icon={<LayoutGrid />} 
                  description={<span>Visualize the physical topology of your Cassandra cluster. The network is meshed (P2P) and nodes constantly exchange their state via the <Tooltip text="P2P protocol allowing nodes to exchange their health and topology state.">Gossip</Tooltip> protocol (simulated by light streams).</span>}
                />
                <div style={{ marginTop: "1rem" }}>
                  <Architecture nodes={strategyConfig.strategy === "nts" ? nodes : filteredNodes} strategy={strategyConfig.strategy} downNodes={downNodes} />
                </div>
              </div>
          </main>

          {/* ── Right Data Panel ── */}
          <aside style={{ width: 280, background: "var(--bg-surface)", borderLeft: "1px solid var(--border-light)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            {/* Injection Form */}
            <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-app)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <PlusCircle size={16} color="var(--primary-color)" /> Inject Data
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <input className="input-field" placeholder="Primary Key (e.g., user_42)" value={userId} onChange={e => { setUserId(e.target.value); setInsertError(""); }} />
                <input className="input-field" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
                <input className="input-field" placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} />

                {insertError && (
                  <div style={{ background: "var(--error-bg)", borderRadius: "var(--radius-sm)", padding: "0.75rem", fontSize: "0.8rem", color: "var(--error-color)", display: "flex", gap: "0.5rem", alignItems: "flex-start", border: "1px solid var(--error-border)" }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ lineHeight: 1.4 }}>{insertError}</span>
                  </div>
                )}

                <button className="btn btn-primary" onClick={insertUser} disabled={insertLoading || backendStatus !== "ok" || !userId || !name} style={{ width: "100%" }}>
                  {insertLoading ? "Inserting..." : "Insert (Write)"}
                </button>
              </div>
            </div>

            {/* Data List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Database</div>
                <span className="badge badge-neutral">{allData.length} rows</span>
              </div>

              {allData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-tertiary)" }}>
                  <Database size={32} strokeWidth={1} style={{ marginBottom: "1rem", opacity: 0.5 }} />
                  <div style={{ fontSize: "0.85rem" }}>No data.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {allData.map(d => {
                    const isSelected = selectedUser?.user_id === d.user_id;
                    return (
                      <div key={d.user_id} onClick={() => setSelectedUser(d)} className="card card-interactive"
                        style={{ padding: "1rem", cursor: "pointer", background: isSelected ? "var(--bg-app)" : "var(--bg-surface)", borderColor: isSelected ? "var(--primary-color)" : "var(--border-subtle)", boxShadow: isSelected ? "var(--shadow-sm)" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: isSelected ? "var(--primary-hover)" : "var(--text-primary)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis" }}>{d.user_id}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>{d.name}</div>
                          </div>
                          <div style={{ display: "flex", gap: "0.25rem" }} onClick={e => e.stopPropagation()}>
                            <button title="Edit" onClick={() => { setModalError(""); setModal({ type: "edit", user: d }); }}
                              className="btn btn-ghost" style={{ padding: "0.3rem" }}>
                              <Edit2 size={14} />
                            </button>
                            <button title="Delete" onClick={() => { setModalError(""); setModal({ type: "delete", user: d }); }}
                              className="btn btn-ghost" style={{ padding: "0.3rem", color: "var(--error-color)" }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ── FullScreen Modal for Simulations ── */}
        {tab !== "cluster" && (
          <FullScreenModal onClose={() => setTab("cluster")}>
            {!selectedUser ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="card" style={{ textAlign: "center", padding: "5rem 3rem", borderStyle: "dashed", maxWidth: 500 }}>
                  <div style={{ background: "var(--primary-light)", width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                    <Copy size={28} color="var(--primary-color)" />
                  </div>
                  <h2 style={{ marginBottom: "0.5rem" }}>Select a Data Entry</h2>
                  <p>
                    To explore internal operations (Partitioning, Replication, Writing), you must first inject data via the right side panel, or select an existing one.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="card" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", padding: "0.75rem 1.25rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-hover)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                      Active Data
                    </div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>
                      {selectedUser.user_id}
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", padding: "0.5rem 1rem", borderRadius: "var(--radius-md)", fontSize: "0.85rem", border: "1px solid var(--border-light)", fontFamily: "monospace" }}>
                    Hash Token : <strong style={{ color: "var(--primary-color)" }}>{selectedUser.token}</strong>
                  </div>
                </div>

                {tab === "partitionnement" && (
                  <div>
                    <PageHeader title="Partitioning" icon={<PieChart />} description={<span>Cassandra uses a hash function (<Tooltip text="Ultra-fast hash algorithm used by Cassandra.">Murmur3</Tooltip>) to transform your <Tooltip text="Unique identifier of a row, whose partition key is hashed for placement.">Primary Key</Tooltip> into a <Tooltip text="Integer generated by hashing determining the data's position on the ring.">Token</Tooltip>. This Token determines which main node the data will be stored on following the ring (<Tooltip text="Virtual ring of tokens from -2^63 to +2^63-1.">Token Ring</Tooltip>).</span>} />
                    <Partitionnement nodes={strategyConfig.strategy === "nts" ? nodes : filteredNodes} nodesWithTokens={strategyConfig.strategy === "nts" ? nodesWithTokens : filteredNodesWithTokens} selectedUser={selectedUser} allData={allData} strategy={strategyConfig.strategy} />
                  </div>
                )}

                {tab === "ring" && (
                  <div>
                    <PageHeader title="Position on the Ring" icon={<CircleDashed />} description={<span>The ring represents the space of all possible tokens (-2^63 to +2^63-1). The highlighted point indicates exactly where the data lands.</span>} />
                    <div className="card">
                      <TokenRing nodes={strategyConfig.strategy === "nts" ? nodes : filteredNodes} nodesWithTokens={strategyConfig.strategy === "nts" ? nodesWithTokens : filteredNodesWithTokens} highlightToken={selectedUser.token} downNodes={downNodes} strategy={strategyConfig.strategy} />
                    </div>
                  </div>
                )}

                {tab === "replication" && (
                  <div>
                    <PageHeader title="Replication" icon={<Copy />} description={<span>To guarantee high availability, data is not stored on a single node, but copied to several neighboring nodes according to the <Tooltip text="Total number of copies of a data entry in the cluster.">Replication Factor (RF)</Tooltip>.</span>} />
                    <Replication nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} selectedUser={selectedUser} rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} downNodes={downNodes} />
                  </div>
                )}

                {tab === "failure" && (
                  <div>
                    <PageHeader title="Failures & Quorum" icon={<ShieldAlert />} description={<span>Simulate node failures by clicking on them. Observe how the consistency level (e.g., <Tooltip text="Level requiring the majority of replicas (RF/2 + 1) to validate the operation.">QUORUM</Tooltip>) allows the cluster to continue functioning even if some nodes are offline.</span>} />
                    <FailureSimulator nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} selectedUser={selectedUser} rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} consistency={consistency} downNodes={downNodes} setDownNodes={setDownNodes} />
                  </div>
                )}

                {tab === "writepath" && (
                  <div>
                    <PageHeader title="The Path of a Write" icon={<ArrowLeftRight />} description={<span>Visualize the exact path of your data: from the client to the coordinator node, then to the final replicas, including the <Tooltip text="Sequential append log guaranteeing the durability (on disk) of writes.">Commit Log</Tooltip> and the <Tooltip text="In-memory (RAM) structure buffering writes before flushing them to disk (SSTable).">Memtable</Tooltip>.</span>} />
                    <WritePath selectedUser={selectedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} consistency={consistency} autoPlayId={autoPlayId} downNodes={downNodes} />
                  </div>
                )}

                {tab === "deletepath" && (
                  <div>
                    <PageHeader title="Tombstones & Deletion" icon={<Trash2 />} description={<span>In Cassandra, a deletion does not immediately erase the data. It writes a <Tooltip text="Deletion marker allowing data to be erased in a distributed manner.">Tombstone</Tooltip>, a deletion marker that will be replicated like a normal write.</span>} />
                    <DeletePath selectedUser={selectedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} consistency={consistency} downNodes={downNodes} autoPlayId={autoDeleteId} />
                  </div>
                )}

                {tab === "updatepath" && (
                  <div>
                    <PageHeader title="Update (Upsert)" icon={<Edit2 />} description={<span>An update in Cassandra is technically identical to an insertion (<Tooltip text="Operation that inserts data if it doesn't exist, or updates it if it does.">Upsert</Tooltip>). The old data is overwritten by the new one (via the internal timestamps system).</span>} />
                    <UpdatePath selectedUser={selectedUser} updatedUser={updatedUser} nodes={filteredNodes} nodesWithTokens={filteredNodesWithTokens} rf={strategyConfig.rf} rfPerDc={strategyConfig.rfPerDc} strategy={strategyConfig.strategy} consistency={consistency} downNodes={downNodes} autoPlayId={autoUpdateId} />
                  </div>
                )}
              </>
            )}
          </FullScreenModal>
        )}
      </div>
    </div>
  );
}
