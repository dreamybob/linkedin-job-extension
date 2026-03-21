from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from config import settings
from database import get_db
from models.resume import ResumeResponse
from services.resume_parser import extract_pdf_text


router = APIRouter(prefix="/api/resume", tags=["resume"])


def _serialize_resume(row: dict) -> ResumeResponse:
    raw_text = row.get("raw_text") or ""
    return ResumeResponse(
        filename=row["filename"],
        uploaded_at=row["uploaded_at"],
        preview_text=raw_text[:500],
        text_length=len(raw_text),
    )


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...)) -> ResumeResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    file_bytes = await file.read()
    if len(file_bytes) > settings.max_resume_size_bytes:
        raise HTTPException(status_code=400, detail="PDF exceeds 5 MB limit")

    try:
        raw_text = extract_pdf_text(file_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to extract PDF text") from exc

    with get_db() as db:
        db.execute("DELETE FROM resume")
        db.execute(
            "INSERT INTO resume (filename, raw_text) VALUES (?, ?)",
            (file.filename or "resume.pdf", raw_text),
        )
        row = db.execute(
            "SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1"
        ).fetchone()
    return _serialize_resume(row)


@router.get("")
def get_resume() -> ResumeResponse:
    with get_db() as db:
        row = db.execute("SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1").fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No resume uploaded")
    return _serialize_resume(row)


@router.delete("")
def delete_resume() -> dict[str, str]:
    with get_db() as db:
        db.execute("DELETE FROM resume")
    return {"status": "deleted"}

