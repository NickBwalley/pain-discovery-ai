import json
from datetime import datetime,timedelta,timezone
import httpx
import pytest
from pain_discovery.store import Store


def test_store_requires_confirmed_user_context():
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json=False))) as client:
        with pytest.raises(PermissionError):Store(client,"https://example.supabase.co","service-test","owner")


def test_duplicate_reuses_stored_item_and_does_not_refresh_expiry():
    requests=[]
    stored={"id":"stored","external_id":"1","expires_at":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()}
    def respond(req):
        requests.append(req)
        if req.url.path.endswith("check_worker_user"):return httpx.Response(200,json=True)
        if req.url.path.endswith("source_removals"):return httpx.Response(200,json=[])
        if req.url.path.split("/")[-1]=="source_items":return httpx.Response(200,json=[stored])
        return httpx.Response(200,json=[])
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        store=Store(client,"https://example.supabase.co","service-test","owner")
        result,duplicate=store.persist_item({"source":"hacker_news","external_id":"1","canonical_url":"https://news.ycombinator.com/item?id=1","permitted_excerpt":"Some pain"},"project",30)
    assert result==stored and duplicate
    assert not any(req.method in ("POST","PATCH") and req.url.path.split("/")[-1]=="source_items" for req in requests)
    link=json.loads(requests[-1].content)
    assert link=={"owner_id":"owner","project_id":"project","item_id":"stored"}


def test_removed_item_never_reimported():
    def respond(req):
        if req.url.path.endswith("check_worker_user"):return httpx.Response(200,json=True)
        assert req.method=="GET" and req.url.path.endswith("source_removals")
        return httpx.Response(200,json=[{"external_id":"1"}])
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        store=Store(client,"https://example.supabase.co","service-test","owner")
        assert store.persist_item({"source":"hacker_news","external_id":"1","permitted_excerpt":"pain"},"project",30)==(None,True)


def test_shared_queue_binds_each_job_to_its_user_and_cannot_read_without_scope():
    requests=[]
    def respond(req):
        requests.append(req)
        if req.url.path.endswith("check_worker_user"): return httpx.Response(200,json=True)
        if req.url.path.endswith("claim_discovery"): return httpx.Response(200,json=[{"owner_id":"alice","id":"run-a"}])
        return httpx.Response(200,json=[])
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        queue=Store(client,"https://example.supabase.co","service-test")
        assert queue.claim()["owner_id"] == "alice"
        assert json.loads(requests[-1].content) == {"p_owner":None}
        with pytest.raises(PermissionError): queue.select("source_items")
        for user in ("alice","bob"):
            store=queue.for_user(user)
            store.select("source_items",owner_id="eq.another-user")
            assert requests[-1].url.params["owner_id"] == "eq."+user
            store.insert("source_items",{"owner_id":"another-user"})
            assert json.loads(requests[-1].content)["owner_id"] == user
            with pytest.raises(PermissionError): store.patch("source_items","id",{"owner_id":"another-user"})


def test_shared_scheduling_and_purge_are_not_restricted_to_a_single_account():
    requests=[]
    def respond(req):
        requests.append(req)
        return httpx.Response(200,json=2 if req.url.path.endswith("enqueue_scheduled_discoveries") else [])
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        queue=Store(client,"https://example.supabase.co","service-test")
        assert queue.enqueue_scheduled()==2
        queue.purge()
    assert requests[-1].method=="DELETE" and "owner_id" not in requests[-1].url.params
