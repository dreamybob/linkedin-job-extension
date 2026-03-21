from __future__ import annotations

import json

from database import get_db
from models.post import FitmentAnalysis
from services.ai_analyzer import AIAnalyzer
from services.link_fetcher import LinkFetcher


def _dump_json(value: list[str]) -> str:
    return json.dumps(value)


class BackgroundWorker:
    def __init__(self) -> None:
        self.link_fetcher = LinkFetcher()
        self.ai_analyzer = AIAnalyzer()

    def process_post(self, post_id: int) -> None:
        with get_db() as db:
            post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
            resume = db.execute(
                "SELECT * FROM resume ORDER BY uploaded_at DESC, id DESC LIMIT 1"
            ).fetchone()
            if not post:
                return
            db.execute(
                "UPDATE posts SET status = 'processing', error_message = NULL WHERE id = ?",
                (post_id,),
            )

        try:
            links_in_post = json.loads(post["links_in_post"] or "[]")
            linked_content = self.link_fetcher.fetch(links_in_post)
            role = self.ai_analyzer.extract_role(post["post_text"] or "", linked_content)
            requirements = self.ai_analyzer.extract_requirements(post["post_text"] or "", linked_content)

            if resume and resume.get("raw_text"):
                fitment = self.ai_analyzer.analyze_fitment(
                    resume["raw_text"], role, requirements
                )
            else:
                fitment = FitmentAnalysis(
                    fitment_score=None,
                    fitment_summary="Resume not uploaded yet; fitment analysis skipped.",
                    strong_matches=[],
                    gaps=[],
                    angles_to_emphasize=[],
                    outreach_talking_points=[],
                )

            with get_db() as db:
                db.execute(
                    """
                    INSERT INTO analysis (
                      post_id, job_title, company_name, location, remote_status, seniority,
                      domain, compensation, must_have_skills, nice_to_have_skills,
                      experience_years, culture_signals, red_flags, fitment_score,
                      fitment_summary, strong_matches, gaps, angles_to_emphasize,
                      outreach_talking_points, linked_content
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(post_id) DO UPDATE SET
                      job_title = excluded.job_title,
                      company_name = excluded.company_name,
                      location = excluded.location,
                      remote_status = excluded.remote_status,
                      seniority = excluded.seniority,
                      domain = excluded.domain,
                      compensation = excluded.compensation,
                      must_have_skills = excluded.must_have_skills,
                      nice_to_have_skills = excluded.nice_to_have_skills,
                      experience_years = excluded.experience_years,
                      culture_signals = excluded.culture_signals,
                      red_flags = excluded.red_flags,
                      fitment_score = excluded.fitment_score,
                      fitment_summary = excluded.fitment_summary,
                      strong_matches = excluded.strong_matches,
                      gaps = excluded.gaps,
                      angles_to_emphasize = excluded.angles_to_emphasize,
                      outreach_talking_points = excluded.outreach_talking_points,
                      linked_content = excluded.linked_content
                    """,
                    (
                        post_id,
                        role.job_title,
                        role.company_name,
                        role.location,
                        role.remote_status,
                        role.seniority,
                        role.domain,
                        role.compensation,
                        _dump_json(requirements.must_have_skills),
                        _dump_json(requirements.nice_to_have_skills),
                        requirements.experience_years,
                        _dump_json(requirements.culture_signals),
                        _dump_json(requirements.red_flags),
                        fitment.fitment_score,
                        fitment.fitment_summary,
                        _dump_json(fitment.strong_matches),
                        _dump_json(fitment.gaps),
                        _dump_json(fitment.angles_to_emphasize),
                        _dump_json(fitment.outreach_talking_points),
                        linked_content,
                    ),
                )
                db.execute("UPDATE posts SET status = 'done' WHERE id = ?", (post_id,))
                db.execute("UPDATE posts SET error_message = NULL WHERE id = ?", (post_id,))
        except Exception as exc:
            with get_db() as db:
                db.execute(
                    "UPDATE posts SET status = 'error', error_message = ? WHERE id = ?",
                    (f"{type(exc).__name__}: {exc}", post_id),
                )
