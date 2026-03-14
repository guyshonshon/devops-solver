"""AI-powered solver using Google Gemini Flash (free tier) with retry logic."""
import json
import re
import time
import uuid
from typing import Optional

import google.generativeai as genai

from .config import settings
from .models import SolutionStep

genai.configure(api_key=settings.gemini_api_key)

# ── JSON Schema communicated to the model ────────────────────────────────────
RESPONSE_SCHEMA = {
    "type": "object",
    "required": ["summary", "difficulty", "estimated_time_minutes", "steps"],
    "properties": {
        "summary": {
            "type": "string",
            "description": "1-2 sentence plain-English summary of the entire solution"
        },
        "difficulty": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Overall difficulty of this lab"
        },
        "estimated_time_minutes": {
            "type": "integer",
            "description": "How long the lab tasks would take to complete manually"
        },
        "steps": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["id", "type", "title", "content"],
                "properties": {
                    "id": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["explanation", "command", "code", "git", "docker", "output"]
                    },
                    "title": {"type": "string", "description": "Short imperative title for this step"},
                    "content": {
                        "type": "string",
                        "description": "The exact command, code, or explanation text. For 'command'/'git'/'docker' this must be the literal runnable command(s). For 'code' this must be a complete runnable Python script. For 'explanation' this is plain English."
                    },
                    "expected_output": {
                        "type": "string",
                        "description": "What the output/result of this step should look like (optional)"
                    },
                    "question_ref": {
                        "type": "integer",
                        "description": "Which question number this step addresses (1-indexed, optional)"
                    }
                }
            }
        }
    }
}

SYSTEM_INSTRUCTION = """You are a senior DevOps/Linux/Python/Git engineer and educator.

Your task: analyze the given lab or homework content and produce a complete, executable solution.

STRICT OUTPUT RULES:
1. Return ONLY a single valid JSON object — no markdown fences, no prose outside JSON.
2. Every step MUST be actionable. Vague steps like "set up the environment" are not acceptable.
3. For 'command' steps: content = the exact bash command(s), one per line if multiple.
4. For 'git' steps: content = the exact git command(s).
5. For 'code' steps: content = a complete, self-contained Python script.
6. For 'explanation' steps: content = concise English, max 3 sentences.
7. Cover EVERY numbered task/question from the lab — do not skip any.
8. Keep steps granular — one command or one explanation per step (except multi-command scripts).
9. Use standard Linux assumptions: Ubuntu 22.04, bash shell, git 2.x, Python 3.10+.

JSON format to return:
{
  "summary": "...",
  "difficulty": "beginner|intermediate|advanced",
  "estimated_time_minutes": 15,
  "steps": [
    {
      "id": "<uuid>",
      "type": "explanation|command|code|git|docker|output",
      "title": "...",
      "content": "...",
      "expected_output": "...",
      "question_ref": 1
    }
  ]
}"""

CATEGORY_CONTEXT = {
    "linux": (
        "This is a Linux fundamentals lab. Focus on bash commands. "
        "Be precise with flags and syntax. Show real commands with expected output."
    ),
    "python": (
        "This is a Python programming lab. Write complete, runnable Python 3 scripts. "
        "Use only the standard library. Include input() calls where the exercises require user input."
    ),
    "git": (
        "This is a Git version control lab. Use standard git commands. "
        "Assume a Unix shell and an existing or new git repository. "
        "Include setup steps if needed (git init, git config)."
    ),
    "homework": (
        "This is a homework assignment with multiple questions. "
        "Address each question thoroughly with commands, code, or explanation as appropriate."
    ),
}

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2


def _build_prompt(category: str, content: str, questions_raw: str) -> str:
    ctx = CATEGORY_CONTEXT.get(category, "")
    questions = json.loads(questions_raw) if questions_raw else []

    questions_section = ""
    if questions:
        lines = ["\n--- EXTRACTED QUESTIONS (answer all of them) ---"]
        for q in questions[:40]:
            lines.append(f"Q{q.get('number', q.get('id', '?'))}: {q.get('full_text', q.get('text', ''))}")
        questions_section = "\n".join(lines)

    return f"""{ctx}

--- LAB CONTENT ---
{content[:5000]}
{questions_section}

Return the JSON solution now. No markdown, no extra text."""


