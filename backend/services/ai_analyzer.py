from __future__ import annotations

import json
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from config import settings
from models.post import FitmentAnalysis, RequirementsExtraction, RoleExtraction


ModelT = TypeVar("ModelT", bound=BaseModel)

SYSTEM_PROMPT = (
    "You are an expert Product Management recruiter and career coach. "
    "You extract structured information from LinkedIn job posts. "
    "Always respond in valid JSON only. No preamble, no explanation. "
    "If a field cannot be determined, use null."
)


def _extract_json_payload(text: str) -> str:
    cleaned = text.strip()

    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end >= start:
        return cleaned[start : end + 1]

    return cleaned


class AIAnalyzer:
    def __init__(self) -> None:
        self.model = settings.gemini_model
        client_kwargs = {}

        if settings.use_vertex_ai:
            client_kwargs["vertexai"] = True
            if settings.vertex_ai_api_key:
                client_kwargs["api_key"] = settings.vertex_ai_api_key
            elif settings.google_cloud_project:
                client_kwargs["project"] = settings.google_cloud_project
            if not settings.vertex_ai_api_key and settings.google_cloud_location:
                client_kwargs["location"] = settings.google_cloud_location
        elif settings.gemini_api_key:
            client_kwargs["api_key"] = settings.gemini_api_key

        self.client = genai.Client(**client_kwargs) if client_kwargs else None

    def _complete_json(self, prompt: str, schema: type[ModelT]) -> ModelT:
        if not self.client:
            raise RuntimeError(
                "No Gemini credentials are configured. Set VERTEX_AI_API_KEY or GEMINI_API_KEY."
            )

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            return parsed

        content = _extract_json_payload((response.text or "").strip() or "{}")
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Gemini returned invalid JSON.") from exc
        try:
            return schema.model_validate(payload)
        except ValidationError as exc:
            raise RuntimeError("Gemini returned schema-invalid JSON.") from exc

    def extract_role(self, post_text: str, linked_content: str) -> RoleExtraction:
        prompt = (
            "Extract the role details from the following LinkedIn job post.\n\n"
            f"POST TEXT:\n{post_text}\n\n"
            f"LINKED CONTENT:\n{linked_content or 'None'}\n\n"
            "Return JSON with keys: job_title, company_name, company_linkedin_url, "
            "location, remote_status, seniority, domain, compensation."
        )
        return self._complete_json(prompt, RoleExtraction)

    def extract_requirements(self, post_text: str, linked_content: str) -> RequirementsExtraction:
        prompt = (
            "Extract the requirements details from the following LinkedIn job post.\n\n"
            f"POST TEXT:\n{post_text}\n\n"
            f"LINKED CONTENT:\n{linked_content or 'None'}\n\n"
            "Return JSON with keys: must_have_skills, nice_to_have_skills, "
            "experience_years, required_pm_experience, immediate_joiner_preferred, "
            "application_method, apply_url, culture_signals, red_flags. "
            "For application_method, choose one of: Google Form, Apply Link, DM, Comment, E-Mail, Unknown."
        )
        return self._complete_json(prompt, RequirementsExtraction)

    def analyze_fitment(
        self,
        resume_text: str,
        role: RoleExtraction,
        requirements: RequirementsExtraction,
    ) -> FitmentAnalysis:
        prompt = (
            "Analyze fitment between this resume and the extracted job details.\n\n"
            f"RESUME:\n{resume_text}\n\n"
            f"ROLE:\n{role.model_dump_json(indent=2)}\n\n"
            f"REQUIREMENTS:\n{requirements.model_dump_json(indent=2)}\n\n"
            "Return JSON with keys: fitment_score, fitment_summary, strong_matches, "
            "gaps, mandatory_qualification_missing, mandatory_qualification_reasons, "
            "mandatory_qualification_details, angles_to_emphasize, outreach_talking_points. "
            "Only mark mandatory_qualification_missing true when the post clearly requires something "
            "the resume does not show, such as mandatory industry experience, minimum years, MBA, "
            "or location eligibility."
        )
        return self._complete_json(prompt, FitmentAnalysis)
