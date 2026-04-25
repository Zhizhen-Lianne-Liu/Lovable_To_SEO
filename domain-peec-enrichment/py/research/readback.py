"""
Pull structured visibility data out of a Peec project.

For a given project_id + date range, returns:
  - brand_report:   visibility / SoV / sentiment / position per brand (overall + per-model breakdown)
  - domain_report:  citation rates per source domain (with classification + gap analysis)
  - chat_summary:   chat counts per prompt × model + sample chat IDs
  - readiness:      flag indicating whether the project has enough data yet

Designed to be called repeatedly — same input always returns latest snapshot.
"""
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

PEEC_API = "https://api.peec.ai/customer/v1"


def _headers() -> dict:
    key = os.environ.get("PEEC_API_KEY")
    if not key:
        sys.exit("Missing PEEC_API_KEY in .env")
    return {"x-api-key": key, "content-type": "application/json"}


def _get(path: str, params: dict | None = None) -> dict:
    r = requests.get(f"{PEEC_API}{path}", headers=_headers(), params=params or {}, timeout=60)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict, params: dict | None = None) -> dict:
    r = requests.post(f"{PEEC_API}{path}", headers=_headers(),
                      params=params or {}, json=body, timeout=60)
    r.raise_for_status()
    return r.json()


# ---------------- Snapshot building blocks ---------------- #

def list_brands(project_id: str) -> list[dict]:
    return _get("/brands", {"project_id": project_id, "limit": 1000}).get("data", [])


def list_prompts(project_id: str) -> list[dict]:
    return _get("/prompts", {"project_id": project_id, "limit": 1000}).get("data", [])


def list_models(project_id: str) -> list[dict]:
    return _get("/models", {"project_id": project_id}).get("data", [])


def list_chats(project_id: str, start: str, end: str) -> list[dict]:
    return _get("/chats", {"project_id": project_id, "start_date": start,
                           "end_date": end, "limit": 10000}).get("data", [])


def brand_report(project_id: str, start: str, end: str, dimensions: list[str] | None = None) -> dict:
    body = {"start_date": start, "end_date": end, "limit": 10000}
    if dimensions:
        body["dimensions"] = dimensions
    return _post("/reports/brands", body, params={"project_id": project_id})


def domain_report(project_id: str, start: str, end: str, gap_only: bool = False) -> dict:
    body = {"start_date": start, "end_date": end, "limit": 1000,
            "order_by": [{"field": "citation_count", "direction": "desc"}]}
    if gap_only:
        body["filters"] = [{"field": "gap", "operator": "gte", "value": 1}]
    return _post("/reports/domains", body, params={"project_id": project_id})


# ---------------- Snapshot orchestrator ---------------- #

