# peec-onboarder

**One domain in. A fully-populated Peec project, the right competitors, the right prompts, and a structured GEO-insights snapshot — out. In about 4 minutes.**

Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**. The hard parts are (1) finding the right competitors for a brand we've never heard of, and (2) turning real SEO demand into Peec-ready tracking prompts that actually measure brand visibility in LLM responses. This pipeline solves both.

---

## The pipeline

```
domain (e.g. attio.com)
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 0a. Cheap self-profile     Tavily extract on homepage     ~3s    │
│ 0b. Deep self-profile      7 own-site URLs + 6 external          │
│                            sources + 1 Anthropic synthesis       │
│                            → 15-field structured profile  ~15s   │
├──────────────────────────────────────────────────────────────────┤
│ 1.  Competitor discovery   3 Tavily approaches in parallel       │
│                            A: /research + output_schema          │
│                            B: 4-channel co-occurrence            │
│                            C: single-shot answer mining   ~25s   │
├──────────────────────────────────────────────────────────────────┤
│ 2.  Consensus + normalize  Vote across A/B/C → top-15            │
│                            5-step normalize (parent/child,       │
│                            canonical name, dedupe, why)          │
│                            Anthropic relevance gate       ~10s   │
├──────────────────────────────────────────────────────────────────┤
│ 3.  SEO keyword intel      DataForSEO ranked-keywords per        │
│                            competitor → consensus split   ~5s    │
├──────────────────────────────────────────────────────────────────┤
│ 4.  Prompt generation      Curator (Opus) → 18 sub-agents        │
│                            (Sonnet, parallel) → Aggregator       │
│                            (Opus) → 20-50 Peec prompts   ~55s    │
├──────────────────────────────────────────────────────────────────┤
│ 5.  Push to Peec           PATCH own brand, wipe-and-replace     │
│                            competitors + prompts (REST)   ~5s    │
├──────────────────────────────────────────────────────────────────┤
│ 6.  Wait                   Peec runs prompts across 7 LLM        │
│                            engines                       ~90s    │
├──────────────────────────────────────────────────────────────────┤
│ 7.  Snapshot composition   17 Peec REST calls + 1 MCP call       │
│                            → unified GEO insights JSON    ~15s   │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
data/<project_id>/snapshot_<ts>.json   ← everything the next stage needs
```

Total: **~3-4 minutes, ~$0.50 per run**, fully automated from a single domain.

---

## ⭐ Stage 1 — Tavily 3-approach competitor discovery

This is the core trick. **Three independent Tavily approaches run in parallel, then vote.** Each approach has a different failure mode; their intersection is what you trust.

### Why three approaches

A single LLM-generated competitor list is wrong in predictable ways:
- **It hallucinates plausible-sounding domains** that don't exist
- **It defaults to the famous brands** (Salesforce, HubSpot) regardless of scale
- **It confuses parent/subsidiary** (returns Microsoft for a small Office365 plugin)
- **It gets fooled by review aggregators** (returns g2.com as a "competitor")

Each of our three approaches makes a *different* mistake. So if 2 of 3 (or all 3) agree on a domain, that domain is real, in the right category, and at the right scale. Disagreement is the signal — not noise.

### Approach A — `/research` with structured output

The most expensive, the most accurate. Single async call to Tavily's `/research` endpoint with a JSON `output_schema` that forces structured competitor records back.

```python
POST https://api.tavily.com/research
{
  "input": "List the top 10 direct competitors of {brand} ({domain}). Direct
            competitor = same buyer, same primary problem, comparable scale tier.
            Match scale tier ({deep_profile.scale_tier}) — don't return
            Microsoft/Salesforce-level enterprises if the brand is a startup.

            Brand: {name}
            Industry: {industry}
            What they do: {occupation}
            Audience: {audience}
            Products: {products_and_services}
            Key differentiators: {key_differentiators}

            EXCLUDE: parent companies, subsidiaries, customers, vendors,
            adjacent-but-non-competing categories. Root domain only.",
  "model": "mini",
  "output_schema": {
    "properties": {
      "competitors": {
        "type": "array",
        "items": { "properties": {
          "name": {"type": "string"},
          "domain": {"type": "string"},
          "description": {"type": "string"},
          "why_relevant": {"type": "string"}
        }}
      }
    },
    "required": ["competitors"]
  }
}
```

