"""In-process run state store. Swappable for Redis later."""
from __future__ import annotations

from .models.runs import RunResult

_store: dict[str, RunResult] = {}


def put(run: RunResult) -> None:
    _store[run.run_id] = run


def get(run_id: str) -> RunResult | None:
    return _store.get(run_id)


def all_runs() -> list[RunResult]:
    return list(_store.values())
