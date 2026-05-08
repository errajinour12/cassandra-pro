import { Info } from "lucide-react";

export default function PageHeader({ title, icon, description }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <h1 className="page-title">
        {icon && <span style={{ color: "var(--primary-color)" }}>{icon}</span>}
        {title}
      </h1>
      {description && (
        <div className="page-description">
          <Info size={16} style={{ color: "var(--primary-color)", flexShrink: 0, marginTop: 4, marginRight: 8, float: "left" }} />
          {description}
        </div>
      )}
    </div>
  );
}
