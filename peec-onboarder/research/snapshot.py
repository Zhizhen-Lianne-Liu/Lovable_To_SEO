"""
Build a complete Peec snapshot for handing off to a website-optimization stage.

One function, `complete_snapshot(project_id)`, that pulls every meaningful Peec
read endpoint and composes a single GEO-actionable JSON blob.

Output schema → see README. Designed to be re-run idempotently.
"""
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

PEEC = "https://api.peec.ai/customer/v1"


def _h() -> dict:
    return {"x-api-key": os.environ["PEEC_API_KEY"], "content-type": "application/json"}


def _get(path: str, params: dict | None = None) -> dict:
    r = requests.get(f"{PEEC}{path}", headers=_h(), params=params or {}, timeout=60)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict, params: dict | None = None) -> dict:
    r = requests.post(f"{PEEC}{path}", headers=_h(),
                      params=params or {}, json=body, timeout=60)
    r.raise_for_status()
    return r.json()


# ---------------- Atomic fetchers ---------------- #

def fetch_brands(pid):  return _get("/brands",  {"project_id": pid, "limit": 1000})["data"]
def fetch_prompts(pid): return _get("/prompts", {"project_id": pid, "limit": 1000})["data"]
def fetch_models(pid):  return _get("/models",  {"project_id": pid})["data"]


def fetch_chats(pid, start, end):
    return _get("/chats", {"project_id": pid, "start_date": start, "end_date": end,
                           "limit": 10000})["data"]


def fetch_chat(pid, cid):
    return _get(f"/chats/{cid}/content", {"project_id": pid})


def fetch_brand_report(pid, start, end, dimensions=None, filters=None):
    body = {"start_date": start, "end_date": end, "limit": 10000}
    if dimensions:
        body["dimensions"] = dimensions
    if filters:
        body["filters"] = filters
    return _post("/reports/brands", body, {"project_id": pid})["data"]


def fetch_domain_report(pid, start, end, gap_only=False, limit=200):
    body = {"start_date": start, "end_date": end, "limit": limit,
            "order_by": [{"field": "citation_count", "direction": "desc"}]}
    if gap_only:
        body["filters"] = [{"field": "gap", "operator": "gte", "value": 1}]
    return _post("/reports/domains", body, {"project_id": pid})["data"]


def fetch_url_report(pid, start, end, gap_only=False, limit=200):
    body = {"start_date": start, "end_date": end, "limit": limit,
            "order_by": [{"field": "retrieval_count", "direction": "desc"}]}
    if gap_only:
        body["filters"] = [{"field": "gap", "operator": "gte", "value": 1}]
    return _post("/reports/urls", body, {"project_id": pid})["data"]


def fetch_actions(pid, scope, **extras):
    """Actions are MCP-only — not exposed via public REST API as of writing.
    Returns [] on 404 so the rest of the snapshot still completes.
    To get real actions data, run alongside an MCP client (Claude/Cursor)."""
    body = {"scope": scope, **extras}
    try:
        return _post("/actions", body, {"project_id": pid})["data"]
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return []
        raise


def fetch_url_content(pid, url):
    """Tavily-style scraped markdown of any URL Peec saw."""
    return _post("/sources/urls/content", {"url": url}, {"project_id": pid})


# ---------------- Composer ---------------- #

def _safe_pct(num, den):
    return round(num / den, 4) if den else 0.0


def _coverage(chats, prompts, models):
    seen = set()
    for c in chats:
        pid = (c.get("prompt") or {}).get("id")
        mid = (c.get("model")  or {}).get("id")
        if pid and mid:
            seen.add((pid, mid))
    expected = len(prompts) * len(models)
    return {"expected": expected, "actual": len(seen),
            "pct": _safe_pct(len(seen), expected)}


def _flatten_brand_row(r):
    return {
        "brand_id": r["brand"]["id"], "brand_name": r["brand"]["name"],
        "visibility": r.get("visibility"), "share_of_voice": r.get("share_of_voice"),
        "mention_count": r.get("mention_count"), "sentiment": r.get("sentiment"),
        "position": r.get("position"),
    }


def _engine_breakdown(per_model_brand_rows, own_id, brand_lookup):
    by_model = defaultdict(list)
    for r in per_model_brand_rows:
        mid = (r.get("model") or {}).get("id") or r.get("model_id")
        if not mid:
            continue
        by_model[mid].append(_flatten_brand_row(r))

    out = []
    for mid, rows in by_model.items():
        own_row = next((r for r in rows if r["brand_id"] == own_id), None)
        comp_rows = sorted(
            [r for r in rows if r["brand_id"] != own_id and (r.get("visibility") or 0) > 0],
            key=lambda r: -(r.get("visibility") or 0),
        )
        own_v = (own_row or {}).get("visibility") or 0
        top_v = (comp_rows[0]["visibility"] if comp_rows else 0) or 0
        out.append({
            "model": mid,
            "own_visibility": own_v,
            "top_competitor": comp_rows[0]["brand_name"] if comp_rows else None,
            "top_competitor_visibility": top_v,
            "gap_pct": max(0.0, top_v - own_v),
        })
    return sorted(out, key=lambda r: -r["gap_pct"])