Submits, polls `/research/{request_id}` every 5s for up to 5 minutes. Returns full competitor records with `description` and `why_relevant` fields populated by Tavily's own retrieval. **This is the only approach that returns *why* each competitor is relevant** — used downstream to ground Peec's brand metadata.

**Failure mode:** can hallucinate credible-but-fake domains; no built-in dedup against review aggregators.

### Approach B — Multi-channel co-occurrence scoring

Four parallel `/search` calls covering distinct facets of "competitor", regex-extract domains from each LLM-generated answer, score by weighted channel agreement.

The four channels and their weights:

| Channel | Weight | Query (deep-profile-grounded) |
|---|---|---|
| `vs` | **3** | "What companies compete head-to-head with {brand} in {category}? Include their domains." |
| `alternatives` | **2** | "What are the top alternatives to {brand} in {category} for {audience}? List companies with their websites." |
| `category` | **1** | "Who are the leading companies in {category}? List with domains." |
| `buyers` | **1** | "If a buyer evaluating {brand} wanted to shortlist options, which companies and domains would they consider?" |

The `vs` channel gets the highest weight because head-to-head queries are the cleanest signal for *direct* competition — alternatives lists are noisier (often include adjacent categories), category lists are broader still.

For each Tavily response, regex-extract domains from the answer text:

```python
DOMAIN_RE = r"\b((?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|app|de|fr|uk|tech|org|tv|gg))\b"
JUNK = {"wikipedia.org", "youtube.com", "reddit.com", "linkedin.com",
        "g2.com", "capterra.com", "github.com", "amazon.com", ...}
```

Each domain's score is the sum of channel weights where it appeared. A domain in all four channels scores 3+2+1+1 = **7** (max). A domain only in `category` scores **1** (likely noise). Ranked by `(-score, -channel_count)`.

**Failure mode:** regex extraction is lossy — misses brand names without `.com` in the answer text. Reddit / forum answers can pollute. The junk-domain blacklist is hand-curated.

### Approach C — Single-shot answer mining

Cheapest and fastest. One `/search` call with `include_answer="advanced"`, regex domain extraction from the synthesis answer.

```python
POST https://api.tavily.com/search
{
  "query": "Who are the top 10 direct competitors of {brand} ({domain})
            in the {category} space? List each with their domain. Same
            product category, same buyer. Match the {scale}-tier scale.",
  "search_depth": "advanced",
  "max_results": 15,
  "include_answer": "advanced"
}
```

The `include_answer="advanced"` tells Tavily to use a stronger synthesis model on the retrieved sources. Same regex extractor as B, with review-domain filter (g2, capterra, trustradius, softwareadvice).

**Failure mode:** thin — depends entirely on whichever sources Tavily happened to retrieve for that one query.

### A vs B vs C side-by-side

| | A: `/research` | B: 4-channel co-occurrence | C: single-shot answer |
|---|---|---|---|
| Tavily endpoint | `/research` (async) | `/search` × 4 | `/search` × 1 |
| Output | Structured records | Domain → channel score | Domain list from answer |
| Returns names? | ✅ Direct from schema | ⚠ Inferred from domain | ⚠ Inferred from domain |
| Returns descriptions? | ✅ | ❌ | ❌ |
| Returns "why relevant"? | ✅ | ❌ | ❌ |
| Latency | ~15s (polled) | ~10s | ~5s |
| Tavily credits | ~5 | ~8 | ~2 |
| Strength | High-quality structured output | Cross-facet agreement | Fast sanity check |
| Failure mode | Hallucinated domains | Regex misses, junk noise | Single-source dependence |

### Consensus voting

After all three return, a `Counter` tallies how many approaches found each domain:

```python
votes_by_domain = Counter()
for approach_results in [A_picks, B_picks, C_picks]:
    for c in approach_results:
        votes_by_domain[c["domain"]] += 1

# top 30 by vote count, then by approach diversity
consensus = sorted(votes_by_domain.items(),
                   key=lambda x: (-x[1], -approach_count(x[0])))[:30]
```

