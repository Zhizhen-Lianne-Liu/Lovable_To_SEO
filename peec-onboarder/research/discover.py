"""
Competitor discovery — three approaches compared head-to-head.

Input:  a domain (e.g. nothing.tech)
Output: ranked list of {name, url, why} for each approach,
        plus a merged ranking by cross-approach agreement.

Approaches:
  A) /research with output_schema     — single async call, structured JSON
  B) /search × multi-query + co-occurrence scoring  — transparent, no LLM
  C) /search with include_answer="advanced"   — cheap middle ground

Run:  python3 discover.py <domain>
"""
import json
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
DATA = ROOT / "data"

API = "https://api.tavily.com"


def load_env():
    """Load env vars from the repo-root .env (single source of truth).
    Falls back to peec-onboarder/.env if root doesn't exist (legacy).

    .env wins over the shell environment for keys it defines — so an
    accidentally-empty ANTHROPIC_API_KEY in the shell can't shadow the
    real value in the file. Vars NOT in .env are left untouched.
    """
    for candidate in (REPO_ROOT / ".env", ROOT / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip()
                # Strip surrounding quotes if present, and skip empty values
                # (so a placeholder line in .env.example can't blank a real env var)
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                if v.startswith("'") and v.endswith("'"):
                    v = v[1:-1]
                if v:
                    os.environ[k] = v
        return
    print(f"[load_env] WARN: no .env found at {REPO_ROOT}/.env or {ROOT}/.env")


def domain_to_slug(domain: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", domain.lower()).strip("-")


_MULTIPART_TLDS = {"co.uk", "com.br", "co.jp", "com.au", "co.nz", "co.in", "ac.uk", "gov.uk"}


def root_domain(url: str) -> str:
    """www.example.com/path → example.com.  dynamics.microsoft.com → microsoft.com.
    Handles multi-part TLDs (foo.co.uk → foo.co.uk).  Fixes the lstrip('www.') bug."""
    try:
        host = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    except Exception:
        host = url.lower()
    if not host:
        host = url.lower()
    # Strip 'www.' prefix correctly (NOT lstrip — that strips any of w/./w/. chars)
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) < 2:
        return host
    last_two = ".".join(parts[-2:])
    last_three = ".".join(parts[-3:]) if len(parts) >= 3 else last_two
    if last_two in _MULTIPART_TLDS:
        return last_three
    return last_two


# ---------------- Tavily wrappers ---------------- #

def tavily_search(query: str, **kwargs) -> dict:
    payload = {
        "query": query,
        "search_depth": kwargs.pop("search_depth", "basic"),
        "max_results": kwargs.pop("max_results", 10),
        **kwargs,
    }
    r = requests.post(
        f"{API}/search",
        headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
        json=payload,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def tavily_extract(urls: list[str], query: str | None = None) -> dict:
    payload = {"urls": urls, "format": "markdown"}
    if query:
        payload["query"] = query
        payload["chunks_per_source"] = 3
    r = requests.post(
        f"{API}/extract",
        headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
        json=payload,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def tavily_research(question: str, output_schema: dict, model: str = "auto") -> dict:
    """Async research call. Submits, polls until complete."""
    headers = {"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"}
    submit = requests.post(
        f"{API}/research",
        headers=headers,
        json={"input": question, "model": model, "output_schema": output_schema},
        timeout=60,
    )
    submit.raise_for_status()
    request_id = submit.json()["request_id"]

    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(5)
        poll = requests.get(f"{API}/research/{request_id}", headers=headers, timeout=30)
        poll.raise_for_status()
        body = poll.json()
        status = body.get("status")
        if status in ("completed", "failed"):
            return body
    raise TimeoutError("Tavily /research polling exceeded 5 min")


# ---------------- Stage 0: profile the input brand ---------------- #

def profile_self(domain: str) -> dict:
    """Tavily extract on the input domain → infer brand name + category."""
    extract = tavily_extract([domain], query="What does this company do? What is the brand name and category?")
    raw = ""
    if extract.get("results"):
        raw = extract["results"][0].get("raw_content", "")[:8000]

    # Lightweight extraction — title + first heading + meta
    name_match = re.search(r"^#\s+([^\n]+)", raw, re.MULTILINE)
    title_guess = name_match.group(1).strip() if name_match else domain.split(".")[0].title()

    return {
        "domain": root_domain(domain),
        "name_guess": title_guess,
        "raw_excerpt": raw[:1500],
    }


# ---------------- Approach A: /research with output_schema ---------------- #

def approach_a_research(self_profile: dict, n: int = 10) -> dict:
    schema = {
        "properties": {
            "competitors": {
                "type": "array",
                "description": f"Up to {n} direct competitor brands",
                "items": {
                    "type": "object",
                    "description": "A single competitor",
                    "properties": {
                        "name": {"type": "string", "description": "Brand name"},
                        "domain": {"type": "string", "description": "Root domain only (e.g. example.com, no www. no path)"},
                        "description": {"type": "string", "description": "One-line description of the competitor"},
                        "why_relevant": {"type": "string", "description": "One-line reason this is a direct competitor"},
                    },
                },
            }
        },
        "required": ["competitors"],
    }
    question = (
        f"List the top {n} direct competitors of the company at {self_profile['domain']} "
        f"({self_profile['name_guess']}). Direct competitor = same buyer, same primary problem, "
        f"comparable scale tier. EXCLUDE: parent companies, subsidiaries, customers, vendors, "
        f"brands in adjacent but non-competing categories. Return root domain only "
        f"(e.g. samsung.com, not www.samsung.com or samsung.com/products). "
        f"Brief context about the input company:\n\n{self_profile['raw_excerpt']}"
    )
    body = tavily_research(question, schema, model="mini")
    if body.get("status") != "completed":
        return {"competitors": [], "sources": [], "error": body.get("status")}
    content = body.get("content", {})
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception:
            content = {}
    return {
        "competitors": content.get("competitors", [])[:n],
        "sources": body.get("sources", []),
    }


# ---------------- Approach B: multi-query co-occurrence ---------------- #

CHANNEL_WEIGHTS = {
    "alternatives": 2,
    "vs": 3,
    "g2": 2,
    "category": 1,
    "reddit": 1,
}

REVIEW_DOMAINS = ["g2.com", "capterra.com", "trustradius.com", "softwareadvice.com"]


JUNK_DOMAINS = {
    "wikipedia.org", "youtube.com", "reddit.com", "medium.com", "linkedin.com",
    "facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com",
    "androidauthority.com", "androidcentral.com", "phonearena.com", "trustedreviews.com",
    "soundguys.com", "gizmochina.com", "techradar.com", "theverge.com", "engadget.com",
    "cnet.com", "tomshardware.com", "businessmodelcanvastemplate.com",
    "g2.com", "capterra.com", "trustradius.com", "softwareadvice.com",
    "github.com", "amazon.com", "ebay.com", "walmart.com",
}

DOMAIN_RE = re.compile(r"\b((?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|app|de|fr|uk|tech|org|tv|gg))\b")


def extract_domains_from_text(text: str, exclude: set[str]) -> list[str]:
    """Pull plausible brand domains from free text. Drops junk + excluded."""
    found = []
    seen = set()
    for raw in DOMAIN_RE.findall(text.lower()):
        d = raw.lstrip("www.")
        # Skip if it's a known junk domain (substring match for subdomain variants)
        if d in seen or d in exclude:
            continue
        if any(j in d for j in JUNK_DOMAINS):
            continue
        seen.add(d)
        found.append(d)
    return found


def approach_b_cooccur(self_profile: dict, n: int = 10) -> dict:
    """Run multiple search channels, each with include_answer='advanced'.
    Extract competitor domains from each answer. Score by co-occurrence across channels."""
    brand = self_profile["name_guess"]
    self_domain = self_profile["domain"]
    exclude = {self_domain}

    queries = [
        ("alternatives", f"What are the top alternatives to {brand} ({self_domain})? List with their websites."),
        ("vs",           f"What companies compete head-to-head with {brand} ({self_domain})? Include their domains."),
        ("category",     f"What is the product category of {brand} ({self_domain})? Who are the leading companies in that category?"),
        ("buyers",       f"If a buyer evaluating {brand} ({self_domain}) wanted to compare options, which companies and domains would they shortlist?"),
    ]

    candidates: dict[str, dict] = {}
    raw_answers: dict[str, str] = {}

    for channel, query in queries:
        try:
            res = tavily_search(query, search_depth="advanced", max_results=8,
                                include_answer="advanced")
        except requests.HTTPError as e:
            print(f"  [B] channel {channel} failed: {e}")
            continue
        answer = res.get("answer", "") or ""
        raw_answers[channel] = answer
        domains = extract_domains_from_text(answer, exclude)
        for d in domains:
            if d not in candidates:
                candidates[d] = {
                    "domain": d,
                    "name": d.split(".")[0].title(),
                    "score": 0,
                    "channels": [],
                }
            candidates[d]["score"] += CHANNEL_WEIGHTS.get(channel, 1)
            if channel not in candidates[d]["channels"]:
                candidates[d]["channels"].append(channel)

    ranked = sorted(candidates.values(), key=lambda c: (-c["score"], -len(c["channels"])))
    return {"competitors": ranked[:n], "raw_answers": raw_answers}


# ---------------- Approach C: search + include_answer ---------------- #

def approach_c_answer(self_profile: dict, n: int = 10) -> list[dict]:
    brand = self_profile["name_guess"]
    query = (
        f"Who are the top {n} direct competitors of {brand} ({self_profile['domain']})? "
        f"List each with their domain. Same product category, same buyer."
    )
    res = tavily_search(query, search_depth="advanced", max_results=15, include_answer="advanced")
    answer = res.get("answer", "")
    # Pull domains out of the answer text + result URLs
    domains_in_answer = set(re.findall(r"\b([a-z0-9-]+\.(?:com|io|ai|co|net|app|de|fr|uk|tech|org))\b", answer.lower()))
    domains_in_answer.discard(self_profile["domain"])
    out = []
    seen = set()
    for d in list(domains_in_answer)[:n]:
        if d in seen or d in REVIEW_DOMAINS:
            continue
        seen.add(d)
        out.append({"domain": d, "name": d.split(".")[0].title(), "source": "answer_text"})
    return out, answer


# ---------------- Main ---------------- #

def run(domain: str) -> dict:
    """Run all 3 approaches + normalization. Returns the full results dict."""
    load_env()
    if not os.environ.get("TAVILY_API_KEY"):
        sys.exit("Missing TAVILY_API_KEY in .env")

    slug = domain_to_slug(domain)
    out_dir = DATA / slug / time.strftime("%Y-%m-%d_%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"→ Output: {out_dir}")

    print(f"\n[0] Profiling {domain}…")
    self_profile = profile_self(domain)
    (out_dir / "self.json").write_text(json.dumps(self_profile, indent=2))
    print(f"  Brand guess: {self_profile['name_guess']}")

    results = {"input": domain, "self": self_profile, "approaches": {}}

    print("\n[A] /research with output_schema (this can take 30-90s)…")
    try:
        a = approach_a_research(self_profile)
        results["approaches"]["A_research"] = a
        comps_a = a.get("competitors", [])
        print(f"  → {len(comps_a)} competitors")
        for c in comps_a[:5]:
            print(f"    • {c.get('name')} ({c.get('domain')})")
    except Exception as e:
        print(f"  ERROR: {e}")
        results["approaches"]["A_research"] = {"error": str(e), "competitors": []}

    print("\n[B] Multi-channel answer-extraction…")
    try:
        b = approach_b_cooccur(self_profile)
        results["approaches"]["B_cooccur"] = b
        comps_b = b.get("competitors", [])
        print(f"  → {len(comps_b)} candidates")
        for c in comps_b[:5]:
            print(f"    • {c['name']:20} ({c['domain']:30}) score={c['score']} channels={c['channels']}")
    except Exception as e:
        print(f"  ERROR: {e}")
        results["approaches"]["B_cooccur"] = {"error": str(e), "competitors": []}

    print("\n[C] Search + include_answer (single shot)…")
    try:
        c, answer = approach_c_answer(self_profile)
        results["approaches"]["C_answer"] = {"competitors": c, "raw_answer": answer}
        print(f"  → {len(c)} competitors")
        for x in c[:5]:
            print(f"    • {x['name']} ({x['domain']})")
    except Exception as e:
        print(f"  ERROR: {e}")
        results["approaches"]["C_answer"] = {"error": str(e), "competitors": []}

    # Cross-approach overlap — competitors found by ≥2 approaches are highest confidence
    domain_votes: Counter = Counter()
    domain_names: dict[str, str] = {}
    for key in ("A_research", "B_cooccur", "C_answer"):
        approach = results["approaches"].get(key, {})
        items = approach.get("competitors", []) if isinstance(approach, dict) else []
        for item in items:
            d = item.get("domain", "").lower().lstrip("www.")
            if d:
                domain_votes[d] += 1
                if d not in domain_names:
                    domain_names[d] = item.get("name", d)

    consensus = [{"domain": d, "name": domain_names.get(d, d), "votes": v}
                 for d, v in domain_votes.most_common(30)]
    results["raw_consensus"] = consensus
    print(f"\n[CONSENSUS RAW] {sum(1 for c in consensus if c['votes'] >= 2)} domains found by ≥2 approaches:")
    for c in consensus[:15]:
        marker = "★" if c["votes"] >= 2 else " "
        print(f"  {marker} {c['name']:20} {c['domain']:30} ({c['votes']} approach{'es' if c['votes']>1 else ''})")

    # Normalize: canonical names, dedupe aliases, backfill reasons
    print("\n[NORMALIZE]")
    from normalize import normalize
    a_picks = results["approaches"].get("A_research", {}).get("competitors", [])
    final = normalize(consensus, a_picks, self_profile, n=10)
    results["final"] = final

    print(f"\n[FINAL] Top {len(final)} normalized competitors:")
    for c in final:
        why = (c.get("why_relevant") or "")[:80]
        print(f"  • {c.get('canonical_name', c['name']):20} {c['domain']:30} v={c['votes']} {why}")

    (out_dir / "results.json").write_text(json.dumps(results, indent=2))
    print(f"\nSaved → {out_dir}/results.json")
    results["_out_dir"] = str(out_dir)
    return results


def normalize_input_domain(raw: str) -> str:
    raw = raw.strip().lower()
    if raw.startswith("https://"):
        raw = raw[8:]
    elif raw.startswith("http://"):
        raw = raw[7:]
    return raw.rstrip("/")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 discover.py <domain>")
    run(normalize_input_domain(sys.argv[1]))
