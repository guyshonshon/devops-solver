import asyncio
import json
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from .config import settings
from .models import Lab

BASE_URL = settings.target_site_url

SITE_MAP = [
    {"category": "linux", "subcategory": "labs", "url": f"{BASE_URL}linux/labs/1-lab/",
     "slug": "linux-lab-1", "title": "Linux Lab 1 - Fundamentals"},
    {"category": "linux", "subcategory": "labs", "url": f"{BASE_URL}linux/labs/2-lab/",
     "slug": "linux-lab-2", "title": "Linux Lab 2 - Advanced"},
    {"category": "python", "subcategory": "labs", "url": f"{BASE_URL}python/labs/1-lab/",
     "slug": "python-lab-1", "title": "Python Lab 1 - Basics"},
    {"category": "git", "subcategory": "lessons", "url": f"{BASE_URL}GIT/lessons/Git-starter/",
     "slug": "git-starter", "title": "Git Starter"},
    {"category": "homework", "subcategory": "homework", "url": f"{BASE_URL}homeworks/linux-homework/",
     "slug": "homework-linux", "title": "Linux Homework"},
]


async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def parse_content(html: str, url: str) -> tuple[str, str]:
    """Returns (plain_text_content, questions_json)"""
    soup = BeautifulSoup(html, "lxml")

    # Remove nav/header/footer noise
    for tag in soup.select("nav, header, footer, script, style, .sidebar"):
        tag.decompose()

    # Extract main prose content
    prose = soup.select_one(".prose, main, article, .content, #content")
    if not prose:
        prose = soup.body or soup

    text = prose.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    questions = extract_questions(text, url)
    return text, json.dumps(questions)


def extract_questions(text: str, url: str) -> list[dict]:
    """Heuristically extract numbered tasks/questions from text."""
    questions = []
    lines = text.split("\n")

    current_q: Optional[dict] = None
    q_num = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Match patterns like: "1.", "1)", "Task 1:", "Exercise 1:", "Q1"
        m = re.match(
            r"^(?:task|exercise|question|q)?\s*(\d+)[.):\-]\s+(.+)",
            line,
            re.IGNORECASE,
        )
        if m:
            if current_q:
                questions.append(current_q)
            q_num += 1
            current_q = {
                "id": q_num,
                "number": int(m.group(1)),
                "text": m.group(2),
                "context": [],
            }
        elif current_q and len(line) > 10 and not line.startswith("#"):
            current_q["context"].append(line)

    if current_q:
        questions.append(current_q)

    # Flatten context into text
    for q in questions:
        ctx = " ".join(q.get("context", [])[:3])
        q["full_text"] = f"{q['text']} {ctx}".strip()
        del q["context"]

    return questions


async def discover_labs() -> list[Lab]:
    """Fetch all known lab pages and return Lab objects."""
    labs: list[Lab] = []

    for entry in SITE_MAP:
        try:
            html = await fetch_page(entry["url"])
            content, questions_json = parse_content(html, entry["url"])

            lab = Lab(
                slug=entry["slug"],
                title=entry["title"],
                category=entry["category"],
                subcategory=entry.get("subcategory"),
                url=entry["url"],
                content=content,
                questions_raw=questions_json,
                last_scraped=datetime.utcnow(),
            )
            labs.append(lab)
        except Exception as e:
            print(f"[scraper] Failed to fetch {entry['url']}: {e}")

    return labs


async def refresh_lab(lab: Lab) -> Lab:
    """Re-scrape a single lab."""
    html = await fetch_page(lab.url)
    content, questions_json = parse_content(html, lab.url)
    lab.content = content
    lab.questions_raw = questions_json
    lab.last_scraped = datetime.utcnow()
    return lab
