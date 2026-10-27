from datetime import datetime, timezone, timedelta
import httpx
import pytest
from pain_discovery.public_web import PublicWeb, public_target
from pain_discovery.connectors import SourceDenied


def policy():
    return {"enabled": True, "automated_fetch": True, "approval_status": "approved", "limits": {"pages": [{
        "url": "https://community.example.com/discussion", "permission_url": "https://community.example.com/terms",
        "permission_confirmed": True, "public_discussion_confirmed": True,
        "reviewed_at": datetime.now(timezone.utc).isoformat()}]}}


def resolver(*args, **kwargs):
    return [(2, 1, 6, "", ("93.184.216.34", 443))]


def test_approved_page_pins_dns_honors_robots_and_redacts():
    requests, delays = [], []
    def respond(request):
        requests.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, headers={"content-type": "text/plain"}, text="User-agent: *\nAllow: /\nCrawl-delay: 4")
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<p>Reporting takes hours. Contact a@example.com</p>")
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        rows = list(PublicWeb(client, resolver, delays.append).collect(policy(), 1))
    assert len(rows) == 1 and rows[0]["source"] == "public_web"
    assert "a@example.com" not in rows[0]["permitted_excerpt"]
    assert rows[0]["author_handle"] is None
    assert all(r.url.host == "93.184.216.34" and r.headers["host"] == "community.example.com" for r in requests)
    assert all(r.extensions["sni_hostname"] == "community.example.com" for r in requests)
    assert delays == [2, 4]


@pytest.mark.parametrize("url", ["http://example.com/x", "https://127.0.0.1/x", "https://[::1]/", "https://db.internal/x",
    "https://user:password@example.com/x", "https://example.com:444/x", "https://example.com/x?token=secret",
    "https://www.reddit.com/r/test", "https://g2.com/x", "https://capterra.com/x", "https://linkedin.com/x"])
def test_ineligible_targets(url):
    with pytest.raises(SourceDenied): public_target(url)


@pytest.mark.parametrize("denial", [301, 401, 403, 429])
def test_access_denial_and_redirect_never_followed(denial):
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(denial, headers={"location": "https://127.0.0.1/", "retry-after": "120"})
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(SourceDenied): list(PublicWeb(client, resolver, lambda _: None).collect(policy(), 1))
    assert len(requests) == 1


def test_private_or_mixed_dns_rejected_before_http():
    def private(*args, **kwargs): return resolver() + [(2, 1, 6, "", ("127.0.0.1", 443))]
    with httpx.Client(transport=httpx.MockTransport(lambda _: pytest.fail("Unexpected fetch"))) as client:
        with pytest.raises(SourceDenied): list(PublicWeb(client, private, lambda _: None).collect(policy(), 1))


@pytest.mark.parametrize("case", ["disabled", "unconfirmed", "expired", "robots", "captcha", "oversized"])
def test_permission_robots_challenge_and_size_guards(case):
    p = policy()
    if case == "disabled": p["enabled"] = False
    if case == "unconfirmed": p["limits"]["pages"][0]["permission_confirmed"] = False
    if case == "expired": p["limits"]["pages"][0]["reviewed_at"] = (datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
    def respond(request):
        if case in ("disabled", "unconfirmed", "expired"): pytest.fail("Permission gate fetched data")
        text = "User-agent: *\nDisallow: /" if case == "robots" else "User-agent: *\nAllow: /"
        if request.url.path != "/robots.txt": text = "Verify you are human" if case == "captcha" else "x" * 1_000_001
        return httpx.Response(200, headers={"content-type": "text/plain"}, text=text)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(SourceDenied): list(PublicWeb(client, resolver, lambda _: None).collect(p, 1))
