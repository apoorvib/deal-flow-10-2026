import pytest
from api.nicrron import _coerce_json, CHALLENGER_MODEL, EXTRACTOR_MODEL


def test_coerce_json_strips_markdown_fence():
    assert _coerce_json('```json\n{"docType": "w2"}\n```') == {"docType": "w2"}


def test_coerce_json_recovers_json_embedded_in_prose():
    assert _coerce_json('Sure! {"docType": "form_1040"} hope that helps')["docType"] == "form_1040"


def test_coerce_json_raises_on_garbage():
    with pytest.raises(ValueError):
        _coerce_json("I cannot help with that.")


def test_challenger_is_a_different_vendor_than_extractor():
    """Cross-vendor independence is the design's core claim. The same vendor twice
    shares blind spots and the review becomes a rubber stamp."""
    assert EXTRACTOR_MODEL.split("/")[0] != CHALLENGER_MODEL.split("/")[0]
