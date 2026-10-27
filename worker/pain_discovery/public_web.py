"""Fetch explicitly approved public discussion pages. No link following or login support."""
import ipaddress
import socket
import time
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from .connectors import SourceDenied
from .normalize import normalize_html, redact_contacts

AGENT = "PainDiscoveryResearch/1.0"
RESTRICTED = ("reddit.com", "redd.it", "linkedin.com", "g2.com", "capterra.com", "discord.com", "slack.com")


def public_target(url: str):
    target = urlsplit(url)
    host = target.hostname or ""
    if (target.scheme != "https" or target.username or target.password or target.port
            or target.query or target.fragment or not host.isascii() or "." not in host
            or host.endswith((".", ".local", ".internal", ".localhost", ".test", ".invalid"))
            or any(host == suffix or host.endswith("." + suffix) for suffix in RESTRICTED)):
        raise SourceDenied("Page is outside the permitted public-page connector policy")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return target
    raise SourceDenied("IP literal page URLs are not allowed")


class PublicWeb:
    def __init__(self, client: httpx.Client, resolver=socket.getaddrinfo, sleep=time.sleep):
        self.client, self.resolver, self.sleep = client, resolver, sleep
        self.scanned = 0

    def get(self, url: str, delay: float):
        target = public_target(url)
        addresses = {entry[4][0] for entry in self.resolver(target.hostname, 443, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(address).is_global or ipaddress.ip_address(address).is_multicast
                                or ipaddress.ip_address(address).is_reserved for address in addresses):
            raise SourceDenied("Public-page DNS resolved to an ineligible address")
        # Connect to the validated IP, retaining TLS SNI/certificate verification and Host.
        # This avoids a second DNS lookup and DNS-rebinding races.
        address = sorted(addresses)[0]
        netloc = f"[{address}]" if ":" in address else address
        pinned = urlunsplit(("https", netloc, target.path or "/", "", ""))
        self.sleep(delay)
        self.client.cookies.clear()
        with self.client.stream("GET", pinned, headers={"Host": target.hostname, "User-Agent": AGENT, "Connection": "close"},
                                extensions={"sni_hostname": target.hostname}, timeout=12, follow_redirects=False) as response:
            if response.status_code in (401, 403, 429):
                raise SourceDenied(f"Public-page fetch stopped: HTTP {response.status_code}; honor Retry-After before a later run")
            if 300 <= response.status_code < 400:
                raise SourceDenied("Public-page redirects are not followed")
            response.raise_for_status()
            if response.headers.get("content-type", "").split(";")[0].strip() not in ("text/html", "text/plain"):
                raise SourceDenied("Unsupported public-page content type")
            data = bytearray()
            for chunk in response.iter_bytes():
                data.extend(chunk)
                if len(data) > 1_000_000:
                    raise SourceDenied("Public-page response exceeds size cap")
            return bytes(data).decode("utf-8", errors="replace")

    def collect(self, policy: dict, cap: int):
        if not (policy.get("enabled") and policy.get("automated_fetch") and policy.get("approval_status") == "approved"):
            raise SourceDenied("Public-page permission is not approved")
        pages = policy.get("limits", {}).get("pages", [])
        if not isinstance(pages, list) or not pages:
            raise SourceDenied("No approved public pages configured")
        for page in pages[:min(cap, 60)]:
            if not isinstance(page, dict) or page.get("permission_confirmed") is not True or page.get("public_discussion_confirmed") is not True:
                raise SourceDenied("Document public discussion and collection/analysis permission before fetching")
            reviewed = datetime.fromisoformat(page["reviewed_at"].replace("Z", "+00:00"))
            if reviewed.tzinfo is None or not datetime.now(timezone.utc) - timedelta(days=30) <= reviewed <= datetime.now(timezone.utc):
                raise SourceDenied("Public-page permission review is expired or invalid")
            public_target(page["permission_url"])
            url = page["url"]
            target = public_target(url)
            robots_url = f"https://{target.hostname}/robots.txt"
            robots = RobotFileParser()
            robots.parse(self.get(robots_url, 2).splitlines())
            if not robots.can_fetch(AGENT, url):
                raise SourceDenied("robots.txt disallows this page")
            rate = robots.request_rate(AGENT)
            delay = max(2, robots.crawl_delay(AGENT) or 0, rate.seconds / rate.requests if rate else 0)
            if delay > 60:
                raise SourceDenied("robots.txt requires a slower schedule than this bounded connector supports")
            raw = self.get(url, delay)
            self.scanned += 1
            if any(marker in raw.lower() for marker in ("verify you are human", "g-recaptcha", "hcaptcha", "cf-chl-", "sign in to continue", "subscribe to continue")):
                raise SourceDenied("Access challenge detected; no bypass attempted")
            text = redact_contacts(normalize_html(raw))[:12000]
            if not text:
                continue
            yield {"source": "public_web", "external_id": sha256(url.encode()).hexdigest(), "canonical_url": url,
                   "author_handle": None, "title": target.hostname + target.path[:180], "published_at": None,
                   "permitted_excerpt": text, "metadata": {"discussion_id": url, "permission_url": page["permission_url"],
                   "permission_reviewed_at": page["reviewed_at"], "kind": "approved_public_page"}}
