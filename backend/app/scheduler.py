"""APScheduler: periodically re-scrape for new labs/homework."""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from .config import settings
from .database import engine
from .models import Lab
from .scraper import discover_labs

scheduler = AsyncIOScheduler()


async def _sync_labs():
    print("[scheduler] Syncing labs from site...")
    fresh_labs = await discover_labs()
    with Session(engine) as session:
        for lab in fresh_labs:
            existing = session.exec(select(Lab).where(Lab.slug == lab.slug)).first()
            if existing:
                existing.content = lab.content
                existing.questions_raw = lab.questions_raw
                existing.last_scraped = lab.last_scraped
                session.add(existing)
            else:
                session.add(lab)
                print(f"[scheduler] New lab discovered: {lab.slug}")
        session.commit()
    print(f"[scheduler] Synced {len(fresh_labs)} labs")


def start_scheduler():
    scheduler.add_job(
        _sync_labs,
        trigger=IntervalTrigger(minutes=settings.scrape_interval_minutes),
        id="sync_labs",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler():
    scheduler.shutdown(wait=False)
