import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Lab } from "../types";
import { StatusBadge } from "./StatusBadge";
import { CATEGORY_CONFIG } from "./CategoryChip";

interface Props { lab: Lab; index: number; }

export function LabCard({ lab, index }: Props) {
  const navigate = useNavigate();
  const cfg = CATEGORY_CONFIG[lab.category] ?? CATEGORY_CONFIG.linux;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/labs/${lab.slug}`)}
      whileTap={{ scale: 0.985 }}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "18px 20px",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = cfg.border;
        e.currentTarget.style.boxShadow = `0 4px 20px ${cfg.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* subtle category top-line */}
      <div style={{
        position: "absolute", top: 0, left: "25%", right: "25%", height: "1px",
        background: `linear-gradient(90deg, transparent, ${cfg.primary}50, transparent)`,
      }} />

      {/* row 1: category chip + status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div className="font-mono" style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          padding: "3px 8px", fontSize: "10px", fontWeight: 600,
          letterSpacing: "0.06em", textTransform: "uppercase",
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          borderRadius: "4px", color: cfg.text,
        }}>
          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
          {cfg.label}
        </div>
        <StatusBadge status={lab.solution_status} size="xs" />
      </div>

      {/* title */}
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: 1.45, marginBottom: "5px" }}>
        {lab.title}
      </h3>

      {/* subcategory */}
      <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)" }}>
        {lab.subcategory ?? "content"}
      </p>
    </motion.article>
  );
}
