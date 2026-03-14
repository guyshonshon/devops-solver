import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Lab, Solution, SolutionStep, SolveRequest
from ..scraper import discover_labs, refresh_lab
from ..solver import solve_lab
from ..executor import run_step
from ..git_handler import push_solution_to_github

router = APIRouter(prefix="/labs", tags=["labs"])


@router.get("/")
async def list_labs(session: Session = Depends(get_session)):
    labs = session.exec(select(Lab)).all()
    result = []
    for lab in labs:
        sol = session.exec(
            select(Solution).where(Solution.lab_slug == lab.slug)
        ).first()
        result.append({
            "slug": lab.slug,
            "title": lab.title,
            "category": lab.category,
            "subcategory": lab.subcategory,
            "url": lab.url,
            "solved": sol.status == "solved" if sol else False,
            "solution_status": sol.status if sol else "unsolved",
            "discovered_at": lab.discovered_at.isoformat(),
            "last_scraped": lab.last_scraped.isoformat() if lab.last_scraped else None,
        })
    return result


@router.get("/{slug}")
async def get_lab(slug: str, session: Session = Depends(get_session)):
    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    return {
        "slug": lab.slug,
        "title": lab.title,
        "category": lab.category,
        "url": lab.url,
        "content": lab.content,
        "questions": json.loads(lab.questions_raw) if lab.questions_raw else [],
        "solution": _format_solution(sol) if sol else None,
    }


@router.post("/{slug}/solve")
async def solve(slug: str, req: SolveRequest, session: Session = Depends(get_session)):
    lab = session.exec(select(Lab).where(Lab.slug == slug)).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    # Check if already solved
    existing = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    if existing and existing.status == "solved":
        return {"message": "Already solved", "solution": _format_solution(existing)}

    # Create/update solution record as "solving"
    solution = existing or Solution(lab_slug=slug)
    solution.status = "solving"
    session.add(solution)
    session.commit()
    session.refresh(solution)

    try:
        summary, steps = await solve_lab(
            category=lab.category,
            content=lab.content,
            questions_raw=lab.questions_raw,
            title=lab.title,
        )

        if req.execute:
            steps = await _execute_steps(steps)

        solution.status = "solved"
        solution.summary = summary
        solution.steps_json = json.dumps([s.model_dump() for s in steps])
        solution.solved_at = datetime.utcnow()
        session.add(solution)
        session.commit()
        session.refresh(solution)

        return {"message": "Solved", "solution": _format_solution(solution)}
    except Exception as e:
        solution.status = "failed"
        solution.summary = str(e)
        session.add(solution)
        session.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{slug}/replay")
async def get_replay(slug: str, session: Session = Depends(get_session)):
    """Return saved steps for animation replay."""
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    if not sol or sol.status not in ("solved", "failed"):
        raise HTTPException(status_code=404, detail="No solution to replay")
    return _format_solution(sol)


@router.post("/{slug}/push-github")
async def push_to_github(slug: str, session: Session = Depends(get_session)):
    sol = session.exec(select(Solution).where(Solution.lab_slug == slug)).first()
    if not sol or sol.status != "solved":
        raise HTTPException(status_code=400, detail="Lab must be solved first")
    steps = json.loads(sol.steps_json)
    result = push_solution_to_github(slug, steps, sol.summary)
    return result


@router.post("/sync")
async def sync_labs(session: Session = Depends(get_session)):
    """Trigger manual re-scrape of the target site."""
    fresh = await discover_labs()
    added, updated = 0, 0
    for lab in fresh:
        from sqlmodel import select as sel
        existing = session.exec(sel(Lab).where(Lab.slug == lab.slug)).first()
        if existing:
            existing.content = lab.content
            existing.questions_raw = lab.questions_raw
            existing.last_scraped = lab.last_scraped
            session.add(existing)
            updated += 1
        else:
            session.add(lab)
            added += 1
    session.commit()
    return {"added": added, "updated": updated}


async def _execute_steps(steps: list[SolutionStep]) -> list[SolutionStep]:
    for step in steps:
        if step.type in ("command", "git", "code"):
            import time
            start = time.time()
            stdout, stderr, rc = await run_step(step.type, step.content)
            elapsed = int((time.time() - start) * 1000)
            step.output = stdout or stderr
            step.status = "success" if rc == 0 else "error"
            step.duration_ms = elapsed
    return steps


def _format_solution(sol: Solution) -> dict:
    return {
        "status": sol.status,
        "summary": sol.summary,
        "steps": json.loads(sol.steps_json) if sol.steps_json else [],
        "solved_at": sol.solved_at.isoformat() if sol.solved_at else None,
        "ai_model": sol.ai_model,
    }
