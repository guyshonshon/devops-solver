import { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import { RefreshCw } from "lucide-react";
import { labsApi } from "../lib/api";
import { LabCard } from "../components/LabCard";
import { CategoryChip, CATEGORY_CONFIG } from "../components/CategoryChip";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/Tooltip";
import { Category } from "../types";

const ALL_CATS: Category[] = ["linux", "git", "python", "homework"];

export function Dashboard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const countRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ["labs"],
    queryFn: labsApi.list,
    refetchInterval: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: labsApi.sync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labs"] }),
  });

  const total = labs.length;
  const solved = labs.filter((l) => l.solved).length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  useEffect(() => {
    if (isLoading) return;
    const targets = [total, solved, pct];
    const suffixes = ["", "", "%"];
    countRefs.current.forEach((el, i) => {
      if (!el) return;
      const proxy = { val: 0 };
      gsap.to(proxy, {
        val: targets[i], duration: 1, ease: "power2.out",
        onUpdate: () => { if (el) el.textContent = Math.round(proxy.val) + suffixes[i]; },
      });
    });
  }, [isLoading, total, solved]);

  const filtered = filter === "all" ? labs : labs.filter((l) => l.category === filter);

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

        {/* ── Hero header ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{ paddingTop: "80px", borderBottom: "1px solid var(--border)" }}
        >
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "44px 40px 36px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "32px", flexWrap: "wrap" }}>

              {/* Left */}
              <div>
                <p className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "10px" }}>
                  DevSecOps-22 · AI Solver
                </p>
                <h1 style={{ fontSize: "34px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "8px" }}>
                  Lab Dashboard
                </h1>
                <p className="font-mono" style={{ fontSize: "12px", color: "var(--text-2)" }}>
                  Solve with AI · visualize steps · replay anytime
                </p>
              </div>

              {/* Right — stats strip */}
              <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
                {[
                  { label: "Labs",     refIdx: 0, color: "#60a5fa" },
                  { label: "Solved",   refIdx: 1, color: "#34d399" },
                  { label: "Progress", refIdx: 2, color: "#a78bfa" },
                ].map(({ label, refIdx, color }, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 28px",
                      textAlign: "center",
                      borderRight: i < 2 ? "1px solid var(--border)" : "none",
                      background: "var(--surface)",
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: "24px", fontWeight: 700, color, lineHeight: 1, marginBottom: "5px" }}>
                      <span ref={(el) => { countRefs.current[refIdx] = el; }}>–</span>
                    </div>
                    <div className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            {total > 0 && (
              <div style={{ marginTop: "28px", height: "2px", background: "var(--surface-2)", borderRadius: "1px", overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981)" }}
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Filter row ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {/* All button */}
            <button
              onClick={() => setFilter("all")}
              className="font-mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "5px 12px", fontSize: "11px", fontWeight: 500, borderRadius: "6px",
                border: `1px solid ${filter === "all" ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                background: filter === "all" ? "rgba(59,130,246,0.1)" : "transparent",
                color: filter === "all" ? "#60a5fa" : "var(--text-2)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              All
              <span style={{ fontSize: "10px", opacity: 0.6 }}>{total}</span>
            </button>

            {ALL_CATS.map((cat) => {
              const count = labs.filter((l) => l.category === cat).length;
              const s = labs.filter((l) => l.category === cat && l.solved).length;
              return (
                <Tooltip key={cat}>
                  <TooltipTrigger asChild>
                    <span>
                      <CategoryChip category={cat} active={filter === cat} onClick={() => setFilter(filter === cat ? "all" : cat)} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{s}/{count} solved</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="font-mono"
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "6px 14px", fontSize: "11px",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: "6px", color: "var(--text-2)",
                  cursor: syncMutation.isPending ? "not-allowed" : "pointer",
                  opacity: syncMutation.isPending ? 0.5 : 1, transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}
              >
                <motion.div animate={syncMutation.isPending ? { rotate: 360 } : {}} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                  <RefreshCw size={12} />
                </motion.div>
                {syncMutation.isPending ? "Syncing" : "Sync"}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Re-scrape site for new labs</TooltipContent>
          </Tooltip>
        </motion.div>

        {/* ── Lab grid ────────────────────────────────────── */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "4px 40px 64px" }}>
          {isLoading ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "14px" }}>
              {filtered.map((lab, i) => <LabCard key={lab.slug} lab={lab} index={i} />)}
            </div>
          )}
        </div>

        {/* Toast */}
        <AnimatePresence>
          {syncMutation.isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="font-mono"
              style={{
                position: "fixed", bottom: "24px", right: "24px",
                padding: "10px 16px", fontSize: "12px",
                background: "var(--surface-2)", border: "1px solid rgba(52,211,153,0.3)",
                borderRadius: "8px", color: "#34d399",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              Synced · +{syncMutation.data?.added ?? 0} new
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "14px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div key={i}
          style={{ height: "108px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "72px 0" }}>
      <p className="font-mono" style={{ fontSize: "13px", color: "var(--text-2)" }}>No labs found</p>
      <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>Click Sync to load content</p>
    </div>
  );
}
