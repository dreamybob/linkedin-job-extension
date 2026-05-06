from __future__ import annotations

import io
from datetime import datetime, timezone

from pypdf import PdfWriter


def make_pdf_bytes(text: str) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_duplicate_save_returns_existing_post_id(client, monkeypatch):
    from routes import posts as posts_module

    monkeypatch.setattr(posts_module.worker, "process_post", lambda post_id: None)

    payload = {
        "post_url": "https://www.linkedin.com/posts/example-post",
        "post_text": "Hiring PM",
        "poster_name": "Taylor",
        "poster_profile_url": "",
        "poster_headline": "",
        "links_in_post": [],
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }

    first = client.post("/api/posts/save", json=payload)
    second = client.post("/api/posts/save", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["status"] == "already_saved"


def test_posts_filtering_and_search(client, monkeypatch):
    from database import get_db
    from routes import posts as posts_module

    monkeypatch.setattr(posts_module.worker, "process_post", lambda post_id: None)

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_headline, links_in_post, saved_at, status)
            VALUES
            (1, 'https://linkedin.com/posts/1', 'Text 1', 'Alice', 'PM', '[]', '2026-03-20T12:00:00+00:00', 'done'),
            (2, 'https://linkedin.com/posts/2', 'Text 2', 'Bob', 'PM', '[]', '2026-03-21T12:00:00+00:00', 'pending')
            """
        )
        db.execute(
            """
            INSERT INTO analysis (
              post_id, job_title, company_name, remote_status, seniority, must_have_skills,
              nice_to_have_skills, culture_signals, red_flags, strong_matches, gaps,
              angles_to_emphasize, outreach_talking_points, fitment_score
            )
            VALUES (?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', ?)
            """,
            (1, "Senior Product Manager", "Acme", "remote", "senior", 9),
        )

    response = client.get("/api/posts", params={"search": "acme", "score_band": "high"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["company_name"] == "Acme"
    assert body["items"][0]["saved_at"] == "2026-03-20T12:00:00+00:00"


def test_get_post_detail_returns_joined_payload(client):
    from database import get_db

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_profile_url, poster_headline, links_in_post, saved_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Role text",
                "Alice",
                "https://linkedin.com/in/alice",
                "Product Leader",
                '["https://example.com/job"]',
                "2026-03-20T12:00:00+00:00",
                "done",
            ),
        )
        db.execute(
            """
            INSERT INTO analysis (
              post_id, job_title, company_name, location, remote_status, seniority, domain,
              compensation, company_linkedin_url, must_have_skills, nice_to_have_skills, experience_years,
              required_pm_experience, immediate_joiner_preferred, application_method, apply_url,
              culture_signals, red_flags, fitment_score, fitment_summary, strong_matches,
              gaps, mandatory_qualification_missing, mandatory_qualification_reasons,
              mandatory_qualification_details, angles_to_emphasize, outreach_talking_points, linked_content
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "PM",
                "Acme",
                "Remote",
                "remote",
                "senior",
                "B2B",
                None,
                "https://linkedin.com/company/acme",
                '["SQL"]',
                '["ML"]',
                "5+ years",
                "4+ years in product management",
                1,
                "Apply Link",
                "https://example.com/apply",
                '["high autonomy"]',
                '["relocation"]',
                7,
                "Decent fit",
                '["Roadmapping"]',
                '["Payments"]',
                1,
                '["MBA required"]',
                '["The post explicitly requires an MBA and the resume does not show one."]',
                '["Translate analytics"]',
                '["Reference hiring manager context"]',
                "Fetched text",
            ),
        )

    response = client.get("/api/posts/1")
    assert response.status_code == 200
    body = response.json()
    assert body["company_name"] == "Acme"
    assert body["must_have_skills"] == ["SQL"]
    assert body["linked_content"] == "Fetched text"
    assert body["company_linkedin_url"] == "https://linkedin.com/company/acme"
    assert body["mandatory_qualification_missing"] is True
    assert body["mandatory_qualification_reasons"] == ["MBA required"]


def test_update_post_labels_is_mutually_exclusive(client):
    from database import get_db

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_headline, links_in_post, saved_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Role text",
                "Alice",
                "Product Leader",
                "[]",
                "2026-03-20T12:00:00+00:00",
                "done",
            ),
        )

    first = client.patch("/api/posts/1/labels", json={"is_important": True})
    second = client.patch("/api/posts/1/labels", json={"is_irrelevant": True})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["is_irrelevant"] is True
    assert second.json()["is_important"] is False


