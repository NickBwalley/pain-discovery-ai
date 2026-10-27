import argparse
import json
import os
import sys
import time
import httpx
from dotenv import load_dotenv
from .ai import Analyzer
from .connectors import HackerNews
from .public_web import PublicWeb
from .pipeline import execute_run
from .store import Store
from .config import ConfigurationError


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Private research worker; no messaging actions")
    parser.add_argument("command", choices=["run-once", "watch", "scheduled", "purge", "dry-run"])
    parser.add_argument("--max-jobs", type=int, default=5)
    args = parser.parse_args()
    try:
        with httpx.Client(follow_redirects=False) as client, httpx.Client(follow_redirects=False, trust_env=False, limits=httpx.Limits(max_keepalive_connections=0)) as public_client:
            def connector():
                return HackerNews(client, float(os.getenv("HN_REQUEST_INTERVAL", ".25")))
            if args.command == "dry-run":
                hn = connector()
                sample = list(hn.collect(10))
                print(json.dumps({"dry_run": True, "scanned": hn.scanned, "eligible_text_items": len(sample), "persisted": 0, "ai_calls": 0}))
                return
            queue = Store(client, os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
            if args.command == "purge":
                print(json.dumps({"purged": len(queue.purge() or [])}))
                return
            if args.command == "scheduled":
                queue.purge()
                queue.enqueue_scheduled()
            def analyzer_factory(cap):
                return Analyzer(client, os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1"), os.getenv("AI_API_KEY", ""), os.getenv("AI_MODEL", ""),
                                min(cap, int(os.getenv("AI_MAX_CALLS_PER_RUN", "10"))), int(os.getenv("AI_MAX_OUTPUT_TOKENS", "1800")))
            processed = 0
            failed = False
            while args.command == "watch" or processed < max(1, min(args.max_jobs, 20)):
                run = queue.claim()
                if not run:
                    if args.command != "watch":
                        break
                    time.sleep(5)
                    continue
                store = queue.for_user(run["owner_id"])
                state, counts = execute_run(store, connector(), analyzer_factory, run, PublicWeb(public_client))
                print(json.dumps({"run_id": run["id"], "state": state, **counts}), flush=True)
                failed |= state in ("failed", "partial")
                processed += 1
            if failed:
                sys.exit(1)
    except KeyboardInterrupt:
        return
    except ConfigurationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Deliberately no raw exception text: HTTP exceptions can include sensitive request URLs.
        print(f"Worker failed ({type(error).__name__}); verify Supabase settings and service availability", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
