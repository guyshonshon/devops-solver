/**
 * Minimal imperative toast system — no library required.
 *
 * Usage anywhere in the app:
 *   import { toast } from './ui/Toaster';
 *   toast('Sync complete: 3 added', 'success');
 *   toast('Network error', 'error');
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

// ── Module-level store (survives component unmounts) ──────────────────────────

type Listener = (items: ToastItem[]) => void;
let _items: ToastItem[] = [];
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach(fn => fn([..._items]));
}

export function toast(message: string, kind: ToastKind = 'info', duration = 4500): string {
  const id = Math.random().toString(36).slice(2, 9);
  _items = [..._items, { id, message, kind }];
  _notify();
  if (duration > 0) setTimeout(() => _dismiss(id), duration);
  return id;
}

function _dismiss(id: string) {
  _items = _items.filter(t => t.id !== id);
  _notify();
}

// ── Style config ──────────────────────────────────────────────────────────────

const KIND_CFG: Record<ToastKind, { color: string; bg: string; border: string; bar: string }> = {
  success: { color: '#34d399', bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.25)',  bar: '#34d399' },
  error:   { color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.25)', bar: '#f87171' },
  warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.25)',  bar: '#fbbf24' },
  info:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.07)',  border: 'rgba(96,165,250,0.25)',  bar: '#3b82f6' },
};

// ── Toaster — render once in App.tsx ─────────────────────────────────────────

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _listeners.add(setItems);
    return () => { _listeners.delete(setItems); };
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9999, pointerEvents: 'none',
      maxWidth: 380,
    }}>
      <AnimatePresence>
        {items.map(item => {
          const cfg = KIND_CFG[item.kind];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => _dismiss(item.id)}
              style={{
                pointerEvents: 'all',
                background: 'var(--surface)',
                border: `1px solid ${cfg.border}`,
                borderLeft: `3px solid ${cfg.bar}`,
                borderRadius: 8,
                padding: '10px 14px',
                cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              }}
            >
              <span className="font-mono" style={{ fontSize: 12, color: cfg.color, lineHeight: 1.5 }}>
                {item.message}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
