from __future__ import annotations

import json
from typing import TypeVar

from google import genai
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


class AIAnalyzer:
    def __init__(self) -> None:
        self.model = settings.gemini_model
        self.client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None

    def _complete_json(self, prompt: str, schema: type[ModelT]) -> ModelT:
        if not self.client:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        response = self.client.models.generate_content(
            model=self.model,
            contents=f"{SYSTEM_PROMPT}\n\n{prompt}",
        )
        content = (response.text or "").strip() or "{}"
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
            "Return JSON with keys: job_title, company_name, location, remote_status, "
            "seniority, domain, compensation."
        )
        return self._complete_json(prompt, RoleExtraction)

    def extract_requirements(self, post_text: str, linked_content: str) -> RequirementsExtraction:
        prompt = (
            "Extract the requirements details from the following LinkedIn job post.\n\n"
            f"POST TEXT:\n{post_text}\n\n"
            f"LINKED CONTENT:\n{linked_content or 'None'}\n\n"
            "Return JSON with keys: must_have_skills, nice_to_have_skills, "
            "experience_years, culture_signals, red_flags."
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
            "gaps, angles_to_emphasize, outreach_talking_points."
        )
        return self._complete_json(prompt, FitmentAnalysis)