The output of stage 1 is a list of competitor candidates each carrying:
- `votes` (1, 2, or 3) — how many of A/B/C found it
- `approaches` (which subset)
- `name`, `description`, `why_relevant` (from A if available)

**Domains with `votes >= 2` are high-confidence.** Domains with 1 vote get a second look in normalize + the Anthropic validation pass.

---

## Stage 2 — Normalize + validate

Five normalization steps clean the consensus list before validation:

1. **Parent/child fold** — hardcoded `PARENT_OF` map (`mi.com → xiaomi.com`, `redmi.com → xiaomi.com`, `honor.com → huawei.com`). Sums votes across merged entries.
2. **Canonical name enrichment** — Pass 1: strip "CRM", "Inc.", "GmbH", "Software", "Platform" via regex from A's names. Pass 2: one batch Tavily `/research` call returns `{domain, canonical_name}` for the rest.
3. **Dedupe by canonical name** — case-insensitive. Higher-voted entry wins; loser's votes get added.
4. **`why_relevant` backfill** — one batch `/research` call covers all candidates missing the field.
5. **Final ranking** — consensus (votes ≥ 2) first, then A's picks, then single-vote candidates. Capped at 15.

Then a single Anthropic call validates the top 15 against the deep self-profile:

> "Given this brand profile, classify each of these 15 candidates as a TRUE direct competitor or NOT. Drop: parent companies, customers, vendors, adjacent-but-different categories, vastly larger or vastly smaller players. Return one verdict per candidate."

Verdicts persist on each candidate as `validated: true|false` + `validation_reason` (audit trail). Final list: validated ones first, fill from rejected up to 10 if needed.

The deep self-profile (stage 0b) is what makes this gate work. Without it, the validator has nothing to compare against.

---

## ⭐ Stage 3+4 — Translating SEO data into Peec prompts

This is the second showpiece. **We turn real Google ranking data into Peec tracking prompts that measure brand visibility in LLM responses.**

### Why "translation," not "copy"

Google search keywords and LLM prompts are different shapes:

| | Google search | LLM prompt |
|---|---|---|
| Form | 2-4 word fragment | Full sentence, conversational |
| Example | `best crm small business` | `What's the best CRM for a 20-person B2B sales team?` |
| Specificity | Low (Google fills in intent) | High (you have to spell it out) |
| Brand surface | Competitor names common | Brands NEVER named |

A naive pipeline (`for keyword in keywords: peec.create_prompt(keyword)`) breaks Peec scoring entirely. Peec runs each prompt across 7 LLM engines daily — those engines respond very differently to fragments vs questions vs imperatives. You need the *prompt shape* that reflects how a real buyer actually queries an AI.

So the question becomes: **how do we re-clothe a Google demand signal in LLM-native phrasing, without losing the demand signal?**

### Step 1 — DataForSEO ranked keywords

For each of the ~10 competitor domains (parallel):

```python
POST https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live
{
  "target": "hubspot.com",
  "location_code": 2840,        # US (auto-derived from input domain TLD)
  "language_code": "en",
  "limit": 200,
  "filters": [
    ["keyword_data.keyword_info.search_volume", ">", 200],   # drop micro-noise
    "and",
    ["ranked_serp_element.serp_item.rank_absolute", "<=", 30] # drop page 3+ accidents
  ],
  "order_by": ["keyword_data.keyword_info.search_volume,desc"]
}
```

Returns up to 200 keywords each competitor *actually ranks for* on Google today, with `volume`, `cpc`, `intent`, `keyword_difficulty`, `serp_position`. Cached at `.cache/dataforseo/agg_{hash}.json` so re-runs are free.

The two filter thresholds matter:
- **`search_volume > 200`** — drops keywords no real human searches for. The long tail below 200 is mostly noise: typos, tracker queries, internal tool searches.
- **`rank_absolute <= 30`** — drops "accidental" rankings on page 3+. If a competitor ranks position 47 for some keyword, they're not actually competing for it.

Together, these filters yield only keywords that are (a) real demand and (b) the competitor is actually fighting for.

### Step 2 — Aggregate into consensus vs outlier

Across all 10 competitors:

```typescript
{
  keyword: "best crm for small business",
  total_volume: 49500,
  count: 4,                                  // ranked by 4 of 10 competitors
  ranking_competitors: ["hubspot.com", "pipedrive.com", "zoho.com", "monday.com"],
  best_position: 3,
  avg_difficulty: 67,
  intent: "commercial"
}
```

Then split:
- **`consensus`**: `count >= 2` — keywords ≥2 competitors rank for. This IS the category.
- **`outliers`**: `count == 1` — keywords only one competitor ranks for. Either noise OR a competitor's idiosyncratic content angle.

The consensus split is the key insight. **If 4 competitors rank for "best crm for small business", that IS the category.** If only Salesforce ranks for "enterprise sales engagement platform with quote-to-cash", that's a Salesforce-specific marketing angle, not a market battleground.

### Step 3 — `selectTopKeywords` (deterministic)

Sorts consensus first by `(-count, -total_volume)`, picks top 60 candidates to feed the LLM stage. Outliers are skipped entirely if `consensusOnly=true`.

### Step 4 — Curator (Opus, single call) — the relevance gate

Single Opus call receives all 60 scored keywords:

```
1.  [commercial   ] vol=49500 count=4 pos=3   best crm for small business
2.  [informational] vol=33000 count=5 pos=7   what is crm
3.  [commercial   ] vol=22000 count=3 pos=5   crm software comparison
...
60. [commercial   ] vol=1100  count=2 pos=12  agency crm tools
```

The system prompt asks Opus to do three things:

1. **Infer the category** from the keyword cluster pattern (e.g. "B2B CRM software")
2. **REJECT**: branded keywords (just a competitor name), content-marketing noise (email etiquette templates, motivational quotes, generic business writing tips), off-topic
3. **KEEP**: head + long-tail mix, commercial + informational mix, persona/use-case variety

Returns:
```json
{
  "inferred_category": "B2B CRM software",
  "selected": [0, 2, 4, 7, 11, 14, 18, 22, 25, 31, 38, 41, 44, 49, 52, 57],
  "rationale": "Picked head terms (best crm for small business), use-case
                variants (crm for sales teams), comparison intent. Dropped
                branded queries and email-template content marketing noise."
}
```

Why Opus, not regex? Opus distinguishes "crm vs salesforce" (competitor-eval keyword, *good*) from "salesforce certification cost" (brand-trivia, *bad*). Same surface keyword shape, very different commercial value. That's the kind of judgment a deterministic filter can't make.

The `inferred_category` becomes a hard prior for the next stage.

### Step 5 — Sub-agents (Sonnet × 5 parallel) — the translators

This is where the actual SEO → prompt translation happens. Slice to 18 seeds, then **one Sonnet call per seed keyword**, 5 in parallel.

**Input per call:**
```json
{
  "keyword": "best crm for small business",
  "intent": "commercial",
  "total_volume": 49500,
  "competitors_ranking": 4,
  "best_position": 3
}
```

The sub-agent doesn't just see the keyword string. It sees the **commercial evidence**:
- `intent: commercial` → bias toward `consideration` frame, not awareness
- `competitors_ranking: 4` → category-defining query, prompts should be category-positioned not niche
- `total_volume: 49500` → calibrates how generic vs specific to be (high-volume head term → narrow with persona; low-volume long-tail → keep close to original)

**The 6 hard rules each sub-agent follows.** Each one defends against a specific failure mode:

| # | Rule | What it defends against |
|---|---|---|
| 1 | **Category gate** — if the keyword isn't actually about the inferred category, return `{prompts: []}` | DataForSEO returns *every* keyword a competitor ranks for, including their HR pages and brand-trivia |
| 2 | **Imperative noun phrases > questions** ("Best CRM for X" beats "What's the best CRM for X?") | Matches how buyers actually query LLMs. Imperatives produce more direct responses → easier brand attribution |
| 3 | **NEVER include a brand name** | Peec measures *which brand the LLM mentions unprompted*. Naming a brand biases the metric to ~100% |
| 4 | **Add ONE persona or constraint per prompt** ("Best CRM for music agencies" not "Best CRM") | Generic prompts return generic answers (always the top 3 brands). Specificity surfaces real visibility variance |
| 5 | **Cover ≥2 frames per keyword** (mix awareness + consideration) | Single-frame prompts under-sample the buyer journey |
| 6 | **40-90 char target, max 200** | Below 40: too generic. Above 200: LLM responses fragment, harder to parse for brand mentions |

