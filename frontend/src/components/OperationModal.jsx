import { useState } from "react";

/**
 * OperationModal — modal réutilisable pour :
 *  - type="edit"    → formulaire de modification
 *  - type="delete"  → confirmation de suppression
 */
export default function OperationModal({ type, user, onConfirm, onCancel, loading, error }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");

  const isDelete = type === "delete";

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(4px)"
  };

  const box = {
    background: "var(--bg-surface)", borderRadius: "var(--radius-xl)",
    padding: "2rem", width: 420, maxWidth: "90vw",
    boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
    border: `1px solid ${isDelete ? "var(--error-color)" : "var(--border-light)"}40`,
    animation: "modalIn 0.2s ease"
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <style>{`@keyframes modalIn { from { transform:scale(0.9); opacity:0; } to { transform:scale(1); opacity:1; } }`}</style>
      <div style={box}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{isDelete ? "🗑️" : "✏️"}</div>
            <h3 style={{ margin: 0, color: isDelete ? "var(--error-color)" : "var(--text-primary)", fontSize: "1.2rem" }}>
              {isDelete ? "Supprimer l'enregistrement" : "Modifier l'enregistrement"}
            </h3>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              Clé primaire : <strong style={{ fontFamily: "monospace", color: "var(--primary-color)" }}>{user?.user_id}</strong>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 20, padding: "0.25rem" }}>×</button>
        </div>

        {/* ✅ Erreur de consistance (UnavailableException simulée) */}
        {error && (
          <div style={{
            background: "var(--error-bg)",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            fontSize: 13,
            color: "#991b1b",
            marginBottom: "1.25rem",
            lineHeight: 1.5
          }}>
            ❌ {error}
          </div>
        )}

        {/* Contenu */}
        {isDelete ? (
          <div style={{ background: "var(--error-bg)", borderRadius: "var(--radius-md)", padding: "1rem 1.25rem", marginBottom: "1.5rem", border: "1px solid #fca5a5", fontSize: 14, color: "#991b1b", lineHeight: 1.6 }}>
            ⚠️ Cette action est <strong>irréversible</strong>. La donnée <strong>«{user?.user_id}»</strong> sera supprimée de tous les nœuds réplicas.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nom</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Nouveau nom" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email</label>
              <input className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="Nouveau email" />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn btn-outline">Annuler</button>
          <button
            onClick={() => isDelete ? onConfirm() : onConfirm({ name, email })}
            disabled={loading || (!isDelete && !name)}
            className="btn"
            style={{ background: isDelete ? "var(--error-color)" : "var(--primary-color)", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "..." : isDelete ? "Supprimer définitivement" : "Enregistrer les modifications"}
          </button>
        </div>

      </div>
    </div>
  );
}