import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Check } from 'lucide-react';
import { SolutionStep } from '../types';
import { parseCodeLines, getActiveLines, ParsedLine } from './execution/parseExecution';
import { SyntaxLine } from './execution/tokenize';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_DELAY = 650;
const STEP_INTRO_DELAY = 900;

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'paused' | 'done';

interface VariableEntry {
  name: string;
  value: string;
  updatedAt: number; // timestamp for flash animation
}

// ─── Step bar colours ─────────────────────────────────────────────────────────

const STEP_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  explanation: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)', text: '#a78bfa' },
  code:        { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  text: '#60a5fa' },
  command:     { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.35)',  text: '#fbbf24' },
  git:         { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.35)',  text: '#34d399' },
  docker:      { bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.35)',  text: '#38bdf8' },
  output:      { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: '#94a3b8' },
};

function typeColor(type: string) {
  return STEP_TYPE_COLORS[type] ?? STEP_TYPE_COLORS.output;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluateSimple(expr: string, vars: Record<string, string>): string {
  // Very lightweight: substitute known variables and try eval on numeric exprs
  try {
    // Replace variable names in the expression with their current values
    const substituted = expr.replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
      if (match in vars) {
        const v = vars[match];
        // wrap strings in quotes if they don't look numeric
        return /^-?\d+(\.\d+)?$/.test(v) ? v : JSON.stringify(v);
      }
      return match;
    });
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${substituted});`)();
    return String(result);
  } catch {
    return expr;
  }
}

function buildPrintOutput(printArgs: string | undefined, vars: Record<string, string>): string {
  if (!printArgs) return '';
  return evaluateSimple(printArgs, vars);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CodeLineRowProps {
  line: ParsedLine;
  state: 'active' | 'past' | 'future';
  isActive: boolean;
}

function CodeLineRow({ line, state, isActive }: CodeLineRowProps) {
  const opacity = state === 'future' ? 0.35 : 1;
  const bg = state === 'active' ? 'rgba(251,191,36,0.08)' : 'transparent';
  const borderLeft = state === 'active' ? '2px solid #fbbf24' : '2px solid transparent';

  return (
    <div
      data-active={isActive ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        opacity,
        background: bg,
        borderLeft,
        transition: 'opacity 0.25s, background 0.2s',
        minHeight: '22px',
      }}
    >
      <span
        className="font-mono"
        style={{
          width: '42px',
          minWidth: '42px',
          textAlign: 'right',
          paddingRight: '12px',
          paddingLeft: '8px',
          color: 'var(--text-3)',
          fontSize: '12px',
          lineHeight: '22px',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {line.n}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: '13px',
          lineHeight: '22px',
          whiteSpace: 'pre',
          paddingRight: '16px',
          flex: 1,
        }}
      >
        {/* Preserve indentation by rendering leading spaces as-is, then syntax highlight */}
        {line.raw.length === 0 ? '\u00a0' : <SyntaxLine code={line.raw} />}
      </span>
    </div>
  );
}

// ─── State panel ──────────────────────────────────────────────────────────────

interface StatePanelProps {
  variables: Record<string, string>;
  flashMap: Record<string, number>;
  stepTitle: string;
  stepType: string;
}

function StatePanel({ variables, flashMap, stepTitle, stepType }: StatePanelProps) {
  const c = typeColor(stepType);
  const entries = Object.entries(variables);

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <div
          className="font-mono"
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginBottom: '6px',
          }}
        >
          Current Step
        </div>
        <div
          style={{
            fontSize: '12px',
            color: c.text,
            fontWeight: 600,
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {stepTitle || '—'}
        </div>
      </div>

      {/* Variables section */}
      <div style={{ padding: '10px 14px', flex: 1, overflowY: 'auto' }}>
        <div
          className="font-mono"
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginBottom: '8px',
          }}
        >
          Variables
          {entries.length > 0 && (
            <span
              style={{
                marginLeft: '6px',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#60a5fa',
                fontSize: '8px',
                fontWeight: 700,
              }}
            >
              {entries.length}
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <div
            className="font-mono"
            style={{ fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic' }}
          >
            no variables yet
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map(([name, value]) => {
              const isFlashing = flashMap[name] !== undefined;
              return (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '6px',
                    padding: '5px 8px',
                    borderRadius: '5px',
                    marginBottom: '3px',
                    background: isFlashing
                      ? 'rgba(251,191,36,0.12)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isFlashing ? 'rgba(251,191,36,0.3)' : 'transparent'}`,
                    transition: 'background 0.3s, border-color 0.3s',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: '12px', color: '#82aaff', fontWeight: 600 }}
                  >
                    {name}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: '11px', color: 'var(--text-3)' }}
                  >
                    =
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '12px',
                      color: '#c3e88d',
                      wordBreak: 'break-all',
                    }}
                  >
                    {value}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ─── Console panel ────────────────────────────────────────────────────────────

