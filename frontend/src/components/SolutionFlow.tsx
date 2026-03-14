import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SolutionStep } from "../types";
import { Terminal } from "./Terminal";

interface Props {
  steps: SolutionStep[];
  autoPlay?: boolean;
  onComplete?: () => void;
}

const SPEEDS = [600, 1100, 2200]; // ms per step at 2x / 1x / 0.5x

export function SolutionFlow({ steps, autoPlay = false, onComplete }: Props) {
  const [current, setCurrent] = useState(autoPlay ? 0 : steps.length);
  const [playing, setPlaying] = useState(autoPlay);
  const [speedIdx, setSpeedIdx] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const delay = SPEEDS[speedIdx];
  const visible = steps.slice(0, current);
  const pct = steps.length > 0 ? (current / steps.length) * 100 : 0;

  useEffect(() => {
    if (!playing || current >= steps.length) {
      if (playing && current >= steps.length) { setPlaying(false); onComplete?.(); }
      return;
    }
    const t = setTimeout(() => setCurrent((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [playing, current, delay]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [current]);

  return (
    <div style={{ background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* Controls */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 16px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
      }}>
        {/* Play / Replay */}
        <button onClick={() => {
          if (current >= steps.length) { setCurrent(0); setPlaying(true); }
          else setPlaying((p) => !p);
        }}
          className="font-mono"
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", fontSize: "11px", fontWeight: 600,
            borderRadius: "5px", cursor: "pointer",
            background: playing ? "rgba(96,165,250,0.1)" : "rgba(52,211,153,0.1)",
            border: `1px solid ${playing ? "rgba(96,165,250,0.3)" : "rgba(52,211,153,0.3)"}`,
            color: playing ? "#60a5fa" : "#34d399",
          }}
        >
          {playing ? "⏸ Pause" : current >= steps.length ? "↺ Replay" : "▶ Play"}
        </button>

        {/* Step */}
        <button onClick={() => { setPlaying(false); setCurrent((c) => Math.min(c + 1, steps.length)); }}
          disabled={current >= steps.length}
          className="font-mono"
          style={{
            padding: "5px 10px", fontSize: "11px", borderRadius: "5px", cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)",
            opacity: current >= steps.length ? 0.35 : 1,
          }}
        >
          Step
        </button>

        {/* Reset */}
        <button onClick={() => { setCurrent(0); setPlaying(false); }}
          className="font-mono"
          style={{
            padding: "5px 10px", fontSize: "11px", borderRadius: "5px", cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)",
          }}
        >
          Reset
        </button>

        {/* Speed */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {["2x", "1x", "0.5x"].map((label, i) => (
            <button key={i} onClick={() => setSpeedIdx(i)}
              className="font-mono"
              style={{
                padding: "4px 8px", fontSize: "10px", borderRadius: "4px", cursor: "pointer",
                background: speedIdx === i ? "rgba(139,92,246,0.15)" : "transparent",
                border: `1px solid ${speedIdx === i ? "rgba(139,92,246,0.35)" : "var(--border)"}`,
                color: speedIdx === i ? "#a78bfa" : "var(--text-3)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "8px", minWidth: "40px", textAlign: "right" }}>
          {current}/{steps.length}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "2px", background: "var(--border)" }}>
        <motion.div style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)" }}
          animate={{ width: `${pct}%` }} transition={{ ease: "easeOut", duration: 0.25 }} />
      </div>

      {/* Timeline */}
      <div ref={scrollRef} style={{ padding: "16px", overflowY: "auto", minHeight: "240px", maxHeight: "580px" }}>
        <AnimatePresence initial={false}>
          {visible.map((step, i) => (
            <motion.div key={step.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "flex", gap: "12px", marginBottom: "12px" }}
            >
              {/* Number + connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 700,
                  background: step.status === "error" ? "rgba(248,113,113,0.15)" : step.status === "success" ? "rgba(52,211,153,0.15)" : "rgba(96,165,250,0.15)",
                  border: `1px solid ${step.status === "error" ? "rgba(248,113,113,0.4)" : step.status === "success" ? "rgba(52,211,153,0.4)" : "rgba(96,165,250,0.3)"}`,
                  color: step.status === "error" ? "#f87171" : step.status === "success" ? "#34d399" : "#60a5fa",
                  fontFamily: "JetBrains Mono, monospace",
                }}>
                  {i + 1}
                </div>
                {i < visible.length - 1 && (
                  <div style={{ width: "1px", flex: 1, minHeight: "12px", background: "var(--border)", marginTop: "4px" }} />
                )}
              </div>

              {/* Step card */}
              <div style={{ flex: 1, paddingBottom: i < visible.length - 1 ? "8px" : 0 }}>
                <Terminal
                  content={step.content} output={step.output}
                  type={step.type} title={step.title}
                  status={i === current - 1 && playing ? "running" : step.status}
                />
                {step.duration_ms != null && (
                  <div className="font-mono" style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-3)" }}>
                    {step.duration_ms}ms
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Done banner */}
        {current >= steps.length && steps.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="font-mono"
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 16px", borderRadius: "8px", fontSize: "12px",
              background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)",
              color: "#34d399",
            }}
          >
            <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#10b981", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>✓</span>
            Solution complete — {steps.length} steps
          </motion.div>
        )}
      </div>
    </div>
  );
}
