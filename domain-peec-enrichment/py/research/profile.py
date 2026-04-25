"""
Deep profile module — enriches a domain into a structured profile that grounds
competitor discovery and the downstream prompt-generation pipeline.

Three sources, one synthesis call:
  1. Own-site multi-page Tavily extract (homepage, /about, /pricing, /product, ...)
  2. External Tavily search restricted to Crunchbase / LinkedIn / G2 / Capterra / Wikipedia / ProductHunt
  3. Anthropic Sonnet synthesis into a structured JSON profile

Returns a dict matching PROFILE_SCHEMA. Every field is grounded — the synthesizer
returns null for anything the source doesn't support, never invents.

Run:  python3 profile.py <domain>
"""
import json
import os
import sys
from pathlib import Path

import requests

# --- Constants ---

PROFILE_FIELDS = [
    "name", "domain", "tagline", "occupation", "industry",
    "category_for_search", "target_markets", "audience",
    "audience_sophistication", "products_and_services",
    "pricing_tier", "scale_tier", "brand_presentation",
    "key_differentiators", "competitor_signals",
]

OWN_SITE_PATHS = ["", "/about", "/about-us", "/pricing", "/product", "/products", "/solutions"]

# Sites where lesser-known brands actually have structured descriptions
EXTERNAL_DOMAINS = [
    "crunchbase.com", "linkedin.com", "wikipedia.org",
    "g2.com", "capterra.com", "producthunt.com",
]

TAVILY_API = "https://api.tavily.com"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

# Default to Sonnet — judgement-heavy task with structured output. Override via env.
SYNTH_MODEL = os.environ.get("PROFILE_MODEL", "claude-sonnet-4-6")


# --- Source 1: own-site multi-page extract ---

def fetch_own_site(domain: str) -> list[str]:
    """Tavily extract on multiple plausible URLs. Returns raw_content strings
    for whichever pages successfully extracted. Pages that 404 are skipped silently."""
    urls = [f"https://{domain}{p}" for p in OWN_SITE_PATHS]
    payload = {"urls": urls, "format": "markdown"}
    try:
        r = requests.post(
            f"{TAVILY_API}/extract",
            headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
            json=payload,
            timeout=120,
        )
        r.raise_for_status()
        results = r.json().get("results", []) or []
        out = []
        for item in results:
            content = (item.get("raw_content") or item.get("content") or "").strip()
            if len(content) >= 100:
                out.append(content[:6000])  # cap each page
        return out
    except Exception as e:
        print(f"  [profile] own-site extract failed: {e}")
        return []


# --- Source 2: external descriptions (third-party listings) ---