**Output per call:**
```json
{
  "prompts": [
    {"query": "Best CRM for small business sales teams under 50 reps",
     "bucket": "consideration", "frame": "evaluative"},
    {"query": "CRM platforms for early-stage B2B startups",
     "bucket": "consideration", "frame": "scenario"},
    {"query": "What does a small business CRM actually do day-to-day",
     "bucket": "awareness", "frame": "open"},
    {"query": "Top affordable CRMs for bootstrapped founders",
     "bucket": "consideration", "frame": "evaluative"}
  ]
}
```

18 seeds × 4 prompts = **~72 raw candidates**. Concurrency=5 keeps wall time around 30s.

Then exact dedup (lowercase, strip punctuation, collapse whitespace) → ~65 candidates.

### Step 6 — Aggregator (Opus, single call) — semantic dedup + ratio

Receives all ~65 candidates as a numbered list. Single Opus call:

```
1.  [consideration] Best CRM for small business sales teams under 50 reps
2.  [consideration] CRM platforms for early-stage B2B startups
3.  [consideration] Top CRM software for small businesses
4.  [consideration] Best CRM tools for early-stage companies
...
65. [awareness] What is CRM software
```

System prompt asks Opus to:
1. **Collapse semantic duplicates** — `1` and `3` are the same query in different words. Keep one.
2. Tiebreak: specific > generic, imperative > question, 40-90 chars preferred
3. **Enforce bucket ratio**: 60% consideration, 27% awareness, 13% brand-eval
4. **Final count**: 20-50 (20 minimum unless input was smaller, 50 max if all distinct)

Why two passes of dedup (exact then semantic)? Exact dedup catches "best CRM software" vs "Best CRM software." It does NOT catch "best CRM for small business" vs "top CRM tools for small companies." Those are semantically identical and would dilute Peec's measurement. Only an LLM with full-list context can decide what's redundant.

### One concrete worked example

Input keyword from DataForSEO (one of 18 seeds for the attio.com run):
```
keyword: "crm for sales teams"
intent: commercial
total_volume: 8,100/mo
competitors_ranking: 6 of 10
best_position: 4
```

Sub-agent output (4 prompts):
```
1. "Best CRM for outbound sales teams under 25 reps"           [consideration]
2. "CRM platforms with strong pipeline analytics for B2B sales" [consideration]
3. "Top CRMs for revenue teams running multi-touch sequences"  [consideration]
4. "How does a sales-team CRM differ from a marketing CRM"      [awareness]
```

Peec runs each across 7 LLM engines daily. Together those 4 prompts measure attio.com visibility across:
- buyer size (under 25 reps)
- functional priority (pipeline analytics)
- workflow context (multi-touch sequences)
- educational moment (sales vs marketing CRM distinction)

**Four distinct measurement angles from one SEO keyword.** Multiply by 18 seeds → 50-70 measurement angles per project. That's the dataset Peec scores against daily.

### The funnel math

```
10 competitors × 200 ranked keywords         = up to 2,000 keyword rows (DataForSEO)
                  ↓ aggregate + dedupe
                                              ~ 800 unique keywords
                  ↓ split
                                              consensus (~120) + outliers (~680)
                  ↓ selectTopKeywords (consensus first)
                                              60 candidates → LLM
                  ↓ Curator (Opus, 1 call)
                                              15-25 seeds + inferred category
                  ↓ slice
                                              18 seeds
                  ↓ Sub-agents (Sonnet × 5 parallel, 1 call each)
                                              ~72 raw prompts
                  ↓ exact dedup
                                              ~65 candidates
                  ↓ Aggregator (Opus, 1 call)
                                              20-50 final prompts → Peec
```

**Total prompt-gen LLM calls:** 1 curator + 18 sub-agents + 1 aggregator = **20 calls**
**Wall time:** ~55-90s
**Cost:** ~$0.30-0.50 per run

### Why this beats the obvious alternatives

