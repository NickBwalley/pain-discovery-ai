from pain_discovery import cli


def test_cli_processes_multiple_users_without_owner_environment(monkeypatch, capsys):
    users=[]
    class Queue:
        def __init__(self,*args): self.runs=iter([{"owner_id":"alice","id":"run-a"},{"owner_id":"bob","id":"run-b"}])
        def claim(self): return next(self.runs,None)
        def for_user(self,user):
            users.append(user)
            return type("ScopedStore",(),{"owner_id":user})()
    def execute(store,connector,analyzer_factory,run,public_web):
        assert store.owner_id==run["owner_id"]
        return "completed",{"fetched":0}
    monkeypatch.setattr(cli,"Store",Queue)
    monkeypatch.setattr(cli,"execute_run",execute)
    monkeypatch.setattr(cli.sys,"argv",["pain-discovery","run-once","--max-jobs","2"])
    monkeypatch.delenv("OWNER_ID",raising=False)
    monkeypatch.delenv("OWNER_EMAIL",raising=False)
    cli.main()
    assert users==["alice","bob"]
    assert capsys.readouterr().out.count('"state": "completed"')==2
