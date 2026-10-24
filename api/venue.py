"""Debate artifact venues.

Every event is written to the local JSON venue first. When the Roundtable
agent credentials are configured, the same event is mirrored into the agent's
Roundtable bank through the documented HTTP tool API. Remote errors are
deliberately swallowed so verification remains available.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from api.tracing import span

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
LOCAL_DIR = ROOT / "fixtures" / "live" / "roundtable"
_lock = threading.Lock()


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class LocalJsonVenue:
    provider = "local_json"

    def _path(self, thread_id: str) -> Path:
        return LOCAL_DIR / f"{thread_id}.json"

    def _read(self, thread_id: str) -> dict[str, Any]:
        try:
            return json.loads(self._path(thread_id).read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {"id": thread_id, "messages": [], "versions": []}

    def _write(self, thread_id: str, data: dict[str, Any]) -> None:
        try:
            LOCAL_DIR.mkdir(parents=True, exist_ok=True)
            with _lock:
                self._path(thread_id).write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

    def open_thread(self, kind: str, title: str, metadata: dict[str, Any] | None = None) -> str:
        thread_id = f"{kind}_{uuid.uuid4().hex[:16]}"
        self._write(thread_id, {"id": thread_id, "kind": kind, "title": title,
                                "metadata": _safe(metadata or {}), "created_at": _now(),
                                "messages": [], "versions": []})
        return thread_id

    def post_message(self, thread_id: str, actor: str, content: Any,
                     metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        data = self._read(thread_id)
        message = {"id": uuid.uuid4().hex, "at": _now(), "actor": actor,
                   "content": _safe(content), "metadata": _safe(metadata or {})}
        data.setdefault("messages", []).append(message)
        self._write(thread_id, data)
        return message

    def version(self, thread_id: str, stage: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read(thread_id)
        version = {"id": uuid.uuid4().hex, "at": _now(), "stage": stage, "payload": _safe(payload)}
        data.setdefault("versions", []).append(version)
        self._write(thread_id, data)
        return version


class RoundtableVenue(LocalJsonVenue):
    provider = "roundtable"

    def __init__(self) -> None:
        self.key = (os.getenv("ROUNDTABLE_API_KEY") or "").strip()
        self.base_url = (os.getenv("ROUNDTABLE_API_URL") or "https://roundtable.bot").strip().rstrip("/")
        self.timeout = float(os.getenv("ROUNDTABLE_TIMEOUT_SECONDS", "8"))

    @property
    def enabled(self) -> bool:
        return bool(self.key and self.base_url)

    def _request(self, tool: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        try:
            path = f"/api/tools/{tool}"
            with span("roundtable.tool", model="roundtable", input_text=json.dumps({
                "tool": tool, "payload": payload,
            })) as trace:
                response = httpx.request(
                    "POST",
                    f"{self.base_url}{path}",
                    headers={"Authorization": f"Bearer {self.key}",
                             "Content-Type": "application/json"},
                    json=payload,
                    timeout=self.timeout,
                )
                body = response.json() if response.content else {}
                trace.set(output_message=json.dumps({"status_code": response.status_code,
                                                      "success": response.is_success}))
                if response.is_success:
                    return body if isinstance(body, dict) else {"data": body}
        except Exception:  # noqa: BLE001
            pass
        return None

    def _write_artifact(self, path: str, payload: dict[str, Any], message: str) -> None:
        self._request("write_file", {
            "request_id": f"savy-{uuid.uuid4().hex}",
            "path": path,
            "content": json.dumps(_safe(payload), indent=2, sort_keys=True),
            "message": message[:2000],
            "create_only": True,
        })

    def open_thread(self, kind: str, title: str, metadata: dict[str, Any] | None = None) -> str:
        local_id = super().open_thread(kind, title, metadata)
        self._write_artifact(
            f"savy/debates/{local_id}/00-thread.json",
            {"id": local_id, "kind": kind, "title": title, "metadata": metadata or {},
             "created_at": _now()},
            f"Create SAVY {kind} debate {local_id}",
        )
        return local_id

    def post_message(self, thread_id: str, actor: str, content: Any,
                     metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        message = super().post_message(thread_id, actor, content, metadata)
        self._write_artifact(
            f"savy/debates/{thread_id}/messages/{message['id']}.json",
            message,
            f"Record {actor} message in SAVY debate {thread_id}",
        )
        return message

    def version(self, thread_id: str, stage: str, payload: dict[str, Any]) -> dict[str, Any]:
        version = super().version(thread_id, stage, payload)
        self._write_artifact(
            f"savy/debates/{thread_id}/versions/{version['id']}.json",
            version,
            f"Record {stage} version in SAVY debate {thread_id}",
        )
        return version


_venue: LocalJsonVenue | None = None


def get_venue() -> LocalJsonVenue:
    global _venue
    if _venue is None:
        candidate = RoundtableVenue()
        _venue = candidate if candidate.enabled else LocalJsonVenue()
    return _venue
