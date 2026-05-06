from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ResumeSuggestionRequest(BaseModel):
    target_type: Literal["bullet", "entry", "section"]
    target_id: str


class ResumeApplyRequest(BaseModel):
    suggestion_id: str
    target_type: Literal["bullet", "entry", "section"]
    target_id: str
    destination_section_id: str | None = None
    destination_entry_id: str | None = None


class ResumeRevertRequest(BaseModel):
    overlay_id: str


class ResumeTemplateAddRequest(BaseModel):
    template_type: Literal[
        "summary",
        "experience",
        "projects",
        "skills",
        "education",
        "certifications",
        "awards",
        "volunteering",
        "other",
    ]
    parent_section_id: str | None = None
