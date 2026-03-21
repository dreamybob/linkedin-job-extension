from __future__ import annotations

from urllib.parse import quote, urlparse

import httpx

from config import settings


SKIPPED_DOMAINS = {"linkedin.com", "twitter.com", "x.com", "instagram.com"}


class LinkFetcher:
    def __init__(self) -> None:
        self.timeout = settings.jina_timeout_seconds
        self.max_links = settings.max_links_per_post
        self.max_chars = settings.max_text_per_url

    def _should_skip(self, url: str) -> bool:
        netloc = urlparse(url).netloc.lower()
        return any(domain in netloc for domain in SKIPPED_DOMAINS)

    def fetch(self, urls: list[str]) -> str:
        collected: list[str] = []
        for url in urls[: self.max_links]:
            if self._should_skip(url):
                continue
            try:
                response = httpx.get(
                    f"https://r.jina.ai/{quote(url, safe=':/?=&')}",
                    timeout=self.timeout,
                )
                response.raise_for_status()
                text = response.text.strip()
                if text:
                    collected.append(f"URL: {url}\n{text[: self.max_chars]}")
            except Exception:
                continue
        return "\n\n".join(collected)

