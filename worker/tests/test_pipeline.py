from copy import deepcopy
from pain_discovery.pipeline import execute_run


class FakeStore:
    owner_id="owner"
    def __init__(self):self.sources={};self.signals={};self.runs=[];self.errors=[];self.clusters=[]
    def project(self,_):return {"id":"project","keywords":["reporting"],"enabled_sources":["hacker_news","manual"]}
    def policies(self):return {"hacker_news":{"enabled":True,"approval_status":"approved","automated_fetch":True,"limits":{"max_items":60},"retention_days":30},"manual":{"enabled":True}}
    def manual_items(self,*_):return []
    def cursor(self,_):return 0
    def set_cursor(self,*_):pass
    def persist_item(self,item,*_):
        duplicate=item["external_id"] in self.sources
        self.sources.setdefault(item["external_id"],{**item,"id":"item-1"})
        return self.sources[item["external_id"]],duplicate
    def has_signal(self,project,item):return item in self.signals
    def record_analysis(self,*_):pass
    def insert(self,table,row):self.signals[row["item_id"]]={**row,"id":"signal"};return [self.signals[row["item_id"]]]
    def cluster(self,*args):self.clusters.append(args)
    def error(self,*args):self.errors.append(args)
    def patch(self,table,item,data):self.runs.append(data)


class FakeHN:
    scanned=1
    def collect(self,*_):return iter([{"external_id":"10","title":"reporting","permitted_excerpt":"Reporting takes hours every week. We use spreadsheets.","source":"hacker_news"}])


RUN=dict(id="run",owner_id="owner",project_id="project",max_items=30,max_ai_calls=5,ai_enabled=True)


def test_real_pipeline_with_mocked_io_is_idempotent(extraction):
    store=FakeStore()
    class FakeAI:
        calls=1;input_tokens=10;output_tokens=20;model="test"
        def extract(self,*_):return extraction
    for _ in range(2):assert execute_run(store,FakeHN(),lambda _:FakeAI(),deepcopy(RUN))[0]=="completed"
    assert len(store.sources)==1 and len(store.signals)==1 and len(store.clusters)==1
    assert store.runs[-1]["duplicates"]==1
    assert store.signals["item-1"]["score"]==35


def test_missing_key_fails_run_without_false_completion():
    store=FakeStore()
    def missing(_):raise ValueError("Missing API key")
    state,_=execute_run(store,FakeHN(),missing,RUN)
    assert state=="failed" and store.runs[-1]["errors"]==1
    assert not store.signals and not store.sources


def test_ai_disabled_is_honest_collection_only():
    store=FakeStore()
    state,_=execute_run(store,FakeHN(),lambda _:None,{**RUN,"ai_enabled":False})
    assert state=="completed" and not store.signals and len(store.sources)==1
    assert "Collection only" in store.runs[-1]["error_summary"]


def test_disabled_source_is_never_fetched():
    store=FakeStore();policies=store.policies();policies["hacker_news"]["enabled"]=False;store.policies=lambda:policies
    class NeverFetch:
        def collect(self,*_):raise AssertionError("Unauthorized fetch")
    assert execute_run(store,NeverFetch(),lambda _:None,{**RUN,"ai_enabled":False})[0]=="failed"


def test_wrong_owner_fails():
    store=FakeStore()
    assert execute_run(store,FakeHN(),lambda _:None,{**RUN,"owner_id":"stranger"})[0]=="failed"


def test_public_pages_flow_through_persistence_and_scoring(extraction):
    store = FakeStore()
    project = store.project(None)
    project["enabled_sources"] = ["public_web"]
    store.project = lambda _: project
    policies = store.policies()
    policies["public_web"] = {"enabled":True,"automated_fetch":True,"approval_status":"approved","retention_days":7,"limits":{"max_items":10}}
    store.policies = lambda: policies
    class NeverHN:
        def collect(self,*_): raise AssertionError("HN must not run")
    class Web(FakeHN):
        def collect(self,*_):
            yield {**next(super().collect()), "source":"public_web"}
    class AI:
        calls=1;input_tokens=10;output_tokens=20;model="mock"
        def extract(self,*_):return extraction
    state, counts = execute_run(store,NeverHN(),lambda _:AI(),RUN,Web())
    assert state == "completed" and counts["analyzed"] == 1
    assert store.signals["item-1"]["score"] == 35
    assert store.sources["10"]["source"] == "public_web"
    policies["public_web"]["enabled"] = False
    assert execute_run(store,NeverHN(),lambda _:None,{**RUN,"ai_enabled":False},Web())[0] == "failed"


def test_partial_collection_keeps_evidence_and_records_error(extraction):
    store=FakeStore()
    class PartialHN(FakeHN):
        def collect(self,*args):
            yield from super().collect(*args)
            raise PermissionError("HN stopped: 429")
    class AI:
        calls=1;input_tokens=10;output_tokens=20;model="mock"
        def extract(self,*_):return extraction
    state,counts=execute_run(store,PartialHN(),lambda _:AI(),RUN)
    assert state=="partial" and counts["errors"]==1 and counts["analyzed"]==1
    assert len(store.signals)==1
