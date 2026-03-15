import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Check, SkipForward, SkipBack } from 'lucide-react';
import { SolutionStep } from '../types';
import { parseCodeLines, getActiveLines } from './execution/parseExecution';
import { SyntaxLine } from './execution/tokenize';
import { PythonSandbox } from './PythonSandbox';

// ── Timing ────────────────────────────────────────────────────────────────────
const LINE_MS  = 720;   // ms between code lines
const ENTER_MS = 450;   // ms pause before starting code lines
const SHOW_MS  = 1100;  // ms to show non-code steps before auto-advancing
const EXIT_MS  = 800;   // ms pause after last code line, before next step

// ── Step colours ──────────────────────────────────────────────────────────────
const SCFG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  explanation: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.28)', text: '#a78bfa', dot: '#8b5cf6' },
  code:        { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.28)',  text: '#60a5fa', dot: '#3b82f6' },
  command:     { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.28)',  text: '#fbbf24', dot: '#f59e0b' },
  git:         { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.28)',  text: '#34d399', dot: '#10b981' },
  docker:      { bg: 'rgba(14,165,233,0.08)',  border: 'rgba(14,165,233,0.28)',  text: '#38bdf8', dot: '#0ea5e9' },
  output:      { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.28)', text: '#94a3b8', dot: '#64748b' },
};
const sc = (t: string) => SCFG[t] ?? SCFG.output;

// ── State types ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'paused' | 'done';

interface ConsoleLine { id: string; text: string; kind: 'cmd' | 'out' | 'info' }

interface S {
  phase: Phase;
  stepIdx: number;
  lineIdx: number;         // -1 = step not started; >=0 = index in getActiveLines()
  completedSteps: Set<number>;
  vars: Record<string, string>;
  flash: Set<string>;      // variable names currently highlighted
  log: ConsoleLine[];
}

const INIT: S = {
  phase: 'idle', stepIdx: 0, lineIdx: -1,
  completedSteps: new Set(), vars: {}, flash: new Set(), log: [],
};

type A =
  | { t: 'PLAY' }
  | { t: 'PAUSE' }
  | { t: 'RESTART' }
  | { t: 'JUMP'; to: number }
  | { t: 'UNFLASH'; keys: string[] }
  | { t: 'RESTORE'; s: S }
  | { t: 'ADVANCE'; stepIdx: number; lineIdx: number; fin: boolean;
      completedStep?: number; vars?: Record<string, string>;
      flash?: string[]; log?: ConsoleLine[] };

let _uid = 0;
const uid = () => `cl${++_uid}`;

function reduce(s: S, a: A): S {
  switch (a.t) {
    case 'PLAY':
      if (s.phase === 'done') return { ...INIT, phase: 'playing' };
      return (s.phase === 'idle' || s.phase === 'paused') ? { ...s, phase: 'playing' } : s;
    case 'PAUSE':
      return s.phase === 'playing' ? { ...s, phase: 'paused' } : s;
    case 'RESTART':
      return { ...INIT };
    case 'JUMP':
      return { ...s, phase: 'paused', stepIdx: a.to, lineIdx: -1 };
    case 'RESTORE':
      return { ...a.s };
    case 'UNFLASH': {
      const flash = new Set(s.flash);
      a.keys.forEach(k => flash.delete(k));
      return { ...s, flash };
    }
    case 'ADVANCE': {
      const completedSteps = new Set(s.completedSteps);
      if (a.completedStep !== undefined) completedSteps.add(a.completedStep);
      const vars = a.vars ? { ...s.vars, ...a.vars } : s.vars;
      const flash = a.flash ? new Set([...s.flash, ...a.flash]) : s.flash;
      const log = a.log ? [...s.log, ...a.log] : s.log;
      return {
        ...s,
        phase: a.fin ? 'done' : s.phase,
        stepIdx: a.stepIdx, lineIdx: a.lineIdx,
        completedSteps, vars, flash, log,
      };
    }
  }
}

// ── Tick computation ──────────────────────────────────────────────────────────
// Runs inside setTimeout — all mutations happen via a single atomic ADVANCE dispatch.
// No setState inside another setState updater. StrictMode-safe via cancelled flag.

