from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, JSON, Column
import sqlalchemy as sa


class Lab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)
    title: str
    category: str  # "linux" | "git" | "python" | "homework"
    subcategory: Optional[str] = None  # "labs" | "homework" | "lessons"
    url: str
    content: str = ""
    questions_raw: str = ""  # JSON string of raw questions
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    last_scraped: Optional[datetime] = None


class Solution(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lab_slug: str = Field(index=True)
    status: str = "pending"  # "pending" | "solving" | "solved" | "failed"
    steps_json: str = "[]"  # JSON array of SolutionStep
    summary: str = ""
    solved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    ai_model: str = "gemini-2.5-flash"
    execution_output: str = ""


# Pydantic-only models (not DB tables)
class SolutionStep(SQLModel):
    id: str
    type: str  # "explanation" | "command" | "code" | "git" | "docker" | "output"
    title: str
    content: str
    output: Optional[str] = None
    status: str = "pending"  # "pending" | "running" | "success" | "error"
    duration_ms: Optional[int] = None
    timestamp: Optional[str] = None


class LabCreate(SQLModel):
    slug: str
    title: str
    category: str
    subcategory: Optional[str] = None
    url: str


class SolveRequest(SQLModel):
    lab_slug: str
    execute: bool = False  # if True, actually run commands