def snapshot(project_id: str, days: int = 7) -> dict:
    end = date.today()
    start = end - timedelta(days=days)
    start_s, end_s = start.isoformat(), end.isoformat()

    brands = list_brands(project_id)
    prompts = list_prompts(project_id)
    models = [m for m in list_models(project_id) if m.get("is_active")]
    chats = list_chats(project_id, start_s, end_s)

    brand_lookup = {b["id"]: b for b in brands}
    prompt_lookup = {p["id"]: p for p in prompts}

    # Coverage matrix: how many chats per (prompt × model).
    # REST returns nested {prompt: {id}}, MCP returns flat prompt_id — handle both.
    coverage: dict[tuple[str, str], int] = {}
    for c in chats:
        pid = c.get("prompt_id") or (c.get("prompt") or {}).get("id")
        mid = c.get("model_id") or (c.get("model") or {}).get("id")
        if not pid or not mid:
            continue
        key = (pid, mid)
        coverage[key] = coverage.get(key, 0) + 1

    expected_combos = len(prompts) * len(models)
    actual_combos = len(coverage)
    coverage_pct = (actual_combos / expected_combos) if expected_combos else 0.0

    # Brand report — overall + per-model breakdown
    overall_brand = brand_report(project_id, start_s, end_s)
    per_model_brand = brand_report(project_id, start_s, end_s, dimensions=["model_id"])

    # Domain report — overall + gap (where competitors cited but we aren't)
    overall_domain = domain_report(project_id, start_s, end_s)
    gap_domain = domain_report(project_id, start_s, end_s, gap_only=True)

    # Build presentable summaries
    own = next((b for b in brands if b.get("is_own")), None)
    own_id = own["id"] if own else None

    def row_to_dict(columns: list[str], row: list) -> dict:
        return dict(zip(columns, row))

    brand_rows = [row_to_dict(overall_brand["columns"], r) for r in overall_brand["rows"]]
    own_row = next((b for b in brand_rows if b["brand_id"] == own_id), None) if own_id else None

    competitor_rows = sorted(
        [b for b in brand_rows if b["brand_id"] != own_id and b.get("visibility") is not None],
        key=lambda b: -(b.get("visibility") or 0),
    )

    return {
        "project_id": project_id,
        "date_range": {"start": start_s, "end": end_s, "days": days},
        "brands": {
            "own": own,
            "competitor_count": len(brands) - (1 if own else 0),
        },
        "prompts": {
            "count": len(prompts),
            "samples": [p.get("text", "") for p in prompts[:5]],
        },
        "active_models": [m["id"] for m in models],
        "readiness": {
            "expected_chats": expected_combos,
            "actual_combos_with_chats": actual_combos,
            "coverage_pct": round(coverage_pct, 3),
            "total_chats": len(chats),
            "ready_for_demo": coverage_pct >= 0.8 and len(chats) >= 5,
        },
        "coverage_matrix": [
            {"prompt": prompt_lookup.get(pid, {}).get("text", pid)[:60],
             "model": mid, "chat_count": cnt}
            for (pid, mid), cnt in sorted(coverage.items(), key=lambda x: -x[1])
        ],
        "own_brand_visibility": own_row,
        "competitor_visibility": competitor_rows[:10],
        "per_model_visibility": [
            row_to_dict(per_model_brand["columns"], r) for r in per_model_brand["rows"]
        ],
        "top_source_domains": [
            row_to_dict(overall_domain["columns"], r) for r in overall_domain["rows"][:15]
        ],
        "gap_opportunities": [
            row_to_dict(gap_domain["columns"], r) for r in gap_domain["rows"][:15]
        ],
    }


def print_summary(snap: dict) -> None:
    r = snap["readiness"]
    own = snap.get("own_brand_visibility")
    print(f"\n=== Peec snapshot — {snap['project_id']} ===")
    print(f"Date range: {snap['date_range']['start']} → {snap['date_range']['end']}")
    print(f"Brands: 1 own + {snap['brands']['competitor_count']} competitors")
    print(f"Prompts: {snap['prompts']['count']}  |  Active models: {len(snap['active_models'])}")
    print(f"\nReadiness: {r['coverage_pct']*100:.0f}% coverage  "
          f"({r['actual_combos_with_chats']}/{r['expected_chats']} prompt×model combos), "
          f"{r['total_chats']} chats total. Ready for demo: {r['ready_for_demo']}")

    if own:
        v = (own.get("visibility") or 0) * 100
        sov = (own.get("share_of_voice") or 0) * 100
        sent = own.get("sentiment")
        sent_s = f"{sent:.0f}" if sent is not None else "—"
        print(f"\nOwn brand ({own['brand_name']}):  visibility={v:.0f}%  SoV={sov:.0f}%  sentiment={sent_s}")

    print("\nTop competitors by visibility:")
    for c in snap["competitor_visibility"][:5]:
        v = (c.get("visibility") or 0) * 100
        sov = (c.get("share_of_voice") or 0) * 100
        sent = c.get("sentiment")
        sent_s = f"{sent:.0f}" if sent is not None else "—"
        print(f"  • {c['brand_name']:20} v={v:5.1f}%  SoV={sov:5.1f}%  sent={sent_s}")

    if snap["gap_opportunities"]:
        print(f"\nGap opportunities (sources citing competitors but not us): {len(snap['gap_opportunities'])}")
        for g in snap["gap_opportunities"][:5]:
            print(f"  • {g.get('domain'):40} retrievals={g.get('retrieval_count')} citations={g.get('citation_count')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 readback.py <project_id> [days]")
    project_id = sys.argv[1]
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7

    if not os.environ.get("PEEC_API_KEY"):
        from discover import load_env
        load_env()

    snap = snapshot(project_id, days=days)
    print_summary(snap)

    out = Path(__file__).resolve().parent.parent / "data" / project_id / "readback.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=2, default=str))
    print(f"\nSaved → {out}")
