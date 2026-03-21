from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(part.strip() for part in parts if part.strip())