def _prompt_breakdown(per_prompt_brand_rows, own_id, prompt_text):
    by_prompt = defaultdict(list)
    for r in per_prompt_brand_rows:
        pid = (r.get("prompt") or {}).get("id") or r.get("prompt_id")
        if not pid:
            continue
        by_prompt[pid].append(_flatten_brand_row(r))

    out = []
    for pid, rows in by_prompt.items():
        own_row = next((r for r in rows if r["brand_id"] == own_id), None)
        comp_rows = sorted(
            [r for r in rows if r["brand_id"] != own_id and (r.get("visibility") or 0) > 0],
            key=lambda r: -(r.get("visibility") or 0),
        )
        own_v = (own_row or {}).get("visibility") or 0
        top_v = (comp_rows[0]["visibility"] if comp_rows else 0) or 0
        out.append({
            "prompt_id": pid,
            "prompt_text": prompt_text.get(pid, ""),
            "own_visibility": own_v,
            "own_position": (own_row or {}).get("position"),
            "own_sentiment": (own_row or {}).get("sentiment"),
            "top_competitor": comp_rows[0]["brand_name"] if comp_rows else None,
            "top_competitor_visibility": top_v,
            "weakness_flag": own_v < 0.3,
            "winning_flag": own_v >= 0.7 and own_v >= top_v,
        })
    return sorted(out, key=lambda r: r["own_visibility"])


def _classify_outreach_tier(score):
    if score >= 0.2: return "HIGH"
    if score >= 0.08: return "MEDIUM"
    return "LOW"


def _flatten_domain_row(r, brand_lookup):
    bids = r.get("mentioned_brand_ids") or []
    return {
        "domain": r["domain"],
        "classification": r.get("classification"),
        "retrieved_percentage": r.get("retrieved_percentage"),
        "retrieval_rate": r.get("retrieval_rate"),
        "citation_rate": r.get("citation_rate"),
        "retrieval_count": r.get("retrieval_count"),
        "citation_count": r.get("citation_count"),
        "competitors_cited": [brand_lookup.get(b, {}).get("name", b) for b in bids],
    }


def _flatten_url_row(r, brand_lookup):
    bids = r.get("mentioned_brand_ids") or []
    return {
        "url": r["url"],
        "classification": r.get("classification"),
        "title": r.get("title"),
        "channel_title": r.get("channel_title"),
        "retrieval_count": r.get("retrieval_count"),
        "citation_count": r.get("citation_count"),
        "citation_rate": r.get("citation_rate"),
        "competitors_cited": [brand_lookup.get(b, {}).get("name", b) for b in bids],
    }


def _aggregate_actions(pid, overview_rows):
    """For each non-zero opportunity slice, drill in and pull recommendation texts."""
    actions = []
    for row in overview_rows:
        score = row.get("opportunity_score", 0) or 0
        if score <= 0:
            continue
        scope = (row.get("action_group_type") or "").lower()
        url_class = row.get("url_classification")
        domain = row.get("domain")
        try:
            extras = {}
            if scope in ("owned", "editorial") and url_class:
                extras["url_classification"] = url_class
            if scope in ("reference", "ugc") and domain:
                extras["domain"] = domain
            drill = fetch_actions(pid, scope, **extras)
        except requests.HTTPError as e:
            actions.append({"scope": scope, "error": str(e)})
            continue
        for d in drill:
            actions.append({
                "scope": scope,
                "url_classification": url_class,
                "domain": domain,
                "opportunity_score": score,
                "gap_percentage": row.get("gap_percentage"),
                "coverage_percentage": row.get("coverage_percentage"),
                "outreach_tier": _classify_outreach_tier(score),
                "recommendation": d.get("text", ""),
            })
    return sorted(actions, key=lambda a: -(a.get("opportunity_score") or 0))


def _fanout_queries(chat_contents):
    counter = Counter()
    sources = defaultdict(set)
    for c in chat_contents:
        for q in (c.get("queries") or []):
            counter[q] += 1
            sources[q].add(((c.get("prompt") or {}).get("id"), (c.get("model") or {}).get("id")))
    return [
        {"query": q, "count": cnt,
         "source_combos": [{"prompt_id": p, "model": m} for p, m in sources[q]]}
        for q, cnt in counter.most_common(50)
    ]


