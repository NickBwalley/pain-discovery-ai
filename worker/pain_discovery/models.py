from typing import Literal
import re
from pydantic import BaseModel, ConfigDict, Field

PROMPT_VERSION = "extract-v1"
RULES_VERSION = "equal-points-v2"


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    exact_excerpt: str = Field(min_length=1, max_length=4000)
    source_item_id: str


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    is_relevant: bool
    relevance_reason: str
    confidence: float = Field(ge=0, le=1)
    pain_summary: str | None
    problem_category: str | None
    pain_evidence: list[Evidence] = Field(max_length=8)
    customer_segment: str | None
    buyer_role: str | None
    buyer_role_evidence: str | None
    existing_workaround: str | None
    existing_product: str | None
    alternative_requested: bool
    severity: int | None = Field(ge=0, le=5)
    frequency: int | None = Field(ge=0, le=5)
    evidence_of_spend: int | None = Field(ge=0, le=5)
    buyer_accessibility: int | None = Field(ge=0, le=5)
    urgency_signal: Literal["explicit", "inferred", "unknown"]
    spend_signal: Literal["explicit", "inferred", "unknown"]
    business_impact: str | None
    missing_information: list[str]


SCORE_DIMENSIONS = ("severity", "frequency", "evidence_of_spend", "buyer_accessibility")


def score(extraction: Extraction) -> tuple[float, float, dict]:
    parts = {key: getattr(extraction, key) for key in SCORE_DIMENSIONS}
    priority = 5 * sum(value or 0 for value in parts.values())
    completeness = sum(value is not None for value in parts.values()) / 4
    return priority, completeness, parts


def validate_evidence(extraction: Extraction, item_id: str, text: str) -> Extraction:
    """Fail closed. Factual fields are extractive; summaries cannot add asserted facts."""
    if extraction.is_relevant and (not extraction.pain_summary or not extraction.pain_evidence):
        raise ValueError("Relevant pain requires a statement and supporting evidence")
    for evidence in extraction.pain_evidence:
        if evidence.source_item_id != item_id or evidence.exact_excerpt not in text:
            raise ValueError("Unsupported quotation or mismatched source")
    evidence_text = "\n".join(e.exact_excerpt for e in extraction.pain_evidence)
    # Deliberately conservative MVP: display only actual source phrases as factual fields.
    for key in ("pain_summary", "problem_category", "customer_segment", "buyer_role", "buyer_role_evidence",
                "existing_workaround", "existing_product", "business_impact"):
        value = getattr(extraction, key)
        if value is not None and value not in evidence_text:
            raise ValueError(f"Unsupported factual field: {key}")
    if extraction.buyer_role and not extraction.buyer_role_evidence:
        raise ValueError("Buyer role needs direct evidence")
    # Single-author samples never establish repeated independent demand or buying access.
    if extraction.buyer_accessibility is not None and not extraction.buyer_role_evidence:
        raise ValueError("Buyer accessibility needs role evidence")
    if extraction.evidence_of_spend not in (None, 0) and extraction.spend_signal != "explicit":
        raise ValueError("Spend score requires explicit evidence")
    if extraction.spend_signal == "explicit" and not re.search(r"[$€£]\s*\d|\b(?:pay|paid|paying|spend|spent|budget|subscription|costs?)\b", evidence_text, re.I):
        raise ValueError("Explicit spend needs an observed spending statement")
    if extraction.alternative_requested and not re.search(
        r"(?:looking for|recommend|suggest|any|an?|better|which|what|is there|are there).{0,60}\b(?:alternative|replacement|substitute)s?\b|(?:what|which).{0,40}\b(?:instead|replace)\b",
        evidence_text, re.I,
    ):
        raise ValueError("Alternative request is unsupported by the quotation")
    return extraction