| Alternative | Problem |
|---|---|
| `for k in keywords: peec.create_prompt(k)` | Wrong shape. Google fragments don't trigger the LLM response patterns Peec measures against. |
| Ask GPT "give me 30 prompts about CRMs" | No grounding in real demand. Generic. |
| Use Ahrefs keyword expansion | Returns SEO long-tails, not buyer-question phrasings. Wrong shape. |
| Single LLM call with all 200 keywords + "generate prompts" | Loses signal in a wall of text. No bucket discipline. Heavy semantic duplication. |
| Hand-craft prompts | Doesn't scale. Doesn't update as the market shifts. |

What this pipeline does instead: **let real Google rankings define the category, let Opus gate relevance, let parallel Sonnet sub-agents force angle diversity, let Opus dedup at semantic level**. Every step has a specific failure mode it's defending against.

---

## Stage 5 — Push to Peec (wipe-and-replace)

Idempotent. Every run converges the project to a clean state.

```
GET    /brands?project_id=...&limit=1000        # current state
PATCH  /brands/{own_id}                         # update own brand in place
DELETE /brands/{competitor_id}     × N          # wipe existing competitors
POST   /brands                     × 10         # create new competitors
GET    /prompts?project_id=...&limit=1000
DELETE /prompts/{id}               × N          # wipe existing prompts
POST   /prompts                    × 20-50      # create new prompts
```

The own brand is updated *in place* (PATCH, not delete-and-recreate) so it keeps `is_own=true`. Competitor colors cycle through 8 fixed hex values. Country code on prompts auto-derived from input domain TLD.

---

## Stage 7 — Snapshot composition (REST + MCP hybrid)

Peec doesn't expose `get_actions` via REST — only via MCP. So we use both transports and merge the results into one snapshot.

### REST endpoints called (17 total)

| Section | Endpoint | What it returns |
|---|---|---|
| Brands | `GET /brands` | Project brand list with own/competitor flag |
| Prompts | `GET /prompts` | All tracked prompts |
| Models | `GET /models` | Active LLM engines (~7) |
| Chats | `GET /chats` | Per-prompt × model responses |
| Chat content | `GET /chats/{id}/content` | Full LLM response text (sampled 30) |
| Brand report (overall) | `POST /reports/brands` | Visibility / SoV / sentiment / position per brand |
| Brand report by model | `POST /reports/brands` (`dimensions=["model_id"]`) | Per-engine breakdown (where each LLM has us behind) |
| Brand report by prompt | `POST /reports/brands` (`dimensions=["prompt_id"]`) | Per-prompt strengths / weaknesses |
| Domain report | `POST /reports/domains` | Cited domains, ordered by citation count |
| Domain gap | `POST /reports/domains` (`gap >= 1`) | Where competitors are cited but we aren't |
| URL report | `POST /reports/urls` | Cited URLs, by retrieval count |
| URL gap | `POST /reports/urls` (`gap >= 1`) | Specific URLs to target |
| Search queries | `POST /queries/search` | Internal Google search queries the LLM used |
| Shopping queries | `POST /queries/shopping` | Internal shopping queries |
| URL content | `POST /sources/urls/content` | Scraped markdown of top 10 gap URLs (5KB cap each) |

### MCP call (1)

Authenticated via OAuth (one-time browser flow, token persisted in `.peec_oauth.json`):
- `get_actions(project_id, scope="overview")` then drilled per non-zero slice (owned, editorial, reference, ugc)
- `get_project_profile(project_id)` — Peec's auto-derived brand profile, useful as a sanity check against our own deep self-profile

The MCP client uses the official Anthropic `mcp` Python SDK with streamable HTTP + dynamic client registration.

### Output schema

`data/<project_id>/snapshot_<timestamp>.json` — single artifact for the next pipeline stage:

```
meta                  project + brand list + coverage stats
deep_profile          our 15-field structured brand profile (stage 0b)
project_profile       Peec's auto-derived profile (sanity check)
scorecard             visibility / SoV / sentiment / position per brand, with rank
engine_breakdown      per-model gap (which AI engines have us behind)
prompt_breakdown      per-prompt strengths/weaknesses, weakness/winning flags
actions               prescriptive recommendations (MCP-only)
gap_targets           domains + URLs where competitors are cited but we aren't
owned_audit           our URLs that are working in AI search + classification mix
fanout_queries        actual search queries the LLMs used internally
url_contents          scraped markdown of top 10 gap URLs (for the rewriter stage)
diagnostics           5 wins (own brand at position 1-5) + 5 misses (competitor-only)
```