def _parse_response(raw: str) -> dict:
    """Extract and validate JSON from model response."""
    raw = raw.strip()
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*\n?", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\n?```\s*$", "", raw, flags=re.MULTILINE)
    raw = raw.strip()

    data = json.loads(raw)

    # Validate required fields
    if "steps" not in data or not isinstance(data["steps"], list):
        raise ValueError("Response missing 'steps' array")
    if "summary" not in data:
        raise ValueError("Response missing 'summary'")
    if len(data["steps"]) == 0:
        raise ValueError("Steps array is empty")

    # Ensure all steps have IDs
    for step in data["steps"]:
        if not step.get("id"):
            step["id"] = str(uuid.uuid4())
        if step.get("type") not in ("explanation", "command", "code", "git", "docker", "output"):
            step["type"] = "explanation"

    return data


async def solve_lab(
    category: str,
    content: str,
    questions_raw: str,
    title: str,
) -> tuple[str, list[SolutionStep]]:
    """Call Gemini with retries. Returns (summary, steps)."""
    if not settings.gemini_api_key:
        return _fallback_solution(category, title)

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_INSTRUCTION,
        generation_config={
            "temperature": 0.15,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        },
    )

    prompt = _build_prompt(category, content, questions_raw)
    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = model.generate_content(prompt)
            data = _parse_response(response.text)

            steps = [
                SolutionStep(
                    id=s["id"],
                    type=s["type"],
                    title=s["title"],
                    content=s["content"],
                    output=s.get("expected_output"),
                    status="pending",
                )
                for s in data["steps"]
            ]
            return data["summary"], steps

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = e
            print(f"[solver] Attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
        except Exception as e:
            last_error = e
            print(f"[solver] API error on attempt {attempt}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SECONDS * attempt)

    # All retries exhausted
    raise RuntimeError(f"Solver failed after {MAX_RETRIES} attempts: {last_error}")


def _fallback_solution(category: str, title: str) -> tuple[str, list[SolutionStep]]:
    """Demo solution when no API key is configured."""
    base = [
        SolutionStep(
            id=str(uuid.uuid4()),
            type="explanation",
            title="Configure Gemini API",
            content="Set GEMINI_API_KEY in your .env file to enable AI-powered solutions. Get a free key at aistudio.google.com.",
            status="pending",
        )
    ]
    demo_steps: dict[str, list[SolutionStep]] = {
        "linux": [
            SolutionStep(id=str(uuid.uuid4()), type="command", title="Check current user", content="whoami", status="pending"),
            SolutionStep(id=str(uuid.uuid4()), type="command", title="Show system info", content="uname -a", status="pending"),
            SolutionStep(id=str(uuid.uuid4()), type="command", title="List home directory", content="ls -la ~", status="pending"),
            SolutionStep(id=str(uuid.uuid4()), type="command", title="Show disk usage", content="df -h", status="pending"),
        ],
        "python": [
            SolutionStep(
                id=str(uuid.uuid4()),
                type="code",
                title="Exercise 1 - Arithmetic",
                content='a = int(input("Enter first number: "))\nb = int(input("Enter second number: "))\nprint(f"Sum: {a+b}, Sub: {a-b}, Mul: {a*b}, Div: {a/b:.2f}")',
                status="pending",
            ),
            SolutionStep(
                id=str(uuid.uuid4()),
                type="code",
                title="Exercise 2 - String ops",
                content='text = input("Enter a sentence: ")\nprint(text.upper())\nprint(f"Count of \'a\': {text.lower().count(\'a\')}")',
                status="pending",
            ),
        ],
        "git": [
            SolutionStep(id=str(uuid.uuid4()), type="git", title="Initialize repository", content="git init my-repo && cd my-repo", status="pending"),
            SolutionStep(id=str(uuid.uuid4()), type="git", title="Set identity", content='git config user.name "Guy Shonshon"\ngit config user.email "guy@example.com"', status="pending"),
            SolutionStep(id=str(uuid.uuid4()), type="git", title="Create initial commit", content='echo "# My Repo" > README.md\ngit add README.md\ngit commit -m "Initial commit"', status="pending"),
        ],
        "homework": [
            SolutionStep(id=str(uuid.uuid4()), type="explanation", title="Answer approach", content="Each homework question requires specific Linux commands. Enable the API key to generate full answers.", status="pending"),
        ],
    }
    steps = base + demo_steps.get(category, [])
    return f"Demo solution for {title} (API key not configured)", steps
