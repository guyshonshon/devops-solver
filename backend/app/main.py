import asyncio
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .config import settings
from .database import init_db, engine
from .models import Lab, Solution
from .auth import verify_api_key
from .routers.labs import router as labs_router, _do_solve_pipeline
from .scheduler import start_scheduler, stop_scheduler
from .scraper import discover_labs

# ── Target-repo commit cache ────────────────────────────────────────────────────
_target_commit: dict = {"sha": None, "fetched_at": 0.0}
_TARGET_COMMIT_TTL = 600  # seconds


async def _fetch_target_commit() -> str | None:
    """Return the HEAD commit SHA of the target course repo (hothaifa96/DevSecOps22)."""
    now = time.monotonic()
    if _target_commit["sha"] and now - _target_commit["fetched_at"] < _TARGET_COMMIT_TTL:
        return _target_commit["sha"]
    try:
        repo = settings.target_github_repo
        branch = settings.target_github_branch
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        url = f"https://api.github.com/repos/{repo}/branches/{branch}"
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            r = await client.get(url)
            r.raise_for_status()
            sha = r.json()["commit"]["sha"]
        _target_commit["sha"] = sha
        _target_commit["fetched_at"] = now
        return sha
    except Exception as exc:
        print(f"[meta] Failed to fetch target commit: {exc}")
        return _target_commit.get("sha")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await _seed_labs_if_empty()
    start_scheduler()
    # Auto-solve all unsolved labs in the background — no user action needed
    asyncio.create_task(_auto_solve_unsolved())
    yield
    stop_scheduler()


async def _seed_labs_if_empty():
    with Session(engine) as session:
        existing = session.exec(select(Lab)).first()
        if not existing:
            print("[startup] No labs found, seeding from site...")
            labs = await discover_labs()
            for lab in labs:
                session.add(lab)
            session.commit()
            print(f"[startup] Seeded {len(labs)} labs")


async def _auto_solve_unsolved():
    """Background task: solve all labs that have no stored solution yet."""
    # Small delay so the server is fully ready before AI calls start
    await asyncio.sleep(2)

    with Session(engine) as session:
        labs = session.exec(select(Lab)).all()
        unsolved_slugs = []
        for lab in labs:
            sol = session.exec(
                select(Solution).where(Solution.lab_slug == lab.slug)
            ).first()
            has_steps = bool(sol and sol.steps_json and sol.steps_json != "[]")
            is_solving = bool(sol and sol.status == "solving")
            if not has_steps and not is_solving:
                unsolved_slugs.append(lab.slug)

    if not unsolved_slugs:
        print("[auto-solve] All labs already solved.")
        return

    print(f"[auto-solve] Solving {len(unsolved_slugs)} unsolved lab(s) in background...")
    MAX_PIPELINE_RETRIES = 3

    for slug in unsolved_slugs:
        last_error = ""
        for attempt in range(1, MAX_PIPELINE_RETRIES + 1):
            try:
                print(f"[auto-solve] → {slug}" + (f" (retry {attempt}, prev error passed to AI)" if attempt > 1 else ""))
                with Session(engine) as session:
                    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
                    if not lab:
                        break
                    existing = session.exec(
                        select(Solution).where(Solution.lab_slug == slug)
                    ).first()
                    await _do_solve_pipeline(
                        lab, session, existing,
                        force=(attempt > 1),
                        previous_error=last_error,
                    )
                print(f"[auto-solve] ✓ {slug}")
                break  # success
            except Exception as exc:
                last_error = str(exc)
                print(f"[auto-solve] ✗ {slug} attempt {attempt}/{MAX_PIPELINE_RETRIES}: {exc}")
                if attempt < MAX_PIPELINE_RETRIES:
                    await asyncio.sleep(5 * attempt)  # back off before retry
        # Brief pause between labs to avoid hammering AI rate limits
        await asyncio.sleep(1)

    print("[auto-solve] Done.")


app = FastAPI(
    title="DevOps Solver API",
    description="AI-powered DevOps lab solver with visualization",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(labs_router, dependencies=[Depends(verify_api_key)])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "scrape_interval_minutes": settings.scrape_interval_minutes,
    }


@app.get("/health/badge")
async def health_badge():
    return {
        "schemaVersion": 1,
        "label": "health",
        "message": "healthy",
        "color": "brightgreen",
    }


@app.get("/meta")
async def meta():
    """Return target course repo metadata (latest commit SHA, repo path)."""
    sha = await _fetch_target_commit()
    return {
        "target_commit": sha,
        "target_repo": settings.target_github_repo,
        "target_branch": settings.target_github_branch,
    }
