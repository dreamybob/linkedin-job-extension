from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, HTTPException

from database import get_db
from services.resume_parser import (
    ENTRY_BASED_SECTION_TYPES,
    SECTION_TYPE_PRIORITY,
    build_structured_resume,
    get_resume_version,
)


ACTION_VERB_RE = re.compile(
    r"(?i)\b(?:led|owned|drove|launched|shipped|built|scaled|improved|grew|optimized|managed|defined|developed|designed|partnered)\b"
)
METRIC_RE = re.compile(r"\d|%|\b(?:kpi|okr|metric|revenue|retention|conversion|nps|adoption)\b", re.I)
GENERIC_RE = re.compile(r"(?i)\b(?:responsible for|worked on|helped|assisted|involved in)\b")

TEMPLATE_CATALOG = [
    {"type": "summary", "title": "Summary", "entry_based": False},
    {"type": "experience", "title": "Experience", "entry_based": True},
    {"type": "projects", "title": "Projects", "entry_based": True},
    {"type": "skills", "title": "Skills", "entry_based": False},
    {"type": "education", "title": "Education", "entry_based": True},
    {"type": "certifications", "title": "Certifications", "entry_based": True},
    {"type": "awards", "title": "Awards", "entry_based": True},
    {"type": "volunteering", "title": "Volunteering", "entry_based": True},
    {"type": "other", "title": "Additional Information", "entry_based": False},
]