def fetch_external(name_guess: str | None, domain: str) -> dict:
    """Tavily search restricted to listings/profiles. For lesser-known brands,
    these third-party descriptions carry the signal the homepage lacks."""
    seed = name_guess or domain
    query = f"{seed} company description what does it do"
    payload = {
        "query": query,
        "include_domains": EXTERNAL_DOMAINS,
        "include_answer": "basic",
        "max_results": 5,
        "search_depth": "basic",
    }
    try:
        r = requests.post(
            f"{TAVILY_API}/search",
            headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
            json=payload,
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        return {
            "answer": data.get("answer", "") or "",
            "results": [
                {
                    "url": item.get("url"),
                    "title": item.get("title"),
                    "content": (item.get("content") or "")[:600],
                }
                for item in (data.get("results") or [])[:3]
            ],
        }
    except Exception as e:
        print(f"  [profile] external search failed: {e}")
        return {"answer": "", "results": []}


# --- Source 3: structured Anthropic synthesis ---

SYSTEM_PROMPT = """You are a brand-intelligence analyst. You read raw text scraped from a company's website plus external descriptions (Crunchbase, LinkedIn, G2, Wikipedia, etc.) and produce a structured profile.

Be specific and grounded — only claim things the source text supports. If the source is ambiguous or doesn't mention a field, return null. Never invent facts.

CRITICAL field rules:
- category_for_search: 2-4 words a buyer would type into Google or ChatGPT to find this category. NOT marketing-speak. Example: "podcast audio cleanup", "AI tender bid automation", "natural deodorant" — NOT "audio enhancement platform" or "next-generation procurement intelligence".
- scale_tier: pick exactly one. "startup" (seed-Series A, <50 employees), "growth" (Series B-C, 50-500), "mid-market" (~500-2000), "enterprise" (Fortune 500-scale incumbents like Salesforce, SAP, Adobe).
- competitor_signals: ONLY brand names actually mentioned in the source text — comparison pages, "alternatives to X" copy, external listings naming peers. Mark as the literal mention, not your guess. Empty array if none mentioned.
- audience_sophistication: "novice" (general consumers) | "intermediate" (professional but non-expert in the category) | "expert" (deep practitioners).
- target_markets: array of {location, marketSize}. location = country/region/global. marketSize = "global" | "regional" | "national".
- pricing_tier: "free" | "freemium" | "paid" | "enterprise" | null.
- products_and_services: 2-6 concrete items, not categories.

OUTPUT — only valid JSON, no fences, no prose. Every field MUST be present (use null or [] if unsupported):
{
  "name": "<short brand name>",
  "tagline": "<1-line value prop, max 80 chars, or null>",
  "occupation": "<one paragraph plain-English: what the company does, who it serves, and how>",
  "industry": "<short phrase: 'X for Y'>",
  "category_for_search": "<2-4 words>",
  "target_markets": [{"location": "<region>", "marketSize": "<global|regional|national>"}],
  "audience": "<plural noun phrase>",
  "audience_sophistication": "<novice|intermediate|expert>",
  "products_and_services": ["<item 1>", "..."],
  "pricing_tier": "<free|freemium|paid|enterprise|null>",
  "scale_tier": "<startup|growth|mid-market|enterprise>",
  "brand_presentation": ["<adjective 1>", "..."],
  "key_differentiators": ["<concrete differentiator 1>", "..."],
  "competitor_signals": ["<brand name mentioned in source>", "..."]
}"""


def synthesize(domain: str, name_guess: str | None, own_site_texts: list[str], external: dict) -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("  [profile] ANTHROPIC_API_KEY missing — skipping synthesis")
        return None

    own_text = "\n\n---\n\n".join(own_site_texts)[:15000]
    parts: list[str] = []
    if external.get("answer"):
        parts.append(f"SUMMARY:\n{external['answer']}")
    for r in external.get("results", []):
        parts.append(f"--- {r['url']}\nTITLE: {r['title']}\n{r['content']}")
    external_text = "\n\n".join(parts)[:6000]

    user_msg = (
        f"DOMAIN: {domain}\n"
        f"NAME (guess): {name_guess or '(unknown)'}\n\n"
        f"=== OWN-SITE TEXT ===\n{own_text or '(no own-site content available)'}\n\n"
        f"=== EXTERNAL DESCRIPTIONS ===\n{external_text or '(no external descriptions found)'}"
    )

    try:
        r = requests.post(
            ANTHROPIC_API,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": SYNTH_MODEL,
                "max_tokens": 1500,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_msg}],
            },
            timeout=90,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"]
    except Exception as e:
        print(f"  [profile] Anthropic synthesis failed: {e}")
        return None

    # Strip fences if model wrapped JSON
    if "```" in text:
        chunks = text.split("```")
        # Pick the longest code block
        text = max((c.lstrip("json").strip() for c in chunks[1::2]), key=len, default=text)
    try:
        parsed = json.loads(text.strip())
    except json.JSONDecodeError as e:
        print(f"  [profile] non-JSON synthesis output: {e} — first 200 chars: {text[:200]}")
        return None

    # Ensure schema completeness — fill missing fields with null/[]
    for f in PROFILE_FIELDS:
        parsed.setdefault(f, None if f not in {"target_markets", "products_and_services", "brand_presentation", "key_differentiators", "competitor_signals"} else [])
    parsed["domain"] = domain
    return parsed


# --- Public API ---

def enrich_profile(domain: str, name_guess: str | None = None) -> dict | None:
    """Build the deep profile. Returns dict matching PROFILE_SCHEMA, or None if
    Anthropic isn't available (caller should fall back to shallow profile)."""
    print(f"[profile] enriching {domain}…")

    print("  [1/3] own-site multi-page extract…")
    own_site_texts = fetch_own_site(domain)
    total_chars = sum(len(t) for t in own_site_texts)
    print(f"        got {len(own_site_texts)} pages, {total_chars} chars")

    print("  [2/3] external descriptions search…")
    external = fetch_external(name_guess, domain)
    print(f"        answer: {len(external['answer'])} chars, {len(external['results'])} sources")

    print(f"  [3/3] Anthropic synthesis ({SYNTH_MODEL})…")
    profile = synthesize(domain, name_guess, own_site_texts, external)
    if profile is None:
        return None

    print(f"  → category_for_search: {profile.get('category_for_search')}")
    print(f"  → scale_tier:           {profile.get('scale_tier')}")
    print(f"  → audience:             {profile.get('audience')}")
    return profile


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 profile.py <domain>")

    # Reuse discover.py's env loader (single source of truth at repo root)
    sys.path.insert(0, str(Path(__file__).parent))
    from discover import load_env, normalize_input_domain

    load_env()
    if not os.environ.get("TAVILY_API_KEY"):
        sys.exit("Missing TAVILY_API_KEY in .env")

    domain = normalize_input_domain(sys.argv[1])
    profile = enrich_profile(domain)
    if profile is None:
        print("[profile] enrichment failed", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(profile, indent=2))
