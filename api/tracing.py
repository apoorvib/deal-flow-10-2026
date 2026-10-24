"""Best-effort PRISM tracing with a local JSONL audit fallback.

PRISM uses a project id plus the ``X-PRISMtrace-Key`` header. Tracing is
observability only: an unavailable tracing service must never change a
verification result or fail an application request.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

LOG = logging.getLogger("api.tracing")
LOCAL_TRACE_FILE = ROOT / "fixtures" / "live" / "prism_traces.jsonl"
DEFAULT_HOST = "https://api.prism.blockconvey.com"
DEFAULT_PROJECT_ID = "4bdcda53-e2da-4d7e-91e9-f9ce234c351b"
_lock = threading.Lock()


def init_tracing() -> None:
    """Initialize tracing without making startup dependent on PRISM."""
    LOCAL_TRACE_FILE.parent.mkdir(parents=True, exist_ok=True)


def _safe(value: Any, limit: int = 6000) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:limit]
    if isinstance(value, dict):
        return {str(k): _safe(v, limit) for k, v in list(value.items())[:100]}
    if isinstance(value, (list, tuple)):
        return [_safe(v, limit) for v in value[:100]]
    return str(value)[:limit]


def _append_local(payload: dict[str, Any]) -> None:
    try:
        LOCAL_TRACE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with _lock, LOCAL_TRACE_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, default=str, separators=(",", ":")) + "\n")
    except Exception:  # noqa: BLE001
        LOG.debug("Unable to write local trace fallback", exc_info=True)


def _send(payload: dict[str, Any]) -> str | None:
    key = (os.getenv("PRISMTRACE_API_KEY") or "").strip()
    project_id = (os.getenv("PRISMTRACE_PROJECT_ID") or DEFAULT_PROJECT_ID).strip()
    if not key or not project_id:
        return None
    host = (os.getenv("PRISMTRACE_HOST") or DEFAULT_HOST).rstrip("/")
    try:
        response = httpx.post(
            f"{host}/api/traces",
            headers={"X-PRISMtrace-Key": key, "Content-Type": "application/json"},
            json={"project_id": project_id, **payload},
            timeout=float(os.getenv("PRISMTRACE_TIMEOUT_SECONDS", "3")),
        )
        if response.is_success:
            body = response.json()
            return str(body.get("id")) if isinstance(body, dict) and body.get("id") else None
        LOG.warning("PRISM trace rejected with HTTP %s", response.status_code)
    except Exception:  # noqa: BLE001
        LOG.debug("PRISM trace delivery failed", exc_info=True)
    return None


def evaluate_guardrail(trace_id: str, messages: list[dict[str, str]]) -> bool | None:
    """Ask PRISM whether an issuance event is allowed.

    ``True`` means PRISM explicitly blocked the event, ``False`` means the
    rules evaluated and allowed it, and ``None`` means PRISM was unavailable.
    The local guardrail remains authoritative when the service is unavailable.
    """
    key = (os.getenv("PRISMTRACE_API_KEY") or "").strip()
    project_id = (os.getenv("PRISMTRACE_PROJECT_ID") or DEFAULT_PROJECT_ID).strip()
    if not key or not project_id:
        return None
    host = (os.getenv("PRISMTRACE_HOST") or DEFAULT_HOST).rstrip("/")
    try:
        response = httpx.post(
            f"{host}/api/guardrails/evaluate",
            headers={"X-PRISMtrace-Key": key, "Content-Type": "application/json"},
            json={"project_id": project_id, "trace_id": trace_id,
                  "agent_id": "savy-accredited-verification", "messages": messages},
            timeout=float(os.getenv("PRISMTRACE_TIMEOUT_SECONDS", "3")),
        )
        if response.is_success:
            body = response.json()
            if isinstance(body, dict) and body.get("evaluated"):
                return bool(body.get("blocked"))
    except Exception:  # noqa: BLE001
        LOG.debug("PRISM guardrail evaluation failed", exc_info=True)
    return None


class Span:
    def __init__(self, name: str, attributes: dict[str, Any]):
        self.name = name
        self.attributes = dict(attributes)
        self.started = time.perf_counter()
        self.trace_id = str(uuid.uuid4())
        self.remote_id: str | None = None

    def set(self, **attributes: Any) -> "Span":
        self.attributes.update(attributes)
        return self

    def _payload(self, error: BaseException | None = None) -> dict[str, Any]:
        elapsed = round((time.perf_counter() - self.started) * 1000)
        attrs = {k: _safe(v) for k, v in self.attributes.items()}
        input_messages = attrs.pop("input_messages", None)
        if input_messages is None:
            input_text = attrs.pop("input_text", "")
            input_messages = [{"role": "user", "content": _safe(input_text)}]
        output = attrs.pop("output_message", "")
        payload: dict[str, Any] = {
            "trace_id": self.trace_id,
            "session_id": attrs.pop("session_id", self.trace_id),
            "agent_id": "savy-accredited-verification",
            "agent_name": "Savy accredited verification",
            "model": attrs.pop("model", "savy-backend"),
            "input_messages": input_messages,
            "output_message": _safe(output),
            "latency_ms": elapsed,
            "metadata": {"span_name": self.name, **attrs},
        }
        if "token_count_input" in self.attributes:
            payload["token_count_input"] = int(self.attributes["token_count_input"] or 0)
        if "token_count_output" in self.attributes:
            payload["token_count_output"] = int(self.attributes["token_count_output"] or 0)
        if error:
            payload["metadata"].update({"status": "error", "error_message": str(error)[:500]})
        else:
            payload["metadata"]["status"] = "ok"
        return payload

    def finish(self, error: BaseException | None = None) -> None:
        payload = self._payload(error)
        _append_local({"at": dt.datetime.now(dt.timezone.utc).isoformat(), **payload})
        self.remote_id = _send(payload)


@contextmanager
def span(name: str, **attributes: Any) -> Iterator[Span]:
    current = Span(name, attributes)
    try:
        yield current
    except Exception as exc:
        current.finish(exc)
        raise
    else:
        current.finish()


def current_trace_url(trace_id: str | None) -> str | None:
    if not trace_id or not os.getenv("PRISMTRACE_API_KEY"):
        return None
    host = (os.getenv("PRISMTRACE_HOST") or DEFAULT_HOST).rstrip("/")
    return f"{host}/traces/{trace_id}"
