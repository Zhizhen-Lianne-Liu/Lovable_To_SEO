# Initial Domain Enrichment

How we deeply profile the input brand BEFORE competitor discovery, so the rest of the pipeline produces accurate competitors, sharper prompts, and grounded recommendations — even for niche or lesser-known brands.

---

## The problem

The pipeline starts with a single domain. Originally we did a thin self-profile:

```
Tavily extract on homepage  →  H1 regex  →  brand name
                            →  3000 chars of homepage markdown  →  raw_excerpt
```

For well-known brands (Attio, HubSpot, Nothing) this works because the AI engines that drive competitor discovery already know what the brand is. For **lesser-known brands** it falls apart:

- Approach A's `/research` call has only a thin marketing snippet to ground its competitor query → it surfaces brands from adjacent categories
- Approaches B/C only see the brand NAME → queries like "alternatives to Phonovo" return mostly irrelevant results
- Anton's keyword pipeline takes only competitor domains, never the input brand → wrong competitors compound into wrong prompts
- Peec's project_profile is empty unless set manually → metric scoring uses no industry context

Result: the wrong competitors get pushed to Peec, which means wrong prompts, which means downstream insights are noise.

---

## The fix — a structured deep profile that grounds every downstream step

We add a step **0b** between the cheap profile and competitor discovery:

```
[0a] Cheap profile (Tavily extract, regex name)        ~3s, free
[0b] Deep profile (multi-source + Anthropic)           ~15s, ~$0.02   ← NEW
[A]  Tavily /research        ── grounded by deep profile
[B]  Multi-channel search    ── grounded by deep profile
[C]  Single-shot answer      ── grounded by deep profile
…
[VALIDATE] Anthropic relevance gate vs deep profile    ~3s, ~$0.01    ← NEW
```

The deep profile is also a **standalone artifact** — saved as `deep_profile.json` per run, embedded in the final snapshot, and (optionally) pushed to Peec via `set_project_profile`.

---

## What the deep profile contains

```json
{
  "name":                    "Phonovo",
  "domain":                  "phonovo.com",
  "tagline":                 "Sound check, in seconds.",
  "occupation":              "One-paragraph plain-English description of what the company does, who it serves, and how.",
  "industry":                "Speech-clarity SaaS for podcasters and audio engineers",
  "category_for_search":     "podcast audio cleanup",
  "target_markets":          [{"location": "Worldwide", "marketSize": "Global"}],
  "audience":                "Independent podcasters and audio editors",
  "audience_sophistication": "intermediate",
  "products_and_services":   ["AI noise reduction", "Voice isolation", "Browser-based editor"],
  "pricing_tier":            "freemium",
  "scale_tier":              "startup",
  "brand_presentation":      ["minimalist", "developer-friendly", "speed-first"],
  "key_differentiators":     ["browser-based, no install", "sub-5-second processing"],
  "competitor_signals":      ["Adobe Podcast", "Auphonic"]
}
```

Every field is grounded — the synthesizer is instructed to return `null` for anything the source doesn't support, never invent.

---

## How we get to this profile

Three sources, one synthesis call.

### Source 1: own-site multi-page extract (Tavily)

We try 7 plausible URLs:
```
https://{domain}            ← homepage
https://{domain}/about
https://{domain}/about-us
https://{domain}/pricing
https://{domain}/product
https://{domain}/products
https://{domain}/solutions
```

Each successful extract contributes ~5KB of markdown. Whatever pages don't exist are skipped silently (Tavily returns 404 or empty).

This is the primary signal: their own marketing copy, in their own words, across the pages that describe what they do, what they sell, and who they serve.

### Source 2: external descriptions (Tavily search)

```python
tavily.search(
  query="{brand} company description what does it do",
  include_domains=["crunchbase.com", "linkedin.com", "wikipedia.org",
                   "g2.com", "capterra.com", "producthunt.com"],
  include_answer="basic",
)
```

For lesser-known brands where the homepage is sparse, third-party sites carry the signal — Crunchbase has structured industry tags, LinkedIn has an "about" company description, G2/Capterra often have category placement, Wikipedia (when it exists) has clean infobox data.

We capture both Tavily's `answer` (its synthesis) and the top 3 raw results.

### Source 3: structured synthesis (Anthropic)

A single Sonnet call with:

- **System**: "You are a brand-intelligence analyst. You read raw text scraped from a company's website plus external descriptions, and produce a structured profile. Be specific and grounded — only claim things the source text supports. If the source is ambiguous, return null. Never invent facts."
- **User**: own-site text + external text + the JSON schema to fill

Returns the JSON above. ~2K output tokens, ~$0.02 per call. Total enrichment cost: ~$0.02 + ~10 Tavily credits.

---

## How the deep profile grounds each downstream step

### Approach A — `/research` with structured output

Before:
> List the top 10 direct competitors of {brand}. Brief context: {3000 chars of homepage markdown}.

After:
> List the top 10 direct competitors of {brand} ({deep_profile.name}). Direct competitor = same buyer, same primary problem, **comparable scale tier**. Match the brand's scale tier ({deep_profile.scale_tier}) — don't return Microsoft/Salesforce-level enterprises if the brand is a startup. Ground-truth context:
>
> Brand: Phonovo
> Industry: Speech-clarity SaaS for podcasters
> What they do: {occupation}
> Audience: {audience}
> Products: {products_and_services}
> Scale tier: startup
> Key differentiators: {key_differentiators}

The scale-tier constraint alone fixes most of the bad outputs (Tavily was returning enterprise-grade tools as "alternatives" to small SaaS).

### Approach B — multi-channel co-occurrence

