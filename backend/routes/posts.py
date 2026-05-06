from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from database import get_db
from models.post import PostDetail, PostIngest, PostLabelsUpdate
from models.resume_review import (
    ResumeApplyRequest,
    ResumeRevertRequest,
    ResumeSuggestionRequest,
    ResumeTemplateAddRequest,
)
from services.background_worker import BackgroundWorker
from services.resume_review import ResumeReviewService


router = APIRouter(prefix="/api/posts", tags=["posts"])
worker = BackgroundWorker()
resume_review_service = ResumeReviewService()


def _loads_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def _serialize_post_detail(row: dict[str, Any]) -> PostDetail:
    payload = dict(row)
    payload["links_in_post"] = _loads_list(payload.get("links_in_post"))
    for key in (
        "must_have_skills",
        "nice_to_have_skills",
        "culture_signals",
        "red_flags",
        "strong_matches",
        "gaps",
        "mandatory_qualification_reasons",
        "mandatory_qualification_details",
        "angles_to_emphasize",
        "outreach_talking_points",
    ):
        payload[key] = _loads_list(payload.get(key))
    return PostDetail.model_validate(payload)


@router.post("/save")
def save_post(post: PostIngest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    if not post.post_url.strip() or not post.post_text.strip():
        raise HTTPException(status_code=422, detail="post_url and post_text are required")

    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM posts WHERE post_url = ?",
            (post.post_url,),
        ).fetchone()
        if existing:
            return JSONResponse(
                status_code=200,
                content={"status": "already_saved", "post_id": existing["id"]},
            )

        cursor = db.execute(
            """
            INSERT INTO posts (
              post_url, post_text, poster_name, poster_profile_url,
              poster_headline, links_in_post, saved_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (
                post.post_url,
                post.post_text,
                post.poster_name,
                post.poster_profile_url,
                post.poster_headline,
                json.dumps(post.links_in_post),
                post.saved_at,
            ),
        )
        post_id = cursor.lastrowid

    background_tasks.add_task(worker.process_post, post_id)
    return JSONResponse(status_code=201, content={"status": "saved", "post_id": post_id})


@router.post("/{post_id}/retry")
def retry_post(post_id: int, background_tasks: BackgroundTasks) -> dict[str, Any]:
    with get_db() as db:
        row = db.execute(
            "SELECT id, status FROM posts WHERE id = ?",
            (post_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found")
        if row["status"] == "done":
            resume = resume_review_service._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=409, detail="Upload a resume before retrying resume review analysis")
            structured = resume_review_service._ensure_structured_resume(db, resume)
            resume_review_service._upsert_pending(db, post_id, structured["resume_version"])
            background_tasks.add_task(
                resume_review_service.process_review_analysis,
                post_id,
                structured["resume_version"],
            )
            return {"status": "resume_review_retry_queued", "post_id": post_id}
        if row["status"] != "error":
            raise HTTPException(status_code=409, detail="Only failed posts or resume review analysis can be retried")

        db.execute(
            "UPDATE posts SET status = 'pending', error_message = NULL WHERE id = ?",
            (post_id,),
        )

    background_tasks.add_task(worker.process_post, post_id)
    return {"status": "retry_queued", "post_id": post_id}


@router.get("/{post_id}/resume-analysis")
def get_resume_analysis(post_id: int, background_tasks: BackgroundTasks) -> dict[str, Any]:
    return resume_review_service.ensure_current(post_id, background_tasks)


@router.post("/{post_id}/resume-suggestions")
def get_resume_suggestions(post_id: int, payload: ResumeSuggestionRequest) -> dict[str, Any]:
    return resume_review_service.get_suggestions(post_id, payload.target_type, payload.target_id)


@router.post("/{post_id}/apply-enhancement")
def apply_enhancement(post_id: int, payload: ResumeApplyRequest) -> dict[str, Any]:
    return resume_review_service.apply_suggestion(
        post_id,
        payload.suggestion_id,
        payload.target_type,
        payload.target_id,
        payload.destination_section_id,
        payload.destination_entry_id,
    )


@router.post("/{post_id}/revert-enhancement")
def revert_enhancement(post_id: int, payload: ResumeRevertRequest) -> dict[str, Any]:
    return resume_review_service.revert_overlay(post_id, payload.overlay_id)


@router.post("/{post_id}/resume-templates")
def add_resume_template(post_id: int, payload: ResumeTemplateAddRequest) -> dict[str, Any]:
    return resume_review_service.add_template(post_id, payload.template_type, payload.parent_section_id)


@router.get("")
def list_posts(
    status: str | None = None,
    score_band: str | None = Query(default=None, pattern="^(high|mid|low|pending|error)$"),
    tag: str | None = Query(default=None, pattern="^(important|irrelevant|immediate_joiner|mandatory_missing)$"),
    search: str | None = None,
    sort: str = Query(default="newest", pattern="^(newest|score_desc|company_asc)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    where: list[str] = []
    params: list[Any] = []

    if status:
        where.append("p.status = ?")
        params.append(status)

    if score_band == "high":
        where.append("a.fitment_score BETWEEN 8 AND 10")
    elif score_band == "mid":
        where.append("a.fitment_score BETWEEN 5 AND 7")
    elif score_band == "low":
        where.append("a.fitment_score BETWEEN 1 AND 4")
    elif score_band == "pending":
        where.append("p.status IN ('pending', 'processing')")
    elif score_band == "error":
        where.append("p.status = 'error'")

    if tag == "important":
        where.append("p.is_important = 1")
    elif tag == "irrelevant":
        where.append("p.is_irrelevant = 1")
    elif tag == "immediate_joiner":
        where.append("COALESCE(a.immediate_joiner_preferred, 0) = 1")
    elif tag == "mandatory_missing":
        where.append("COALESCE(a.mandatory_qualification_missing, 0) = 1")

    if search:
        where.append(
            "(LOWER(COALESCE(a.company_name, '')) LIKE ? OR "
            "LOWER(COALESCE(a.job_title, '')) LIKE ? OR "
            "LOWER(COALESCE(p.poster_name, '')) LIKE ?)"
        )
        term = f"%{search.lower()}%"
        params.extend([term, term, term])

    order_by = {
        "newest": "datetime(COALESCE(p.saved_at, p.created_at)) DESC",
        "score_desc": (
            "CASE WHEN a.fitment_score IS NULL THEN 1 ELSE 0 END ASC, "
            "a.fitment_score DESC, datetime(COALESCE(p.saved_at, p.created_at)) DESC"
        ),
        "company_asc": "LOWER(COALESCE(a.company_name, 'zzzz')) ASC, datetime(COALESCE(p.saved_at, p.created_at)) DESC",
    }[sort]

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    query = f"""
      SELECT
        p.id, p.post_url, p.poster_name, p.poster_headline, p.saved_at, p.is_important, p.is_irrelevant,
        p.status, p.error_message, a.job_title, a.company_name, a.remote_status, a.seniority,
        a.fitment_score, COALESCE(a.immediate_joiner_preferred, 0) AS immediate_joiner_preferred,
        COALESCE(a.mandatory_qualification_missing, 0) AS mandatory_qualification_missing
      FROM posts p
      LEFT JOIN analysis a ON a.post_id = p.id
      {where_sql}
      ORDER BY {order_by}
      LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    with get_db() as db:
        rows = db.execute(query, params).fetchall()
        count_query = f"""
          SELECT COUNT(*) AS count
          FROM posts p
          LEFT JOIN analysis a ON a.post_id = p.id
          {where_sql}
        """
        total = db.execute(count_query, params[:-2]).fetchone()["count"]
    return {"items": rows, "total": total}


@router.get("/{post_id}")
def get_post(post_id: int) -> PostDetail:
    with get_db() as db:
        row = db.execute(
            """
            SELECT
              p.id, p.post_url, p.post_text, p.poster_name, p.poster_profile_url,
              p.poster_headline, p.links_in_post, p.saved_at, p.is_important, p.is_irrelevant,
              p.status, p.error_message,
              a.job_title, a.company_name, a.location, a.remote_status, a.seniority,
              a.domain, a.compensation, a.company_linkedin_url, a.must_have_skills,
              a.nice_to_have_skills, a.experience_years, a.required_pm_experience,
              COALESCE(a.immediate_joiner_preferred, 0) AS immediate_joiner_preferred,
              a.application_method, a.apply_url, a.culture_signals, a.red_flags, a.fitment_score,
              a.fitment_summary, a.strong_matches, a.gaps,
              COALESCE(a.mandatory_qualification_missing, 0) AS mandatory_qualification_missing,
              a.mandatory_qualification_reasons, a.mandatory_qualification_details,
              a.angles_to_emphasize, a.outreach_talking_points, a.linked_content
            FROM posts p
            LEFT JOIN analysis a ON a.post_id = p.id
            WHERE p.id = ?
            """,
            (post_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    return _serialize_post_detail(row)


@router.get("/status/{post_id}")
def get_post_status(post_id: int) -> dict[str, Any]:
    with get_db() as db:
        row = db.execute(
            "SELECT id, status, error_message FROM posts WHERE id = ?",
            (post_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    return row


@router.delete("/{post_id}")
def delete_post(post_id: int) -> dict[str, str]:
    with get_db() as db:
        row = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found")
        db.execute("DELETE FROM analysis WHERE post_id = ?", (post_id,))
        db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    return {"status": "deleted"}


@router.patch("/{post_id}/labels")
def update_post_labels(post_id: int, payload: PostLabelsUpdate) -> dict[str, Any]:
    with get_db() as db:
        row = db.execute(
            "SELECT id, is_important, is_irrelevant FROM posts WHERE id = ?",
            (post_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found")

        is_important = row["is_important"]
        is_irrelevant = row["is_irrelevant"]

        if payload.is_important is not None:
            is_important = int(payload.is_important)
            if payload.is_important:
                is_irrelevant = 0

        if payload.is_irrelevant is not None:
            is_irrelevant = int(payload.is_irrelevant)
            if payload.is_irrelevant:
                is_important = 0

        db.execute(
            "UPDATE posts SET is_important = ?, is_irrelevant = ? WHERE id = ?",
            (is_important, is_irrelevant, post_id),
        )

    return {
        "status": "updated",
        "post_id": post_id,
        "is_important": bool(is_important),
        "is_irrelevant": bool(is_irrelevant),
    }
