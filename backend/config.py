from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.database_path = os.getenv(
            "DATABASE_PATH", str((BASE_DIR / "db" / "pm_job_saver.db").resolve())
        )
        allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
        self.allowed_origins = [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]
        self.max_resume_size_bytes = 5 * 1024 * 1024
        self.max_links_per_post = 5
        self.max_text_per_url = 3000
        self.jina_timeout_seconds = 10


settings = Settings()
