from __future__ import annotations

import json
import importlib
import sqlite3


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


def test_init_db_repairs_analysis_foreign_key_drift_and_worker_can_write(monkeypatch, tmp_path):
    db_path = tmp_path / "drifted.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

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
                "Existing analyzed role",
                "Alice",
                "",
                "",
                "[]",
                "2026-03-20T12:00:00+00:00",
                "done",
            ),
        )
        db.execute(
            """
            INSERT INTO analysis (
              post_id, job_title, company_name, must_have_skills, nice_to_have_skills,
              culture_signals, red_flags, strong_matches, gaps, angles_to_emphasize,
              outreach_talking_points, fitment_score, fitment_summary
            )
            VALUES (?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', ?, ?)
            """,
            (1, "PM", "Acme", 8, "Existing analysis"),
        )
        db.execute(
            """
            INSERT INTO posts (
              id, post_url, post_text, poster_name, poster_profile_url, poster_headline,
              links_in_post, saved_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                2,
                "https://linkedin.com/posts/2",
                "New role to analyze",
                "Bob",
                "",
                "",
                json.dumps(["https://example.com/job"]),
                "2026-03-21T12:00:00+00:00",
                "pending",
            ),
        )

    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = OFF;")
        connection.execute("ALTER TABLE analysis RENAME TO analysis_legacy")
        connection.execute(
            """
            CREATE TABLE analysis (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              post_id INTEGER UNIQUE REFERENCES posts_legacy(id) ON DELETE CASCADE,
              job_title TEXT,
              company_name TEXT,
              location TEXT,
              remote_status TEXT,
              seniority TEXT,
              domain TEXT,
              compensation TEXT,
              must_have_skills TEXT,
              nice_to_have_skills TEXT,
              experience_years TEXT,
              culture_signals TEXT,
              red_flags TEXT,
              fitment_score INTEGER,
              fitment_summary TEXT,
              strong_matches TEXT,
              gaps TEXT,
              angles_to_emphasize TEXT,
              outreach_talking_points TEXT,
              linked_content TEXT,
              created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        connection.execute(
            """
            INSERT INTO analysis (
              id, post_id, job_title, company_name, location, remote_status, seniority,
              domain, compensation, must_have_skills, nice_to_have_skills, experience_years,
              culture_signals, red_flags, fitment_score, fitment_summary, strong_matches,
              gaps, angles_to_emphasize, outreach_talking_points, linked_content, created_at
            )
            SELECT
              id, post_id, job_title, company_name, location, remote_status, seniority,
              domain, compensation, must_have_skills, nice_to_have_skills, experience_years,
              culture_signals, red_flags, fitment_score, fitment_summary, strong_matches,
              gaps, angles_to_emphasize, outreach_talking_points, linked_content, created_at
            FROM analysis_legacy
            """
        )
        connection.execute("DROP TABLE analysis_legacy")
        connection.commit()

    database.init_db()

    with sqlite3.connect(db_path) as connection:
        foreign_key = connection.execute("PRAGMA foreign_key_list(analysis)").fetchone()
        assert foreign_key[2] == "posts"

    with database.get_db() as db:
        preserved = db.execute(
            "SELECT post_id, company_name, fitment_summary FROM analysis WHERE post_id = 1"
        ).fetchone()

    assert preserved["company_name"] == "Acme"
    assert preserved["fitment_summary"] == "Existing analysis"

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
                "company_name": "Globex",
                "company_linkedin_url": "https://linkedin.com/company/globex",
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
                "immediate_joiner_preferred": False,
                "application_method": "Apply Link",
                "apply_url": "https://example.com/apply",
                "culture_signals": ["high autonomy"],
                "red_flags": [],
            },
        )(),
    )

    worker.process_post(2)

    with database.get_db() as db:
        post = db.execute("SELECT status, error_message FROM posts WHERE id = 2").fetchone()
        analysis = db.execute(
            "SELECT post_id, company_name, must_have_skills FROM analysis WHERE post_id = 2"
        ).fetchone()

    assert post["status"] == "done"
    assert post["error_message"] is None
    assert analysis["company_name"] == "Globex"
    assert json.loads(analysis["must_have_skills"]) == ["Roadmapping"]
