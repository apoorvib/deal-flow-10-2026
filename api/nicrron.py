"""Thin client over Nicrron (an OpenAI-compatible gateway to many vendors' models)
plus document-type classification.

This module is deliberately minimal: it owns model selection, the HTTP call, and
JSON-coercion of model replies. It does NOT own the debate loop, the rules engine,
or tracing — those are later tasks layered on top of `complete_json`/`classify`.

Model choice is architecturally load-bearing, not arbitrary: the next task (a
4-round adversarial debate) requires the challenger to be a *different vendor*
than the extractor/adjudicator, or the "adversarial review" degenerates into a
same-vendor rubber stamp. See design doc §4.1 and §6.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional, get_args

from dotenv import load_dotenv
from openai import OpenAI

from api.models import DocType

# Load secrets from the repo-root .env regardless of the process's cwd.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# --- Constants (exact values per task-5-brief.md / design doc §4.1) --------

NICRRON_BASE_URL = "https://api.nicrron.ai/v1"

EXTRACTOR_MODEL = "openai/gpt-6-luna"
CHALLENGER_MODEL = "anthropic/claude-sonnet-5"  # MUST stay a non-OpenAI vendor.
ADJUDICATOR_MODEL = "openai/gpt-6-astra"

# Vision is confirmed working on both luna and Sonnet 5 (spec §6), but stays
# behind an explicit opt-in env var rather than defaulting on.
VISION_ENABLED = os.getenv("VISION_ENABLED", "0") == "1"

_VALID_DOC_TYPES = get_args(DocType)

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Lazy singleton so importing this module never requires the API key
    (only making a call does)."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("NICRRON_API_KEY"),
            base_url=NICRRON_BASE_URL,
        )
    return _client


# --- JSON coercion -----------------------------------------------------------

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL)


def _strip_fences(text: str) -> str:
    """Strip a surrounding markdown code fence (```json ... ``` or ``` ... ```),
    if present. Leaves the text untouched otherwise."""
    stripped = text.strip()
    match = _FENCE_RE.match(stripped)
    if match:
        return match.group(1).strip()
    return stripped


def _coerce_json(text: str) -> dict:
    """Parse a model reply into a dict, tolerating the ways models mangle JSON:

    1. Strip a markdown fence, if present, and try to parse.
    2. Fall back to the outermost `{`...`}` span (handles prose wrapped around
       the JSON) and try to parse that.
    3. Raise ValueError if neither works.
    """
    candidate = _strip_fences(text)

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        brace_span = candidate[start : end + 1]
        try:
            return json.loads(brace_span)
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not coerce model output into JSON: {text!r}")


# --- Core call ---------------------------------------------------------------


def complete_json(
    model: str,
    system: str,
    user: str,
    image_b64: Optional[str] = None,
) -> dict:
    """Call Nicrron with a system/user prompt and parse the reply as JSON.

    When `image_b64` is supplied AND vision is enabled, the user message carries
    an `image_url` content block alongside the text; otherwise the user message
    is plain text (either because no image was given, or because vision is
    disabled and we don't want to pay for/trust an image the model may ignore).
    """
    client = _get_client()

    if image_b64 and VISION_ENABLED:
        user_content = [
            {"type": "text", "text": user},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_b64}"},
            },
        ]
    else:
        user_content = user

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    # --- PRISM span attaches here (later task): the span should wrap this
    # call and record `model_name` and `usage` (captured just below) as
    # attributes, without needing this function restructured.
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0,
    )
    model_name = response.model  # noqa: F841 -- captured for the future span.
    usage = response.usage  # noqa: F841 -- captured for the future span.

    text = response.choices[0].message.content or ""
    return _coerce_json(text)


# --- Document classification -------------------------------------------------

_CLASSIFY_SYSTEM = (
    "You classify financial documents for an accredited-investor verification "
    "system. Reply with JSON only, no prose, no markdown fence: "
    '{"docType": "<value>"} where <value> is EXACTLY one of: '
    + ", ".join(_VALID_DOC_TYPES)
    + ". If none clearly apply, use \"other\"."
)


def classify(
    text: str,
    filename: str,
    image_b64: Optional[str] = None,
) -> str:
    """Classify a document's text (and optionally an image of it) into one of
    the nine `DocType` values. Defaults to "other" for anything the model
    returns that isn't an exact match (e.g. "1040" instead of "form_1040")."""
    user = f"Filename: {filename}\n\nDocument text:\n{text}"
    result = complete_json(EXTRACTOR_MODEL, _CLASSIFY_SYSTEM, user, image_b64=image_b64)

    doc_type = result.get("docType")
    if doc_type in _VALID_DOC_TYPES:
        return doc_type
    return "other"
