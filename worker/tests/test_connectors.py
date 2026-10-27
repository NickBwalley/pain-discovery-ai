import httpx
import pytest
from pain_discovery.connectors import HackerNews, SourceDenied, HN_BASE


def test_official_api_only_and_bounded_sampling():
    requested=[]
    def respond(request):
        requested.append(str(request.url))
        path=request.url.path
        if path.endswith("stories.json"):return httpx.Response(200,json=[10,11])
        item=int(path.split("/")[-1].split(".")[0])
        raw={"id":item,"type":"story","title":"Ask HN: reporting","text":"<p>Reporting takes hours</p>","by":"author","time":1700000000,"url":"http://127.0.0.1/secrets","kids":[12] if item==10 else []}
        if item==12:raw.update(type="comment",text="We use spreadsheets",kids=[])
        return httpx.Response(200,json=raw)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        hn=HackerNews(client,sleep=lambda _:None)
        items=list(hn.collect(2))
    assert hn.scanned==2 and len(items)==2
    assert len(requested)==4
    assert all(url.startswith(HN_BASE) for url in requested)
    assert items[1]["metadata"]["discussion_id"]=="10"
    assert items[0]["canonical_url"]=="https://news.ycombinator.com/item?id=10"
    assert items[0]["permitted_excerpt"]=="Reporting takes hours"


@pytest.mark.parametrize("status",[401,403,429])
def test_access_enforcement_stops(status):
    calls=[]
    def respond(req):calls.append(req);return httpx.Response(status,headers={"Retry-After":"60"})
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(SourceDenied):list(HackerNews(client,sleep=lambda _:None).collect(3))
    assert len(calls)==1


def test_deleted_and_external_only_are_not_pain():
    def respond(request):
        if request.url.path.endswith("stories.json"):return httpx.Response(200,json=[1,2])
        return httpx.Response(200,json={"id":1,"type":"story","title":"Vendor is awful","url":"https://example.com","deleted":request.url.path.endswith("2.json")})
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        assert list(HackerNews(client,sleep=lambda _:None).collect(3))==[]
