from __future__ import annotations

from pydantic import BaseModel


class ResumeResponse(BaseModel):
    filename: str
    uploaded_at: str
    preview_text: str
    text_length: int

