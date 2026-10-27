"""Refresh the reviewable extraction schema after intentional model changes."""
import json
from pathlib import Path
from pain_discovery.models import Extraction

destination = Path(__file__).resolve().parents[1] / "schemas" / "extraction.schema.json"
destination.parent.mkdir(exist_ok=True)
destination.write_text(json.dumps(Extraction.model_json_schema(), indent=2) + "\n", encoding="utf-8")
