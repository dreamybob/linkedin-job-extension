from __future__ import annotations

import hashlib
import re
from io import BytesIO
from uuid import NAMESPACE_URL, uuid5

from pypdf import PdfReader


SECTION_TYPE_PRIORITY = {
    "contact": 0,
    "summary": 1,
    "experience": 2,
    "projects": 3,
    "skills": 4,
    "education": 5,
    "certifications": 6,
    "awards": 7,
    "volunteering": 8,
    "other": 9,
}

KNOWN_SECTION_TYPES = {
    "contact": "contact",
    "contact information": "contact",
    "header": "contact",
    "profile": "summary",
    "professional summary": "summary",
    "summary": "summary",
    "about": "summary",
    "experience": "experience",
    "work experience": "experience",
    "professional experience": "experience",
    "employment history": "experience",
    "projects": "projects",
    "selected projects": "projects",
    "key projects": "projects",
    "skills": "skills",
    "core skills": "skills",
    "key skills": "skills",
    "technical skills": "skills",
    "education": "education",
    "certifications": "certifications",
    "licenses & certifications": "certifications",
    "awards": "awards",
    "achievements": "awards",
    "volunteering": "volunteering",
    "leadership": "other",
    "publications": "other",
    "additional information": "other",
}

ENTRY_BASED_SECTION_TYPES = {
    "experience",
    "projects",
    "education",
    "certifications",
    "awards",
    "volunteering",
}

BULLET_PREFIX_RE = re.compile(r"^(?:[-*•▪◦●■]+|\d+[.)])\s+")
DATE_HINT_RE = re.compile(
    r"(?i)\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|present|current|20\d{2}|19\d{2})\b"
)


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(part.strip() for part in parts if part.strip())


def get_resume_version(raw_text: str) -> str:
    return hashlib.sha256((raw_text or "").encode("utf-8")).hexdigest()


def build_structured_resume(raw_text: str) -> dict:
    resume_version = get_resume_version(raw_text)
    cleaned_lines = _normalize_lines(raw_text)
    grouped_sections = _group_sections(cleaned_lines)

    sections: list[dict] = []
    for order, section in enumerate(grouped_sections):
        section_id = _stable_id("section", resume_version, str(order), section["type"], section["title"])
        payload = {
            "id": section_id,
            "type": section["type"],
            "title": section["title"],
            "order": order,
            "entries": [],
            "bullets": [],
        }
        if section["type"] in ENTRY_BASED_SECTION_TYPES:
            payload["entries"] = _parse_entries(resume_version, section_id, section["type"], section["title"], section["lines"])
        else:
            payload["bullets"] = _parse_flat_bullets(resume_version, section_id, section["type"], section["lines"])
        sections.append(payload)

    ordered_sections = sorted(
        sections,
        key=lambda item: (SECTION_TYPE_PRIORITY.get(item["type"], 99), item["order"]),
    )
    for index, section in enumerate(ordered_sections):
        section["order"] = index
        for bullet_index, bullet in enumerate(section["bullets"]):
            bullet["order"] = bullet_index
        for entry_index, entry in enumerate(section["entries"]):
            entry["order"] = entry_index
            for bullet_index, bullet in enumerate(entry["bullets"]):
                bullet["order"] = bullet_index

    return {
        "resume_version": resume_version,
        "sections": ordered_sections,
    }


def _normalize_lines(raw_text: str) -> list[str]:
    normalized: list[str] = []
    for raw_line in (raw_text or "").replace("\r", "\n").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if line.isdigit():
            continue
        if line.lower() in {"page 1", "page 2", "page 3"}:
            continue
        normalized.append(line)
    return normalized


def _group_sections(lines: list[str]) -> list[dict]:
    if not lines:
        return [
            {
                "type": "summary",
                "title": "Summary",
                "lines": [],
            }
        ]

    sections: list[dict] = []
    current = {
        "type": "contact",
        "title": "Contact / Header",
        "lines": [],
    }

    for line in lines:
        section_type = _infer_section_type(line)
        if section_type:
            if current["lines"] or current["type"] != "contact":
                sections.append(current)
            current = {
                "type": section_type,
                "title": _title_from_heading(line, section_type),
                "lines": [],
            }
            continue
        current["lines"].append(line)

    if current["lines"] or not sections:
        sections.append(current)

    return sections


def _infer_section_type(line: str) -> str | None:
    normalized = line.lower().strip(": ").replace("&", "and")
    if normalized in KNOWN_SECTION_TYPES:
        return KNOWN_SECTION_TYPES[normalized]

    words = normalized.split()
    if len(words) > 5:
        return None
    if normalized.isupper():
        return KNOWN_SECTION_TYPES.get(normalized.lower())
    if line.endswith(":") and normalized in KNOWN_SECTION_TYPES:
        return KNOWN_SECTION_TYPES[normalized]
    return None


def _title_from_heading(line: str, section_type: str) -> str:
    heading = line.strip().strip(":")
    if heading:
        return heading
    default_titles = {
        "contact": "Contact / Header",
        "summary": "Summary",
        "experience": "Experience",
        "projects": "Projects",
        "skills": "Skills",
        "education": "Education",
        "certifications": "Certifications",
        "awards": "Awards",
        "volunteering": "Volunteering",
        "other": "Additional Information",
    }
    return default_titles.get(section_type, "Section")