def test_retry_post_requeues_failed_analysis(client, monkeypatch):
    from database import get_db
    from routes import posts as posts_module

    retried = []
    monkeypatch.setattr(posts_module.worker, "process_post", lambda post_id: retried.append(post_id))

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_headline, links_in_post, saved_at, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Role text",
                "Alice",
                "Product Leader",
                "[]",
                "2026-03-20T12:00:00+00:00",
                "error",
                "RuntimeError: boom",
            ),
        )

    response = client.post("/api/posts/1/retry")

    assert response.status_code == 200
    assert response.json()["status"] == "retry_queued"
    assert retried == [1]

    with get_db() as db:
        row = db.execute("SELECT status, error_message FROM posts WHERE id = 1").fetchone()

    assert row["status"] == "pending"
    assert row["error_message"] is None


def test_resume_upload_rejects_non_pdf(client):
    response = client.post(
        "/api/resume/upload",
        files={"file": ("resume.txt", b"plain text", "text/plain")},
    )
    assert response.status_code == 400


def test_resume_upload_accepts_pdf(client, monkeypatch):
    from routes import resume as resume_module

    monkeypatch.setattr(resume_module, "extract_pdf_text", lambda _: "PM resume text")
    pdf_bytes = make_pdf_bytes("ignored")
    response = client.post(
        "/api/resume/upload",
        files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    assert response.json()["preview_text"] == "PM resume text"


def test_structured_resume_endpoint_returns_sectionalized_preview(client, monkeypatch):
    from routes import resume as resume_module

    resume_text = "\n".join(
        [
            "Jane Doe",
            "jane@example.com",
            "Summary",
            "Product manager focused on roadmapping and experimentation.",
            "Experience",
            "Senior Product Manager | Acme | 2023 - Present",
            "- Led onboarding experiments that improved conversion by 12%",
            "Skills",
            "Roadmapping, Analytics, SQL",
        ]
    )
    monkeypatch.setattr(resume_module, "extract_pdf_text", lambda _: resume_text)

    upload = client.post(
        "/api/resume/upload",
        files={"file": ("resume.pdf", make_pdf_bytes("ignored"), "application/pdf")},
    )
    assert upload.status_code == 200

    response = client.get("/api/resume/structured")
    assert response.status_code == 200
    body = response.json()

    assert body["resume_version"]
    assert [section["type"] for section in body["sections"]][:3] == ["contact", "summary", "experience"]
    assert any(section["type"] == "skills" for section in body["sections"])


def test_resume_review_analysis_and_enhancement_flow(client, monkeypatch):
    from database import get_db
    from routes import resume as resume_module

    resume_text = "\n".join(
        [
            "Jane Doe",
            "jane@example.com",
            "Summary",
            "Product manager focused on customer research and payments.",
            "Experience",
            "Senior Product Manager | Acme | 2023 - Present",
            "- Worked on payments roadmap",
            "- Led onboarding experiments that improved conversion by 12%",
            "Skills",
            "Roadmapping, Analytics",
        ]
    )
    monkeypatch.setattr(resume_module, "extract_pdf_text", lambda _: resume_text)
    client.post(
        "/api/resume/upload",
        files={"file": ("resume.pdf", make_pdf_bytes("ignored"), "application/pdf")},
    )

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_headline, links_in_post, saved_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "https://linkedin.com/posts/1",
                "Hiring PM",
                "Taylor",
                "Hiring Manager",
                "[]",
                "2026-05-05T12:00:00+00:00",
                "done",
            ),
        )
        db.execute(
            """
            INSERT INTO analysis (
              post_id, job_title, company_name, remote_status, seniority, must_have_skills,
              nice_to_have_skills, required_pm_experience, fitment_score, fitment_summary,
              strong_matches, gaps, culture_signals, red_flags, angles_to_emphasize, outreach_talking_points,
              mandatory_qualification_missing, mandatory_qualification_reasons, mandatory_qualification_details
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', ?, ?, ?)
            """,
            (
                1,
                "Senior Product Manager",
                "Acme",
                "remote",
                "senior",
                '["payments", "experimentation", "sql"]',
                '["analytics"]',
                "5+ years in product management",
                8,
                "Strong PM fundamentals with gaps in SQL proof.",
                0,
                '[]',
                '[]',
            ),
        )

    first = client.get("/api/posts/1/resume-analysis")
    assert first.status_code == 200
    assert first.json()["status"] == "processing"

    second = client.get("/api/posts/1/resume-analysis")
    assert second.status_code == 200
    body = second.json()
    assert body["status"] == "complete"
    assert body["score_breakdown"]["total"] >= 0

    experience_section = next(section for section in body["sections"] if section["type"] == "experience")
    bullet = next(
        bullet
        for entry in experience_section["entries"]
        for bullet in entry["bullets"]
        if bullet["annotation_type"] == "needs_rewrite"
    )

    suggestions = client.post(
        "/api/posts/1/resume-suggestions",
        json={"target_type": "bullet", "target_id": bullet["id"]},
    )
    assert suggestions.status_code == 200
    suggestion_body = suggestions.json()
    assert len(suggestion_body["suggestions"]) == 2

    suggestion_id = suggestion_body["suggestions"][0]["id"]
    apply_response = client.post(
        "/api/posts/1/apply-enhancement",
        json={
            "suggestion_id": suggestion_id,
            "target_type": "bullet",
            "target_id": bullet["id"],
        },
    )
    assert apply_response.status_code == 200
    applied = apply_response.json()
    assert applied["overlay_revision"] == 1
    updated_bullet = next(
        bullet_item
        for section in applied["sections"]
        if section["type"] == "experience"
        for entry in section["entries"]
        for bullet_item in entry["bullets"]
        if bullet_item["id"] == bullet["id"]
    )
    assert updated_bullet["text"] != bullet["text"]
    assert updated_bullet["applied_overlay_id"]

    revert_response = client.post(
        "/api/posts/1/revert-enhancement",
        json={"overlay_id": applied["action"]["overlay_id"]},
    )
    assert revert_response.status_code == 200
    reverted = revert_response.json()
    reverted_bullet = next(
        bullet_item
        for section in reverted["sections"]
        if section["type"] == "experience"
        for entry in section["entries"]
        for bullet_item in entry["bullets"]
        if bullet_item["id"] == bullet["id"]
    )
    assert reverted_bullet["text"] == bullet["text"]