Before:
```
"alternatives to {brand} ({domain})"
"{brand} vs"
"What is the product category of {brand}?"
"buyers comparing {brand}"
```

After:
```
"alternatives to {brand} in the {category_for_search} space for {audience}, match {scale_tier}"
"companies competing head-to-head with {brand} in the {category_for_search} space"
"leading companies in the {category_for_search} category for {audience}"
"buyers shortlisting {brand} in {category_for_search} for {audience}"
```

The category-grounded queries return tighter result sets. For Phonovo: "alternatives" without the category = noise; "alternatives in podcast audio cleanup" = the right tools.

### Approach C — single-shot answer

Adds the same category and scale clauses to the question.

### Validation step (NEW)

After consensus + normalize, we have a top-15 candidate list. Single Anthropic call:

> Given this brand profile, classify each of these 15 candidates as a TRUE direct competitor or NOT. Drop: parent companies, customers, vendors, adjacent-but-different categories, vastly larger or vastly smaller players. Return one verdict per candidate.

Each candidate gets `validated: true|false` + `validation_reason`. We keep validated ones first, then fill from rejected ones up to 10 if we don't have enough validated candidates. **The verdicts stay in the JSON** so the audit trail is preserved.

This is the relevance gate that prevents wrong competitors from leaking into Peec.

### Anton's prompt-gen (optional but recommended)

Anton's CLI accepts `--category="..."` as a hint to its keyword filter. Pass `deep_profile.category_for_search` as that flag and his Opus relevance gate has a strong prior — it stops inferring category from competitor keyword patterns and starts working with ground truth.

### Peec's `set_project_profile` (optional)

The deep profile maps almost 1:1 onto Peec's project profile schema. Pushing it via MCP `set_project_profile` makes Peec's metric scoring use industry/audience context — better visibility attribution, better recommendation generation.

---

## Module layout

```
peec-onboarder/research/
├── profile.py              ← NEW: enrich_profile(domain) → deep_profile dict
├── discover.py             ← MODIFIED: calls profile_self_deep + uses it in all 3 approaches
│                              + validate_against_profile() relevance gate
├── normalize.py            ← unchanged
├── push.py                 ← unchanged
├── snapshot.py             ← snapshot already includes deep_profile + project_profile
├── orchestrate.py          ← unchanged (deep profile flows through `results["deep_profile"]`)
├── anton_runner.py         ← TODO: pass --category from deep_profile.category_for_search
└── mcp_client.py           ← TODO: also push set_project_profile after first snapshot
```

---

## API surface

### Public function

```python
from profile import enrich_profile

profile = enrich_profile(
    domain="phonovo.com",
    name_guess="Phonovo",   # optional — improves external search query
)
# → dict matching PROFILE_SCHEMA
```

### CLI

```bash
python3 peec-onboarder/research/profile.py phonovo.com
# Prints the JSON profile to stdout. Useful for debugging.
```

### Auto-invoked

When you run the orchestrator, the deep profile happens automatically as step 0b. Output saved to:

```
peec-onboarder/data/<domain-slug>/<timestamp>/deep_profile.json
```

It's also embedded in the final snapshot as `snapshot.deep_profile` (separate from `snapshot.project_profile` which comes from Peec).

---

## Failure modes and fallbacks

| Failure | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` not set | Skip deep profile entirely. All approaches fall back to ungrounded queries. Pipeline still runs. |
| Domain has no extractable pages (404 / JS-only / blocked) | Use only external-source synthesis. Profile is thinner but usable. |
| External search returns nothing | Use only own-site synthesis. Common for very new brands. |
| Anthropic returns malformed JSON | Caught at parse, validation step also catches and keeps unfiltered top 10. Logs warning. |
| `npm install` not yet run for Anton | `anton_runner.py` runs it lazily on first invocation. |

---

## Cost & latency

| Step | Latency | Cost |
|---|---|---|
| Source 1 (own-site Tavily extract, ~5 URLs) | ~6s | ~5 Tavily credits |
| Source 2 (external Tavily search, 2 queries) | ~3s | ~4 Tavily credits |
| Source 3 (Anthropic Sonnet synthesis) | ~5s | ~$0.02 |
| Validation pass (Anthropic Sonnet) | ~3s | ~$0.01 |
| **Total enrichment overhead** | **~17s** | **~$0.03 + 9 Tavily credits** |

For a pipeline that already takes 3-4 min and ~$0.50 per run, this is rounding error in exchange for substantially better competitor accuracy on niche brands.

---

## Why this matters for the rest of the pipeline

| Stage | Without deep profile | With deep profile |
|---|---|---|
| Competitor discovery | Tavily guesses from thin homepage snippet | Grounded queries with category, audience, scale |
| Competitor validation | None | Anthropic gate drops parent-cos, vendors, wrong-tier brands |
| Anton's keyword curation | Infers category from competitor keyword patterns (brittle for niche) | Passes category as ground-truth hint |
| Peec metric scoring | No industry context | Uses set_project_profile for better attribution |
| Downstream rewriter | No positioning to enhance | Has industry, audience, differentiators, products |
| Snapshot artifact | `deep_profile: null` | Full structured profile available to next stage |

---

## Status

| Component | State |
|---|---|
| `profile.py` | ✅ written, syntax-clean, tests pass |
| `discover.py` deep-profile integration | ✅ all 3 approaches grounded |
| `discover.py` validation step | ✅ added between normalize and final |
| `requirements.txt` | ✅ `anthropic>=0.40` added |
| Tested on a niche brand (phonovo.com) | ⏳ in progress |
| Anton `--category` integration | ⏳ TODO |
| Peec `set_project_profile` push | ⏳ TODO |

All in `tom-anton/integration` branch. Currently uncommitted on Tom's local — confirm + push pending.
