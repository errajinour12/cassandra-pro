import { useState } from "react";
import { Trash2, Edit2, AlertTriangle } from "lucide-react";

/**
 * OperationModal — reusable modal for:
 *  - type="edit"    → edit form
 *  - type="delete"  → delete confirmation
 */
export default function OperationModal({ type, user, onConfirm, onCancel, loading, error }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");

  const isDelete = type === "delete";

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(6px)",
    animation: "overlayFadeIn 0.3s ease-out forwards"
  };

  const box = {
    background: "var(--bg-surface)", borderRadius: "var(--radius-2xl)",
    padding: "2.5rem", width: 440, maxWidth: "90vw",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
    border: `1px solid ${isDelete ? "var(--error-border)" : "var(--border-light)"}`,
    animation: "modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <style>{`
        @keyframes overlayFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalSlideUp { 
          from { transform: translateY(30px) scale(0.95); opacity:0; } 
          to { transform: translateY(0) scale(1); opacity:1; } 
        }
      `}</style>
      <div style={box}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ marginBottom: 12, display: "inline-flex", padding: 10, borderRadius: 12, background: isDelete ? "var(--error-bg)" : "var(--primary-light)" }}>
              {isDelete ? <Trash2 size={24} color="var(--error-color)" /> : <Edit2 size={24} color="var(--primary-color)" />}
            </div>
            <h3 style={{ margin: 0, color: isDelete ? "var(--error-color)" : "var(--text-primary)", fontSize: "1.2rem" }}>
              {isDelete ? "Delete Record" : "Edit Record"}
            </h3>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              Primary Key: <strong style={{ fontFamily: "monospace", color: "var(--primary-color)" }}>{user?.user_id}</strong>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 20, padding: "0.25rem" }}>×</button>
        </div>

        {/* ✅ Consistency error (simulated UnavailableException) */}
        {error && (
          <div style={{
            background: "var(--error-bg)",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            fontSize: 13,
            color: "#991b1b",
            marginBottom: "1.25rem",
            lineHeight: 1.5,
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start"
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        {isDelete ? (
          <div style={{ background: "var(--error-bg)", borderRadius: "var(--radius-md)", padding: "1rem 1.25rem", marginBottom: "1.5rem", border: "1px solid #fca5a5", fontSize: 14, color: "#991b1b", lineHeight: 1.6, display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              This action is <strong>irreversible</strong>. The data <strong>"{user?.user_id}"</strong> will be deleted from all replica nodes.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Name</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="New name" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email</label>
              <input className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="New email" />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn btn-outline">Cancel</button>
          <button
            onClick={() => isDelete ? onConfirm() : onConfirm({ name, email })}
            disabled={loading || (!isDelete && !name)}
            className="btn"
            style={{ background: isDelete ? "var(--error-color)" : "var(--primary-color)", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "..." : isDelete ? "Delete Permanently" : "Save Changes"}
          </button>
        </div>

      </div>
    </div>
  );
}