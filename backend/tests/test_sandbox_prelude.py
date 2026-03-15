"""Tests for the PythonSandbox security prelude.

The prelude string is embedded in frontend/src/components/PythonSandbox.tsx.
This test runs an equivalent Python version to verify the security properties.

Keep PRELUDE here in sync with the SECURITY_PRELUDE constant in PythonSandbox.tsx.
"""
import builtins
import sys
import types

import pytest

# ── Mirror of SECURITY_PRELUDE in PythonSandbox.tsx ──────────────────────────
PRELUDE = """\
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
"""

BLOCKED_MODULES = ("js", "pyodide", "_pyodide", "micropip")


@pytest.fixture()
def sandbox():
    """Apply the security prelude, yield, then fully restore the original importer."""
    original_import = builtins.__import__

    # Register stub modules so the real import machinery would resolve them —
    # we need to prove our prelude blocks them, not that they're simply absent.
    stubs: dict[str, types.ModuleType] = {}
    for name in BLOCKED_MODULES:
        if name not in sys.modules:
            stubs[name] = types.ModuleType(name)
            sys.modules[name] = stubs[name]

    exec(PRELUDE, {})  # modifies builtins.__import__ globally

    yield

    # Restore
    builtins.__import__ = original_import
    for name, mod in stubs.items():
        if sys.modules.get(name) is mod:
            del sys.modules[name]


# ── Blocked module tests ──────────────────────────────────────────────────────

@pytest.mark.parametrize("mod", BLOCKED_MODULES)
def test_blocked_modules_raise(sandbox, mod):
    with pytest.raises(ImportError, match="not available in this playground"):
        __import__(mod)


@pytest.mark.parametrize("mod", BLOCKED_MODULES)
def test_blocked_submodule_raises(sandbox, mod):
    with pytest.raises(ImportError, match="not available in this playground"):
        __import__(f"{mod}.something")


# ── Allowed module tests ──────────────────────────────────────────────────────

@pytest.mark.parametrize("mod", ["math", "json", "re", "random", "datetime",
                                  "collections", "itertools", "os", "sys"])
def test_allowed_modules_import(sandbox, mod):
    m = __import__(mod)
    assert m is not None


def test_math_works(sandbox):
    import math
    assert math.pi > 3.14


def test_json_works(sandbox):
    import json
    assert json.loads('{"x": 1}') == {"x": 1}


# ── Builtins are intact ───────────────────────────────────────────────────────

def test_eval_still_works(sandbox):
    assert eval("1 + 1") == 2  # noqa: S307


def test_exec_still_works(sandbox):
    ns: dict = {}
    exec("x = 40 + 2", ns)  # noqa: S102
    assert ns["x"] == 42


def test_open_still_works(sandbox, tmp_path):
    f = tmp_path / "test.txt"
    f.write_text("hello")
    with open(f) as fh:
        assert fh.read() == "hello"


# ── Cleanup: prelude names are deleted ───────────────────────────────────────

def test_prelude_names_not_leaked(sandbox):
    """_sandboxed_import, _orig_import, _b, _BLOCKED must not exist in globals."""
    g = {}
    exec(PRELUDE, g)
    leaked = {"_sandboxed_import", "_orig_import", "_b", "_BLOCKED"} & g.keys()
    assert not leaked, f"Prelude leaked names into namespace: {leaked}"


# ── Idempotency: running the prelude twice doesn't break things ──────────────

def test_prelude_idempotent(sandbox):
    exec(PRELUDE, {})  # second application
    with pytest.raises(ImportError):
        __import__("js")
    import math
    assert math.sqrt(4) == 2.0
