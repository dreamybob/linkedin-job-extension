from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from database import get_db
from models.post import PostDetail, PostIngest
from services.background_worker import BackgroundWorker


router = APIRouter(prefix="/api/posts", tags=["posts"])
worker = BackgroundWorker()


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


@router.get("")
def list_posts(
    status: str | None = None,
    score_band: str | None = Query(default=None, pattern="^(high|mid|low|pending|error)$"),
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
        p.id, p.post_url, p.poster_name, p.poster_headline, p.saved_at, p.status, p.error_message,
        a.job_title, a.company_name, a.remote_status, a.seniority, a.fitment_score
      FROM posts p
      LEFT JOIN analysis a ON a.post_id = p.id
      {where_sql}
      ORDER BY {order_by}
      LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    with get_db() as db:
        rows = db.execute(query, params).fetchall()
        total = db.execute("SELECT COUNT(*) AS count FROM posts").fetchone()["count"]
    return {"items": rows, "total": total}


@router.get("/{post_id}")
def get_post(post_id: int) -> PostDetail:
    with get_db() as db:
        row = db.execute(
            """
            SELECT
              p.id, p.post_url, p.post_text, p.poster_name, p.poster_profile_url,
              p.poster_headline, p.links_in_post, p.saved_at, p.status, p.error_message,
              a.job_title, a.company_name, a.location, a.remote_status, a.seniority,
              a.domain, a.compensation, a.must_have_skills, a.nice_to_have_skills,
              a.experience_years, a.culture_signals, a.red_flags, a.fitment_score,
              a.fitment_summary, a.strong_matches, a.gaps, a.angles_to_emphasize,
              a.outreach_talking_points, a.linked_content
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