def _diagnostics(chat_contents, own_id, prompt_text):
    """3-5 wins (own brand mentioned, high sentiment), 3-5 misses (only competitors)."""
    wins, misses = [], []
    for c in chat_contents:
        bm = c.get("brands_mentioned") or []
        own = next((b for b in bm if b.get("id") == own_id), None)
        excerpt = ""
        msgs = c.get("messages") or []
        if len(msgs) >= 2:
            excerpt = (msgs[-1].get("content") or "")[:600]
        record = {
            "chat_id": c.get("id"),
            "prompt_id": (c.get("prompt") or {}).get("id"),
            "prompt_text": prompt_text.get((c.get("prompt") or {}).get("id"), ""),
            "model": (c.get("model") or {}).get("id"),
            "brands_mentioned": [{"name": b["name"], "position": b.get("position")} for b in bm],
            "source_urls": [s["url"] for s in (c.get("sources") or [])][:5],
            "excerpt": excerpt,
        }
        if own:
            record["own_position"] = own.get("position")
            wins.append(record)
        elif bm:  # competitors mentioned but not us
            misses.append(record)
    # Pick spread: top 5 wins (lowest position = best) + top 5 misses (most competitors mentioned)
    wins = sorted(wins, key=lambda x: x.get("own_position") or 99)[:5]
    misses = sorted(misses, key=lambda x: -len(x["brands_mentioned"]))[:5]
    return {"wins": wins, "misses": misses}


# ---------------- Top level ---------------- #

def complete_snapshot(project_id: str, days: int = 7,
                      pull_chat_contents: bool = True,
                      pull_url_contents: bool = False) -> dict:
    end = date.today()
    start = end - timedelta(days=days)
    s, e = start.isoformat(), end.isoformat()

    print(f"[snapshot] project={project_id}  window={s}→{e}")

    # 1. Configuration
    brands = fetch_brands(project_id)
    prompts = fetch_prompts(project_id)
    models  = fetch_models(project_id)
    active_models = [m for m in models if m.get("is_active")]
    own = next((b for b in brands if b.get("is_own")), None)
    own_id = own["id"] if own else None
    competitors = [b for b in brands if not b.get("is_own")]
    brand_lookup = {b["id"]: b for b in brands}
    prompt_text = {p["id"]: ((p.get("messages") or [{}])[0].get("content") or "")
                   for p in prompts}

    print(f"  brands: 1 own + {len(competitors)} competitors  |  "
          f"prompts: {len(prompts)}  |  active models: {len(active_models)}")

    # 2. Chats — coverage + diagnostics
    chats = fetch_chats(project_id, s, e)
    coverage = _coverage(chats, prompts, active_models)
    print(f"  chats: {len(chats)}  coverage: {coverage['actual']}/{coverage['expected']} "
          f"({coverage['pct']*100:.0f}%)")

    chat_contents = []
    if pull_chat_contents and chats:
        # Pull a sample — capping at 30 to keep latency reasonable
        sample = chats[:30]
        print(f"  fetching content for {len(sample)} chats…")
        for c in sample:
            try:
                chat_contents.append(fetch_chat(project_id, c["id"]))
            except requests.HTTPError:
                continue

    # 3. Brand reports
    print("  brand reports…")
    overall = fetch_brand_report(project_id, s, e)
    per_model = fetch_brand_report(project_id, s, e, dimensions=["model_id"])
    per_prompt = fetch_brand_report(project_id, s, e, dimensions=["prompt_id"])

    # 4. Domain + URL reports (overall + gap)
    print("  domain & url reports…")
    domains_all = fetch_domain_report(project_id, s, e, limit=200)
    domains_gap = fetch_domain_report(project_id, s, e, gap_only=True, limit=200)
    urls_all    = fetch_url_report(project_id, s, e, limit=200)
    urls_gap    = fetch_url_report(project_id, s, e, gap_only=True, limit=200)

    # 5. Actions — overview, then drill all non-zero slices
    print("  actions…")
    actions_overview = fetch_actions(project_id, "overview")
    actions = _aggregate_actions(project_id, actions_overview)

    # 6. Compose output
    own_metrics = next((_flatten_brand_row(r) for r in overall
                        if r["brand"]["id"] == own_id), None)
    competitor_metrics = sorted(
        [_flatten_brand_row(r) for r in overall if r["brand"]["id"] != own_id],
        key=lambda r: -(r.get("visibility") or 0),
    )
    rank = 1 + sum(1 for c in competitor_metrics
                   if (c.get("visibility") or 0) > (own_metrics or {}).get("visibility", 0))

    own_domains = (own or {}).get("domains") or []
    cited_owned = [_flatten_url_row(r, brand_lookup) for r in urls_all
                   if any(d in r["url"] for d in own_domains)]

    classification_mix = Counter()
    total_retrievals = 0
    for r in domains_all:
        cls = r.get("classification") or "OTHER"
        classification_mix[cls] += r.get("retrieval_count") or 0
        total_retrievals += r.get("retrieval_count") or 0

    snapshot = {
        "meta": {
            "project_id": project_id,
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
            "date_range": {"start": s, "end": e, "days": days},
            "own_brand": {"id": own_id, "name": (own or {}).get("name"),
                          "domains": own_domains},
            "competitors": [{"id": b["id"], "name": b["name"],
                             "domains": b.get("domains") or []} for b in competitors],
            "active_models": [m["id"] for m in active_models],
            "coverage": coverage,
        },
        "scorecard": {
            "own": own_metrics,
            "competitors": competitor_metrics,
            "our_rank": rank,
            "total_brands_ranked": 1 + len([c for c in competitor_metrics
                                            if (c.get("visibility") or 0) > 0]),
        },
        "engine_breakdown": _engine_breakdown(per_model, own_id, brand_lookup),
        "prompt_breakdown": _prompt_breakdown(per_prompt, own_id, prompt_text),
        "actions": actions,
        "gap_targets": {
            "domains": [_flatten_domain_row(r, brand_lookup) for r in domains_gap],
            "urls":    [_flatten_url_row(r, brand_lookup)    for r in urls_gap],
        },
        "owned_audit": {
            "cited_urls": cited_owned,
            "site_classification_mix": {
                k: round(v / total_retrievals, 4) if total_retrievals else 0
                for k, v in classification_mix.items()
            },
        },
        "fanout_queries": _fanout_queries(chat_contents),
        "diagnostics": _diagnostics(chat_contents, own_id, prompt_text),
        "_raw": {
            "chat_count_total": len(chats),
            "chat_contents_sampled": len(chat_contents),
            "domain_report_top": [_flatten_domain_row(r, brand_lookup)
                                  for r in domains_all[:30]],
            "url_report_top":    [_flatten_url_row(r, brand_lookup)
                                  for r in urls_all[:30]],
        },
    }
    return snapshot