Threshold definitions baked in:
- `weakness_flag` = `own_visibility < 0.3`
- `winning_flag` = `own_visibility >= 0.7 AND own >= top_competitor`
- Outreach tier: HIGH ≥ 0.2, MEDIUM ≥ 0.08, LOW < 0.08

A real example output is committed at [`peec-onboarder/examples/snapshot_attio_2026-04-25.json`](peec-onboarder/examples/snapshot_attio_2026-04-25.json) — 462KB of structured GEO insights, fully populated, 100% model coverage.

---

## Cost & timing per run

| Stage | Latency | Cost |
|---|---|---|
| 0a + 0b. Self-profile (Tavily ×9 + Anthropic ×1) | ~17s | ~$0.02 + 9 Tavily credits |
| 1. Tavily 3-approach competitor discovery | ~25s | ~15 Tavily credits |
| 2. Normalize + Anthropic validation | ~10s | ~$0.01 |
| 3. DataForSEO ranked keywords (×10 parallel, cached) | ~5s | ~$0.10 |
| 4. Prompt generation (1 Opus + 18 Sonnet + 1 Opus) | ~55s | ~$0.30 |
| 5. Peec push | ~5s | free (REST) |
| 6. Wait for chats | 90s | — |
| 7. Snapshot (17 REST + 1 MCP) | ~15s | free |
| **Total** | **~3-4 min** | **~$0.50 + 24 Tavily credits** |

---

## Quickstart

```bash
# From repo root:
cp .env.example .env
# Fill in: PEEC_API_KEY (skc-...), TAVILY_API_KEY, ANTHROPIC_API_KEY,
#          DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD

# Demo run with the bundled fixture (no Peec auth needed)
PEEC_FIXTURE=examples/founder-mvp/snapshot_attio_2026-04-25.json \
  npm run dev -- run \
    --repo https://github.com/your-team/your-lovable-app \
    --project-id demo

# Real run — clone, prerender, enhance, push branch, open PR
npm run dev -- run \
  --repo https://github.com/your-team/your-lovable-app \
  --project-id <peec_project_id> \
  --open-pr
```

Outputs land in `out/<run-id>/`:

- `01-repo.json` — cloned-repo metadata + source-file list
- `02-prerendered.html` — the SPA-to-static conversion (already a wins-by-itself artifact)
- `03-diagnose.json` — Peec signal
- `04-brief.md` — strategist brief
- `05-diff.patch` — what enhancement changed vs prerendered
- `site/` — the final static site (`index.html` + `robots.txt` + `sitemap.xml`)
- `report.md` — exec summary you can paste into Slack

When `--repo` is given the final `site/` is committed to a fresh branch under `seo/`. With `--open-pr` we push and call `gh pr create`.

---

## Why we win the track

Most "AI SEO tools" guess. We don't.

| Signal | Source | What it tells us |
|---|---|---|
| What buyers ask LLMs | Peec `/queries/search` | Real query targets — not Ahrefs guesses |
| Which URLs LLMs cite | Peec `/reports/urls` | The shape of content that wins citations |
| Where competitors crush us | Peec `/reports/brands` | Share-of-voice gaps to attack first |
| The page itself | Cloned repo | The React source we can actually edit |

Claude fuses all four into an enhancement that targets the *actual* gap. Then we re-measure on Peec next week and show the lift.

---

## What "GEO" means here

GEO = Generative Engine Optimization. Becoming the source LLMs *quote* when a buyer asks "what's the best receipt scanner for freelancers?". The enhancer applies a concrete playbook — see [`docs/GEO_PRINCIPLES.md`](docs/GEO_PRINCIPLES.md):

- **Direct, extractable answers** at the top of every section
- **Comparison tables** for every "X vs Y" buyer query
- **Cited stats** with linked sources
- **Schema.org JSON-LD** (Organization, SoftwareApplication, FAQPage)
- **Entity consistency** — same brand surface form everywhere
- **Q&A blocks** sized for LLM quote windows (40–80 words)