function evalSimple(expr: string, vars: Record<string, string>): string {
  try {
    const sub = expr.replace(/\b([a-zA-Z_]\w*)\b/g, m =>
      m in vars ? (/^-?\d+(\.\d+)?$/.test(vars[m]) ? vars[m] : JSON.stringify(vars[m])) : m
    );
    // Security: strip string literals then reject if any identifier remains
    // (guards against unreplaced names like `fetch`, `document`, `window`, etc.)
    const stripped = sub.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    if (/[a-zA-Z_$]/.test(stripped)) return expr;
    // eslint-disable-next-line no-new-func
    return String(new Function(`"use strict";return(${sub})`)());
  } catch { return expr; }
}

function doTick(s: S, steps: SolutionStep[], dispatch: (a: A) => void) {
  const { stepIdx, lineIdx, vars } = s;
  const step = steps[stepIdx];
  if (!step) { dispatch({ t: 'ADVANCE', stepIdx, lineIdx, fin: true }); return; }

  const isCode = step.type === 'code';
  const isTerm = step.type === 'command' || step.type === 'git' || step.type === 'docker';

  // ── Step intro (lineIdx === -1) ────────────────────────────────────────────
  if (lineIdx === -1) {
    if (!isCode) {
      const log: ConsoleLine[] = [];
      if (isTerm) {
        const pfx = step.type === 'git' ? '$ git ' : step.type === 'docker' ? '$ docker ' : '$ ';
        const cmd = step.type === 'git' ? step.content.replace(/^git\s+/, '') : step.content;
        log.push({ id: uid(), text: pfx + cmd, kind: 'cmd' });
      }
      if (step.output) {
        step.output.split('\n').filter(Boolean).forEach(l =>
          log.push({ id: uid(), text: l, kind: 'out' })
        );
      }
      const nxt = stepIdx + 1;
      const fin = nxt >= steps.length;
      dispatch({ t: 'ADVANCE', stepIdx: fin ? stepIdx : nxt, lineIdx: -1, fin,
        completedStep: stepIdx, log: log.length ? log : undefined });
      return;
    }

    // Code step: pre-populate example_inputs into vars before starting line animation.
    // This ensures derived assignments (e.g. num1 = float(num1_str)) can evaluate correctly.
    const active = getActiveLines(parseCodeLines(step.content));
    const preVars = step.example_inputs ? { ...vars, ...step.example_inputs } : undefined;
    if (!active.length) {
      const nxt = stepIdx + 1;
      const fin = nxt >= steps.length;
      dispatch({ t: 'ADVANCE', stepIdx: fin ? stepIdx : nxt, lineIdx: -1, fin, completedStep: stepIdx,
        vars: preVars });
      return;
    }
    dispatch({ t: 'ADVANCE', stepIdx, lineIdx: 0, fin: false, vars: preVars });
    return;
  }

  // ── Code line processing ───────────────────────────────────────────────────
  const active = getActiveLines(parseCodeLines(step.content));

  if (lineIdx >= active.length) {
    // All code lines done — emit any output NOT already emitted per-print-line
    const log: ConsoleLine[] = [];
    if (step.output) {
      const totalPrintLines = active.filter(l => l.category === 'print').length;
      const outputLines = step.output.split('\n').filter(Boolean);
      // Lines already emitted per-print — only emit the remainder (e.g. from inner function calls)
      outputLines.slice(totalPrintLines).forEach(l =>
        log.push({ id: uid(), text: l, kind: 'out' })
      );
    }
    const nxt = stepIdx + 1;
    const fin = nxt >= steps.length;
    dispatch({ t: 'ADVANCE', stepIdx: fin ? stepIdx : nxt, lineIdx: -1, fin,
      completedStep: stepIdx, log: log.length ? log : undefined });
    return;
  }

  const line = active[lineIdx];
  const newVars: Record<string, string> = {};
  const flash: string[] = [];
  const log: ConsoleLine[] = [];

  if (line.category === 'assign' && line.variable && line.valueExpr) {
    newVars[line.variable] = evalSimple(line.valueExpr, vars);
    flash.push(line.variable);
  } else if (line.category === 'augmented' && line.variable && line.valueExpr) {
    const existing = vars[line.variable] ?? '0';
    const opRaw = line.raw.match(/(\*\*=|\/\/=|>>=|<<=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/)?.[1] ?? '+=';
    const binOp = opRaw.slice(0, -1);
    newVars[line.variable] = evalSimple(`(${existing})${binOp}(${line.valueExpr})`, vars);
    flash.push(line.variable);
  } else if (line.category === 'input-assign' && line.variable) {
    // Use AI-provided example value if available, otherwise fall back to <input> placeholder
    const exampleVal = step.example_inputs?.[line.variable] ?? '<input>';
    newVars[line.variable] = exampleVal;
    flash.push(line.variable);
    if (line.prompt) {
      // Show the input prompt together with the example value, like a real terminal session
      log.push({ id: uid(), text: `> ${line.prompt}${exampleVal !== '<input>' ? exampleVal : ''}`, kind: 'info' });
    }
  } else if (line.category === 'print') {
    // Emit the corresponding output line immediately as this print statement executes
    const printsBefore = active.slice(0, lineIdx).filter(l => l.category === 'print').length;
    const outputLines = (step.output || '').split('\n').filter(Boolean);
    if (printsBefore < outputLines.length) {
      log.push({ id: uid(), text: outputLines[printsBefore], kind: 'out' });
    }
  }

  dispatch({
    t: 'ADVANCE', stepIdx, lineIdx: lineIdx + 1, fin: false,
    vars: Object.keys(newVars).length ? newVars : undefined,
    flash: flash.length ? flash : undefined,
    log: log.length ? log : undefined,
  });
}

function getDelay(s: S, steps: SolutionStep[]): number {
  const step = steps[s.stepIdx];
  if (!step) return LINE_MS;
  const isCode = step.type === 'code';
  if (s.lineIdx === -1) return isCode ? ENTER_MS : SHOW_MS;
  if (isCode) {
    const active = getActiveLines(parseCodeLines(step.content));
    if (s.lineIdx >= active.length) return EXIT_MS;
  }
  return LINE_MS;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      padding: 64, textAlign: 'center',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div className="font-mono" style={{ fontSize: 13, color: 'var(--text-3)' }}>No steps to visualize</div>
    </div>
  );
}

