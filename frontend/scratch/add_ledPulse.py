import os

css_file = r"c:\Users\pc\OneDrive\Documents\simcassandra\cassandra-pro\frontend\src\index.css"

with open(css_file, "a", encoding="utf-8") as f:
    f.write("""
/* ── Missing LED Pulse Keyframe ── */
@keyframes ledPulse {
  0%, 100% { opacity: 1; transform: scale(1.3); }
  50% { opacity: 0.3; transform: scale(1); }
}
""")

print("Added ledPulse keyframe to index.css")