def _parse_flat_bullets(resume_version: str, section_id: str, section_type: str, lines: list[str]) -> list[dict]:
    if not lines:
        return []

    items: list[str] = []
    if section_type == "summary":
        items = [" ".join(lines).strip()]
    elif section_type == "skills":
        for line in lines:
            chunks = [chunk.strip(" -") for chunk in re.split(r"[|,/·]", line) if chunk.strip(" -")]
            if len(chunks) <= 1:
                items.append(BULLET_PREFIX_RE.sub("", line))
            else:
                items.extend(chunks)
    else:
        current = ""
        for line in lines:
            bullet = BULLET_PREFIX_RE.sub("", line)
            if BULLET_PREFIX_RE.match(line):
                if current:
                    items.append(current)
                current = bullet
            elif current:
                current = f"{current} {bullet}".strip()
            else:
                items.append(bullet)
        if current:
            items.append(current)

    bullets: list[dict] = []
    for order, text in enumerate(item for item in items if item):
        bullets.append(
            {
                "id": _stable_id("bullet", resume_version, section_id, str(order), text),
                "text": text,
                "order": order,
            }
        )
    return bullets


def _parse_entries(
    resume_version: str,
    section_id: str,
    section_type: str,
    section_title: str,
    lines: list[str],
) -> list[dict]:
    entries: list[dict] = []
    current: dict | None = None

    for line in lines:
        if _looks_like_entry_heading(line, current is None):
            if current:
                _finalize_entry(current, entries, resume_version, section_id)
            current = {
                "section_type": section_type,
                "section_title": section_title,
                "heading": BULLET_PREFIX_RE.sub("", line),
                "subtitle": None,
                "date_range": _extract_date_range(line),
                "bullets": [],
                "notes": [],
            }
            continue

        if current is None:
            current = {
                "section_type": section_type,
                "section_title": section_title,
                "heading": section_title,
                "subtitle": None,
                "date_range": None,
                "bullets": [],
                "notes": [],
            }

        if current["subtitle"] is None and not BULLET_PREFIX_RE.match(line) and DATE_HINT_RE.search(line) and current["date_range"] is None:
            current["date_range"] = line
            continue

        if current["subtitle"] is None and not BULLET_PREFIX_RE.match(line) and not current["bullets"] and not _looks_like_entry_heading(line, False):
            current["subtitle"] = line
            continue

        bullet_text = BULLET_PREFIX_RE.sub("", line)
        if current["bullets"] and not BULLET_PREFIX_RE.match(line) and not _looks_like_entry_heading(line, False):
            current["bullets"][-1] = f"{current['bullets'][-1]} {bullet_text}".strip()
        else:
            current["bullets"].append(bullet_text)

    if current:
        _finalize_entry(current, entries, resume_version, section_id)

    if not entries:
        default_entry_id = _stable_id("entry", resume_version, section_id, "0", section_title)
        return [
            {
                "id": default_entry_id,
                "title": section_title,
                "subtitle": None,
                "date_range": None,
                "order": 0,
                "bullets": _parse_flat_bullets(resume_version, default_entry_id, section_type, lines),
            }
        ]

    return entries


def _finalize_entry(current: dict, entries: list[dict], resume_version: str, section_id: str) -> None:
    order = len(entries)
    heading = current["heading"] or current["section_title"]
    entry_id = _stable_id("entry", resume_version, section_id, str(order), heading)
    bullets = []
    for bullet_order, text in enumerate(item for item in current["bullets"] if item):
        bullets.append(
            {
                "id": _stable_id("bullet", resume_version, entry_id, str(bullet_order), text),
                "text": text,
                "order": bullet_order,
            }
        )

    if not bullets and current["subtitle"]:
        bullets.append(
            {
                "id": _stable_id("bullet", resume_version, entry_id, "0", current["subtitle"]),
                "text": current["subtitle"],
                "order": 0,
            }
        )

    entries.append(
        {
            "id": entry_id,
            "title": heading,
            "subtitle": current["subtitle"],
            "date_range": current["date_range"],
            "order": order,
            "bullets": bullets,
        }
    )


def _looks_like_entry_heading(line: str, is_first_line: bool) -> bool:
    if BULLET_PREFIX_RE.match(line):
        return False
    if len(line) > 120:
        return False
    if "|" in line or " at " in line.lower():
        return True
    if DATE_HINT_RE.search(line) and len(line.split()) <= 12:
        return True
    words = line.split()
    title_case_ratio = sum(1 for word in words if word[:1].isupper()) / max(1, len(words))
    if is_first_line and title_case_ratio >= 0.5:
        return True
    return title_case_ratio >= 0.75 and len(words) <= 10


def _extract_date_range(line: str) -> str | None:
    if not DATE_HINT_RE.search(line):
        return None
    if "|" in line:
        return line.split("|")[-1].strip()
    return line


def _stable_id(*parts: str) -> str:
    return str(uuid5(NAMESPACE_URL, "::".join(part.strip() for part in parts if part is not None)))