def test_resume_template_overlay_adds_new_section(client, monkeypatch):
    from database import get_db
    from routes import resume as resume_module

    monkeypatch.setattr(
        resume_module,
        "extract_pdf_text",
        lambda _: "Jane Doe\nSummary\nPM leader\nExperience\nSenior PM | Acme\n- Led roadmap",
    )
    client.post(
        "/api/resume/upload",
        files={"file": ("resume.pdf", make_pdf_bytes("ignored"), "application/pdf")},
    )

    with get_db() as db:
        db.execute(
            """
            INSERT INTO posts (id, post_url, post_text, poster_name, poster_headline, links_in_post, saved_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                2,
                "https://linkedin.com/posts/2",
                "Hiring PM",
                "Taylor",
                "Hiring Manager",
                "[]",
                "2026-05-05T12:00:00+00:00",
                "done",
            ),
        )
        db.execute(
            """
            INSERT INTO analysis (
              post_id, job_title, company_name, remote_status, seniority, must_have_skills,
              nice_to_have_skills, required_pm_experience, fitment_score, fitment_summary,
              strong_matches, gaps, culture_signals, red_flags, angles_to_emphasize, outreach_talking_points,
              mandatory_qualification_missing, mandatory_qualification_reasons, mandatory_qualification_details
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', ?, ?, ?)
            """,
            (
                2,
                "Product Lead",
                "Globex",
                "remote",
                "lead",
                '["roadmapping"]',
                '["analytics"]',
                "7+ years in product management",
                7,
                "Strong fit",
                0,
                '[]',
                '[]',
            ),
        )

    client.get("/api/posts/2/resume-analysis")
    client.get("/api/posts/2/resume-analysis")

    response = client.post(
        "/api/posts/2/resume-templates",
        json={"template_type": "projects"},
    )
    assert response.status_code == 200
    body = response.json()
    assert any(section["type"] == "projects" for section in body["sections"])