def print_summary(snap: dict) -> None:
    m = snap["meta"]
    print(f"\n=== Snapshot {m['project_id']} ({m['snapshot_at']}) ===")
    print(f"Own: {m['own_brand']['name']} ({', '.join(m['own_brand']['domains'])})")
    print(f"Competitors: {len(m['competitors'])}  Active models: {len(m['active_models'])}")
    cov = m["coverage"]
    print(f"Coverage: {cov['actual']}/{cov['expected']} ({cov['pct']*100:.0f}%)")

    sc = snap["scorecard"]
    own = sc["own"]
    if own:
        v = (own.get("visibility") or 0) * 100
        sov = (own.get("share_of_voice") or 0) * 100
        sent = own.get("sentiment")
        print(f"\nOWN: vis={v:.0f}% sov={sov:.0f}% sent={sent}  rank={sc['our_rank']}/{sc['total_brands_ranked']}")
    print(f"Top 5 competitors:")
    for c in sc["competitors"][:5]:
        v = (c.get("visibility") or 0) * 100
        print(f"  • {c['brand_name']:18} v={v:5.0f}%  sent={c.get('sentiment')}")

    print(f"\nActions: {len(snap['actions'])} total")
    for a in snap["actions"][:5]:
        print(f"  [{a['outreach_tier']:6}] {a['scope']:10} {a.get('domain') or a.get('url_classification') or '':20} "
              f"score={a['opportunity_score']:.3f}  → {a['recommendation'][:80]}")

    print(f"\nGap domains: {len(snap['gap_targets']['domains'])}")
    for d in snap["gap_targets"]["domains"][:5]:
        comps = ", ".join(d["competitors_cited"][:3])
        print(f"  • {d['domain']:32} {d.get('classification') or '—':10} "
              f"retrievals={d.get('retrieval_count'):>3}  cites={comps}")

    print(f"\nFanout queries: {len(snap['fanout_queries'])}  (top 5)")
    for q in snap["fanout_queries"][:5]:
        print(f"  • {q['query'][:60]:62} count={q['count']}")

    print(f"\nDiagnostics: {len(snap['diagnostics']['wins'])} wins, "
          f"{len(snap['diagnostics']['misses'])} misses")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 snapshot.py <project_id> [days]")
    if not os.environ.get("PEEC_API_KEY"):
        from discover import load_env
        load_env()
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    snap = complete_snapshot(sys.argv[1], days=days)
    print_summary(snap)

    out = Path(__file__).resolve().parent.parent / "data" / sys.argv[1] / f"snapshot_{int(time.time())}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=2, default=str))
    print(f"\nSaved → {out}")
