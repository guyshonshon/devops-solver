from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .config import settings
from .database import init_db, engine
from .models import Lab
from .routers.labs import router as labs_router
from .scheduler import start_scheduler, stop_scheduler
from .scraper import discover_labs


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await _seed_labs_if_empty()
    start_scheduler()
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

app.include_router(labs_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
