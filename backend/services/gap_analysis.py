from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import BackgroundTasks, HTTPException

from database import get_db
from models.post import GapAnalysis, GapAnalysisResponse
from services.ai_analyzer import AIAnalyzer


def _loads_json(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def get_resume_version(raw_text: str) -> str:
    return hashlib.sha256(raw_text.encode("utf-8")).hexdigest()


class GapAnalysisService:
    def __init__(self) -> None:
        self.ai_analyzer = AIAnalyzer()

    def get_current(self, post_id: int) -> GapAnalysisResponse:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                return GapAnalysisResponse(status="no_resume")

            resume_version = get_resume_version(resume["raw_text"])
            cached = self._get_cached_analysis(db, post_id, resume_version)
            if cached:
                return self._serialize(cached)

            if not self._can_analyze(post, self._get_jd_analysis(db, post_id)):
                return GapAnalysisResponse(status="pending", resume_version=resume_version)

        return GapAnalysisResponse(status="pending", resume_version=resume_version)

    def ensure_current(self, post_id: int, background_tasks: BackgroundTasks) -> GapAnalysisResponse:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                return GapAnalysisResponse(status="no_resume")

            resume_version = get_resume_version(resume["raw_text"])
            cached = self._get_cached_analysis(db, post_id, resume_version)
            if cached:
                return self._serialize(cached)

            jd_analysis = self._get_jd_analysis(db, post_id)
            if not self._can_analyze(post, jd_analysis):
                return GapAnalysisResponse(status="pending", resume_version=resume_version)

            self._upsert_pending(db, post_id, resume_version)

        background_tasks.add_task(self.process_gap_analysis, post_id, resume_version)
        return GapAnalysisResponse(status="pending", resume_version=resume_version)

    def retry_current(self, post_id: int, background_tasks: BackgroundTasks) -> GapAnalysisResponse:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                return GapAnalysisResponse(status="no_resume")

            resume_version = get_resume_version(resume["raw_text"])
            jd_analysis = self._get_jd_analysis(db, post_id)
            if not self._can_analyze(post, jd_analysis):
                return GapAnalysisResponse(status="pending", resume_version=resume_version)

            self._upsert_pending(db, post_id, resume_version)

        background_tasks.add_task(self.process_gap_analysis, post_id, resume_version)
        return GapAnalysisResponse(status="pending", resume_version=resume_version)

    def process_gap_analysis(self, post_id: int, resume_version: str) -> None:
        try:
            with get_db() as db:
                resume = self._get_latest_resume(db)
                jd_analysis = self._get_jd_analysis(db, post_id)
                if not resume or get_resume_version(resume["raw_text"]) != resume_version:
                    return
                if not jd_analysis:
                    self._mark_error(db, post_id, resume_version, "Job analysis is not ready yet.")
                    return

                jd_signals = self._build_jd_signals(jd_analysis)
                resume_text = resume["raw_text"]

            result = self.ai_analyzer.analyze_resume_gaps(resume_text, jd_signals)
            self._store_complete(post_id, resume_version, result)
        except Exception as exc:
            with get_db() as db:
                self._mark_error(db, post_id, resume_version, f"{type(exc).__name__}: {exc}")

    def _get_post(self, db, post_id: int) -> dict[str, Any]:
        post = db.execute(
            "SELECT id, status, error_message FROM posts WHERE id = ?",
            (post_id,),
        ).fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        return post

    def _get_latest_resume(self, db) -> dict[str, Any] | None:
        resume = db.execute(
            "SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1"
        ).fetchone()
        if not resume or not resume.get("raw_text"):
            return None
        return resume

    def _get_jd_analysis(self, db, post_id: int) -> dict[str, Any] | None:
        return db.execute(
            "SELECT * FROM analysis WHERE post_id = ?",
            (post_id,),
        ).fetchone()

    def _get_cached_analysis(self, db, post_id: int, resume_version: str) -> dict[str, Any] | None:
        return db.execute(
            """
            SELECT * FROM gap_analysis
            WHERE post_id = ? AND resume_version = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (post_id, resume_version),
        ).fetchone()

    def _can_analyze(self, post: dict[str, Any], jd_analysis: dict[str, Any] | None) -> bool:
        return post["status"] == "done" and jd_analysis is not None

    def _serialize(self, row: dict[str, Any]) -> GapAnalysisResponse:
        return GapAnalysisResponse(
            status=row["status"],
            resume_version=row["resume_version"],
            error_message=row.get("error_message"),
            overall_verdict=row.get("overall_verdict"),
            resume_strengths=_loads_json(row.get("resume_strengths"), []),
            gaps=_loads_json(row.get("gaps"), []),
        )

    def _upsert_pending(self, db, post_id: int, resume_version: str) -> None:
        db.execute(
            """
            INSERT INTO gap_analysis (
              post_id, resume_version, overall_verdict, resume_strengths,
              gaps, status, error_message, updated_at
            )
            VALUES (?, ?, NULL, '[]', '[]', 'pending', NULL, datetime('now'))
            ON CONFLICT(post_id, resume_version) DO UPDATE SET
              overall_verdict = NULL,
              resume_strengths = '[]',
              gaps = '[]',
              status = 'pending',
              error_message = NULL,
              updated_at = datetime('now')
            """,
            (post_id, resume_version),
        )

    def _store_complete(self, post_id: int, resume_version: str, result: GapAnalysis) -> None:
        strengths = result.resume_strengths[:3]
        gaps = sorted(result.gaps, key=lambda item: item.rank)[:5]
        with get_db() as db:
            db.execute(
                """
                UPDATE gap_analysis
                SET overall_verdict = ?,
                    resume_strengths = ?,
                    gaps = ?,
                    status = 'complete',
                    error_message = NULL,
                    updated_at = datetime('now')
                WHERE post_id = ? AND resume_version = ?
                """,
                (
                    result.overall_verdict,
                    json.dumps(strengths),
                    json.dumps([gap.model_dump() for gap in gaps]),
                    post_id,
                    resume_version,
                ),
            )

    def _mark_error(self, db, post_id: int, resume_version: str, message: str) -> None:
        db.execute(
            """
            INSERT INTO gap_analysis (
              post_id, resume_version, overall_verdict, resume_strengths,
              gaps, status, error_message, updated_at
            )
            VALUES (?, ?, NULL, '[]', '[]', 'error', ?, datetime('now'))
            ON CONFLICT(post_id, resume_version) DO UPDATE SET
              overall_verdict = NULL,
              resume_strengths = '[]',
              gaps = '[]',
              status = 'error',
              error_message = excluded.error_message,
              updated_at = datetime('now')
            """,
            (post_id, resume_version, message),
        )

    def _build_jd_signals(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "role": {
                "job_title": row.get("job_title"),
                "company_name": row.get("company_name"),
                "company_linkedin_url": row.get("company_linkedin_url"),
                "location": row.get("location"),
                "remote_status": row.get("remote_status"),
                "seniority": row.get("seniority"),
                "domain": row.get("domain"),
                "compensation": row.get("compensation"),
            },
            "requirements": {
                "must_have_skills": _loads_json(row.get("must_have_skills"), []),
                "nice_to_have_skills": _loads_json(row.get("nice_to_have_skills"), []),
                "experience_years": row.get("experience_years"),
                "required_pm_experience": row.get("required_pm_experience"),
                "immediate_joiner_preferred": bool(row.get("immediate_joiner_preferred")),
                "application_method": row.get("application_method"),
                "apply_url": row.get("apply_url"),
                "culture_signals": _loads_json(row.get("culture_signals"), []),
                "red_flags": _loads_json(row.get("red_flags"), []),
            },
            "fitment": {
                "fitment_score": row.get("fitment_score"),
                "fitment_summary": row.get("fitment_summary"),
                "strong_matches": _loads_json(row.get("strong_matches"), []),
                "gaps": _loads_json(row.get("gaps"), []),
                "mandatory_qualification_missing": bool(row.get("mandatory_qualification_missing")),
                "mandatory_qualification_reasons": _loads_json(row.get("mandatory_qualification_reasons"), []),
                "mandatory_qualification_details": _loads_json(row.get("mandatory_qualification_details"), []),
                "angles_to_emphasize": _loads_json(row.get("angles_to_emphasize"), []),
                "outreach_talking_points": _loads_json(row.get("outreach_talking_points"), []),
            },
            "linked_content": row.get("linked_content") or "",
        }