def _loads_json(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _dumps_json(value: Any) -> str:
    return json.dumps(value)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResumeReviewService:
    def get_structured_resume(self) -> dict[str, Any]:
        with get_db() as db:
            resume = self._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=404, detail="No resume uploaded")

            structured = self._ensure_structured_resume(db, resume)

        return {
            "resume_version": structured["resume_version"],
            "filename": resume["filename"],
            "uploaded_at": resume["uploaded_at"],
            "sections": structured["sections"],
            "available_templates": TEMPLATE_CATALOG,
        }

    def ensure_current(self, post_id: int, background_tasks: BackgroundTasks) -> dict[str, Any]:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            post_context = self._build_post_context(post)

            if not resume:
                return {
                    "status": "no_resume",
                    "post": post_context,
                    "sections": [],
                    "available_templates": TEMPLATE_CATALOG,
                }

            structured = self._ensure_structured_resume(db, resume)
            resume_version = structured["resume_version"]

            if post["status"] in {"pending", "processing"} or not post.get("job_title"):
                return self._build_processing_response(post_context, structured)

            if post["status"] == "error":
                return self._build_error_response(
                    post_context,
                    structured,
                    post.get("error_message") or "Job analysis failed before the resume review could run.",
                )

            row = db.execute(
                """
                SELECT *
                FROM resume_review_analysis
                WHERE post_id = ? AND resume_version = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (post_id, resume_version),
            ).fetchone()

            if not row:
                self._upsert_pending(db, post_id, resume_version)
                background_tasks.add_task(self.process_review_analysis, post_id, resume_version)
                return self._build_processing_response(post_context, structured)

            if row["status"] == "pending":
                return self._build_processing_response(post_context, structured)

            if row["status"] == "error":
                return self._build_error_response(
                    post_context,
                    structured,
                    row.get("error_message") or "Resume review analysis failed.",
                )

            return self._build_complete_response(db, post_context, structured, row)

    def process_review_analysis(self, post_id: int, resume_version: str) -> None:
        try:
            with get_db() as db:
                post = self._get_post(db, post_id)
                resume = self._get_resume_by_version(db, resume_version)
                if not resume:
                    self._mark_analysis_error(db, post_id, resume_version, "Resume version is no longer available.")
                    return

                structured = self._load_structured_resume(db, resume_version)
                if not structured["sections"]:
                    self._mark_analysis_error(db, post_id, resume_version, "Structured resume could not be built.")
                    return

                if post["status"] != "done" or not post.get("job_title"):
                    self._upsert_pending(db, post_id, resume_version)
                    return

                evaluation = self._evaluate_resume_against_job(structured, post)
                analysis_row = self._store_analysis(db, post_id, resume_version, evaluation)
                self._store_target_rows(db, analysis_row["id"], evaluation["targets"])
        except Exception as exc:
            with get_db() as db:
                self._mark_analysis_error(db, post_id, resume_version, f"{type(exc).__name__}: {exc}")

    def get_suggestions(self, post_id: int, target_type: str, target_id: str) -> dict[str, Any]:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=404, detail="No resume uploaded")

            structured = self._ensure_structured_resume(db, resume)
            analysis = self._get_complete_analysis_row(db, post_id, structured["resume_version"])
            overlay_revision = self._active_overlay_revision(db, post_id, structured["resume_version"])
            cached = db.execute(
                """
                SELECT payload
                FROM resume_review_suggestions
                WHERE post_id = ? AND resume_version = ? AND target_type = ? AND target_id = ? AND overlay_revision = ?
                """,
                (post_id, structured["resume_version"], target_type, target_id, overlay_revision),
            ).fetchone()
            if cached:
                return json.loads(cached["payload"])

            response = self._build_complete_response(db, self._build_post_context(post), structured, analysis)
            target = self._find_target(response, target_type, target_id)
            if not target:
                raise HTTPException(status_code=404, detail="Selected resume item was not found")

            payload = self._generate_suggestions(post, response, target_type, target)
            db.execute(
                """
                INSERT INTO resume_review_suggestions (
                  id, post_id, resume_version, target_type, target_id, overlay_revision, payload, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(post_id, resume_version, target_type, target_id, overlay_revision) DO UPDATE SET
                  payload = excluded.payload,
                  updated_at = datetime('now')
                """,
                (
                    payload["cache_id"],
                    post_id,
                    structured["resume_version"],
                    target_type,
                    target_id,
                    overlay_revision,
                    _dumps_json(payload),
                ),
            )
            return payload

    def apply_suggestion(
        self,
        post_id: int,
        suggestion_id: str,
        target_type: str,
        target_id: str,
        destination_section_id: str | None = None,
        destination_entry_id: str | None = None,
    ) -> dict[str, Any]:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=404, detail="No resume uploaded")

            structured = self._ensure_structured_resume(db, resume)
            analysis = self._get_complete_analysis_row(db, post_id, structured["resume_version"])
            suggestion_payload, suggestion = self._find_cached_suggestion(
                db, post_id, structured["resume_version"], suggestion_id
            )
            if suggestion is None:
                raise HTTPException(status_code=404, detail="Suggestion not found")

            self._revert_existing_source_overlays(db, post_id, structured["resume_version"], target_type, target_id)

            overlay_id = str(uuid4())
            option_kind = suggestion["kind"]
            metadata = {
                "annotation_type": "strong_match",
                "rationale": suggestion.get("rationale"),
                "keywords_matched": suggestion.get("keywords_matched", []),
                "keywords_missing": suggestion.get("keywords_missing", []),
                "breakdown_delta": suggestion.get("breakdown_delta", {}),
                "title": suggestion.get("label"),
                "source_target_type": target_type,
                "source_target_id": target_id,
            }

            if option_kind == "rewrite":
                original_text = self._get_base_bullet_text(structured, target_id)
                if original_text is None:
                    raise HTTPException(status_code=404, detail="Bullet target not found")
                db.execute(
                    """
                    INSERT INTO resume_review_overlays (
                      id, post_id, resume_version, source_target_type, source_target_id,
                      target_type, target_id, section_id, entry_id, operation, suggestion_id,
                      original_text, applied_text, score_delta, metadata
                    )
                    VALUES (?, ?, ?, ?, ?, 'bullet', ?, ?, ?, 'replace_bullet', ?, ?, ?, ?, ?)
                    """,
                    (
                        overlay_id,
                        post_id,
                        structured["resume_version"],
                        target_type,
                        target_id,
                        target_id,
                        suggestion.get("destination_section_id"),
                        suggestion.get("destination_entry_id"),
                        suggestion_id,
                        original_text,
                        suggestion["text"],
                        suggestion["score_delta"],
                        _dumps_json(metadata),
                    ),
                )
            elif option_kind == "insert_bullet":
                generated_bullet_id = str(uuid4())
                resolved_section_id = destination_section_id or suggestion.get("destination_section_id")
                resolved_entry_id = destination_entry_id or suggestion.get("destination_entry_id")
                if not resolved_section_id and not resolved_entry_id:
                    raise HTTPException(status_code=422, detail="A destination is required for missing-evidence inserts")
                db.execute(
                    """
                    INSERT INTO resume_review_overlays (
                      id, post_id, resume_version, source_target_type, source_target_id,
                      target_type, target_id, section_id, entry_id, operation, suggestion_id,
                      original_text, applied_text, score_delta, metadata
                    )
                    VALUES (?, ?, ?, ?, ?, 'bullet', ?, ?, ?, 'insert_bullet', ?, ?, ?, ?, ?)
                    """,
                    (
                        overlay_id,
                        post_id,
                        structured["resume_version"],
                        target_type,
                        target_id,
                        generated_bullet_id,
                        resolved_section_id,
                        resolved_entry_id,
                        suggestion_id,
                        "",
                        suggestion["text"],
                        suggestion["score_delta"],
                        _dumps_json(metadata),
                    ),
                )
            else:
                raise HTTPException(status_code=422, detail="Unsupported suggestion kind")

            response = self._build_complete_response(
                db,
                self._build_post_context(post),
                structured,
                analysis,
            )
            response["action"] = {
                "kind": "apply",
                "overlay_id": overlay_id,
                "suggestion_id": suggestion_id,
                "score_delta": suggestion["score_delta"],
                "message": f"Applied {suggestion.get('label', 'enhancement')}.",
                "expires_in_ms": 5000,
                "cache_id": suggestion_payload["cache_id"],
            }
            return response

    def revert_overlay(self, post_id: int, overlay_id: str) -> dict[str, Any]:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=404, detail="No resume uploaded")

            structured = self._ensure_structured_resume(db, resume)
            analysis = self._get_complete_analysis_row(db, post_id, structured["resume_version"])
            row = db.execute(
                """
                SELECT *
                FROM resume_review_overlays
                WHERE id = ? AND post_id = ? AND reverted_at IS NULL
                """,
                (overlay_id, post_id),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Overlay not found")

            db.execute(
                "UPDATE resume_review_overlays SET reverted_at = ? WHERE id = ?",
                (_now_iso(), overlay_id),
            )

            response = self._build_complete_response(
                db,
                self._build_post_context(post),
                structured,
                analysis,
            )
            response["action"] = {
                "kind": "revert",
                "overlay_id": overlay_id,
                "message": "Reverted applied enhancement.",
            }
            return response

    def add_template(self, post_id: int, template_type: str, parent_section_id: str | None) -> dict[str, Any]:
        with get_db() as db:
            post = self._get_post(db, post_id)
            resume = self._get_latest_resume(db)
            if not resume:
                raise HTTPException(status_code=404, detail="No resume uploaded")

            structured = self._ensure_structured_resume(db, resume)
            analysis = self._get_complete_analysis_row(db, post_id, structured["resume_version"])
            template = next((item for item in TEMPLATE_CATALOG if item["type"] == template_type), None)
            if template is None:
                raise HTTPException(status_code=422, detail="Unsupported template type")

            overlay_id = str(uuid4())
            if parent_section_id:
                section = self._find_section(structured["sections"], parent_section_id)
                if not section:
                    raise HTTPException(status_code=404, detail="Destination section not found")
                db.execute(
                    """
                    INSERT INTO resume_review_overlays (
                      id, post_id, resume_version, source_target_type, source_target_id, target_type,
                      target_id, section_id, entry_id, operation, suggestion_id, original_text,
                      applied_text, score_delta, metadata
                    )
                    VALUES (?, ?, ?, 'section', ?, 'entry', ?, ?, NULL, 'add_entry_template', NULL, '', ?, 0, ?)
                    """,
                    (
                        overlay_id,
                        post_id,
                        structured["resume_version"],
                        parent_section_id,
                        str(uuid4()),
                        parent_section_id,
                        f"Additional {section['title'].rstrip('s')}",
                        _dumps_json({"template_type": section["type"], "is_template": True}),
                    ),
                )
            else:
                db.execute(
                    """
                    INSERT INTO resume_review_overlays (
                      id, post_id, resume_version, source_target_type, source_target_id, target_type,
                      target_id, section_id, entry_id, operation, suggestion_id, original_text,
                      applied_text, score_delta, metadata
                    )
                    VALUES (?, ?, ?, 'section', ?, 'section', ?, NULL, NULL, 'add_section_template', NULL, '', ?, 0, ?)
                    """,
                    (
                        overlay_id,
                        post_id,
                        structured["resume_version"],
                        template_type,
                        str(uuid4()),
                        template["title"],
                        _dumps_json({"template_type": template_type, "entry_based": template["entry_based"], "is_template": True}),
                    ),
                )

            response = self._build_complete_response(
                db,
                self._build_post_context(post),
                structured,
                analysis,
            )
            response["action"] = {
                "kind": "template",
                "message": f"Added {template['title']} template.",
            }
            return response

    def _get_latest_resume(self, db) -> dict[str, Any] | None:
        row = db.execute(
            "SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1"
        ).fetchone()
        if not row or not row.get("raw_text"):
            return None
        return row

    def _get_resume_by_version(self, db, resume_version: str) -> dict[str, Any] | None:
        row = db.execute(
            """
            SELECT r.*
            FROM resume r
            JOIN structured_resume_versions srv ON srv.resume_row_id = r.id
            WHERE srv.resume_version = ?
            ORDER BY r.uploaded_at DESC, r.id DESC
            LIMIT 1
            """,
            (resume_version,),
        ).fetchone()
        if row and row.get("raw_text"):
            return row

        fallback = db.execute(
            "SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1"
        ).fetchone()
        if fallback and get_resume_version(fallback.get("raw_text") or "") == resume_version:
            return fallback
        return None

    def _ensure_structured_resume(self, db, resume_row: dict[str, Any]) -> dict[str, Any]:
        resume_version = get_resume_version(resume_row.get("raw_text") or "")
        existing = db.execute(
            "SELECT resume_version FROM structured_resume_versions WHERE resume_version = ?",
            (resume_version,),
        ).fetchone()
        if existing:
            return self._load_structured_resume(db, resume_version)

        structured = build_structured_resume(resume_row.get("raw_text") or "")
        db.execute(
            """
            INSERT INTO structured_resume_versions (resume_version, resume_row_id, filename, raw_text_hash)
            VALUES (?, ?, ?, ?)
            """,
            (
                structured["resume_version"],
                resume_row["id"],
                resume_row.get("filename"),
                structured["resume_version"],
            ),
        )
        for section in structured["sections"]:
            db.execute(
                """
                INSERT INTO structured_resume_sections (id, resume_version, type, title, display_order)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    section["id"],
                    structured["resume_version"],
                    section["type"],
                    section["title"],
                    section["order"],
                ),
            )
            for entry in section["entries"]:
                db.execute(
                    """
                    INSERT INTO structured_resume_entries (id, section_id, title, subtitle, date_range, display_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        entry["id"],
                        section["id"],
                        entry["title"],
                        entry.get("subtitle"),
                        entry.get("date_range"),
                        entry["order"],
                    ),
                )
                for bullet in entry["bullets"]:
                    db.execute(
                        """
                        INSERT INTO structured_resume_bullets (id, section_id, entry_id, text, display_order)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            bullet["id"],
                            section["id"],
                            entry["id"],
                            bullet["text"],
                            bullet["order"],
                        ),
                    )
            for bullet in section["bullets"]:
                db.execute(
                    """
                    INSERT INTO structured_resume_bullets (id, section_id, entry_id, text, display_order)
                    VALUES (?, ?, NULL, ?, ?)
                    """,
                    (
                        bullet["id"],
                        section["id"],
                        bullet["text"],
                        bullet["order"],
                    ),
                )
        return structured

    def _load_structured_resume(self, db, resume_version: str) -> dict[str, Any]:
        sections = db.execute(
            """
            SELECT id, type, title, display_order
            FROM structured_resume_sections
            WHERE resume_version = ?
            ORDER BY display_order ASC
            """,
            (resume_version,),
        ).fetchall()
        entries = db.execute(
            """
            SELECT id, section_id, title, subtitle, date_range, display_order
            FROM structured_resume_entries
            WHERE section_id IN (
              SELECT id FROM structured_resume_sections WHERE resume_version = ?
            )
            ORDER BY display_order ASC
            """,
            (resume_version,),
        ).fetchall()
        bullets = db.execute(
            """
            SELECT id, section_id, entry_id, text, display_order
            FROM structured_resume_bullets
            WHERE section_id IN (
              SELECT id FROM structured_resume_sections WHERE resume_version = ?
            )
            ORDER BY display_order ASC
            """,
            (resume_version,),
        ).fetchall()

        entry_map: dict[str, dict[str, Any]] = {}
        section_map: dict[str, dict[str, Any]] = {}
        assembled_sections: list[dict[str, Any]] = []
        for row in sections:
            payload = {
                "id": row["id"],
                "type": row["type"],
                "title": row["title"],
                "order": row["display_order"],
                "entries": [],
                "bullets": [],
            }
            section_map[row["id"]] = payload
            assembled_sections.append(payload)
        for row in entries:
            payload = {
                "id": row["id"],
                "title": row["title"],
                "subtitle": row.get("subtitle"),
                "date_range": row.get("date_range"),
                "order": row["display_order"],
                "bullets": [],
            }
            entry_map[row["id"]] = payload
            section_map[row["section_id"]]["entries"].append(payload)
        for row in bullets:
            payload = {
                "id": row["id"],
                "text": row["text"],
                "order": row["display_order"],
            }
            if row.get("entry_id"):
                entry_map[row["entry_id"]]["bullets"].append(payload)
            else:
                section_map[row["section_id"]]["bullets"].append(payload)

        return {
            "resume_version": resume_version,
            "sections": assembled_sections,
        }

    def _get_post(self, db, post_id: int) -> dict[str, Any]:
        row = db.execute(
            """
            SELECT
              p.id, p.status, p.error_message, p.saved_at, p.post_text, p.post_url,
              a.job_title, a.company_name, a.company_linkedin_url, a.location,
              a.remote_status, a.seniority, a.domain, a.compensation,
              a.must_have_skills, a.nice_to_have_skills, a.experience_years,
              a.required_pm_experience, a.immediate_joiner_preferred,
              a.application_method, a.apply_url, a.culture_signals, a.red_flags,
              a.fitment_score, a.fitment_summary, a.strong_matches, a.gaps,
              a.mandatory_qualification_missing, a.mandatory_qualification_reasons,
              a.mandatory_qualification_details, a.angles_to_emphasize,
              a.outreach_talking_points, a.linked_content
            FROM posts p
            LEFT JOIN analysis a ON a.post_id = p.id
            WHERE p.id = ?
            """,
            (post_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found")
        return row

    def _build_post_context(self, post: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": post["id"],
            "status": post["status"],
            "error_message": post.get("error_message"),
            "saved_at": post.get("saved_at"),
            "post_url": post.get("post_url"),
            "job_title": post.get("job_title"),
            "company_name": post.get("company_name"),
            "location": post.get("location"),
            "remote_status": post.get("remote_status"),
            "seniority": post.get("seniority"),
            "fitment_score": post.get("fitment_score"),
        }

    def _build_processing_response(self, post_context: dict[str, Any], structured: dict[str, Any]) -> dict[str, Any]:
        return {
            "status": "processing",
            "post": post_context,
            "resume_version": structured["resume_version"],
            "overlay_revision": 0,
            "score_breakdown": None,
            "keyword_summary": {"matched": [], "missing": []},
            "overall_summary": None,
            "top_issues": [],
            "top_opportunities": [],
            "sections": self._blank_sections(structured["sections"]),
            "available_templates": TEMPLATE_CATALOG,
        }

    def _build_error_response(
        self,
        post_context: dict[str, Any],
        structured: dict[str, Any],
        message: str,
    ) -> dict[str, Any]:
        return {
            "status": "error",
            "post": post_context,
            "resume_version": structured["resume_version"],
            "overlay_revision": 0,
            "score_breakdown": None,
            "keyword_summary": {"matched": [], "missing": []},
            "overall_summary": None,
            "top_issues": [],
            "top_opportunities": [],
            "error_message": message,
            "sections": self._blank_sections(structured["sections"]),
            "available_templates": TEMPLATE_CATALOG,
        }

    def _build_complete_response(
        self,
        db,
        post_context: dict[str, Any],
        structured: dict[str, Any],
        analysis_row: dict[str, Any],
    ) -> dict[str, Any]:
        target_rows = db.execute(
            """
            SELECT *
            FROM resume_review_analysis_targets
            WHERE analysis_id = ?
            """,
            (analysis_row["id"],),
        ).fetchall()
        active_overlays = db.execute(
            """
            SELECT *
            FROM resume_review_overlays
            WHERE post_id = ? AND resume_version = ? AND reverted_at IS NULL
            ORDER BY created_at ASC, id ASC
            """,
            (post_context["id"], structured["resume_version"]),
        ).fetchall()

        effective_sections = self._build_effective_sections(structured["sections"], target_rows, active_overlays)
        overlay_revision = len(active_overlays)
        score_breakdown = _loads_json(analysis_row.get("score_breakdown"), {})
        keyword_summary = _loads_json(analysis_row.get("keyword_summary"), {"matched": [], "missing": []})
        for overlay in active_overlays:
            metadata = _loads_json(overlay.get("metadata"), {})
            breakdown_delta = metadata.get("breakdown_delta", {})
            for key, value in breakdown_delta.items():
                score_breakdown[key] = score_breakdown.get(key, 0) + value
        base_total = analysis_row.get("total_score") or score_breakdown.get("total", 0)
        overlay_total = sum(int(row.get("score_delta") or 0) for row in active_overlays)
        score_breakdown["total"] = max(0, min(100, base_total + overlay_total))

        top_issues = _loads_json(analysis_row.get("top_issues"), [])
        top_opportunities = _loads_json(analysis_row.get("top_opportunities"), [])
        applied_source_ids = {row["source_target_id"] for row in active_overlays}
        top_opportunities = [item for item in top_opportunities if item.get("target_id") not in applied_source_ids]

        return {
            "status": "complete",
            "post": post_context,
            "resume_version": structured["resume_version"],
            "overlay_revision": overlay_revision,
            "score_breakdown": score_breakdown,
            "keyword_summary": keyword_summary,
            "overall_summary": analysis_row.get("overall_summary"),
            "top_issues": top_issues,
            "top_opportunities": top_opportunities,
            "sections": effective_sections,
            "available_templates": TEMPLATE_CATALOG,
        }

    def _blank_sections(self, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._decorate_with_targets(copy.deepcopy(sections), {})

    def _decorate_with_targets(
        self,
        sections: list[dict[str, Any]],
        target_map: dict[tuple[str, str], dict[str, Any]],
    ) -> list[dict[str, Any]]:
        for section in sections:
            self._apply_target_fields(section, target_map.get(("section", section["id"])))
            section["can_add_entries"] = section["type"] in ENTRY_BASED_SECTION_TYPES
            section.setdefault("applied_overlay_id", None)
            section.setdefault("is_template", False)
            for entry in section["entries"]:
                self._apply_target_fields(entry, target_map.get(("entry", entry["id"])))
                entry.setdefault("applied_overlay_id", None)
                entry.setdefault("is_template", False)
                for bullet in entry["bullets"]:
                    self._apply_target_fields(bullet, target_map.get(("bullet", bullet["id"])))
                    bullet.setdefault("applied_overlay_id", None)
                    bullet.setdefault("is_generated", False)
            for bullet in section["bullets"]:
                self._apply_target_fields(bullet, target_map.get(("bullet", bullet["id"])))
                bullet.setdefault("applied_overlay_id", None)
                bullet.setdefault("is_generated", False)
        return sections

    def _apply_target_fields(self, node: dict[str, Any], target: dict[str, Any] | None) -> None:
        if not target:
            node["annotation_type"] = "neutral"
            node["score"] = None
            node["score_impact"] = 0
            node["explanation"] = None
            node["keywords_matched"] = []
            node["keywords_missing"] = []
            node["suggestion_summary"] = None
            return
        node["annotation_type"] = target.get("annotation_type") or "neutral"
        node["score"] = target.get("score")
        node["score_impact"] = target.get("score_impact") or 0
        node["explanation"] = target.get("explanation")
        node["keywords_matched"] = target.get("keywords_matched", [])
        node["keywords_missing"] = target.get("keywords_missing", [])
        node["suggestion_summary"] = target.get("suggestion_summary")

    def _build_effective_sections(
        self,
        base_sections: list[dict[str, Any]],
        target_rows: list[dict[str, Any]],
        active_overlays: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        sections = self._decorate_with_targets(copy.deepcopy(base_sections), self._target_map(target_rows))
        section_map, entry_map, bullet_map = self._index_sections(sections)

        for overlay in active_overlays:
            metadata = _loads_json(overlay.get("metadata"), {})
            if overlay["operation"] == "replace_bullet":
                bullet = bullet_map.get(overlay["target_id"])
                if not bullet:
                    continue
                bullet["text"] = overlay["applied_text"]
                bullet["applied_overlay_id"] = overlay["id"]
                bullet["annotation_type"] = metadata.get("annotation_type", "strong_match")
                bullet["score_impact"] = int(overlay.get("score_delta") or 0)
                bullet["explanation"] = metadata.get("rationale") or "Applied enhancement."
                bullet["keywords_matched"] = metadata.get("keywords_matched", [])
                bullet["keywords_missing"] = metadata.get("keywords_missing", [])
            elif overlay["operation"] == "insert_bullet":
                destination_entry = entry_map.get(overlay.get("entry_id"))
                new_bullet = {
                    "id": overlay["target_id"],
                    "text": overlay["applied_text"],
                    "order": 999,
                    "annotation_type": metadata.get("annotation_type", "strong_match"),
                    "score": None,
                    "score_impact": int(overlay.get("score_delta") or 0),
                    "explanation": metadata.get("rationale") or "Inserted missing evidence suggestion.",
                    "keywords_matched": metadata.get("keywords_matched", []),
                    "keywords_missing": metadata.get("keywords_missing", []),
                    "suggestion_summary": metadata.get("title"),
                    "applied_overlay_id": overlay["id"],
                    "is_generated": True,
                }
                if destination_entry:
                    destination_entry["bullets"].append(new_bullet)
                    destination_entry["bullets"].sort(key=lambda item: (item["order"], item["id"]))
                else:
                    destination_section = section_map.get(overlay.get("section_id"))
                    if destination_section:
                        destination_section["bullets"].append(new_bullet)
                        destination_section["bullets"].sort(key=lambda item: (item["order"], item["id"]))
                source_entry = entry_map.get(overlay.get("source_target_id"))
                source_section = section_map.get(overlay.get("source_target_id"))
                source_node = source_entry or source_section
                if source_node:
                    source_node["applied_overlay_id"] = overlay["id"]
                    source_node["annotation_type"] = metadata.get("annotation_type", "strong_match")
                    source_node["explanation"] = metadata.get("rationale") or "Applied a grounded missing-evidence draft."
            elif overlay["operation"] == "add_section_template":
                metadata_type = metadata.get("template_type", "other")
                new_section = {
                    "id": overlay["target_id"],
                    "type": metadata_type,
                    "title": overlay["applied_text"],
                    "order": 999,
                    "entries": [],
                    "bullets": [],
                    "annotation_type": "neutral",
                    "score": None,
                    "score_impact": 0,
                    "explanation": "New empty template section.",
                    "keywords_matched": [],
                    "keywords_missing": [],
                    "suggestion_summary": None,
                    "can_add_entries": metadata.get("entry_based", False),
                    "applied_overlay_id": overlay["id"],
                    "is_template": True,
                }
                sections.append(new_section)
                section_map[new_section["id"]] = new_section
            elif overlay["operation"] == "add_entry_template":
                section = section_map.get(overlay.get("section_id"))
                if not section:
                    continue
                new_entry = {
                    "id": overlay["target_id"],
                    "title": overlay["applied_text"],
                    "subtitle": None,
                    "date_range": None,
                    "order": 999,
                    "bullets": [],
                    "annotation_type": "neutral",
                    "score": None,
                    "score_impact": 0,
                    "explanation": "New empty template entry.",
                    "keywords_matched": [],
                    "keywords_missing": [],
                    "suggestion_summary": None,
                    "applied_overlay_id": overlay["id"],
                    "is_template": True,
                }
                section["entries"].append(new_entry)
                section["entries"].sort(key=lambda item: (item["order"], item["id"]))
                entry_map[new_entry["id"]] = new_entry

        sections.sort(key=lambda item: (SECTION_TYPE_PRIORITY.get(item["type"], 99), item["order"], item["title"]))
        for index, section in enumerate(sections):
            section["order"] = index
        return sections

    def _target_map(self, rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
        mapping = {}
        for row in rows:
            mapping[(row["target_type"], row["target_id"])] = {
                "annotation_type": row.get("annotation_type"),
                "score": row.get("score"),
                "score_impact": row.get("score_impact"),
                "explanation": row.get("explanation"),
                "keywords_matched": _loads_json(row.get("keywords_matched"), []),
                "keywords_missing": _loads_json(row.get("keywords_missing"), []),
                "suggestion_summary": row.get("suggestion_summary"),
            }
        return mapping

    def _index_sections(self, sections: list[dict[str, Any]]):
        section_map: dict[str, dict[str, Any]] = {}
        entry_map: dict[str, dict[str, Any]] = {}
        bullet_map: dict[str, dict[str, Any]] = {}
        for section in sections:
            section_map[section["id"]] = section
            for entry in section["entries"]:
                entry_map[entry["id"]] = entry
                for bullet in entry["bullets"]:
                    bullet_map[bullet["id"]] = bullet
            for bullet in section["bullets"]:
                bullet_map[bullet["id"]] = bullet
        return section_map, entry_map, bullet_map

    def _upsert_pending(self, db, post_id: int, resume_version: str) -> None:
        db.execute(
            """
            INSERT INTO resume_review_analysis (
              post_id, resume_version, status, total_score, score_breakdown, keyword_summary,
              top_issues, top_opportunities, overall_summary, error_message, updated_at
            )
            VALUES (?, ?, 'pending', NULL, '{}', '{}', '[]', '[]', NULL, NULL, datetime('now'))
            ON CONFLICT(post_id, resume_version) DO UPDATE SET
              status = 'pending',
              total_score = NULL,
              score_breakdown = '{}',
              keyword_summary = '{}',
              top_issues = '[]',
              top_opportunities = '[]',
              overall_summary = NULL,
              error_message = NULL,
              updated_at = datetime('now')
            """,
            (post_id, resume_version),
        )

    def _mark_analysis_error(self, db, post_id: int, resume_version: str, message: str) -> None:
        db.execute(
            """
            INSERT INTO resume_review_analysis (
              post_id, resume_version, status, total_score, score_breakdown, keyword_summary,
              top_issues, top_opportunities, overall_summary, error_message, updated_at
            )
            VALUES (?, ?, 'error', NULL, '{}', '{}', '[]', '[]', NULL, ?, datetime('now'))
            ON CONFLICT(post_id, resume_version) DO UPDATE SET
              status = 'error',
              error_message = excluded.error_message,
              updated_at = datetime('now')
            """,
            (post_id, resume_version, message),
        )

    def _store_analysis(self, db, post_id: int, resume_version: str, evaluation: dict[str, Any]) -> dict[str, Any]:
        db.execute(
            """
            INSERT INTO resume_review_analysis (
              post_id, resume_version, status, total_score, score_breakdown, keyword_summary,
              top_issues, top_opportunities, overall_summary, error_message, updated_at
            )
            VALUES (?, ?, 'complete', ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
            ON CONFLICT(post_id, resume_version) DO UPDATE SET
              status = 'complete',
              total_score = excluded.total_score,
              score_breakdown = excluded.score_breakdown,
              keyword_summary = excluded.keyword_summary,
              top_issues = excluded.top_issues,
              top_opportunities = excluded.top_opportunities,
              overall_summary = excluded.overall_summary,
              error_message = NULL,
              updated_at = datetime('now')
            """,
            (
                post_id,
                resume_version,
                evaluation["score_breakdown"]["total"],
                _dumps_json(evaluation["score_breakdown"]),
                _dumps_json(evaluation["keyword_summary"]),
                _dumps_json(evaluation["top_issues"]),
                _dumps_json(evaluation["top_opportunities"]),
                evaluation["overall_summary"],
            ),
        )
        return db.execute(
            """
            SELECT *
            FROM resume_review_analysis
            WHERE post_id = ? AND resume_version = ?
            """,
            (post_id, resume_version),
        ).fetchone()

    def _store_target_rows(self, db, analysis_id: int, targets: list[dict[str, Any]]) -> None:
        db.execute("DELETE FROM resume_review_analysis_targets WHERE analysis_id = ?", (analysis_id,))
        for target in targets:
            db.execute(
                """
                INSERT INTO resume_review_analysis_targets (
                  analysis_id, target_type, target_id, parent_section_id, parent_entry_id, annotation_type,
                  score, score_impact, explanation, keywords_matched, keywords_missing, suggestion_summary
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    analysis_id,
                    target["target_type"],
                    target["target_id"],
                    target.get("parent_section_id"),
                    target.get("parent_entry_id"),
                    target.get("annotation_type"),
                    target.get("score"),
                    target.get("score_impact"),
                    target.get("explanation"),
                    _dumps_json(target.get("keywords_matched", [])),
                    _dumps_json(target.get("keywords_missing", [])),
                    target.get("suggestion_summary"),
                ),
            )

    def _get_complete_analysis_row(self, db, post_id: int, resume_version: str) -> dict[str, Any]:
        row = db.execute(
            """
            SELECT *
            FROM resume_review_analysis
            WHERE post_id = ? AND resume_version = ? AND status = 'complete'
            ORDER BY id DESC
            LIMIT 1
            """,
            (post_id, resume_version),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=409, detail="Resume analysis is not ready yet")
        return row

    def _active_overlay_revision(self, db, post_id: int, resume_version: str) -> int:
        row = db.execute(
            """
            SELECT COUNT(*) AS count
            FROM resume_review_overlays
            WHERE post_id = ? AND resume_version = ? AND reverted_at IS NULL
            """,
            (post_id, resume_version),
        ).fetchone()
        return int(row["count"])

    def _find_target(self, response: dict[str, Any], target_type: str, target_id: str) -> dict[str, Any] | None:
        for section in response["sections"]:
            if target_type == "section" and section["id"] == target_id:
                payload = dict(section)
                payload["parent_section_id"] = section["id"]
                return payload
            for entry in section["entries"]:
                if target_type == "entry" and entry["id"] == target_id:
                    payload = dict(entry)
                    payload["parent_section_id"] = section["id"]
                    payload["parent_entry_id"] = entry["id"]
                    payload["section_type"] = section["type"]
                    return payload
                for bullet in entry["bullets"]:
                    if target_type == "bullet" and bullet["id"] == target_id:
                        payload = dict(bullet)
                        payload["parent_section_id"] = section["id"]
                        payload["parent_entry_id"] = entry["id"]
                        payload["section_type"] = section["type"]
                        return payload
            for bullet in section["bullets"]:
                if target_type == "bullet" and bullet["id"] == target_id:
                    payload = dict(bullet)
                    payload["parent_section_id"] = section["id"]
                    payload["parent_entry_id"] = None
                    payload["section_type"] = section["type"]
                    return payload
        return None

    def _generate_suggestions(
        self,
        post: dict[str, Any],
        response: dict[str, Any],
        target_type: str,
        target: dict[str, Any],
    ) -> dict[str, Any]:
        cache_id = str(uuid4())
        suggestions: list[dict[str, Any]] = []
        matched = target.get("keywords_matched", [])
        missing = target.get("keywords_missing", [])
        annotation_type = target.get("annotation_type", "neutral")

        if target_type == "bullet" and annotation_type == "needs_rewrite":
            suggestions = self._rewrite_suggestions(
                target["text"],
                matched,
                missing,
                target.get("parent_section_id"),
                target.get("parent_entry_id"),
            )
        elif target_type in {"entry", "section"} and annotation_type == "missing_evidence":
            suggestions = [self._missing_evidence_suggestion(target, missing, post)]

        payload = {
            "status": "complete",
            "cache_id": cache_id,
            "target_type": target_type,
            "target_id": target["id"],
            "annotation_type": annotation_type,
            "explanation": target.get("explanation"),
            "keywords_matched": matched,
            "keywords_missing": missing,
            "suggestions": suggestions,
        }
        return payload

    def _rewrite_suggestions(
        self,
        text: str,
        matched: list[str],
        missing: list[str],
        section_id: str | None,
        entry_id: str | None,
    ) -> list[dict[str, Any]]:
        base_text = text.strip().rstrip(".")
        cleaned_text = GENERIC_RE.sub("", base_text).strip().capitalize()
        lead_keyword = matched[0] if matched else "product strategy"
        support_keyword = missing[0] if missing else lead_keyword
        variant_one = cleaned_text
        if not ACTION_VERB_RE.search(variant_one):
            variant_one = f"Led {variant_one[:1].lower() + variant_one[1:]}" if variant_one else f"Led {lead_keyword} initiatives"
        variant_one = f"{variant_one}, emphasizing {lead_keyword} outcomes.".strip()

        variant_two = cleaned_text
        if not METRIC_RE.search(variant_two):
            variant_two = f"{variant_two} with clear ownership across roadmap, delivery, and stakeholder alignment.".strip()
        variant_two = f"{variant_two} Aligned the work to {support_keyword} priorities.".strip()

        return [
            {
                "id": str(uuid4()),
                "kind": "rewrite",
                "label": "Impact-first rewrite",
                "text": variant_one,
                "rationale": "Bring the strongest keyword match and clearer ownership to the front.",
                "score_delta": 6,
                "breakdown_delta": {"keyword_coverage": 2, "experience_alignment": 2, "skill_coverage": 1, "section_completeness": 1},
                "keywords_matched": matched,
                "keywords_missing": missing,
                "destination_section_id": section_id,
                "destination_entry_id": entry_id,
            },
            {
                "id": str(uuid4()),
                "kind": "rewrite",
                "label": "Clarity-focused rewrite",
                "text": variant_two,
                "rationale": "Keep the claim grounded but make the fit to the job easier to scan.",
                "score_delta": 4,
                "breakdown_delta": {"keyword_coverage": 2, "experience_alignment": 1, "skill_coverage": 1},
                "keywords_matched": matched,
                "keywords_missing": missing,
                "destination_section_id": section_id,
                "destination_entry_id": entry_id,
            },
        ]

    def _missing_evidence_suggestion(
        self,
        target: dict[str, Any],
        missing: list[str],
        post: dict[str, Any],
    ) -> dict[str, Any]:
        keyword = missing[0] if missing else (post.get("job_title") or "product work")
        section_label = target.get("title") or "this section"
        entry_id = target.get("id") if "bullets" in target and target.get("parent_entry_id") else target.get("parent_entry_id")
        destination_entry_id = target["id"] if target.get("parent_entry_id") or target.get("section_type") in ENTRY_BASED_SECTION_TYPES else None
        destination_section_id = target.get("parent_section_id") or target["id"]
        text = f"Demonstrated hands-on ownership of {keyword} work within {section_label}, translating business goals into shipped product outcomes."
        return {
            "id": str(uuid4()),
            "kind": "insert_bullet",
            "label": "Add grounded evidence",
            "text": text,
            "rationale": f"Add a concise proof point for {keyword} so the role fit is easier to verify.",
            "score_delta": 8,
            "breakdown_delta": {"keyword_coverage": 3, "experience_alignment": 3, "skill_coverage": 1, "section_completeness": 1},
            "keywords_matched": [],
            "keywords_missing": missing,
            "destination_section_id": destination_section_id,
            "destination_entry_id": destination_entry_id if entry_id else None,
        }

    def _find_cached_suggestion(self, db, post_id: int, resume_version: str, suggestion_id: str):
        rows = db.execute(
            """
            SELECT payload
            FROM resume_review_suggestions
            WHERE post_id = ? AND resume_version = ?
            ORDER BY updated_at DESC
            """,
            (post_id, resume_version),
        ).fetchall()
        for row in rows:
            payload = json.loads(row["payload"])
            for suggestion in payload.get("suggestions", []):
                if suggestion["id"] == suggestion_id:
                    return payload, suggestion
        return None, None

    def _get_base_bullet_text(self, structured: dict[str, Any], bullet_id: str) -> str | None:
        for section in structured["sections"]:
            for bullet in section["bullets"]:
                if bullet["id"] == bullet_id:
                    return bullet["text"]
            for entry in section["entries"]:
                for bullet in entry["bullets"]:
                    if bullet["id"] == bullet_id:
                        return bullet["text"]
        return None

    def _revert_existing_source_overlays(self, db, post_id: int, resume_version: str, target_type: str, target_id: str) -> None:
        db.execute(
            """
            UPDATE resume_review_overlays
            SET reverted_at = ?
            WHERE post_id = ? AND resume_version = ? AND source_target_type = ? AND source_target_id = ? AND reverted_at IS NULL
            """,
            (_now_iso(), post_id, resume_version, target_type, target_id),
        )

    def _find_section(self, sections: list[dict[str, Any]], section_id: str) -> dict[str, Any] | None:
        return next((section for section in sections if section["id"] == section_id), None)

    def _evaluate_resume_against_job(self, structured: dict[str, Any], post: dict[str, Any]) -> dict[str, Any]:
        keywords = self._job_keywords(post)
        must_have = keywords["must_have"]
        nice_to_have = keywords["nice_to_have"]
        all_keywords = keywords["all"]

        targets: list[dict[str, Any]] = []
        overall_matched: set[str] = set()
        experience_matched: set[str] = set()
        skills_matched: set[str] = set()
        key_sections_present = 0

        for section in structured["sections"]:
            section_matched: set[str] = set()
            section_targets: list[dict[str, Any]] = []
            if section["type"] in {"contact", "summary", "experience", "skills", "education"}:
                key_sections_present += 1

            for bullet in section["bullets"]:
                bullet_target = self._score_bullet(
                    bullet["text"],
                    all_keywords,
                    must_have,
                    section["type"],
                    section["id"],
                    None,
                    bullet["id"],
                )
                targets.append(bullet_target)
                section_targets.append(bullet_target)
                section_matched.update(bullet_target["keywords_matched"])
                overall_matched.update(bullet_target["keywords_matched"])
                if section["type"] == "skills":
                    skills_matched.update(bullet_target["keywords_matched"])

            for entry in section["entries"]:
                entry_matched: set[str] = set()
                entry_targets: list[dict[str, Any]] = []
                for bullet in entry["bullets"]:
                    bullet_target = self._score_bullet(
                        bullet["text"],
                        all_keywords,
                        must_have,
                        section["type"],
                        section["id"],
                        entry["id"],
                        bullet["id"],
                    )
                    targets.append(bullet_target)
                    entry_targets.append(bullet_target)
                    section_targets.append(bullet_target)
                    entry_matched.update(bullet_target["keywords_matched"])
                    section_matched.update(bullet_target["keywords_matched"])
                    overall_matched.update(bullet_target["keywords_matched"])
                    if section["type"] == "experience":
                        experience_matched.update(bullet_target["keywords_matched"])
                    if section["type"] == "skills":
                        skills_matched.update(bullet_target["keywords_matched"])

                entry_missing = [keyword for keyword in must_have if keyword not in entry_matched][:4]
                entry_annotation = "missing_evidence" if entry_missing else ("strong_match" if entry_matched else "neutral")
                entry_score = max(35, min(95, 50 + len(entry_matched) * 10 - len(entry_missing) * 8))
                entry_explanation = (
                    f"This entry is not yet proving {', '.join(entry_missing)} clearly enough for the job."
                    if entry_missing
                    else "This entry already reinforces relevant job signals."
                    if entry_matched
                    else "This entry is not strongly tied to the job yet."
                )
                targets.append(
                    {
                        "target_type": "entry",
                        "target_id": entry["id"],
                        "parent_section_id": section["id"],
                        "parent_entry_id": entry["id"],
                        "annotation_type": entry_annotation,
                        "score": entry_score,
                        "score_impact": -max(2, len(entry_missing) * 2) if entry_missing else len(entry_matched) * 2,
                        "explanation": entry_explanation,
                        "keywords_matched": sorted(entry_matched),
                        "keywords_missing": entry_missing,
                        "suggestion_summary": "Add a grounded bullet to prove missing experience." if entry_missing else None,
                    }
                )

            section_missing = [keyword for keyword in must_have if keyword not in section_matched][:4]
            if section["type"] == "summary" and section_missing and section["bullets"]:
                section_annotation = "needs_rewrite"
            elif section_missing and section["type"] in {"experience", "projects", "skills"}:
                section_annotation = "missing_evidence"
            elif section_matched:
                section_annotation = "strong_match"
            else:
                section_annotation = "neutral"
            section_score = max(30, min(96, 45 + len(section_matched) * 7 - len(section_missing) * 6 + len(section_targets)))
            targets.append(
                {
                    "target_type": "section",
                    "target_id": section["id"],
                    "parent_section_id": section["id"],
                    "parent_entry_id": None,
                    "annotation_type": section_annotation,
                    "score": section_score,
                    "score_impact": -max(2, len(section_missing) * 2) if section_missing else len(section_matched),
                    "explanation": (
                        f"This section still needs stronger evidence for {', '.join(section_missing)}."
                        if section_missing
                        else "This section is contributing useful job fit signals."
                        if section_matched
                        else "This section is not strongly affecting the score yet."
                    ),
                    "keywords_matched": sorted(section_matched),
                    "keywords_missing": section_missing,
                    "suggestion_summary": "Add or revise bullets in this section to close missing evidence." if section_missing else None,
                }
            )

        matched_total = len(overall_matched)
        keyword_target_count = max(1, len(all_keywords))
        keyword_coverage = round((matched_total / keyword_target_count) * 35)
        experience_alignment = min(30, 12 + len(experience_matched) * 4)
        skill_coverage = min(20, 8 + len(skills_matched) * 3)
        section_completeness = min(15, key_sections_present * 3)
        critical_gap_penalty = 0
        if post.get("mandatory_qualification_missing"):
            critical_gap_penalty -= 10
        missing_must_have = [keyword for keyword in must_have if keyword not in overall_matched]
        critical_gap_penalty -= min(10, len(missing_must_have) * 2)
        total = max(0, min(100, keyword_coverage + experience_alignment + skill_coverage + section_completeness + critical_gap_penalty))

        top_issues = self._top_targets(targets, descending=False)
        top_opportunities = self._top_targets(targets, descending=True)
        keyword_summary = {
            "matched": sorted(overall_matched),
            "missing": missing_must_have,
            "nice_to_have_missing": [keyword for keyword in nice_to_have if keyword not in overall_matched][:5],
        }

        summary_parts = []
        if missing_must_have:
            summary_parts.append(f"Missing or weak evidence for {', '.join(missing_must_have[:3])}")
        if experience_matched:
            summary_parts.append(f"Experience signals matched: {', '.join(sorted(experience_matched)[:3])}")
        if not summary_parts:
            summary_parts.append("The resume has some relevant signals, but most sections need stronger targeting for this role.")

        return {
            "score_breakdown": {
                "keyword_coverage": keyword_coverage,
                "experience_alignment": experience_alignment,
                "skill_coverage": skill_coverage,
                "section_completeness": section_completeness,
                "critical_gap_penalty": critical_gap_penalty,
                "total": total,
            },
            "keyword_summary": keyword_summary,
            "top_issues": top_issues,
            "top_opportunities": top_opportunities,
            "overall_summary": ". ".join(summary_parts),
            "targets": targets,
        }

    def _job_keywords(self, post: dict[str, Any]) -> dict[str, list[str]]:
        must_have = self._normalize_keywords(
            _loads_json(post.get("must_have_skills"), [])
            + self._phrase_keywords(post.get("required_pm_experience"))
        )
        nice_to_have = self._normalize_keywords(
            _loads_json(post.get("nice_to_have_skills"), [])
            + self._phrase_keywords(post.get("job_title"))
        )
        all_keywords = []
        for keyword in must_have + nice_to_have:
            if keyword not in all_keywords:
                all_keywords.append(keyword)
        return {
            "must_have": must_have[:8],
            "nice_to_have": nice_to_have[:8],
            "all": all_keywords[:12],
        }

    def _normalize_keywords(self, values: list[str]) -> list[str]:
        keywords: list[str] = []
        for value in values:
            if not value:
                continue
            cleaned = re.sub(r"\s+", " ", str(value)).strip().lower()
            if len(cleaned) < 3:
                continue
            if cleaned not in keywords:
                keywords.append(cleaned)
        return keywords

    def _phrase_keywords(self, value: str | None) -> list[str]:
        if not value:
            return []
        text = value.lower()
        phrases = []
        for chunk in re.split(r"[,/|]", text):
            chunk = re.sub(r"\s+", " ", chunk).strip()
            if not chunk:
                continue
            if chunk not in phrases:
                phrases.append(chunk)
        return phrases

    def _score_bullet(
        self,
        text: str,
        keywords: list[str],
        must_have: list[str],
        section_type: str,
        section_id: str,
        entry_id: str | None,
        bullet_id: str,
    ) -> dict[str, Any]:
        lowered = text.lower()
        matched = [keyword for keyword in keywords if keyword in lowered]
        missing = [keyword for keyword in must_have if keyword not in matched][:3]
        has_action = bool(ACTION_VERB_RE.search(text))
        has_metric = bool(METRIC_RE.search(text))

        if matched and has_action and has_metric:
            annotation_type = "strong_match"
            score_impact = min(10, 3 + len(matched) * 2)
            explanation = "This bullet already reads as relevant, specific, and outcome-oriented for the role."
            suggestion_summary = None
        elif matched:
            annotation_type = "needs_rewrite"
            score_impact = -max(2, 6 - len(matched))
            explanation = "This bullet is relevant, but it is not surfacing impact or job-fit language clearly enough."
            suggestion_summary = "Rewrite this bullet to foreground ownership, outcomes, and the strongest matching keywords."
        elif section_type in {"experience", "projects", "summary"} and (GENERIC_RE.search(text) or len(text.split()) > 8):
            annotation_type = "needs_rewrite"
            score_impact = -2
            explanation = "This bullet is generic and not helping the resume prove fit for the job."
            suggestion_summary = "Tighten this bullet around concrete product work or swap it for a stronger proof point."
        else:
            annotation_type = "neutral"
            score_impact = 0
            explanation = "This bullet is not materially helping or hurting the role fit yet."
            suggestion_summary = None

        return {
            "target_type": "bullet",
            "target_id": bullet_id,
            "parent_section_id": section_id,
            "parent_entry_id": entry_id,
            "annotation_type": annotation_type,
            "score": None,
            "score_impact": score_impact,
            "explanation": explanation,
            "keywords_matched": matched,
            "keywords_missing": missing,
            "suggestion_summary": suggestion_summary,
        }

    def _top_targets(self, targets: list[dict[str, Any]], descending: bool) -> list[dict[str, Any]]:
        actionable = [
            target
            for target in targets
            if target["target_type"] in {"bullet", "entry", "section"}
            and target.get("annotation_type") in {"needs_rewrite", "missing_evidence", "strong_match"}
        ]
        if descending:
            filtered = [target for target in actionable if target.get("annotation_type") in {"needs_rewrite", "missing_evidence"}]
            ordered = sorted(filtered, key=lambda item: (len(item.get("keywords_missing", [])), -(item.get("score_impact") or 0)), reverse=True)
        else:
            filtered = [target for target in actionable if target.get("annotation_type") in {"needs_rewrite", "missing_evidence"}]
            ordered = sorted(filtered, key=lambda item: ((item.get("score_impact") or 0), -len(item.get("keywords_missing", []))))

        return [
            {
                "target_type": item["target_type"],
                "target_id": item["target_id"],
                "annotation_type": item["annotation_type"],
                "title": item["suggestion_summary"] or item["explanation"],
                "score_impact": item.get("score_impact") or 0,
                "keywords_missing": item.get("keywords_missing", []),
            }
            for item in ordered[:3]
        ]
