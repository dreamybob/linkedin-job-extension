from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


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
    company_linkedin_url: str | None = None
    location: str | None = None
    remote_status: str | None = "unknown"
    seniority: str | None = None
    domain: str | None = None
    compensation: str | None = None


class RequirementsExtraction(BaseModel):
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    experience_years: str | None = None
    required_pm_experience: str | None = None
    immediate_joiner_preferred: bool = False
    application_method: str | None = None
    apply_url: str | None = None
    culture_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)

    @field_validator(
        "must_have_skills",
        "nice_to_have_skills",
        "culture_signals",
        "red_flags",
        mode="before",
    )
    @classmethod
    def default_list_fields(cls, value):
        return value or []


class FitmentAnalysis(BaseModel):
    fitment_score: int | None = None
    fitment_summary: str | None = None
    strong_matches: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    mandatory_qualification_missing: bool = False
    mandatory_qualification_reasons: list[str] = Field(default_factory=list)
    mandatory_qualification_details: list[str] = Field(default_factory=list)
    angles_to_emphasize: list[str] = Field(default_factory=list)
    outreach_talking_points: list[str] = Field(default_factory=list)

    @field_validator(
        "strong_matches",
        "gaps",
        "mandatory_qualification_reasons",
        "mandatory_qualification_details",
        "angles_to_emphasize",
        "outreach_talking_points",
        mode="before",
    )
    @classmethod
    def default_analysis_lists(cls, value):
        return value or []


class PostSummary(BaseModel):
    id: int
    post_url: str
    poster_name: str = ""
    poster_headline: str = ""
    saved_at: str | None = None
    is_important: bool = False
    is_irrelevant: bool = False
    status: Literal["pending", "processing", "done", "error"]
    error_message: str | None = None
    job_title: str | None = None
    company_name: str | None = None
    remote_status: str | None = None
    seniority: str | None = None
    fitment_score: int | None = None
    immediate_joiner_preferred: bool = False
    mandatory_qualification_missing: bool = False


class PostDetail(PostSummary):
    post_text: str = ""
    poster_profile_url: str = ""
    links_in_post: list[str] = Field(default_factory=list)
    location: str | None = None
    domain: str | None = None
    compensation: str | None = None
    company_linkedin_url: str | None = None
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    experience_years: str | None = None
    required_pm_experience: str | None = None
    application_method: str | None = None
    apply_url: str | None = None
    culture_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    fitment_summary: str | None = None
    strong_matches: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    mandatory_qualification_reasons: list[str] = Field(default_factory=list)
    mandatory_qualification_details: list[str] = Field(default_factory=list)
    angles_to_emphasize: list[str] = Field(default_factory=list)
    outreach_talking_points: list[str] = Field(default_factory=list)
    linked_content: str = ""


class PostLabelsUpdate(BaseModel):
    is_important: bool | None = None
    is_irrelevant: bool | None = None
