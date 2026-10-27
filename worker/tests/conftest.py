import pytest
from pain_discovery.models import Extraction


@pytest.fixture
def extraction_data():
    return dict(is_relevant=True, relevance_reason="Direct workflow complaint", confidence=.8,
        pain_summary="Reporting takes hours", problem_category=None,
        pain_evidence=[{"exact_excerpt":"Reporting takes hours every week. We use spreadsheets.","source_item_id":"item-1"}],
        customer_segment=None,buyer_role=None,buyer_role_evidence=None,existing_workaround="spreadsheets",existing_product=None,
        alternative_requested=False,severity=3,frequency=4,evidence_of_spend=None,buyer_accessibility=None,
        urgency_signal="unknown",spend_signal="unknown",business_impact=None,missing_information=["Purchasing authority"])


@pytest.fixture
def extraction(extraction_data):
    return Extraction.model_validate(extraction_data)
