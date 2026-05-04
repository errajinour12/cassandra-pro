import { useState, useEffect } from "react";

export default function UpdatePath({ selectedUser, updatedUser, nodes, nodesWithTokens, rf, consistency, autoPlayId, downNodes = new Set() }) {
  const [step, setStep] = useState(0);
  const [isSuccess, setIsSuccess] = useState(true);

  // Explications pour chaque phase
  const stepDescriptions = [
    { 
      title: "Prêt à écrire", 
      desc: "Le client prépare l'envoi de la donnée. Dans Cassandra, le client peut se connecter à n'importe quel nœud du cluster, qui agira alors comme Coordinateur pour cette requête.",
      module: null
    },
    { 
      title: "Phase 1 : Partitionnement", 
      desc: "Le Client envoie la donnée au Coordinateur. Celui-ci hache la clé primaire (Murmur3) pour obtenir un Token. Grâce à ce Token, il sait exactement quel nœud est le propriétaire principal de cette donnée sur l'anneau.",
      module: "Partitionnement"
    },
    { 
      title: "Phase 2 : Réplication", 
      desc: `Le Coordinateur ne stocke pas forcément la donnée lui-même. Il la transfère en parallèle aux ${rf} nœuds réplicas responsables (selon votre Facteur de Réplication RF=${rf}).`,
      module: "Réplication"
    },
    { 
      title: "Phase 3 : Moteur de Stockage", 
      desc: "Sur CHAQUE réplica, la donnée est écrite simultanément : d'abord de manière séquentielle dans le CommitLog sur disque (pour ne jamais la perdre en cas de crash), puis dans la Memtable en RAM (pour des lectures ultra-rapides).",
      module: "Stockage Interne"
    },
    { 
      title: "Phase 4 : Consistance & Pannes", 
      desc: `Le Coordinateur attend les acquittements (ACKs) des réplicas. Avec une consistance ${consistency}, il n'a pas besoin d'attendre tout le monde ! Si un nœud est en panne ou lent, la requête peut quand même réussir si le Quorum est atteint.`,
      module: "Pannes & Quorum"
    },
    { 
      title: "Phase 5 : Résultat", 
      desc: isSuccess 
        ? "Le niveau de consistance requis a été atteint. Le Coordinateur renvoie l'acquittement global au Client. L'écriture est terminée avec succès ! Plus tard, la Memtable sera flushée en SSTable."
        : "ÉCHEC (UnavailableException). Le nombre de réplicas en ligne n'a pas permis d'atteindre le Quorum requis par la consistance. Le Coordinateur renvoie une erreur au Client.",
      module: "Terminé"
    }
  ];

  useEffect(() => {
    setStep(0);
  }, [selectedUser, updatedUser, rf, consistency, downNodes]);

  useEffect(() => {
    if (autoPlayId > 0) {
      playAnimation();
    }
  }, [autoPlayId]);

  const playAnimation = () => {
    setStep(0);
    setTimeout(() => setStep(1), 500);   // Partitionnement
    setTimeout(() => setStep(2), 5500);  // Réplication (après 5s)
    setTimeout(() => setStep(3), 10500); // Moteur (après 5s)
    setTimeout(() => setStep(4), 15500); // Consistance (après 5s)
    setTimeout(() => setStep(5), 20500); // Succès ou Échec (après 5s)
  };

  // ── Logique NTS avancée ──
  const isNts = consistency.includes("LOCAL") || consistency.includes("EACH") || (typeof rf !== "number");
  // Remarque: Dans App.jsx, pour NTS on passait strategyConfig.
  // Mais ici on n'a pas strategyConfig en prop dans l'ancienne version.
  // On va utiliser une heuristique ou modifier pour bien supporter rfPerDc si dispo.
  
  const getReplicas = () => {
    if (!nodesWithTokens || nodesWithTokens.length === 0 || !selectedUser) return [];

    const t = BigInt(selectedUser.token);

    // Détection NTS via un prop caché ou via le fait que rf est un objet (si rfPerDc est passé)
    // Comme App.jsx passe { rf, strategyConfig... } on doit trouver si c'est NTS.
    // En fait l'ancien composant n'a pas "strategy" ni "rfPerDc". 
    // On va recalculer depuis nodesWithTokens si on voit plusieurs DCs.
    const dcs = [...new Set(nodesWithTokens.map(n => n.datacenter || "dc1"))];
    const isActuallyNts = dcs.length > 1;

    if (!isActuallyNts) {
      const allTokens = [];
      nodesWithTokens.forEach((node, nodeIdx) =>
        (node.tokens || []).forEach(tok => allTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }))
      );
      allTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
      if (!allTokens.length) return [];

      let primaryIdx = allTokens.findIndex(tok => t <= BigInt(tok.token));
      if (primaryIdx === -1) primaryIdx = 0;

      const replicas = [], seen = new Set();
      let curr = primaryIdx;
      while (replicas.length < rf && replicas.length < nodes.length) {
        const node = allTokens[curr];
        if (!seen.has(node.nodeIdx)) { seen.add(node.nodeIdx); replicas.push(node); }
        curr = (curr + 1) % allTokens.length;
      }
      return replicas;
    }

    // NTS : calcul indépendant par DC
    const replicas = [];
    const byDc = {};
    nodesWithTokens.forEach((node, nodeIdx) => {
      const dc = node.datacenter || "dc1";
      if (!byDc[dc]) byDc[dc] = [];
      byDc[dc].push({ node, nodeIdx });
    });

    // En NTS simulé ici, on suppose RF=3 par DC
    const simulatedRfPerDc = rf || 3;

    Object.entries(byDc).forEach(([dc, dcNodes]) => {
      const dcTokens = [];
      dcNodes.forEach(({ node, nodeIdx }) => {
        (node.tokens || []).forEach(tok => dcTokens.push({ token: tok, nodeIdx, address: node.address, datacenter: node.datacenter }));
      });
      if (!dcTokens.length) return;

      dcTokens.sort((a, b) => (BigInt(a.token) < BigInt(b.token) ? -1 : 1));
      
      let primaryIdx = dcTokens.findIndex(tok => t <= BigInt(tok.token));
      if (primaryIdx === -1) primaryIdx = 0;

      const dcReplicas = [];
      const seen = new Set();
      let curr = primaryIdx;
      
      while (dcReplicas.length < simulatedRfPerDc && dcReplicas.length < dcNodes.length) {
        const node = dcTokens[curr];
        if (!seen.has(node.nodeIdx)) {
          seen.add(node.nodeIdx);
          dcReplicas.push(node);
        }
        curr = (curr + 1) % dcTokens.length;
      }
      replicas.push(...dcReplicas);
    });

    return replicas;
  };

  const replicas = getReplicas();
  const dcs = [...new Set(replicas.map(r => r.datacenter || "dc1"))];
  const isActualNts = dcs.length > 1;

  const getRequiredAcks = () => {
    if (!isActualNts) {
      if (consistency === "ONE") return 1;
      if (consistency === "ALL") return rf;
      return Math.floor(rf / 2) + 1;
    }
    if (consistency === "LOCAL_QUORUM") { return Math.floor(rf / 2) + 1; }
    if (consistency === "LOCAL_ONE") return 1;
    if (consistency === "EACH_QUORUM") { return dcs.length * (Math.floor(rf / 2) + 1); }
    if (consistency === "ALL") return replicas.length;
    if (consistency === "ONE") return 1;
    return Math.floor(rf / 2) + 1;
  };
  const requiredAcks = getRequiredAcks();

  // Calcul du succès en fonction des nœuds en panne
  useEffect(() => {
    let upReplicasCount = 0;
    replicas.forEach(r => {
      const isSimDown = downNodes.has(r.address);
      const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
      if (!isSimDown && !isReallyDown) {
        upReplicasCount++;
      }
    });
    setIsSuccess(upReplicasCount >= requiredAcks);
  }, [replicas, downNodes, requiredAcks, nodes]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "2rem", minHeight: "750px", alignItems: "stretch" }}>
      
      {/* Colonne Gauche : Narratif et Explications */}
      <div className="card" style={{ display: "flex", flexDirection: "column", background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-light)" }}>
        <h2 style={{ margin: "0 0 1rem", color: "var(--text-primary)", fontSize: "1.4rem" }}>L'Anatomie d'une Modification</h2>
        <p style={{ margin: "0 0 2rem", color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
          Découvrez comment Cassandra gère la <strong>Modification (LWW)</strong>, la <strong>Réplication</strong> et la <strong>Consistance</strong> pour la donnée <span style={{color: "#f59e0b", fontWeight: "bold"}}>{(updatedUser || selectedUser)?.user_id}</span>.
        </p>

        <button className="btn btn-primary" onClick={playAnimation} style={{ padding: "1rem", fontSize: "15px", marginBottom: "2rem", width: "100%", background: "#f59e0b", borderColor: "#f59e0b" }}>
          ▶ Lancer l'Animation Complète
        </button>

        {/* Panneau d'explication dynamique */}
        <div style={{ 
          flex: 1, 
          background: step > 0 ? "#fffbeb" : "var(--bg-surface)", 
          border: step > 0 ? "1px solid #f59e0b" : "1px solid var(--border-light)",
          borderRadius: "var(--radius-lg)", 
          padding: "1.5rem",
          transition: "all 0.3s ease",
          boxShadow: step > 0 ? "0 4px 12px rgba(245, 158, 11, 0.15)" : "none"
        }}>
          {stepDescriptions[step].module && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Concept : {stepDescriptions[step].module}
            </div>
          )}
          <h3 style={{ margin: "0 0 1rem", color: "#d97706", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ background: "#f59e0b", color: "white", width: "24px", height: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "12px" }}>
              {step}
            </span>
            {stepDescriptions[step].title}
          </h3>
          <p style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.6, fontSize: "14px" }}>
            {stepDescriptions[step].desc}
          </p>

          {/* Mini-Stats en fonction de l'étape */}
          {step === 4 && (
             <div style={{ marginTop: "1.5rem", padding: "1rem", background: "white", borderRadius: "var(--radius-md)", border: "1px dashed var(--warning-color)" }}>
               <strong style={{fontSize: "13px", color: "var(--warning-color)"}}>Consistance {consistency}</strong>
               <div style={{fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px"}}>
                 Le Coordinateur a besoin de <strong>{requiredAcks} ACK(s)</strong> sur {rf} pour considérer l'écriture réussie.
               </div>
             </div>
          )}
        </div>
      </div>

      {/* Colonne Droite : Le Cluster Animé */}
      <div className="card" style={{ position: "relative", background: "var(--bg-app)", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        <div style={{ width: "100%", height: "100%", position: "relative", maxWidth: "800px", maxHeight: "750px", minHeight: "600px" }}>
          
          {/* SVG Lignes de connexion */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}>
            {/* Ligne Client -> Coordinateur */}
            <path d="M 10% 50% L 35% 50%" stroke="var(--border-light)" strokeWidth="3" strokeDasharray="5,5" fill="none" />
            
            {/* Lignes Coordinateur -> Replicas */}
            {replicas.map((r, i) => {
              const startX = "35%";
              const startY = "50%";
              const endX = "75%";
              const endY = `${8 + (i * (84 / (replicas.length === 1 ? 1 : replicas.length - 1)))}%`; // Distribuer verticalement
              return (
                <line key={`line-${i}`} x1={startX} y1={startY} x2={endX} y2={endY} stroke="var(--border-light)" strokeWidth="2" strokeDasharray="4,4" />
              );
            })}
          </svg>

          {/* Noeuds du système */}
          
          {/* 1. Client */}
          <div className="system-node client-node" style={{ top: "50%", left: "10%" }}>
            <div style={{ fontSize: "2rem" }}>💻</div>
            <div className="node-label">Client</div>
          </div>

          {/* 2. Coordinateur */}
          <div className={`system-node coord-node ${step >= 1 && step < 5 ? 'active-node' : ''}`} style={{ top: "50%", left: "35%" }}>
            <div style={{ fontSize: "2.5rem" }}>⚙️</div>
            <div className="node-label">Coordinateur</div>
            {step === 1 && <span className="status-badge ping-badge">Hashing (Murmur3)</span>}
            {step === 4 && <span className="status-badge" style={{background:"var(--warning-color)", color:"white"}}>Attente ACKs...</span>}
          </div>

          {/* 3. Replicas */}
          {replicas.map((r, i) => {
            const topPos = `${8 + (i * (84 / (replicas.length === 1 ? 1 : replicas.length - 1)))}%`;
            const isActive = step >= 2 && step <= 4;
            const isWriting = step === 3;
            
            const isSimDown = downNodes.has(r.address);
            const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
            const isDown = isSimDown || isReallyDown;
            const isDcPrimary = isActualNts && (i === 0 || replicas[i - 1].datacenter !== r.datacenter);

            return (
              <div key={r.nodeIdx} className={`system-node replica-node ${isActive && !isDown ? 'active-node' : ''}`} style={{ 
                top: topPos, left: "75%", width: "160px", transform: "translateY(-50%)",
                borderColor: isDown ? "var(--error-color)" : "var(--border-light)",
                background: isDown ? "var(--error-bg)" : "var(--bg-surface)",
                opacity: isDown ? 0.7 : 1
              }}>
                <div style={{ fontSize: "1.5rem" }}>{isDown ? "🔥" : "🖥️"}</div>
                <div className="node-label" style={{ color: isDown ? "var(--error-color)" : "var(--text-primary)" }}>Nœud {r.nodeIdx + 1} <span style={{fontSize: 10, color: "var(--text-tertiary)"}}>{isActualNts ? `(${r.datacenter})` : ""}</span></div>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{isActualNts ? (isDcPrimary ? "(Primaire Local)" : "(Réplica Local)") : (i === 0 ? "(Primaire)" : "(Réplica)")}</div>
                
                {/* Moteur interne (Memtable/CommitLog) visible à l'étape 3 */}
                {!isDown && (
                  <div className={`internal-engine ${step >= 3 ? 'show-engine' : ''}`}>
                    <div className={`engine-part ${isWriting ? 'flash-write' : ''}`} style={{ borderColor: step >=3 ? '#fde047' : '', background: step >=3 ? '#fef9c3' : '', color: step >=3 ? '#854d0e' : '' }}>💽 CommitLog</div>
                    <div className={`engine-part ${isWriting ? 'flash-write' : ''}`} style={{ borderColor: step >=3 ? '#fde047' : '', background: step >=3 ? '#fef9c3' : '', color: step >=3 ? '#854d0e' : '' }}>🧠 Memtable : {(updatedUser || selectedUser)?.user_id} ✓</div>
                  </div>
                )}

                {isDown && <span className="status-badge error-badge" style={{bottom: "-15px"}}>PANNE</span>}
              </div>
            );
          })}


          {/* --- ANIMATIONS DES DONNÉES --- */}

          {/* Phase 1: Client -> Coordinateur */}
          <div className={`data-packet ${step === 1 ? 'anim-c-to-coord' : 'hidden'}`} style={{ '--start-x': '10%', '--start-y': '50%', '--end-x': '35%', '--end-y': '50%' }}>
            ✉️ <span>{(updatedUser || selectedUser)?.user_id}</span>
          </div>

          {/* Phase 2: Coordinateur -> Replicas */}
          {replicas.map((r, i) => {
            const endY = `${8 + (i * (84 / (replicas.length === 1 ? 1 : replicas.length - 1)))}%`;
            return (
              <div key={`p2-${i}`} className={`data-packet packet-copy ${step === 2 ? 'anim-coord-to-rep' : 'hidden'}`} style={{ '--start-x': '35%', '--start-y': '50%', '--end-x': '75%', '--end-y': endY }}>
                ✉️
              </div>
            );
          })}

          {/* Phase 4: Replicas -> Coordinateur (ACKs) */}
          {replicas.map((r, i) => {
            const startY = `${8 + (i * (84 / (replicas.length === 1 ? 1 : replicas.length - 1)))}%`;
            const isSimDown = downNodes.has(r.address);
            const isReallyDown = nodes.find(n => n.address === r.address)?.is_up === false;
            const isDown = isSimDown || isReallyDown;
            
            // Ne pas envoyer d'ACK si le noeud est en panne
            if (isDown) return null;

            return (
              <div key={`p4-${i}`} className={`data-packet ack-packet ${step === 4 ? 'anim-rep-to-coord' : 'hidden'}`} style={{ '--start-x': '75%', '--start-y': startY, '--end-x': '35%', '--end-y': '50%' }}>
                ✅ ACK
              </div>
            );
          })}

          {/* Phase 5: Coordinateur -> Client (Final ACK/ERR) */}
          {isSuccess ? (
            <div className={`data-packet ack-packet ${step === 5 ? 'anim-coord-to-c' : 'hidden'}`} style={{ '--start-x': '35%', '--start-y': '50%', '--end-x': '10%', '--end-y': '50%' }}>
              🎉 SUCCÈS
            </div>
          ) : (
            <div className={`data-packet ${step === 5 ? 'anim-coord-to-c' : 'hidden'}`} style={{ '--start-x': '35%', '--start-y': '50%', '--end-x': '10%', '--end-y': '50%', borderColor: "var(--error-color)", background: "var(--error-bg)", color: "var(--error-color)" }}>
              ❌ ERREUR
            </div>
          )}

        </div>
      </div>
    </div>
  );
}