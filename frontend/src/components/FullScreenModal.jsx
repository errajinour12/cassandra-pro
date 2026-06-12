import { X } from "lucide-react";
import "./FullScreenModal.css";

export default function FullScreenModal({ children, onClose }) {
  // Prevent clicks inside the modal from closing it
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div className="fs-modal-overlay" onClick={onClose}>
      <div className="fs-modal-content" onClick={handleContentClick}>
        <button className="fs-modal-close" onClick={onClose} aria-label="Close">
          <X size={28} />
        </button>
        <div className="fs-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
