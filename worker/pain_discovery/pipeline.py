from datetime import datetime, timezone
from .ai import BudgetExceeded
from .models import PROMPT_VERSION, RULES_VERSION, score
from .normalize import relevant
from .config import ConfigurationError


def execute_run(store, connector, analyzer_factory, run: dict, public_web=None):
    counts = dict(fetched=0, accepted=0, duplicates=0, analyzed=0, errors=0)
    analyzer = None
    state, message = "completed", None
    try:
        if run["owner_id"] != store.owner_id:
            raise PermissionError("Job owner mismatch")
        project = store.project(run["project_id"])
        policies = store.policies()
        cap = min(run["max_items"], 60, int(policies["hacker_news"]["limits"].get("max_items", 60)))
        if run["ai_enabled"]:
            analyzer = analyzer_factory(run["max_ai_calls"])
        items = []
        sources = project["enabled_sources"]
        if any(source not in ("hacker_news", "manual", "public_web") for source in sources):
            raise PermissionError("Project includes an unauthorized connector")
        if "manual" in sources and not policies["manual"]["enabled"]:
            raise PermissionError("Manual source policy is disabled")
        if "manual" in sources and policies["manual"]["enabled"]:
            items = store.manual_items(project["id"], cap)
            counts["fetched"] += len(items)
        high_water = store.cursor(project["id"])
        if "hacker_news" in sources:
            policy = policies["hacker_news"]
            if not policy["enabled"] or policy["approval_status"] != "approved" or not policy["automated_fetch"]:
                raise PermissionError("Hacker News source policy is disabled")
            # Revisit bounded recent sample: stored IDs/hashes provide idempotency and overlapping
            # scans catch new comments even when an older root is below the high-water mark.
            try:
                if cap > len(items):
                    for raw in connector.collect(cap-len(items)):
                        high_water = max(high_water, int(raw["external_id"]))
                        if not relevant(raw["title"] + " " + raw["permitted_excerpt"], project):
                            continue
                        stored, duplicate = store.persist_item(raw, project["id"], policy["retention_days"])
                        counts["duplicates"] += int(duplicate)
                        if stored:
                            items.append(stored)
            except Exception as error:
                counts["errors"] += 1
                store.error(run["id"], type(error).__name__)
                message = f"{type(error).__name__}: HN collection stopped; any already accepted evidence is retained"
            finally:
                counts["fetched"] += connector.scanned
            store.set_cursor(project["id"], high_water)
        if "public_web" in sources:
            policy = policies.get("public_web", {})
            if public_web is None or not policy.get("enabled") or not policy.get("automated_fetch") or policy.get("approval_status") != "approved":
                raise PermissionError("Public-page connector is disabled or permission is missing")
            try:
                remaining = min(cap-len(items), int(policy.get("limits", {}).get("max_items", 10)))
                if remaining > 0:
                    for raw in public_web.collect(policy, remaining):
                        if not relevant(raw["title"] + " " + raw["permitted_excerpt"], project):
                            continue
                        stored, duplicate = store.persist_item(raw, project["id"], policy["retention_days"])
                        counts["duplicates"] += int(duplicate)
                        if stored:
                            items.append(stored)
            except Exception as error:
                counts["errors"] += 1
                store.error(run["id"], type(error).__name__)
                message = f"{type(error).__name__}: public-page collection stopped; verify permission, robots and access status"
            finally:
                counts["fetched"] += public_web.scanned
        for item in items:
            if not relevant(item["title"] + " " + item["permitted_excerpt"], project):
                continue
            counts["accepted"] += 1
            if not analyzer or store.has_signal(project["id"], item["id"]):
                continue
            try:
                extraction = analyzer.extract(item, project)
                counts["analyzed"] += 1
                if not extraction.is_relevant:
                    store.record_analysis(project["id"], item["id"], False, analyzer.model)
                    continue
                priority, completeness, parts = score(extraction)
                signal = store.insert("pain_signals", {"project_id": project["id"], "item_id": item["id"],
                    "extraction": extraction.model_dump(), "summary": extraction.pain_summary, "category": extraction.problem_category,
                    "score": priority, "evidence_completeness": completeness, "score_components": parts,
                    "rules_version": RULES_VERSION, "model_id": analyzer.model, "prompt_version": PROMPT_VERSION})[0]
                store.cluster(signal, extraction)
                store.record_analysis(project["id"], item["id"], True, analyzer.model)
            except BudgetExceeded:
                counts["errors"] += 1
                store.error(run["id"], "ai_budget_exhausted")
                message = "AI call cap reached; remaining sources retained for another run"
                break
            except PermissionError:
                raise
            except Exception as error:
                counts["errors"] += 1
                store.error(run["id"], type(error).__name__)
        if counts["errors"]:
            state = "partial" if counts["analyzed"] or counts["accepted"] else "failed"
        if not analyzer and not message:
            message = "Collection only: AI was disabled; no extraction was attempted"
    except Exception as error:
        counts["errors"] += 1
        state = "partial" if counts["accepted"] else "failed"
        message = str(error) if isinstance(error, ConfigurationError) else f"{type(error).__name__}: run stopped; verify source policy, credentials and provider configuration"
        store.error(run["id"], type(error).__name__)
    finally:
        if analyzer:
            counts.update(ai_calls=analyzer.calls, input_tokens=analyzer.input_tokens, output_tokens=analyzer.output_tokens)
        store.patch("discovery_runs", run["id"], {**counts, "state": state, "error_summary": message, "ended_at": datetime.now(timezone.utc).isoformat()})
    return state, counts
