"""Small PostgREST adapter. No raw source content or credentials in logs/errors."""
from datetime import datetime, timezone, timedelta
import httpx
from .normalize import content_hash
from .config import ConfigurationError


class Store:
    def __init__(self, client: httpx.Client, url: str, key: str, owner_id: str | None = None):
        if not all((url, key)):
            raise ConfigurationError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        if not url.startswith("https://") and not url.startswith("http://127.0.0.1:") and not url.startswith("http://localhost:"):
            raise ConfigurationError("Use HTTPS Supabase URL (or local Supabase)")
        self.client, self.url, self.owner_id = client, url.rstrip("/") + "/rest/v1", owner_id
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.key, self.base_url = key, url
        if owner_id and not self.rpc("check_worker_user", {"p_user": owner_id}):
            raise PermissionError("Worker user is missing or unconfirmed")

    def for_user(self, user_id: str):
        return Store(self.client, self.base_url, self.key, user_id)

    def scope(self):
        if not self.owner_id:
            raise PermissionError("A claimed job's user context is required for workspace data")
        return self.owner_id

    def request(self, method, path, *, params=None, data=None, prefer="return=representation"):
        response = self.client.request(method, f"{self.url}/{path}", headers={**self.headers, "Prefer": prefer}, params=params, json=data, timeout=20, follow_redirects=False)
        if response.is_error:
            raise RuntimeError(f"Database operation failed: {method} {path.split('/')[0]} HTTP {response.status_code}")
        return response.json() if response.content else None

    def rpc(self, name, args):
        return self.request("POST", f"rpc/{name}", data=args)

    def select(self, table, **params):
        return self.request("GET", table, params={**params, "owner_id": f"eq.{self.scope()}"})

    def insert(self, table, data, conflict=None):
        payload = {**data, "owner_id": self.scope()}
        return self.request("POST", table, data=payload, params={"on_conflict": conflict} if conflict else None,
                            prefer="resolution=ignore-duplicates,return=representation" if conflict else "return=representation")

    def patch(self, table, item_id, data):
        if "owner_id" in data and data["owner_id"] != self.scope():
            raise PermissionError("Cannot move records between users")
        return self.request("PATCH", table, params={"owner_id": f"eq.{self.scope()}", "id": f"eq.{item_id}"}, data=data)

    def claim(self):
        rows = self.rpc("claim_discovery", {"p_owner": self.owner_id})
        return rows[0] if rows else None

    def project(self, project_id):
        rows = self.select("research_projects", id=f"eq.{project_id}", limit="1")
        if not rows:
            raise PermissionError("Project does not belong to the job's user")
        return rows[0]

    def policies(self):
        return {row["source_id"]: row for row in self.request("GET", "source_policies")}

    def persist_item(self, item, project_id, retention_days):
        item = {**item, "content_hash": content_hash(item["permitted_excerpt"]),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()}
        removed = self.select("source_removals", source=f"eq.{item['source']}", external_id=f"eq.{item['external_id']}", limit="1")
        if not removed:
            removed = self.select("source_removals", source=f"eq.{item['source']}", content_hash=f"eq.{item['content_hash']}", limit="1")
        if not removed:
            removed = self.select("source_removals", source=f"eq.{item['source']}", canonical_url=f"eq.{item['canonical_url']}", limit="1")
        if removed:
            return None, True
        # Query identities separately to avoid embedding untrusted text in PostgREST filter syntax.
        existing = []
        for key in ("external_id", "canonical_url", "content_hash"):
            existing = self.select("source_items", source=f"eq.{item['source']}", **{key: f"eq.{item[key]}"}, limit="1")
            if existing:
                break
        duplicate = bool(existing)
        if existing:
            stored = existing[0]
            if stored.get("removal_requested_at") or datetime.fromisoformat(stored["expires_at"]).astimezone(timezone.utc) <= datetime.now(timezone.utc):
                return None, True
        else:
            stored = self.insert("source_items", item)[0]
        self.insert("project_source_items", {"project_id": project_id, "item_id": stored["id"]}, "project_id,item_id")
        return stored, duplicate

    def manual_items(self, project_id, cap):
        return self.rpc("pending_manual_sources", {"p_owner": self.scope(), "p_project": project_id, "p_cap": cap})

    def has_signal(self, project_id, item_id):
        return bool(self.select("analysis_results", project_id=f"eq.{project_id}", item_id=f"eq.{item_id}", select="item_id", limit="1")) or bool(self.select("pain_signals", project_id=f"eq.{project_id}", item_id=f"eq.{item_id}", select="id", limit="1"))

    def record_analysis(self, project_id, item_id, relevant, model):
        self.insert("analysis_results", {"project_id": project_id, "item_id": item_id, "is_relevant": relevant, "model_id": model}, "project_id,item_id")

    def cluster(self, signal, extraction):
        # Exact repeated problem phrases only. Broad LLM categories cannot merge unrelated pains.
        canonical = " ".join(extraction.pain_summary.casefold().split())
        clusters = self.select("pain_clusters", project_id=f"eq.{signal['project_id']}", canonical_problem=f"eq.{canonical}", limit="1")
        cluster = clusters[0] if clusters else self.insert("pain_clusters", {
            "project_id": signal["project_id"], "canonical_problem": canonical,
            "summary": extraction.pain_summary, "score": signal["score"],
        })[0]
        self.insert("cluster_members", {"cluster_id": cluster["id"], "pain_signal_id": signal["id"]}, "cluster_id,pain_signal_id")

    def error(self, run_id, code):
        self.insert("job_errors", {"run_id": run_id, "code": code, "message": f"{code}: see operator configuration; source/model content omitted"})

    def cursor(self, project_id):
        rows = self.select("source_cursors", project_id=f"eq.{project_id}", source="eq.hacker_news", limit="1")
        return rows[0]["last_id"] if rows else 0

    def set_cursor(self, project_id, value):
        self.request("POST", "source_cursors", params={"on_conflict": "project_id,source"}, data={"owner_id": self.scope(), "project_id": project_id, "source": "hacker_news", "last_id": value}, prefer="resolution=merge-duplicates,return=minimal")

    def purge(self):
        params = {"expires_at": f"lte.{datetime.now(timezone.utc).isoformat()}"}
        if self.owner_id:
            params["owner_id"] = f"eq.{self.owner_id}"
        return self.request("DELETE", "source_items", params=params)

    def enqueue_scheduled(self):
        return self.rpc("enqueue_scheduled_discoveries", {})
