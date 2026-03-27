from __future__ import annotations

import json
import importlib


def test_background_worker_marks_post_done_without_resume(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "worker.db"))

    import config
    import database
    from services import background_worker as background_worker_module

    importlib.reload(config)
    importlib.reload(database)
    importlib.reload(background_worker_module)

    database.init_db()

    with database.get_db() as db:
        db.execute(
            """
            INSERT INTO posts (
              id, post_url, post_text, poster_name, poster_profile_url, poster_headline,
              links_in_post, saved_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Hiring a product manager",
                "Alice",
                "",
                "",
                json.dumps(["https://example.com/job"]),
                "2026-03-20T12:00:00+00:00",
                "pending",
            ),
        )

    worker = background_worker_module.BackgroundWorker()
    monkeypatch.setattr(worker.link_fetcher, "fetch", lambda urls: "Example linked content")
    monkeypatch.setattr(
        worker.ai_analyzer,
        "extract_role",
        lambda post_text, linked_content: type(
            "Role",
            (),
            {
                "job_title": "Senior PM",
                "company_name": "Acme",
                "company_linkedin_url": "https://linkedin.com/company/acme",
                "location": "Remote",
                "remote_status": "remote",
                "seniority": "senior",
                "domain": "B2B",
                "compensation": None,
            },
        )(),
    )
    monkeypatch.setattr(
        worker.ai_analyzer,
        "extract_requirements",
        lambda post_text, linked_content: type(
            "Reqs",
            (),
            {
                "must_have_skills": ["Roadmapping"],
                "nice_to_have_skills": ["Payments"],
                "experience_years": "5+ years",
                "required_pm_experience": "5+ years in product management",
                "immediate_joiner_preferred": True,
                "application_method": "Apply Link",
                "apply_url": "https://example.com/apply",
                "culture_signals": ["high autonomy"],
                "red_flags": ["relocation"],
            },
        )(),
    )

    worker.process_post(1)

    with database.get_db() as db:
        post = db.execute("SELECT status FROM posts WHERE id = 1").fetchone()
        analysis = db.execute(
            "SELECT fitment_summary, fitment_score, must_have_skills FROM analysis WHERE post_id = 1"
        ).fetchone()

    assert post["status"] == "done"
    assert analysis["fitment_score"] is None
    assert analysis["fitment_summary"] == "Resume not uploaded yet; fitment analysis skipped."
    assert json.loads(analysis["must_have_skills"]) == ["Roadmapping"]


def test_background_worker_marks_post_error_on_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "worker_error.db"))

    import config
    import database
    from services import background_worker as background_worker_module

    importlib.reload(config)
    importlib.reload(database)
    importlib.reload(background_worker_module)

    database.init_db()
    with database.get_db() as db:
        db.execute(
            """
            INSERT INTO posts (
              id, post_url, post_text, poster_name, poster_profile_url, poster_headline,
              links_in_post, saved_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Hiring a product manager",
                "Alice",
                "",
                "",
                "[]",
                "2026-03-20T12:00:00+00:00",
                "pending",
            ),
        )

    worker = background_worker_module.BackgroundWorker()
    monkeypatch.setattr(worker.link_fetcher, "fetch", lambda urls: "")
    monkeypatch.setattr(
        worker.ai_analyzer,
        "extract_role",
        lambda post_text, linked_content: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    worker.process_post(1)

    with database.get_db() as db:
        post = db.execute("SELECT status, error_message FROM posts WHERE id = 1").fetchone()

    assert post["status"] == "error"
    assert post["error_message"] == "RuntimeError: boom"
