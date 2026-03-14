import { motion } from "framer-motion";

interface Props {
  content: string;
  output?: string;
  type: string;
  title: string;
  status: string;
}

const TYPE_META: Record<string, { color: string; prompt: string; label: string }> = {
  command:     { color: "#fbbf24", prompt: "$ ",      label: "BASH"    },
  git:         { color: "#34d399", prompt: "git ",    label: "GIT"     },
  code:        { color: "#60a5fa", prompt: ">>> ",    label: "PYTHON"  },
  docker:      { color: "#22d3ee", prompt: "docker ", label: "DOCKER"  },
  explanation: { color: "#a78bfa", prompt: "",        label: "NOTE"    },
  output:      { color: "#7a8fad", prompt: "",        label: "OUTPUT"  },
};

const DEFAULT_META = TYPE_META.explanation;

export function Terminal({ content, output, type, title, status }: Props) {
  const meta = TYPE_META[type] ?? DEFAULT_META;
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div style={{
      background: "#0a0e18",
      border: `1px solid ${isRunning ? meta.color + "40" : isError ? "rgba(248,113,113,0.25)" : "var(--border)"}`,
      borderRadius: "8px",
      overflow: "hidden",
      fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace",
      fontSize: "13px",
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: isRunning ? `0 0 16px ${meta.color}18` : "none",
    }}>
      {/* Chrome bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 14px",
        background: "#0d1220",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", gap: "5px" }}>
          {["#f87171", "#fbbf24", "#34d399"].map((c, i) => (
            <div key={i} style={{ width: "9px", height: "9px", borderRadius: "50%", background: c, opacity: 0.45 }} />
          ))}
        </div>
        <span style={{ flex: 1, textAlign: "center", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.05em" }}>
          {title}
        </span>
        <span style={{
          fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
          padding: "2px 7px", borderRadius: "3px",
          color: meta.color, background: meta.color + "15", border: `1px solid ${meta.color}30`,
        }}>
          {meta.label}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: "14px" }}>
        {type === "explanation" ? (
          <p style={{ color: "#8b97b0", lineHeight: 1.65 }}>{content}</p>
        ) : (
          <div style={{ display: "flex", gap: "8px" }}>
            <span style={{ color: meta.color, opacity: 0.55, userSelect: "none", flexShrink: 0 }}>{meta.prompt}</span>
            <pre style={{ color: "#c9d4e0", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6, margin: 0 }}>
              {content}
            </pre>
          </div>
        )}

        {output && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}
          >
            <div style={{ fontSize: "9px", color: "var(--text-3)", letterSpacing: "0.15em", marginBottom: "6px" }}>OUTPUT</div>
            <pre style={{
              color: "#7a8fad", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all",
              lineHeight: 1.55, maxHeight: "140px", overflowY: "auto", margin: 0,
            }}>
              {output}
            </pre>
          </motion.div>
        )}
      </div>

      {/* Status bar */}
      {isRunning && (
        <motion.div style={{ height: "2px", background: "var(--border)", originX: 0 }}>
          <motion.div
            style={{ height: "100%", background: meta.color }}
            initial={{ scaleX: 0 }} animate={{ scaleX: [0, 0.7, 1, 0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}
      {isSuccess && <div style={{ height: "2px", background: "linear-gradient(90deg, transparent, #34d399, transparent)" }} />}
      {isError   && <div style={{ height: "2px", background: "linear-gradient(90deg, transparent, #f87171, transparent)" }} />}
    </div>
  );
}
