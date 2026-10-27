"""Only a fixed, official public API. Never follow a submitted URL or article link."""
import time
from collections import deque
from datetime import datetime, timezone
import httpx
from .normalize import normalize_html, redact_contacts

HN_BASE = "https://hacker-news.firebaseio.com/v0"


class SourceDenied(RuntimeError):
    pass


class HackerNews:
    def __init__(self, client: httpx.Client, interval: float = .25, sleep=time.sleep):
        self.client, self.interval, self.sleep = client, max(.25, interval), sleep
        self.requests = 0
        self.scanned = 0

    def get(self, path: str):
        for attempt in range(3):
            self.sleep(self.interval)
            self.requests += 1
            response = self.client.get(f"{HN_BASE}/{path}.json", timeout=12, follow_redirects=False)
            if response.status_code in (401, 403, 429):
                # No evasion or repeated requests after access enforcement.
                raise SourceDenied(f"HN stopped: HTTP {response.status_code}; retry-after={response.headers.get('retry-after', 'unspecified')}")
            if response.status_code >= 500 and attempt < 2:
                self.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            if len(response.content) > 1_000_000:
                raise ValueError("HN response exceeds size cap")
            return response.json()
        raise RuntimeError("HN unavailable")

    def collect(self, cap: int, watermark: int = 0):
        """Bounded sample of recent Ask/new stories and descendants. Not a full HN search.

        The cursor advances by fetched item ID. Descendants are still traversed for older
        stories to discover new comments. Only the latest bounded sample is inspected.
        """
        roots = list(dict.fromkeys(self.get("askstories")[:20] + self.get("newstories")[:20]))
        pending = deque((item_id, item_id, "") for item_id in roots)
        seen = set()
        fetched = 0
        while pending and fetched < cap:
            item_id, discussion_id, parent_title = pending.popleft()
            if item_id in seen:
                continue
            seen.add(item_id)
            raw = self.get(f"item/{int(item_id)}")
            fetched += 1
            self.scanned += 1
            if not raw or raw.get("deleted") or raw.get("dead"):
                continue
            title = redact_contacts(normalize_html(raw.get("title", ""))) or parent_title
            # Inspect a few descendants before the next root so comments fit the run cap.
            for child in reversed(raw.get("kids", [])[:5]):
                pending.appendleft((child, discussion_id, title))
            if raw.get("type") not in ("story", "comment") or item_id <= watermark:
                continue
            text = redact_contacts(normalize_html(raw.get("text", "")))
            if not text:
                continue  # An external article's title is not the author's pain statement.
            yield {
                "source": "hacker_news", "external_id": str(item_id),
                "canonical_url": f"https://news.ycombinator.com/item?id={item_id}",
                "author_handle": raw.get("by"), "title": title,
                "published_at": datetime.fromtimestamp(raw["time"], timezone.utc).isoformat() if raw.get("time") else None,
                "permitted_excerpt": text, "metadata": {"discussion_id": str(discussion_id), "kind": raw["type"]},
            }