function IdleOverlay({ onPlay }: { onPlay: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        background: 'rgba(10,14,24,0.78)', backdropFilter: 'blur(3px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
      }}
    >
      <motion.button
        onClick={onPlay}
        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 32px', fontSize: 14, fontWeight: 700,
          fontFamily: 'inherit', borderRadius: 10, cursor: 'pointer',
          background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399',
          boxShadow: '0 0 40px rgba(52,211,153,0.1)',
        }}
      >
        <Play size={16} />
        Play walkthrough
      </motion.button>
      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
        Step through the solution line by line
      </div>
    </motion.div>
  );
}

function StepRail({ steps, stepIdx, completedSteps, dispatch }: {
  steps: SolutionStep[]; stepIdx: number; completedSteps: Set<number>; dispatch: (a: A) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 16px', overflowX: 'auto',
      background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', gap: 0,
    }}>
      {steps.map((step, idx) => {
        const cfg = sc(step.type);
        const isActive = idx === stepIdx;
        const isDone = completedSteps.has(idx);
        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <div style={{
                width: 16, height: 1, flexShrink: 0,
                background: isDone || idx <= stepIdx ? 'rgba(255,255,255,0.1)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            )}
            <button
              onClick={() => dispatch({ t: 'JUMP', to: idx })}
              title={`${idx + 1}. ${step.title || step.type}`}
              className="font-mono"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 10, fontWeight: isActive ? 700 : 500,
                whiteSpace: 'nowrap', flexShrink: 0,
                background: isActive ? cfg.bg : 'transparent',
                border: `1px solid ${isActive ? cfg.border : isDone ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                color: isActive ? cfg.text : isDone ? 'var(--text-2)' : 'var(--text-3)',
                transition: 'all 0.18s',
              }}
            >
              {isDone && !isActive
                ? <Check size={9} color="#34d399" />
                : <span style={{
                    width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: isActive ? cfg.dot : isDone ? '#34d399' : 'var(--border)',
                    transition: 'background 0.2s',
                  }} />
              }
              {idx + 1}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepHeader({ step, lineIdx, totalLines }: {
  step: SolutionStep; lineIdx: number; totalLines: number;
}) {
  const cfg = sc(step.type);
  return (
    <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span className="font-mono" style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 4,
          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
        }}>
          {step.type}
        </span>
        {step.type === 'code' && totalLines > 0 && (
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {lineIdx >= 0
              ? `line ${Math.min(lineIdx + 1, totalLines)} / ${totalLines}`
              : `${totalLines} lines`}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: step.description ? 6 : 0 }}>
        {step.title}
      </div>
      {step.description && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 2 }}>
          {step.description}
        </div>
      )}
    </div>
  );
}

function CodeView({ step, activeLineIdx, scrollRef }: {
  step: SolutionStep; activeLineIdx: number; scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const allLines = parseCodeLines(step.content);
  const activeLines = getActiveLines(allLines);

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', background: '#0a0e18', padding: '12px 0' }}>
      {allLines.map((line, rawIdx) => {
        const activePosOfLine = activeLines.indexOf(line);
        let lineState: 'active' | 'past' | 'future' = 'future';

        if (line.category === 'blank' || line.category === 'comment') {
          const firstFutureActive = activeLines[activeLineIdx];
          lineState = !firstFutureActive
            ? (activeLineIdx >= activeLines.length ? 'past' : 'future')
            : (line.n < firstFutureActive.n ? 'past' : 'future');
        } else if (activePosOfLine !== -1) {
          if (activeLineIdx < 0) lineState = 'future';
          else if (activePosOfLine < activeLineIdx) lineState = 'past';
          else if (activePosOfLine === activeLineIdx) lineState = 'active';
          else lineState = 'future';
        }

        const isActive = lineState === 'active';
        return (
          <div
            key={rawIdx}
            data-active={isActive ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'stretch', minHeight: 24,
              opacity: lineState === 'future' ? 0.28 : 1,
              background: isActive ? 'rgba(251,191,36,0.07)' : 'transparent',
              borderLeft: `2px solid ${isActive ? '#fbbf24' : 'transparent'}`,
              transition: 'opacity 0.22s, background 0.18s, border-color 0.18s',
            }}
          >
            <span className="font-mono" style={{
              width: 44, minWidth: 44, textAlign: 'right',
              paddingRight: 12, paddingLeft: 8,
              color: isActive ? 'rgba(251,191,36,0.6)' : 'rgba(120,140,170,0.35)',
              fontSize: 12, lineHeight: '24px', userSelect: 'none', flexShrink: 0,
              transition: 'color 0.18s',
            }}>
              {line.n}
            </span>
            <span className="font-mono" style={{
              fontSize: 13, lineHeight: '24px', whiteSpace: 'pre', paddingRight: 20, flex: 1,
            }}>
              {line.raw.length === 0 ? '\u00a0' : <SyntaxLine code={line.raw} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VarsPanel({ vars, flash }: { vars: Record<string, string>; flash: Set<string> }) {
  const entries = Object.entries(vars);
  return (
    <div style={{
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', height: '100%',
    }}>
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)', flexShrink: 0,
      }}>
        <div className="font-mono" style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          Variables
          {entries.length > 0 && (
            <span style={{
              padding: '1px 5px', borderRadius: 3,
              background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.28)',
              color: '#60a5fa', fontSize: 8, fontWeight: 700,
            }}>
              {entries.length}
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', paddingTop: 4 }}>
            no variables yet
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map(([name, value]) => {
              const isFlashing = flash.has(name);
              return (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 5,
                    padding: '5px 8px', borderRadius: 5, marginBottom: 3,
                    background: isFlashing ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${isFlashing ? 'rgba(251,191,36,0.3)' : 'transparent'}`,
                    transition: 'background 0.28s, border-color 0.28s',
                  }}
                >
                  <span className="font-mono" style={{ fontSize: 12, color: '#82aaff', fontWeight: 600 }}>{name}</span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>=</span>
                  <span className="font-mono" style={{ fontSize: 12, color: '#c3e88d', wordBreak: 'break-all' }}>{value}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function TerminalView({ step, isActive }: { step: SolutionStep; isActive: boolean }) {
  const cfg = sc(step.type);
  const prompt = step.type === 'git' ? '$ git ' : step.type === 'docker' ? '$ docker ' : '$ ';
  const cmd = step.type === 'git' ? step.content.replace(/^git\s+/, '') : step.content;

  return (
    <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
      <div style={{
        background: '#080c18', border: `1px solid ${cfg.border}`, borderRadius: 8, overflow: 'hidden',
        boxShadow: isActive ? `0 0 28px ${cfg.bg}` : 'none', transition: 'box-shadow 0.3s',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', background: 'rgba(255,255,255,0.025)',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
        }}>
          {['#f87171', '#fbbf24', '#34d399'].map((c, i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.4 }} />
          ))}
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>
            {step.title}
          </span>
          <span className="font-mono" style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            padding: '2px 7px', borderRadius: 3,
            background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
          }}>
            {step.type.toUpperCase()}
          </span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div className="font-mono" style={{ fontSize: 13, lineHeight: 1.65 }}>
            <span style={{ color: cfg.dot, opacity: 0.75, userSelect: 'none' }}>{prompt}</span>
            <span style={{ color: '#eeffff' }}>{cmd}</span>
          </div>
          {step.output && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.28, delay: 0.12 }}
              style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <pre className="font-mono" style={{
                fontSize: 12, color: '#7a8fad', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                lineHeight: 1.65, margin: 0,
              }}>
                {step.output}
              </pre>
            </motion.div>
          )}
        </div>
        {isActive && (
          <motion.div style={{ height: 2, background: 'transparent', originX: 0 }}>
            <motion.div
              style={{ height: '100%', background: cfg.dot }}
              initial={{ scaleX: 0 }} animate={{ scaleX: [0, 0.8, 1, 0.8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ExplanationView({ step }: { step: SolutionStep }) {
  const cfg = sc(step.type);
  return (
    <div style={{ padding: '22px 24px', flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '22px 26px', borderRadius: 8,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {step.content}
        </div>
        {step.output && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${cfg.border}` }}>
            <pre className="font-mono" style={{
              fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0,
            }}>
              {step.output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsolePanel({ lines }: { lines: ConsoleLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div style={{
      background: '#06090f', borderTop: '1px solid var(--border)',
      minHeight: 156, maxHeight: 220, overflowY: 'auto',
      padding: '10px 18px 14px', flexShrink: 0,
    }}>
      <div className="font-mono" style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--text-3)', marginBottom: 8,
      }}>
        Output
      </div>
      {lines.length === 0 ? (
        <div className="font-mono" style={{ fontSize: 11, color: 'rgba(120,140,170,0.35)', fontStyle: 'italic' }}>
          — waiting for output —
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {lines.map((line) => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="font-mono"
              style={{
                fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                color: line.kind === 'cmd' ? '#fbbf24' : line.kind === 'info' ? '#94a3b8' : '#c3e88d',
              }}
            >
              {line.text}
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      <div ref={endRef} />
    </div>
  );
}

// ── Step pre-processing ───────────────────────────────────────────────────────
// Merge 'explanation' type steps into the following step's description.
// This eliminates explanation as a separate animated stage — context is shown
// alongside each code/command step in the StepHeader description area.

function mergeExplanationSteps(raw: SolutionStep[]): SolutionStep[] {
  const out: SolutionStep[] = [];
  let pendingDesc: string | null = null;

  for (const step of raw) {
    if (step.type === 'explanation') {
      // Accumulate explanation text to inject into the next real step
      pendingDesc = pendingDesc ? `${pendingDesc}\n${step.content}` : step.content;
    } else {
      if (pendingDesc) {
        // Prepend explanation as context to this step's description
        const merged = step.description
          ? `${pendingDesc} — ${step.description}`
          : pendingDesc;
        out.push({ ...step, description: merged });
        pendingDesc = null;
      } else {
        out.push(step);
      }
    }
  }

  // If trailing explanation steps remain with no following step, attach as a
  // description to the last real step, or skip (no visual home for them).
  if (pendingDesc && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = {
      ...last,
      description: last.description ? `${last.description} — ${pendingDesc}` : pendingDesc,
    };
  }

  return out;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { steps: SolutionStep[] }

export function SolutionExecutionView({ steps: rawSteps }: Props) {
  // Merge explanation steps into adjacent real steps
  const steps = React.useMemo(() => mergeExplanationSteps(rawSteps), [rawSteps]);
  const [state, rawDispatch] = useReducer(reduce, INIT);

  // Stable ref to latest state — timer callbacks read from here, never stale
  const stateRef = useRef(state);
  stateRef.current = state;

  const codeScrollRef = useRef<HTMLDivElement>(null);

  // ── History tracking for step-back ────────────────────────────────────────
  const historyRef = useRef<S[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);

  // Wrap rawDispatch: save a deep copy of state before each ADVANCE, clear on restart
  const dispatch = useCallback((a: A) => {
    if (a.t === 'ADVANCE') {
      const curr = stateRef.current;
      historyRef.current.push({
        ...curr,
        completedSteps: new Set(curr.completedSteps),
        flash: new Set(curr.flash),
        log: [...curr.log],
      });
      setCanGoBack(true);
    } else if (a.t === 'RESTART' || (a.t === 'PLAY' && stateRef.current.phase === 'done')) {
      historyRef.current = [];
      setCanGoBack(false);
    }
    rawDispatch(a);
  }, [rawDispatch]);

  function handleStepBack() {
    if (historyRef.current.length === 0) return;
    if (stateRef.current.phase === 'playing') rawDispatch({ t: 'PAUSE' });
    const prev = historyRef.current.pop()!;
    rawDispatch({ t: 'RESTORE', s: prev });
    setCanGoBack(historyRef.current.length > 0);
  }

  // ── Auto-play timer ────────────────────────────────────────────────────────
  // StrictMode-safe: cancelled flag ensures only one tick fires per effect
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (steps.length === 0) {
      dispatch({ t: 'ADVANCE', stepIdx: 0, lineIdx: -1, fin: true });
      return;
    }

    let cancelled = false;
    const ms = getDelay(state, steps);

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (stateRef.current.phase !== 'playing') return;
      doTick(stateRef.current, steps, dispatch);
    }, ms);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // steps read via closure; stateRef always current — only re-schedule on these keys
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.stepIdx, state.lineIdx]);

  // ── Flash cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.flash.size === 0) return;
    const keys = [...state.flash];
    const t = setTimeout(() => dispatch({ t: 'UNFLASH', keys }), 900);
    return () => clearTimeout(t);
  }, [state.flash]);

  // ── Auto-scroll active code line into view ─────────────────────────────────
  useEffect(() => {
    const el = codeScrollRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state.lineIdx, state.stepIdx]);

  if (steps.length === 0) return <EmptyState />;

  const step = steps[state.stepIdx];
  const isCode = step?.type === 'code';
  const isTerm = step?.type === 'command' || step?.type === 'git' || step?.type === 'docker';
  const isExpl = !isCode && !isTerm;

  const activeLines = isCode && step ? getActiveLines(parseCodeLines(step.content)) : [];

  // Step forward: pause auto-play and advance one tick
  function handleStep() {
    if (state.phase === 'done') return;
    if (state.phase === 'playing') dispatch({ t: 'PAUSE' });
    doTick({ ...stateRef.current, phase: 'paused' }, steps, dispatch);
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', fontFamily: 'inherit',
    }}>

      {/* ── Controls ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => dispatch(state.phase === 'playing' ? { t: 'PAUSE' } : { t: 'PLAY' })}
          className="font-mono"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', fontSize: 11, fontWeight: 600,
            borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            background: state.phase === 'playing' ? 'rgba(96,165,250,0.1)' : 'rgba(52,211,153,0.1)',
            border: `1px solid ${state.phase === 'playing' ? 'rgba(96,165,250,0.3)' : 'rgba(52,211,153,0.3)'}`,
            color: state.phase === 'playing' ? '#60a5fa' : '#34d399',
          }}
        >
          {state.phase === 'playing' ? <Pause size={11} /> : <Play size={11} />}
          {state.phase === 'done' ? 'Replay' : state.phase === 'playing' ? 'Pause' : 'Play'}
        </button>

        <button
          onClick={handleStepBack}
          disabled={!canGoBack}
          title="Step back"
          className="font-mono"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 11px', fontSize: 11,
            borderRadius: 6, cursor: canGoBack ? 'pointer' : 'default',
            fontFamily: 'inherit', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-3)',
            opacity: canGoBack ? 1 : 0.35,
          }}
        >
          <SkipBack size={11} />
        </button>

        <button
          onClick={handleStep}
          disabled={state.phase === 'done'}
          className="font-mono"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 11px', fontSize: 11,
            borderRadius: 6, cursor: state.phase === 'done' ? 'default' : 'pointer',
            fontFamily: 'inherit', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-3)',
            opacity: state.phase === 'done' ? 0.35 : 1,
          }}
        >
          <SkipForward size={11} />
          Step
        </button>

        <button
          onClick={() => dispatch({ t: 'RESTART' })}
          className="font-mono"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 11px', fontSize: 11,
            borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)',
          }}
        >
          <RotateCcw size={11} />
        </button>

        <div className="font-mono" style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 11, color: 'var(--text-3)',
        }}>
          {state.phase === 'playing' && (
            <motion.span
              style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399' }}
              animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          {state.phase === 'done' && <Check size={11} color="#34d399" />}
          <span>
            {state.stepIdx + 1}/{steps.length} steps
            {isCode && state.lineIdx >= 0
              && ` · line ${Math.min(state.lineIdx + 1, activeLines.length)}/${activeLines.length}`}
          </span>
        </div>
      </div>

      {/* ── Step rail ── */}
      <StepRail
        steps={steps}
        stepIdx={state.stepIdx}
        completedSteps={state.completedSteps}
        dispatch={dispatch}
      />

      {/* ── Content (position:relative for idle overlay) ── */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1 }}>

        <AnimatePresence>
          {state.phase === 'idle' && (
            <IdleOverlay onPlay={() => dispatch({ t: 'PLAY' })} />
          )}
        </AnimatePresence>

        {/* Step panels */}
        <div style={{ display: 'flex', flex: 1, minHeight: 380 }}>

          {/* Left: step header + code/terminal/explanation */}
          <div style={{
            flex: isCode ? '0 0 65%' : '1',
            display: 'flex', flexDirection: 'column', minWidth: 0,
            borderRight: isCode ? '1px solid var(--border)' : 'none',
          }}>
            {step && (
              <StepHeader step={step} lineIdx={state.lineIdx} totalLines={activeLines.length} />
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <AnimatePresence mode="wait">
                {isCode && step && (
                  <motion.div
                    key={`code-${state.stepIdx}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
                  >
                    <CodeView
                      step={step}
                      activeLineIdx={state.lineIdx}
                      scrollRef={codeScrollRef as React.RefObject<HTMLDivElement>}
                    />
                  </motion.div>
                )}
                {isTerm && step && (
                  <motion.div
                    key={`term-${state.stepIdx}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}
                  >
                    <TerminalView step={step} isActive={state.phase === 'playing'} />
                  </motion.div>
                )}
                {isExpl && step && (
                  <motion.div
                    key={`exp-${state.stepIdx}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ flex: 1, overflow: 'auto' }}
                  >
                    <ExplanationView step={step} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: variable tracker (code steps only) */}
          {isCode && (
            <div style={{ flex: '0 0 35%', minWidth: 0, overflow: 'hidden' }}>
              <VarsPanel vars={state.vars} flash={state.flash} />
            </div>
          )}
        </div>

        {/* Console output */}
        <ConsolePanel lines={state.log} />

        {/* Python sandbox — code steps only */}
        {isCode && step && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <PythonSandbox step={step} />
          </div>
        )}
      </div>

      {/* Done banner */}
      <AnimatePresence>
        {state.phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="font-mono"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', fontSize: 12,
              background: 'rgba(52,211,153,0.07)', borderTop: '1px solid rgba(52,211,153,0.22)',
              color: '#34d399',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#10b981', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>
              ✓
            </span>
            Solution complete — {steps.length} step{steps.length !== 1 ? 's' : ''} visualized
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
