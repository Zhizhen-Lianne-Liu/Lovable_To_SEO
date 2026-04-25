"""
Normalize raw discovery output:
  1. Canonical brand name per domain (via Tavily extract on each homepage)
  2. Dedupe aliases (Mi ↔ Xiaomi, dynamics.microsoft.com ↔ microsoft.com)
  3. Backfill why_relevant for candidates that don't have it
  4. Final ranking — consensus ≥2 ∪ Approach A picks, capped at N

Pure data layer — depends on discover.tavily_* helpers.
"""
import json
import re
from typing import Iterable

from discover import (
    root_domain,
    tavily_research,
)


# Known parent/child mergers — when both surface as candidates, fold child into parent
PARENT_OF = {
    "mi.com": "xiaomi.com",
    "redmi.com": "xiaomi.com",
    "poco.com": "xiaomi.com",
    "honor.com": "huawei.com",  # technically separate now but often confused
    # Don't merge things like Realme/OPPO — they share a parent but are separate market brands
}

NAME_SUFFIX_NOISE = re.compile(
    r"\b(?:CRM|App|Inc\.?|LLC|Ltd\.?|GmbH|Co\.?|Corp\.?|Software|Platform|Cloud|Online|"
    r"Official|Website|Home|Page)\b",
    re.I,
)


def canon_name(raw: str) -> str:
    """'HubSpot CRM' → 'HubSpot'. 'OnePlus Inc.' → 'OnePlus'."""
    if not raw:
        return ""
    name = NAME_SUFFIX_NOISE.sub("", raw).strip()
    name = re.sub(r"\s+", " ", name)
    name = name.strip(" -|,:;")
    return name


def merge_candidates(candidates: list[dict]) -> list[dict]:
    """Pre-merge by parent_of map and exact-domain duplicates. Sums votes."""
    by_domain: dict[str, dict] = {}
    for c in candidates:
        d = root_domain(c.get("domain", ""))
        d = PARENT_OF.get(d, d)
        if not d:
            continue
        if d not in by_domain:
            by_domain[d] = {
                "domain": d,
                "name": c.get("name", ""),
                "votes": 0,
                "approaches": set(),
                "why_relevant": c.get("why_relevant") or c.get("why") or "",
                "description": c.get("description", ""),
            }
        slot = by_domain[d]
        slot["votes"] += int(c.get("votes", 1))
        for a in c.get("approaches", []):
            slot["approaches"].add(a)
        if c.get("why_relevant") and not slot["why_relevant"]:
            slot["why_relevant"] = c["why_relevant"]
        if c.get("description") and not slot["description"]:
            slot["description"] = c["description"]
    out = []
    for v in by_domain.values():
        v["approaches"] = sorted(v["approaches"])
        out.append(v)
    return out


# ---------------- Canonical brand name ---------------- #

def enrich_canonical_names(candidates: list[dict]) -> list[dict]:
    """Set canonical_name per candidate. Strategy:
    - If we have a clean name from Approach A's structured output, keep it (apply canon_name).
    - Otherwise, batch-fetch canonical names via ONE Tavily research call for the rest.
    """
    if not candidates:
        return candidates

    # Pass 1: candidates that already have a real name from A → just clean it
    needs_lookup = []
    for c in candidates:
        existing = c.get("name", "")
        # B/C generate names from `domain.split(".")[0].title()` — those need lookup
        domain_derived = (existing.lower() == c["domain"].split(".")[0].lower()) or not existing
        if not domain_derived and existing:
            c["canonical_name"] = canon_name(existing)
        else:
            needs_lookup.append(c)

    if not needs_lookup:
        return candidates

    # Pass 2: one Tavily research call for everything that needs a real name
    listing = "\n".join(f"- {c['domain']}" for c in needs_lookup)
    schema = {
        "properties": {
            "names": {
                "type": "array",
                "description": "One entry per input domain",
                "items": {
                    "type": "object",
                    "description": "Canonical name for one domain",
                    "properties": {
                        "domain": {"type": "string", "description": "Matches an input domain exactly"},
                        "canonical_name": {"type": "string", "description": "The canonical brand or company name (no 'CRM'/'Inc.'/'Software' suffixes, no taglines)"},
                    },
                },
            }
        },
        "required": ["names"],
    }
    question = (
        "For each of these domains, return the canonical brand name as it would appear "
        "on a logo or in a sentence like 'X is a CRM'. Strip suffixes like 'CRM', 'Inc.', "
        "'Software', and never return taglines.\n\n" + listing
    )
    try:
        body = tavily_research(question, schema, model="mini")
    except Exception as e:
        print(f"  [enrich] research call failed: {e}")
        for c in needs_lookup:
            c["canonical_name"] = c.get("name", c["domain"])
        return candidates

    if body.get("status") != "completed":
        for c in needs_lookup:
            c["canonical_name"] = c.get("name", c["domain"])
        return candidates

    content = body.get("content", {})
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception:
            content = {}
    name_map = {root_domain(r.get("domain", "")): r.get("canonical_name", "")
                for r in content.get("names", [])}
    for c in needs_lookup:
        name = name_map.get(c["domain"], "")
        c["canonical_name"] = canon_name(name) if name else c.get("name", c["domain"])
    return candidates


# ---------------- Dedupe by canonical name ---------------- #