interface ConsolePanelProps {
  lines: string[];
}

function ConsolePanel({ lines }: ConsolePanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div
      style={{
        background: '#080c18',
        borderTop: '1px solid var(--border)',
        height: '160px',
        overflowY: 'auto',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          marginBottom: '8px',
          flexShrink: 0,
        }}
      >
        Console
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {lines.map((line, idx) => (
            <motion.div
              key={`${idx}-${line}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="font-mono"
              style={{
                fontSize: '12px',
                color: line.startsWith('>') ? '#fbbf24' : '#c3e88d',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {line}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── Idle overlay ─────────────────────────────────────────────────────────────

function IdleOverlay({ onPlay }: { onPlay: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(13,17,23,0.82)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        zIndex: 10,
        backdropFilter: 'blur(2px)',
      }}
    >
      <motion.button
        onClick={onPlay}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '13px 28px',
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: 'inherit',
          background: 'rgba(59,130,246,0.18)',
          border: '1px solid rgba(59,130,246,0.45)',
          borderRadius: '9px',
          color: '#60a5fa',
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(59,130,246,0.15)',
        }}
      >
        <Play size={18} />
        Play to visualize solution
      </motion.button>
      <div
        className="font-mono"
        style={{ fontSize: '11px', color: 'var(--text-3)' }}
      >
        Step through the solution line by line
      </div>
    </motion.div>
  );
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

interface StepBarProps {
  steps: SolutionStep[];
  stepIdx: number;
  completedUpTo: number;
  onJump: (idx: number) => void;
}

function StepBar({ steps, stepIdx, completedUpTo, onJump }: StepBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        alignItems: 'center',
      }}
    >
      {steps.map((step, idx) => {
        const c = typeColor(step.type);
        const isActive = idx === stepIdx;
        const isDone = idx < completedUpTo;
        return (
          <button
            key={step.id}
            onClick={() => onJump(idx)}
            title={step.title}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: isActive ? '4px 10px' : '3px 8px',
              fontSize: isActive ? '11px' : '10px',
              fontWeight: isActive ? 700 : 500,
              borderRadius: '20px',
              cursor: 'pointer',
              background: isActive ? c.bg : isDone ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: `1px solid ${isActive ? c.border : isDone ? 'var(--border-2)' : 'var(--border)'}`,
              color: isActive ? c.text : isDone ? 'var(--text-2)' : 'var(--text-3)',
              transition: 'all 0.18s',
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              boxShadow: isActive ? `0 0 10px ${c.border}` : 'none',
            }}
          >
            {isDone && !isActive ? (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block', flexShrink: 0 }} />
            ) : (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isActive ? c.text : 'var(--text-3)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {idx + 1}. {step.title || step.type}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Explanation card ─────────────────────────────────────────────────────────

function ExplanationCard({ step }: { step: SolutionStep }) {
  const c = typeColor(step.type);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: '28px 32px',
        background: 'var(--surface)',
        borderRadius: '8px',
        border: `1px solid ${c.border}`,
        margin: '24px',
        boxShadow: `0 0 20px ${c.bg}`,
        animation: 'pulse-border 2.5s ease-in-out infinite',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: c.text,
          marginBottom: '10px',
        }}
      >
        {step.type}
      </div>
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: '10px',
          lineHeight: 1.4,
        }}
      >
        {step.title}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-2)',
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
        }}
      >
        {step.content}
      </div>
    </motion.div>
  );
}

// ─── Terminal command panel ───────────────────────────────────────────────────

function TerminalCard({ step }: { step: SolutionStep }) {
  const c = typeColor(step.type);
  return (
    <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          background: '#0d1117',
          border: `1px solid ${c.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Terminal header */}
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--surface-2)',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
          <span
            className="font-mono"
            style={{ fontSize: '11px', color: 'var(--text-3)', marginLeft: '6px' }}
          >
            {step.title}
          </span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <span className="font-mono" style={{ fontSize: '12px', color: c.text }}>$ </span>
          <span className="font-mono" style={{ fontSize: '12px', color: '#eeffff' }}>
            {step.content}
          </span>
          {step.output && (
            <div
              className="font-mono"
              style={{
                marginTop: '10px',
                fontSize: '12px',
                color: 'var(--text-2)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}
            >
              {step.output}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  steps: SolutionStep[];
}

export function SolutionExecutionView({ steps }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(-1);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [flashMap, setFlashMap] = useState<Record<string, number>>({});
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [completedUpTo, setCompletedUpTo] = useState(0);

  const codeScrollRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  // Derived: current step
  const currentStep = steps[stepIdx] ?? null;

  // Parse current code step's lines
  const allLines = currentStep?.type === 'code'
    ? parseCodeLines(currentStep.content)
    : [];
  const activeLines = getActiveLines(allLines);

  // Reset to idle
  const handleRestart = useCallback(() => {
    setPhase('idle');
    setStepIdx(0);
    setLineIdx(-1);
    setVariables({});
    setFlashMap({});
    setConsoleLines([]);
    setCompletedUpTo(0);
  }, []);

  const handlePlay = useCallback(() => {
    if (phase === 'done') {
      handleRestart();
      // Will auto-play after state clears; trigger in next tick
      setTimeout(() => setPhase('playing'), 0);
      return;
    }
    setPhase('playing');
  }, [phase, handleRestart]);

  const handlePause = useCallback(() => {
    setPhase('paused');
  }, []);

  // Jump to step (pause and reset line index)
  const handleJump = useCallback((idx: number) => {
    setPhase('paused');
    setStepIdx(idx);
    setLineIdx(-1);
  }, []);

  // Flash variable briefly
  const flashVariable = useCallback((name: string) => {
    const ts = Date.now();
    setFlashMap((prev) => ({ ...prev, [name]: ts }));
    setTimeout(() => {
      setFlashMap((prev) => {
        if (prev[name] === ts) {
          const next = { ...prev };
          delete next[name];
          return next;
        }
        return prev;
      });
    }, 900);
  }, []);

  // Process a line: update variables / console
  const processLine = useCallback(
    (line: ParsedLine, currentVars: Record<string, string>): Record<string, string> => {
      let newVars = currentVars;

      if (line.category === 'assign' && line.variable) {
        const value = line.valueExpr
          ? evaluateSimple(line.valueExpr, currentVars)
          : line.valueExpr ?? '';
        newVars = { ...currentVars, [line.variable]: value };
        setVariables(newVars);
        flashVariable(line.variable);
      } else if (line.category === 'augmented' && line.variable) {
        const existing = currentVars[line.variable] ?? '0';
        const expr = `${existing} ${line.raw.match(/(\+=|-=|\*=|\/=)/)?.[1]?.charAt(0) ?? '+'} ${line.valueExpr ?? '0'}`;
        const value = evaluateSimple(expr, currentVars);
        newVars = { ...currentVars, [line.variable]: value };
        setVariables(newVars);
        flashVariable(line.variable);
      } else if (line.category === 'input-assign' && line.variable) {
        const prompt = line.prompt ?? '';
        const fakeValue = '<input>';
        newVars = { ...currentVars, [line.variable]: fakeValue };
        setVariables(newVars);
        flashVariable(line.variable);
        if (prompt) {
          setConsoleLines((prev) => [...prev, `> ${prompt}`]);
        }
      } else if (line.category === 'print') {
        const output = buildPrintOutput(line.printArgs, currentVars);
        setConsoleLines((prev) => [...prev, output]);
      }

      return newVars;
    },
    [flashVariable]
  );

  // Main animation engine
  useEffect(() => {
    if (phase !== 'playing') return;
    if (steps.length === 0) { setPhase('done'); return; }
    if (stepIdx >= steps.length) { setPhase('done'); return; }

    const step = steps[stepIdx];

    // Non-code steps: just wait and advance
    if (step.type !== 'code') {
      // Show output in console if present
      if (step.output && lineIdx === -1) {
        // Add to console on step intro
        setConsoleLines((prev) => [...prev, step.output!]);
      }
      const t = setTimeout(() => {
        if (phaseRef.current !== 'playing') return;
        setCompletedUpTo((c) => Math.max(c, stepIdx + 1));
        if (stepIdx + 1 >= steps.length) {
          setPhase('done');
        } else {
          setStepIdx((s) => s + 1);
          setLineIdx(-1);
        }
      }, STEP_INTRO_DELAY);
      return () => clearTimeout(t);
    }

    // Code step
    const lines = getActiveLines(parseCodeLines(step.content));

    if (lineIdx === -1) {
      // Step intro — short pause then start line 0
      const t = setTimeout(() => {
        if (phaseRef.current !== 'playing') return;
        if (lines.length === 0) {
          setCompletedUpTo((c) => Math.max(c, stepIdx + 1));
          if (stepIdx + 1 >= steps.length) {
            setPhase('done');
          } else {
            setStepIdx((s) => s + 1);
            setLineIdx(-1);
          }
        } else {
          setLineIdx(0);
        }
      }, 300);
      return () => clearTimeout(t);
    }

    if (lineIdx >= lines.length) {
      // Step complete
      const t = setTimeout(() => {
        if (phaseRef.current !== 'playing') return;
        setCompletedUpTo((c) => Math.max(c, stepIdx + 1));
        if (stepIdx + 1 >= steps.length) {
          setPhase('done');
        } else {
          setStepIdx((s) => s + 1);
          setLineIdx(-1);
        }
      }, LINE_DELAY);
      return () => clearTimeout(t);
    }

    // Animate current line
    const currentLine = lines[lineIdx];
    const t = setTimeout(() => {
      if (phaseRef.current !== 'playing') return;
      // Process the line (side effects: variables, console)
      setVariables((prevVars) => processLine(currentLine, prevVars));
      setLineIdx((l) => l + 1);
    }, LINE_DELAY);
    return () => clearTimeout(t);
  }, [phase, stepIdx, lineIdx, steps, processLine]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (currentStep?.type !== 'code') return;
    const el = codeScrollRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [lineIdx, stepIdx, currentStep]);

  if (steps.length === 0) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          background: 'var(--surface)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
        }}
      >
        <div className="font-mono" style={{ fontSize: '13px', color: 'var(--text-2)' }}>
          No steps to visualize
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const isCodeStep = currentStep?.type === 'code';
  const isTerminalStep =
    currentStep?.type === 'command' || currentStep?.type === 'git' || currentStep?.type === 'docker';
  const isExplanationStep = currentStep?.type === 'explanation' || currentStep?.type === 'output';

  return (
    <div
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      {/* Controls row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Play */}
        {phase !== 'playing' && (
          <button
            onClick={handlePlay}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '5px',
              cursor: 'pointer',
              background: 'rgba(52,211,153,0.1)',
              border: '1px solid rgba(52,211,153,0.3)',
              color: '#34d399',
            }}
          >
            <Play size={12} />
            {phase === 'done' ? 'Replay' : 'Play'}
          </button>
        )}

        {/* Pause */}
        {phase === 'playing' && (
          <button
            onClick={handlePause}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '5px',
              cursor: 'pointer',
              background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.3)',
              color: '#60a5fa',
            }}
          >
            <Pause size={12} />
            Pause
          </button>
        )}

        {/* Restart */}
        <button
          onClick={handleRestart}
          className="font-mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            fontSize: '11px',
            borderRadius: '5px',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
          }}
        >
          <RotateCcw size={12} />
          Restart
        </button>

        {/* Status indicator */}
        <div
          className="font-mono"
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: 'var(--text-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {phase === 'playing' && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#34d399',
              }}
            />
          )}
          {phase === 'done' && <Check size={12} color="#34d399" />}
          <span>
            {stepIdx + 1}/{steps.length} steps
            {isCodeStep && lineIdx >= 0 && ` · line ${lineIdx + 1}/${activeLines.length}`}
          </span>
        </div>
      </div>

      {/* Step bar */}
      <StepBar
        steps={steps}
        stepIdx={stepIdx}
        completedUpTo={completedUpTo}
        onJump={handleJump}
      />

      {/* Main panels (relative for idle overlay) */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Idle overlay */}
        <AnimatePresence>
          {phase === 'idle' && (
            <IdleOverlay onPlay={handlePlay} />
          )}
        </AnimatePresence>

        {/* Middle row: code + state */}
        <div style={{ display: 'flex', minHeight: '420px' }}>
          {/* Code / content panel (65%) */}
          <div
            style={{
              flex: '0 0 65%',
              display: 'flex',
              flexDirection: 'column',
              borderRight: isCodeStep ? '1px solid var(--border)' : 'none',
              minWidth: 0,
            }}
          >
            {isExplanationStep && currentStep && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ExplanationCard step={currentStep} />
              </div>
            )}

            {isTerminalStep && currentStep && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <TerminalCard step={currentStep} />
              </div>
            )}

            {isCodeStep && (
              <div
                ref={codeScrollRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  background: '#0d1117',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                }}
              >
                {allLines.map((line, rawIdx) => {
                  // Determine state relative to active lines
                  const activePosOfLine = activeLines.indexOf(line);
                  let state: 'active' | 'past' | 'future' = 'future';

                  if (line.category === 'blank' || line.category === 'comment') {
                    // blank/comment lines: show at past opacity if before current active, else future
                    const firstFutureActive = activeLines[lineIdx];
                    if (!firstFutureActive) {
                      state = lineIdx >= activeLines.length ? 'past' : 'future';
                    } else {
                      state = line.n < firstFutureActive.n ? 'past' : 'future';
                    }
                  } else if (activePosOfLine !== -1) {
                    if (lineIdx < 0) {
                      state = 'future';
                    } else if (activePosOfLine < lineIdx) {
                      state = 'past';
                    } else if (activePosOfLine === lineIdx) {
                      state = 'active';
                    } else {
                      state = 'future';
                    }
                  }

                  const isActive = state === 'active';
                  return (
                    <CodeLineRow
                      key={rawIdx}
                      line={line}
                      state={state}
                      isActive={isActive}
                    />
                  );
                })}
              </div>
            )}

            {!isCodeStep && !isTerminalStep && !isExplanationStep && currentStep && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
                <div className="font-mono" style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                  {currentStep.title}
                </div>
              </div>
            )}
          </div>

          {/* State panel (35%) — only for code steps */}
          {isCodeStep && (
            <div style={{ flex: '0 0 35%', minWidth: 0 }}>
              <StatePanel
                variables={variables}
                flashMap={flashMap}
                stepTitle={currentStep?.title ?? ''}
                stepType={currentStep?.type ?? 'code'}
              />
            </div>
          )}
        </div>

        {/* Console panel */}
        <ConsolePanel lines={consoleLines} />
      </div>

      {/* Done banner */}
      <AnimatePresence>
        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              fontSize: '12px',
              background: 'rgba(52,211,153,0.07)',
              borderTop: '1px solid rgba(52,211,153,0.25)',
              color: '#34d399',
            }}
          >
            <span
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#10b981',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            Solution complete — {steps.length} step{steps.length !== 1 ? 's' : ''} visualized
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
