import { useState, useRef } from "react";
import "./Tooltip.css";

export default function Tooltip({ children, text }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 200); // Léger délai
  };

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <span 
      className="tooltip-container"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <span className="tooltip-trigger">{children}</span>
      {visible && (
        <div className="tooltip-box">
          {text}
        </div>
      )}
    </span>
  );
}
