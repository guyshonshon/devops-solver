/**
 * Shared Pyodide loader — single instance across all components.
 *
 * NOTE: Keep SECURITY_PRELUDE in sync with backend/tests/test_sandbox_prelude.py
 */

export interface PyodideInstance {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { get(key: string): unknown };
  setStdout(opts: { batched: (msg: string) => void }): void;
  setStderr(opts: { batched: (msg: string) => void }): void;
}

type PyodideWindow = Window &
  typeof globalThis & {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance>;
  };

// One shared promise — Pyodide loads at most once per page session.
let _promise: Promise<PyodideInstance> | null = null;
let _instance: PyodideInstance | null = null;
let _securityApplied = false;

export const SECURITY_PRELUDE = `
import builtins as _b

_orig_import = _b.__import__

def _sandboxed_import(name, globals=None, locals=None, fromlist=(), level=0,
                      _blocked=frozenset({'js', 'pyodide', '_pyodide', 'micropip'}),
                      _real=_orig_import):
    if name.split('.')[0] in _blocked:
        raise ImportError(f"'{name}' is not available in this playground")
    return _real(name, globals, locals, fromlist, level)

_b.__import__ = _sandboxed_import
del _b, _orig_import, _sandboxed_import
`;

export function loadPyodide(): Promise<PyodideInstance> {
  if (!_promise) {
    _promise = (async (): Promise<PyodideInstance> => {
      const pyWindow = window as unknown as PyodideWindow;
      if (typeof pyWindow.loadPyodide !== "function") {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load Pyodide from CDN'));
          document.head.appendChild(s);
        });
      }
      if (typeof pyWindow.loadPyodide !== "function") {
        throw new Error("Pyodide loader is unavailable on window");
      }
      const py = await pyWindow.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      _instance = py;
      return py;
    })();
  }
  return _promise;
}

/** Load Pyodide and apply the security prelude (idempotent). */
export async function getPyodide(): Promise<PyodideInstance> {
  const py = await loadPyodide();
  if (!_securityApplied) {
    await py.runPythonAsync(SECURITY_PRELUDE);
    _securityApplied = true;
  }
  return py;
}

/** Run Python code, capturing stdout/stderr. Returns { output, error }. */
export async function runPython(
  code: string,
  inputQueue: string[] = [],
  timeoutMs = 10_000,
): Promise<{ output: string; error: string | null }> {
  const py = await getPyodide();

  // Wire input() → FIFO queue
  const queueJson = JSON.stringify(inputQueue);
  await py.runPythonAsync(`
import builtins as _b
_q = ${queueJson}
def _qi(prompt=''):
    global _q
    if _q:
        v = _q.pop(0)
        if prompt: print(str(prompt) + str(v))
        return str(v)
    return ''
_b.input = _qi
del _b, _qi
`);

  const lines: string[] = [];
  py.setStdout({ batched: (m: string) => lines.push(m) });
  py.setStderr({ batched: (m: string) => lines.push(`⚠ ${m}`) });

  try {
    await Promise.race([
      py.runPythonAsync(code),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timed out (10 s)')), timeoutMs),
      ),
    ]);
    return { output: lines.join('\n') || '(no output)', error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const msgLines = msg.split("\n").filter(Boolean);
    const last = msgLines.length > 0 ? msgLines[msgLines.length - 1] : msg;
    return { output: lines.join('\n'), error: last };
  }
}
