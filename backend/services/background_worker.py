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
                    mandatory_qualification_missing=False,
                    mandatory_qualification_reasons=[],
                    mandatory_qualification_details=[],
                    angles_to_emphasize=[],
                    outreach_talking_points=[],
                )

            with get_db() as db:
                db.execute(
                    """
                    INSERT INTO analysis (
                      post_id, job_title, company_name, location, remote_status, seniority,
                      domain, compensation, company_linkedin_url, must_have_skills, nice_to_have_skills,
                      experience_years, required_pm_experience, immediate_joiner_preferred, application_method,
                      apply_url, culture_signals, red_flags, fitment_score, fitment_summary, strong_matches,
                      gaps, mandatory_qualification_missing, mandatory_qualification_reasons,
                      mandatory_qualification_details, angles_to_emphasize, outreach_talking_points, linked_content
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(post_id) DO UPDATE SET
                      job_title = excluded.job_title,
                      company_name = excluded.company_name,
                      location = excluded.location,
                      remote_status = excluded.remote_status,
                      seniority = excluded.seniority,
                      domain = excluded.domain,
                      compensation = excluded.compensation,
                      company_linkedin_url = excluded.company_linkedin_url,
                      must_have_skills = excluded.must_have_skills,
                      nice_to_have_skills = excluded.nice_to_have_skills,
                      experience_years = excluded.experience_years,
                      required_pm_experience = excluded.required_pm_experience,
                      immediate_joiner_preferred = excluded.immediate_joiner_preferred,
                      application_method = excluded.application_method,
                      apply_url = excluded.apply_url,
                      culture_signals = excluded.culture_signals,
                      red_flags = excluded.red_flags,
                      fitment_score = excluded.fitment_score,
                      fitment_summary = excluded.fitment_summary,
                      strong_matches = excluded.strong_matches,
                      gaps = excluded.gaps,
                      mandatory_qualification_missing = excluded.mandatory_qualification_missing,
                      mandatory_qualification_reasons = excluded.mandatory_qualification_reasons,
                      mandatory_qualification_details = excluded.mandatory_qualification_details,
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
                        role.company_linkedin_url,
                        _dump_json(requirements.must_have_skills),
                        _dump_json(requirements.nice_to_have_skills),
                        requirements.experience_years,
                        requirements.required_pm_experience,
                        int(requirements.immediate_joiner_preferred),
                        requirements.application_method,
                        requirements.apply_url,
                        _dump_json(requirements.culture_signals),
                        _dump_json(requirements.red_flags),
                        fitment.fitment_score,
                        fitment.fitment_summary,
                        _dump_json(fitment.strong_matches),
                        _dump_json(fitment.gaps),
                        int(fitment.mandatory_qualification_missing),
                        _dump_json(fitment.mandatory_qualification_reasons),
                        _dump_json(fitment.mandatory_qualification_details),
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
