import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Github, Play, RotateCcw } from "lucide-react";
import { labsApi } from "../lib/api";
import { SolutionExecutionView } from "../components/SolutionExecutionView";
import { StatusBadge } from "../components/StatusBadge";
import { CATEGORY_CONFIG } from "../components/CategoryChip";
import { Switch } from "../components/ui/Switch";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/Tooltip";
import { Category } from "../types";

const TABS = ["overview", "solution"] as const;

export function LabDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "solution">("overview");
  const [execute, setExecute] = useState(false);
  const [ghResult, setGhResult] = useState<{ pr_url?: string; message?: string } | null>(null);

  const { data: lab, isLoading } = useQuery({
    queryKey: ["lab", slug],
    queryFn: () => labsApi.get(slug!),
    enabled: !!slug,
  });

  const solveMutation = useMutation({
    mutationFn: () => labsApi.solve(slug!, execute),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab", slug] });
      qc.invalidateQueries({ queryKey: ["labs"] });
      setTab("solution");
    },
  });

  const pushMutation = useMutation({
    mutationFn: () => labsApi.pushGitHub(slug!),
    onSuccess: setGhResult,
  });

  if (isLoading) return <PageLoading />;
  if (!lab) return (
    <div style={{ paddingTop: "100px", textAlign: "center" }} className="font-mono">
      <span style={{ color: "var(--text-2)", fontSize: "13px" }}>Lab not found</span>
    </div>
  );

  const cfg = CATEGORY_CONFIG[lab.category as Category] ?? CATEGORY_CONFIG.linux;
  const solution = lab.solution;
  const isSolved = lab.solution_status === "solved";

  return (
    <TooltipProvider>
      <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
        <div style={{ maxWidth: tab === "solution" ? "1400px" : "900px", margin: "0 auto", padding: "36px 40px 64px", transition: "max-width 0.25s ease" }}>

          {/* Breadcrumb */}
          <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-3)", marginBottom: "24px" }}>
            <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontFamily: "inherit", fontSize: "inherit", padding: 0, transition: "color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; }}>
              Dashboard
            </button>
            <span>/</span>
            <span style={{ color: cfg.text }}>{lab.category}</span>
            <span>/</span>
            <span style={{ color: "var(--text-2)" }}>{lab.slug}</span>
          </div>

          {/* Lab header card */}
          <div style={{
            background: "var(--surface)", border: `1px solid ${cfg.border}`,
            borderRadius: "12px", padding: "24px 28px", marginBottom: "24px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${cfg.primary}60, transparent)` }} />
            <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "3px", background: cfg.primary, borderRadius: "12px 0 0 12px" }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <div className="font-mono" style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  padding: "3px 9px", borderRadius: "4px",
                  background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
                  marginBottom: "10px",
                }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: cfg.primary, display: "inline-block" }} />
                  {lab.category} · {lab.subcategory}
                </div>
                <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", marginBottom: "6px", letterSpacing: "-0.01em" }}>{lab.title}</h1>
                {solution?.summary && (
                  <p className="font-mono" style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.6, maxWidth: "560px" }}>
                    {solution.summary}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <StatusBadge status={lab.solution_status} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={lab.url} target="_blank" rel="noreferrer" style={{
                      display: "flex", alignItems: "center", padding: "7px",
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: "6px", color: "var(--text-2)", textDecoration: "none",
                      transition: "border-color 0.15s, color 0.15s",
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Open source lab</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border)", marginBottom: "28px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="font-mono"
                style={{
                  padding: "9px 16px", fontSize: "12px", fontWeight: 500,
                  background: "none", border: "none", cursor: "pointer",
                  color: tab === t ? cfg.text : "var(--text-3)",
                  position: "relative", transition: "color 0.15s", textTransform: "capitalize",
                }}
                onMouseEnter={(e) => { if (tab !== t) e.currentTarget.style.color = "var(--text-2)"; }}
                onMouseLeave={(e) => { if (tab !== t) e.currentTarget.style.color = "var(--text-3)"; }}
              >
                {t}
                {t === "solution" && isSolved && (
                  <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "#34d399", marginLeft: "6px", verticalAlign: "middle" }} />
                )}
                {tab === t && (
                  <motion.div layoutId="tab-line"
                    style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: cfg.primary, borderRadius: "2px 2px 0 0" }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Overview */}
          <AnimatePresence mode="wait">
            {tab === "overview" && (
              <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                {/* Questions */}
                {lab.questions.length > 0 && (
                  <div style={{ marginBottom: "28px" }}>
                    <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "12px" }}>
                      Questions
                      <span style={{ padding: "1px 6px", borderRadius: "3px", background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text, fontSize: "9px", fontWeight: 700 }}>
                        {lab.questions.length}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {lab.questions.map((q) => (
                        <div key={q.id} style={{
                          display: "flex", alignItems: "flex-start", gap: "12px",
                          padding: "12px 16px", borderRadius: "8px",
                          background: "var(--surface)", border: "1px solid var(--border)",
                        }}>
                          <span className="font-mono" style={{ fontSize: "11px", fontWeight: 700, color: cfg.text, flexShrink: 0, paddingTop: "1px", width: "20px", textAlign: "right" }}>
                            {q.number}.
                          </span>
                          <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.55 }}>{q.full_text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px 24px" }}>
                  <div className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "16px" }}>
                    Actions
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    {!isSolved ? (
                      <motion.button
                        onClick={() => solveMutation.mutate()}
                        disabled={solveMutation.isPending || lab.solution_status === "solving"}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="font-mono"
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "9px 20px", fontSize: "12px", fontWeight: 600,
                          background: cfg.bg, border: `1px solid ${cfg.border}`,
                          borderRadius: "7px", color: cfg.text, cursor: "pointer",
                          opacity: solveMutation.isPending ? 0.7 : 1,
                          boxShadow: solveMutation.isPending ? `0 0 18px ${cfg.glow}` : "none",
                          transition: "box-shadow 0.3s",
                        }}
                      >
                        {solveMutation.isPending ? (
                          <motion.div style={{ width: "13px", height: "13px", border: `1.5px solid ${cfg.text}`, borderTopColor: "transparent", borderRadius: "50%" }}
                            animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
                        ) : <Play size={13} />}
                        {solveMutation.isPending ? "Solving..." : "Solve with AI"}
                      </motion.button>
                    ) : (
                      <motion.button onClick={() => setTab("solution")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="font-mono"
                        style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "9px 20px", fontSize: "12px", fontWeight: 600,
                          background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.28)",
                          borderRadius: "7px", color: "#34d399", cursor: "pointer",
                        }}
                      >
                        <RotateCcw size={13} /> View Solution
                      </motion.button>
                    )}

                    <Switch checked={execute} onCheckedChange={setExecute} label="Execute commands" color={cfg.primary} />

                    {isSolved && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className="font-mono"
                            style={{
                              display: "flex", alignItems: "center", gap: "7px",
                              padding: "8px 16px", fontSize: "11px", fontWeight: 500, marginLeft: "auto",
                              background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.28)",
                              borderRadius: "7px", color: "#60a5fa", cursor: "pointer",
                              opacity: pushMutation.isPending ? 0.6 : 1,
                            }}
                          >
                            <Github size={13} />
                            {pushMutation.isPending ? "Pushing..." : "Push to GitHub"}
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent>Create a PR with this solution</TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <AnimatePresence>
                    {(ghResult || solveMutation.isError) && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="font-mono"
                        style={{
                          marginTop: "14px", padding: "10px 14px", borderRadius: "6px", fontSize: "12px",
                          background: ghResult?.pr_url || !solveMutation.isError ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                          border: `1px solid ${ghResult?.pr_url || !solveMutation.isError ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                          color: ghResult?.pr_url || !solveMutation.isError ? "#34d399" : "#f87171",
                        }}
                      >
                        {ghResult?.pr_url ? <><a href={ghResult.pr_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>PR created: {ghResult.pr_url}</a></> : ghResult?.message ?? (solveMutation.error as Error)?.message}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Solution */}
            {tab === "solution" && (
              <motion.div key="solution" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {solution ? (
                  <SolutionExecutionView steps={solution.steps} />
                ) : (
                  <div style={{ textAlign: "center", padding: "64px 0", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
                    <p className="font-mono" style={{ fontSize: "13px", color: "var(--text-2)" }}>No solution yet</p>
                    <p className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>Go to Overview and click Solve with AI</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
}

function PageLoading() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "88px 40px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {[60, 160, 120].map((h, i) => (
        <motion.div key={i} style={{ height: h, borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)" }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}
