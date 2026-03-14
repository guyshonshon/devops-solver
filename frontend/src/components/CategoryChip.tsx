import { motion } from "framer-motion";
import { Category } from "../types";

export const CATEGORY_CONFIG: Record<Category, {
  label: string;
  primary: string;
  text: string;
  bg: string;
  border: string;
  glow: string;
}> = {
  linux: {
    label: "Linux",
    primary: "#f59e0b",
    text:    "#fbbf24",
    bg:      "rgba(245,158,11,0.1)",
    border:  "rgba(245,158,11,0.28)",
    glow:    "rgba(245,158,11,0.12)",
  },
  git: {
    label: "Git",
    primary: "#10b981",
    text:    "#34d399",
    bg:      "rgba(16,185,129,0.1)",
    border:  "rgba(16,185,129,0.28)",
    glow:    "rgba(16,185,129,0.12)",
  },
  python: {
    label: "Python",
    primary: "#3b82f6",
    text:    "#60a5fa",
    bg:      "rgba(59,130,246,0.1)",
    border:  "rgba(59,130,246,0.28)",
    glow:    "rgba(59,130,246,0.12)",
  },
  homework: {
    label: "Homework",
    primary: "#8b5cf6",
    text:    "#a78bfa",
    bg:      "rgba(139,92,246,0.1)",
    border:  "rgba(139,92,246,0.28)",
    glow:    "rgba(139,92,246,0.12)",
  },
};

interface Props {
  category: Category;
  active?: boolean;
  onClick?: () => void;
}

export function CategoryChip({ category, active, onClick }: Props) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <motion.button
      onClick={onClick}
      whileHover={onClick ? { scale: 1.03 } : {}}
      whileTap={onClick ? { scale: 0.97 } : {}}
      className="font-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 11px",
        fontSize: "11px",
        fontWeight: 500,
        borderRadius: "6px",
        border: `1px solid ${active ? cfg.border : "#253047"}`,
        background: active ? cfg.bg : "transparent",
        color: active ? cfg.text : "#7a8fad",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: active ? cfg.primary : "#364a66",
          transition: "background 0.15s",
          display: "inline-block",
        }}
      />
      {cfg.label}
    </motion.button>
  );
}
