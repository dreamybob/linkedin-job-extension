from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PostIngest(BaseModel):
    post_url: str
    post_text: str
    poster_name: str = ""
    poster_profile_url: str = ""
    poster_headline: str = ""
    links_in_post: list[str] = Field(default_factory=list)
    saved_at: str


class RoleExtraction(BaseModel):
    job_title: str | None = None
    company_name: str | None = None
    location: str | None = None
    remote_status: str | None = "unknown"
    seniority: str | None = None
    domain: str | None = None
    compensation: str | None = None


class RequirementsExtraction(BaseModel):
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    experience_years: str | None = None
    culture_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)


class FitmentAnalysis(BaseModel):
    fitment_score: int | None = None
    fitment_summary: str | None = None
    strong_matches: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    angles_to_emphasize: list[str] = Field(default_factory=list)
    outreach_talking_points: list[str] = Field(default_factory=list)


class PostSummary(BaseModel):
    id: int
    post_url: str
    poster_name: str = ""
    poster_headline: str = ""
    saved_at: str | None = None
    status: Literal["pending", "processing", "done", "error"]
    job_title: str | None = None
    company_name: str | None = None
    remote_status: str | None = None
    seniority: str | None = None
    fitment_score: int | None = None


class PostDetail(PostSummary):
    post_text: str = ""
    poster_profile_url: str = ""
    links_in_post: list[str] = Field(default_factory=list)
    location: str | None = None
    domain: str | None = None
    compensation: str | None = None
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    experience_years: str | None = None
    culture_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    fitment_summary: str | None = None
    strong_matches: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    angles_to_emphasize: list[str] = Field(default_factory=list)
    outreach_talking_points: list[str] = Field(default_factory=list)
    linked_content: str = ""

