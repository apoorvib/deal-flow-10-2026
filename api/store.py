# Disk-backed persistence so cases survive `uvicorn --reload`. In-memory dicts wipe
# the frontend dev's test data on every restart. Flat JSON per collection — no DB.
#
# Generic by design: store.put(collection, key, model) / get / all_of work with any
# collection name, including one no route writes yet (e.g. "doc_reviews", added by a
# later task for the AI adjudicator's recommendation, keyed by document id).

import json
import pathlib
from typing import Type, TypeVar

from pydantic import BaseModel

DIR = pathlib.Path("fixtures/live")
DIR.mkdir(parents=True, exist_ok=True)
T = TypeVar("T", bound=BaseModel)


def _file(collection: str) -> pathlib.Path:
    return DIR / f"{collection}.json"


def _read(collection: str) -> dict:
    p = _file(collection)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return {}


# NOTE: put()/delete() are read-modify-write with no file lock. Two concurrent
# writers to the same collection can race and one update can be lost. Fine for a
# single-process dev/demo server; a later task adding background jobs or multiple
# workers should add locking (e.g. a per-collection file lock) before relying on
# this for anything concurrent.


def put(collection: str, key: str, model: BaseModel) -> None:
    data = _read(collection)
    data[key] = model.model_dump(by_alias=True, mode="json")
    _file(collection).write_text(json.dumps(data, indent=2))


def get(collection: str, key: str, cls: Type[T]) -> T | None:
    raw = _read(collection).get(key)
    return cls.model_validate(raw) if raw else None


def all_of(collection: str, cls: Type[T]) -> list[T]:
    out = []
    for raw in _read(collection).values():
        try:
            out.append(cls.model_validate(raw))
        except Exception:
            continue
    return out


def delete(collection: str, key: str) -> bool:
    data = _read(collection)
    if key not in data:
        return False
    del data[key]
    _file(collection).write_text(json.dumps(data, indent=2))
    return True


# Raw-dict access for server-only records that aren't wire models (sessions,
# sign-in links, ownership, debate transcripts).


def get_raw(collection: str, key: str) -> dict | None:
    return _read(collection).get(key)


def put_raw(collection: str, key: str, value: dict) -> None:
    data = _read(collection)
    data[key] = value
    _file(collection).write_text(json.dumps(data, indent=2))


def all_raw(collection: str) -> dict:
    return _read(collection)


def wipe(collection: str) -> None:
    p = _file(collection)
    if p.exists():
        p.unlink()