Classic SEO is the floor (titles, meta, headings, alt text) — not the ceiling.

---

## HTTP API (Python FastAPI service)

The CLI above is the local tool. The Python service at `src/lovable_to_seo/` powers the web app — same pipeline, exposed over HTTP.

```
POST /run
   → [Ingest]   clone to /tmp/ltseo-{run_id}/
   → asyncio.gather(
         [Prerender] Agent SDK loop                    # reads local disk
                     → /tmp/ltseo-{run_id}/seo/        # local scratch only
                       index.html (markup + inlined CSS + assets/)
         [Diagnose]  httpx → Peec REST (3 in parallel) # hits network
     )                                                  # run concurrently
   → [Analyze]  pure Python decision table → ActionItem list
   → [Enhance]  Agent SDK loop
                → edits /tmp/ltseo-{run_id}/seo/index.html in place
                → writes seo/robots.txt, seo/sitemap.xml
   → [Ship]     read /tmp/ltseo-{run_id}/seo/* off disk
                strip "seo/" prefix → publish at repo ROOT on main:
                  index.html, robots.txt, sitemap.xml, assets/
                GitHub Git Data API → blobs → fresh tree (no base_tree)
                → fast-forward main
   → RunResult { commit_url, commit_sha, run_id }
```

`seo/` is local scratch only — it never appears on the remote. Ship replaces `main` entirely (one-way migration; original React source stays in the parent commit and is recoverable via `git revert HEAD`).

```bash
# Spin up
cp .env.example .env   # add ANTHROPIC_API_KEY + GITHUB_TOKEN
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../anton && npm install      # one-time, ~30s

# Dry run (no GitHub push, uses fixture Peec data)
curl -X POST localhost:8000/run/sync \
  -H "Content-Type: application/json" \
  -d '{"github_repo_url":"https://github.com/owner/repo",
       "peec_project_id":"demo","own_brand_id":"br_attio","push":false}'

# Full end-to-end run
python3 research/orchestrate.py \
  --domain attio.com \
  --project-id or_<your-project-id>
```

Useful flags: `--country DE`, `--skip-prompts`, `--prompts-from prompts.json`, `--skip-research results.json`, `--wait-seconds 90`, `--no-snapshot`, `--no-mcp`, `--dry-run`.

The Peec project must already exist in the dashboard — there's no `POST /projects` endpoint.

---

## Modules

| File | Purpose |
|---|---|
| `peec-onboarder/research/profile.py`      | Stage 0b: deep self-profile (Tavily ×9 + Anthropic synthesis → 15-field profile) |
| `peec-onboarder/research/discover.py`     | Stage 1+2: Tavily 3-approach discovery + consensus + Anthropic validation |
| `peec-onboarder/research/normalize.py`    | Stage 2: 5-step normalization (parent/child, canonical, dedupe, why backfill) |
| `peec-onboarder/research/anton_runner.py` | Stage 3+4: subprocess wrapper around Anton's TS prompt-gen pipeline |
| `anton/scripts/prompts.ts`                | Stage 3+4 entry: DataForSEO + Curator + Sub-agents + Aggregator |
| `peec-onboarder/research/push.py`         | Stage 5: Peec REST writes (wipe-and-replace) |
| `peec-onboarder/research/snapshot.py`     | Stage 7: 17 REST endpoints → unified snapshot |
| `peec-onboarder/research/mcp_client.py`   | Stage 7: MCP OAuth + `get_actions` + `get_project_profile` |
| `peec-onboarder/research/orchestrate.py`  | End-to-end CLI tying all stages together |

---

## Known constraints

- **No `POST /projects`** — projects must exist in the Peec dashboard before this runs
- **Actions are MCP-only** — REST has zero coverage for the recommendations layer; we use both transports
- **Wipe-and-replace** — every run deletes existing competitor brands and prompts. The own brand is updated in place to preserve `is_own=true`
- **Cold-start models** — Microsoft Copilot scrapes ~24h after prompt creation; first snapshot misses it. Other 6 engines populate within ~60s.

---

## Reference

- [`peec-onboarder/examples/snapshot_attio_2026-04-25.json`](peec-onboarder/examples/snapshot_attio_2026-04-25.json) — full real snapshot for reference
