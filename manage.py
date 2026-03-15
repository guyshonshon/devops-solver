#!/usr/bin/env python3
"""Management CLI for devops-solver.

Usage:
  python manage.py clear-solutions              # clear all solutions
  python manage.py clear-solutions --slug SLUG  # clear one lab's solution
  python manage.py list-solutions               # show all stored solutions
"""
import argparse
import os
import sqlite3
import sys


def get_db_path() -> str:
    """Resolve the SQLite DB path from .env or fall back to the default."""
    env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
    if os.path.exists(env_path):
        for line in open(env_path):
            line = line.strip()
            if line.startswith("DATABASE_URL=") or line.startswith("database_url="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                # Strip sqlite:/// prefix
                for prefix in ("sqlite:///./", "sqlite:////", "sqlite:///"):
                    if val.startswith(prefix):
                        val = val[len(prefix):]
                        break
                if not os.path.isabs(val):
                    val = os.path.join(os.path.dirname(__file__), "backend", val)
                return val

    # Default location used by docker-compose (volume-mounted data/)
    candidates = [
        os.path.join(os.path.dirname(__file__), "data", "devops_solver.db"),
        os.path.join(os.path.dirname(__file__), "backend", "devops_solver.db"),
        os.path.join(os.path.dirname(__file__), "devops_solver.db"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]  # return first candidate even if it doesn't exist yet


def cmd_clear(args):
    db = get_db_path()
    if not os.path.exists(db):
        print(f"DB not found: {db}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db)
    try:
        if args.slug:
            row = conn.execute(
                "SELECT id FROM solution WHERE lab_slug = ?", (args.slug,)
            ).fetchone()
            if not row:
                print(f"No solution found for slug '{args.slug}'")
                return
            conn.execute("DELETE FROM solution WHERE lab_slug = ?", (args.slug,))
            conn.commit()
            print(f"Cleared solution for '{args.slug}'")
        else:
            count = conn.execute("SELECT COUNT(*) FROM solution").fetchone()[0]
            if count == 0:
                print("No solutions to clear.")
                return
            conn.execute("DELETE FROM solution")
            conn.commit()
            print(f"Cleared {count} solution(s).")
    finally:
        conn.close()


def cmd_list(args):
    db = get_db_path()
    if not os.path.exists(db):
        print(f"DB not found: {db}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db)
    try:
        rows = conn.execute(
            "SELECT lab_slug, status, ai_model, solved_at, "
            "LENGTH(steps_json) as steps_size FROM solution ORDER BY lab_slug"
        ).fetchall()
        if not rows:
            print("No solutions stored.")
            return
        print(f"{'SLUG':<30} {'STATUS':<10} {'MODEL':<20} {'SOLVED AT':<22} STEPS")
        print("-" * 90)
        for slug, status, model, solved_at, size in rows:
            solved_at = (solved_at or "")[:19]
            print(f"{slug:<30} {status:<10} {(model or ''):<20} {solved_at:<22} {size} bytes")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="devops-solver management CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_clear = sub.add_parser("clear-solutions", help="Delete stored solutions so they are re-generated on next request")
    p_clear.add_argument("--slug", metavar="SLUG", help="Clear only this lab slug")
    p_clear.set_defaults(func=cmd_clear)

    p_list = sub.add_parser("list-solutions", help="Show all stored solutions")
    p_list.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
