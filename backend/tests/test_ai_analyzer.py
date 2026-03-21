from services.ai_analyzer import _extract_json_payload


def test_extract_json_payload_strips_markdown_fences():
    payload = _extract_json_payload(
        """```json
        {
          "job_title": "Product Manager",
          "company_name": "Acme"
        }
        ```"""
    )

    assert payload.startswith("{")
    assert payload.endswith("}")
    assert '"job_title": "Product Manager"' in payload
