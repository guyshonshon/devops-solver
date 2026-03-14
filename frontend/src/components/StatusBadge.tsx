import { motion } from "framer-motion";

const CONFIG: Record<string, { label: string; color: string; bg: string; border: string; pulse: boolean }> = {
  unsolved: { label: "Unsolved", color: "#7a8fad", bg: "rgba(122,143,173,0.08)", border: "rgba(122,143,173,0.2)",  pulse: false },
  pending:  { label: "Pending",  color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)", pulse: false },
  solving:  { label: "Solving",  color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)", pulse: true  },
  solved:   { label: "Solved",   color: "#34d399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.25)", pulse: false },
  failed:   { label: "Failed",   color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", pulse: false },
};

const FALLBACK = CONFIG.unsolved;

interface Props {
  status: string;
  size?: "xs" | "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: Props) {
  const cfg = CONFIG[status] ?? FALLBACK;
  const px = size === "xs" ? "3px 7px" : size === "sm" ? "4px 9px" : "4px 11px";
  const fs = size === "xs" ? "10px" : size === "sm" ? "10px" : "11px";

  return (
    <span
      className="font-mono inline-flex items-center gap-1.5 rounded"
      style={{ padding: px, fontSize: fs, fontWeight: 500, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <motion.span
        style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }}
        animate={cfg.pulse ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      {cfg.label}
    </span>
  );
}