def dedupe_by_name(candidates: list[dict]) -> list[dict]:
    """If two candidates have the same canonical_name (case-insensitive), keep the
    higher-voted one and merge votes/approaches. Domain stays the better-known one."""
    by_canon: dict[str, dict] = {}
    for c in sorted(candidates, key=lambda x: -x.get("votes", 0)):
        key = c.get("canonical_name", c.get("name", "")).lower().strip()
        if not key:
            key = c["domain"]
        if key not in by_canon:
            by_canon[key] = c
        else:
            # Merge into the existing higher-voted slot
            existing = by_canon[key]
            existing["votes"] += c["votes"]
            existing["approaches"] = sorted(set(existing["approaches"]) | set(c.get("approaches", [])))
            if not existing.get("why_relevant") and c.get("why_relevant"):
                existing["why_relevant"] = c["why_relevant"]
    return list(by_canon.values())


# ---------------- Why-relevant backfill ---------------- #

def backfill_why(candidates: list[dict], self_profile: dict) -> list[dict]:
    """For candidates missing a why_relevant, do ONE Tavily research call covering all of them."""
    missing = [c for c in candidates if not c.get("why_relevant")]
    if not missing:
        return candidates
    brand_name = self_profile.get("name_guess", self_profile["domain"])
    listing = "\n".join(f"- {c.get('canonical_name', c['domain'])} ({c['domain']})" for c in missing)
    schema = {
        "properties": {
            "reasons": {
                "type": "array",
                "description": "One entry per input brand",
                "items": {
                    "type": "object",
                    "description": "Reason for one brand",
                    "properties": {
                        "domain": {"type": "string", "description": "Matches the input domain"},
                        "why": {"type": "string", "description": "One-line reason this brand competes with the input company"},
                    },
                },
            }
        },
        "required": ["reasons"],
    }
    question = (
        f"For each of these brands, write a one-line reason why they are a direct "
        f"competitor of {brand_name} ({self_profile['domain']}). Same buyer, same product "
        f"category, comparable scale tier:\n\n{listing}"
    )
    try:
        body = tavily_research(question, schema, model="mini")
    except Exception as e:
        print(f"  [backfill] research call failed: {e}")
        return candidates
    if body.get("status") != "completed":
        return candidates
    content = body.get("content", {})
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception:
            content = {}
    by_domain = {root_domain(r.get("domain", "")): r.get("why", "") for r in content.get("reasons", [])}
    for c in candidates:
        if not c.get("why_relevant") and by_domain.get(c["domain"]):
            c["why_relevant"] = by_domain[c["domain"]]
    return candidates


# ---------------- Final ranking ---------------- #

def rank_final(candidates: list[dict], approach_a_picks: list[dict], n: int = 10) -> list[dict]:
    """Final ranking strategy:
      - All consensus (votes ≥ 2) at the top, ordered by votes
      - Then top-of-A picks not already included (A is most curated, has reasoning)
      - Cap at n
    """
    a_domains = {root_domain(c.get("domain", "")) for c in approach_a_picks}
    consensus = sorted(
        [c for c in candidates if c["votes"] >= 2],
        key=lambda c: (-c["votes"], -len(c.get("approaches", []))),
    )
    consensus_domains = {c["domain"] for c in consensus}

    # Fill from A picks not already in consensus
    fillers = [c for c in candidates if c["domain"] in a_domains and c["domain"] not in consensus_domains]
    fillers.sort(key=lambda c: (-c["votes"], -len(c.get("approaches", []))))

    # Then any remaining single-vote candidates if we still need more
    rest = [c for c in candidates
            if c["domain"] not in consensus_domains and c["domain"] not in {f["domain"] for f in fillers}]
    rest.sort(key=lambda c: -c.get("votes", 0))

    final = (consensus + fillers + rest)[:n]
    return final


# ---------------- Public entry point ---------------- #

def normalize(consensus_raw: list[dict], approach_a_picks: list[dict], self_profile: dict, n: int = 10) -> list[dict]:
    """Full normalization pipeline.
    consensus_raw: items shaped {domain, name, votes, approaches[]}
    approach_a_picks: A's structured competitors with why_relevant + description
    """
    # Pull A's reasoning into the consensus pool so it survives the merge
    a_lookup = {root_domain(c.get("domain", "")): c for c in approach_a_picks}
    enriched = []
    for c in consensus_raw:
        d = root_domain(c["domain"])
        a = a_lookup.get(d, {})
        enriched.append({
            **c,
            "domain": d,
            "approaches": c.get("channels", c.get("approaches", [])),
            "why_relevant": a.get("why_relevant") or a.get("why") or c.get("why_relevant", ""),
            "description":  a.get("description", c.get("description", "")),
        })

    print("  [normalize] step 1: parent/child merge…")
    step1 = merge_candidates(enriched)
    print(f"           {len(consensus_raw)} → {len(step1)} after pre-merge")

    print("  [normalize] step 2: canonical names from homepages (Tavily extract)…")
    step2 = enrich_canonical_names(step1)

    print("  [normalize] step 3: dedupe by canonical name…")
    step3 = dedupe_by_name(step2)
    print(f"           {len(step1)} → {len(step3)} after name dedupe")

    print("  [normalize] step 4: backfill why_relevant for missing entries…")
    step4 = backfill_why(step3, self_profile)

    print("  [normalize] step 5: final rank…")
    final = rank_final(step4, approach_a_picks, n=n)
    return final
