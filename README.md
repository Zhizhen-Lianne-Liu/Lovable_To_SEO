# lovabletoseo

**The AI marketer for Lovable founders.**

Your Lovable app is secretly a React SPA. Google sees an empty `<div id="root">`.
ChatGPT, Perplexity, and Claude have nothing to cite. As far as the AI-search
world is concerned, the page doesn't exist.

`lovabletoseo` clones your Lovable GitHub repo, fixes the technical SEO + GEO
gaps, runs an intelligence pipeline against [Peec AI](https://peec.ai) +
[Tavily](https://tavily.com) + [DataForSEO](https://dataforseo.com), and PRs
the result back so you can keep iterating in Lovable.

> Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**.

**One Lovable repo URL in. A real PR with index/route mutations + JSON-LD +
robots.txt + sitemap.xml, a fully-populated Peec project measuring real AI
visibility, and a structured GEO-insights snapshot — out. In about 4
minutes, all under $0.50.**

The hard parts are (1) finding the right competitors for a brand we've never
heard of, (2) turning real SEO demand into Peec-ready tracking prompts that
actually measure brand visibility in LLM responses, and (3) injecting the
results back into the founder's Lovable codebase using their framework's idiom
so the round-trip into Lovable stays clean. This pipeline solves all three.

---

## The pipeline

```
GitHub repo URL (Lovable)
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. INGEST           git clone + framework detect (vite-react /   │
│                     tanstack-start), Lovable-signature heuristic,│
│                     source-file walk                       ~3s   │
├──────────────────────────────────────────────────────────────────┤
│ 2. AUDIT            12-category technical-SEO scan (title,       │
│                     description, og, twitter, canonical, schema, │
│                     robots, sitemap, headings, alt-text, csr)~1s │
├──────────────────────────────────────────────────────────────────┤
│ 3. PRERENDER        Sonnet renders SPA → single static HTML doc  │
│                     (skippable with --no-prerender)        ~30s  │
├──────────────────────────────────────────────────────────────────┤
│ 4a. Cheap profile   Tavily extract on homepage             ~3s   │
│ 4b. Deep profile    7 own-site URLs + 6 external sources         │
│                     + 1 Anthropic synthesis                      │
│                     → 15-field structured profile          ~15s  │
├──────────────────────────────────────────────────────────────────┤
│ 5. Discover         3 Tavily approaches in parallel              │
│                     A: /research + output_schema                 │
│                     B: 4-channel co-occurrence                   │
│                     C: single-shot answer mining           ~25s  │
│                     + consensus voting + 5-step normalize        │
│                     + Anthropic relevance gate vs deep profile   │
├──────────────────────────────────────────────────────────────────┤
│ 6. SEO keyword data DataForSEO ranked-keywords per                │
│                     competitor → consensus split           ~5s   │
├──────────────────────────────────────────────────────────────────┤
│ 7. Prompt-gen       Curator (Opus) → 18 sub-agents (Sonnet,      │
│                     parallel) → Aggregator (Opus)                │
│                     → 20-50 Peec prompts                   ~55s  │
├──────────────────────────────────────────────────────────────────┤
│ 8. Push to Peec     PATCH own brand, wipe-and-replace            │
│                     competitors + prompts (REST)           ~5s   │
├──────────────────────────────────────────────────────────────────┤
│ 9. Snapshot         17 REST calls + composer → unified GEO       │
│    composition      insights JSON. Coverage filled in            │
│                     ~1h after push.                        ~15s  │
├──────────────────────────────────────────────────────────────────┤
│ 10. Context         Generate `.agents/product-marketing-context  │
│                     .md` from profile + discover + snapshot.     │
│                     Foundation file the next stage's vendored    │
│                     marketing skills read.                  <1s  │
├──────────────────────────────────────────────────────────────────┤
│ 11. Strategy        Compose 4 vendored skills (site-architecture │
│                     + copywriting + ai-seo + schema-markup) into │
│                     one Opus call → per-route directives + global│
│                     JSON-LD + proposed new pages           ~30s  │
├──────────────────────────────────────────────────────────────────┤
│ 12. Apply           Framework-aware code mods INSIDE THE STACK:  │
│                     - vite-react: edit index.html shell          │
│                     - tanstack-start: edit __root.tsx + write    │
│                       src/lovabletoseo/meta.ts                   │
│                     + write public/robots.txt + sitemap.xml      │
│                     + (TanStack) generate src/routes/<path>.tsx  │
│                       for every strategy.newPages item, with     │
│                       per-page meta + FAQPage/Article/Comparison │
│                       JSON-LD + a 4-10 row feature comparison    │
│                       table (or 3-8 h2/p sections for guides)    │
│                     + (TanStack) write src/lovabletoseo/nav.tsx  │
│                       and inject <LovabletoseoNav /> into        │
│                       RootShell so generated pages are reachable │
│                       from a sub-footer on every page    ~5-15s  │
├──────────────────────────────────────────────────────────────────┤
│ 13. Ship            Branch + commit + PR via gh CLI         ~5s  │
├──────────────────────────────────────────────────────────────────┤
│ 14. Report          Markdown brief used as PR body (scorecard,   │
│                     wins/losses, changes shipped, caveats) <1s   │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
PR opened on the founder's repo  +  test3 Peec project populated
```

Total: **~3-4 minutes, ~$0.50 per run**, fully automated from a single GitHub URL. With `--limit`, ~$0.30 in ~3 min and every stage still exercises end-to-end.

### Real run, real artifacts

We ran this end-to-end against
[comodoc/flowmetrics-landing-page](https://github.com/comodoc/flowmetrics-landing-page)
in `--limit` mode. **The artifacts are real, you can click through:**

- **PR opened:** [#2 — lovabletoseo: SEO + GEO fixes](https://github.com/comodoc/flowmetrics-landing-page/pull/2) (118 additions: `__root.tsx` + `src/lovabletoseo/meta.ts` + `public/robots.txt` + `public/sitemap.xml`)
- **Peec project:** test3 → 6 brands + 8 prompts pushed
- **Snapshot at 1h:** 100% coverage, 56/56 chats processed
- **Findings:** FlowMetrics 0% visibility / 0% SoV / rank 4 of 4. HubSpot dominates with 69% SoV.
- **Top-cited URLs the AIs use instead:** HBS blog (108x), SEMrush (33x), Monday.com (27x), Klipfolio's KPI page (26x), HubSpot's glossary (16x).
- **Fanout queries the AIs ran:** "KPIs definition", "examples of KPIs in business", "What are performance indicators in marketing?" — pure GEO targeting evidence.

---

## ⭐ Stage 5 — Tavily 3-approach competitor discovery

The first showpiece. **Three independent Tavily approaches run in parallel,
then vote.** Each approach has a different failure mode; their intersection
is what you trust.

### Why three approaches

A single LLM-generated competitor list is wrong in predictable ways:
- **It hallucinates plausible-sounding domains** that don't exist
- **It defaults to the famous brands** (Salesforce, HubSpot) regardless of scale
- **It confuses parent/subsidiary** (returns Microsoft for a small Office365 plugin)
- **It gets fooled by review aggregators** (returns g2.com as a "competitor")

Each of our three approaches makes a *different* mistake. So if 2 of 3 (or
all 3) agree on a domain, that domain is real, in the right category, and at
the right scale. Disagreement is the signal — not noise.

### Approach A — `/research` with structured output

The most expensive, the most accurate. Single async call to Tavily's
`/research` endpoint with a JSON `output_schema` that forces structured
competitor records back. Polled every 5s for up to 5 minutes. Ground-truth
context block injected in the prompt: brand name, industry, occupation,
audience, products, key differentiators (from the deep self-profile).

**This is the only approach that returns *why* each competitor is relevant**
— used downstream to ground Peec's brand metadata.

**Failure mode:** can hallucinate credible-but-fake domains; no built-in
dedup against review aggregators.

### Approach B — Multi-channel co-occurrence scoring

Four parallel `/search` calls covering distinct facets of "competitor",
regex-extract domains from each LLM-generated answer, score by weighted
channel agreement.

The four channels and their weights:

| Channel | Weight | Query (deep-profile-grounded) |
|---|---|---|
| `vs` | **3** | "What companies compete head-to-head with {brand} in {category}? Include their domains." |
| `alternatives` | **2** | "What are the top alternatives to {brand} in {category} for {audience}? List companies with their websites." |
| `category` | **1** | "Who are the leading companies in {category}? List with domains." |
| `buyers` | **1** | "If a buyer evaluating {brand} wanted to shortlist options, which companies and domains would they consider?" |

The `vs` channel gets the highest weight because head-to-head queries are
the cleanest signal for *direct* competition — alternatives lists are
noisier, category lists broader still.

For each Tavily response, regex-extract domains from the answer text:

```ts
const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|app|de|fr|uk|tech|org|tv|gg))\b/g;
const JUNK = new Set(["wikipedia.org", "youtube.com", "reddit.com", "linkedin.com",
                      "g2.com", "capterra.com", "github.com", "amazon.com", ...]);
```

Each domain's score is the sum of channel weights where it appeared. A domain
in all four channels scores 3+2+1+1 = **7** (max). A domain only in `category`
scores **1** (likely noise). Ranked by `(-score, -channel_count)`.

**Failure mode:** regex extraction is lossy — misses brand names without
`.com` in the answer text. Reddit / forum answers can pollute. The
junk-domain blacklist is hand-curated.

### Approach C — Single-shot answer mining

Cheapest and fastest. One `/search` call with `include_answer="advanced"`,
regex domain extraction from the synthesis answer. The
`include_answer="advanced"` tells Tavily to use a stronger synthesis model
on the retrieved sources. Same regex extractor as B, with review-domain
filter (g2, capterra, trustradius, softwareadvice).

**Failure mode:** thin — depends entirely on whichever sources Tavily
happened to retrieve for that one query.

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

After all three return, a vote count tallies how many approaches found
each domain:

```ts
const votesByDomain = new Map<string, number>();
for (const approachResults of [aPicks, bPicks, cPicks]) {
  for (const c of approachResults) {
    votesByDomain.set(c.domain, (votesByDomain.get(c.domain) ?? 0) + 1);
  }
}
const consensus = [...votesByDomain.entries()]
  .sort(([, va], [, vb]) => vb - va)
  .slice(0, 30);
```

Then 5 normalization steps clean the list before Anthropic's relevance gate:

1. **Parent/child fold** — hardcoded `PARENT_OF` map (`mi.com → xiaomi.com`,
   `redmi.com → xiaomi.com`, `honor.com → huawei.com`). Sums votes across
   merged entries.
2. **Canonical name enrichment** — Pass 1: strip "CRM", "Inc.", "GmbH",
   "Software", "Platform" via regex from A's names. Pass 2: one batch
   Tavily `/research` call returns `{domain, canonical_name}` for the rest.
3. **Dedupe by canonical name** — case-insensitive. Higher-voted entry
   wins; loser's votes get added.
4. **`why_relevant` backfill** — one batch `/research` call covers all
   candidates missing the field.
5. **Final ranking** — consensus (votes ≥ 2) first, then A's picks, then
   single-vote candidates. Capped at 15.

Then a single Anthropic call validates the top 15 against the deep self-profile:

> "Given this brand profile, classify each of these 15 candidates as a TRUE
> direct competitor or NOT. Drop: parent companies, customers, vendors,
> adjacent-but-different categories, vastly larger or vastly smaller
> players. Return one verdict per candidate."

Verdicts persist on each candidate as `validated: true|false` +
`validation_reason` (audit trail). Final list: validated ones first, fill
from rejected up to 10 if needed.

The deep self-profile (stage 4b) is what makes this gate work. Without it,
the validator has nothing to compare against.

---

## ⭐ Stage 6+7 — Translating SEO data into Peec prompts

The second showpiece. **We turn real Google ranking data into Peec tracking
prompts that measure brand visibility in LLM responses.**

### Why "translation," not "copy"

Google search keywords and LLM prompts are different shapes:

| | Google search | LLM prompt |
|---|---|---|
| Form | 2-4 word fragment | Full sentence, conversational |
| Example | `best crm small business` | `What's the best CRM for a 20-person B2B sales team?` |
| Specificity | Low (Google fills in intent) | High (you have to spell it out) |
| Brand surface | Competitor names common | Brands NEVER named |

A naive pipeline (`for keyword in keywords: peec.create_prompt(keyword)`)
breaks Peec scoring entirely. Peec runs each prompt across 7 LLM engines
daily — those engines respond very differently to fragments vs questions vs
imperatives. You need the *prompt shape* that reflects how a real buyer
actually queries an AI.

So the question becomes: **how do we re-clothe a Google demand signal in
LLM-native phrasing, without losing the demand signal?**

### Step 1 — DataForSEO ranked keywords

For each of the ~10 competitor domains (parallel):

```typescript
POST https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live
{
  "target": "hubspot.com",
  "location_code": 2840,        // US
  "language_code": "en",
  "limit": 30,                   // (or 10 with --limit)
  "filters": [
    ["keyword_data.keyword_info.search_volume", ">", 200],   // drop micro-noise
    "and",
    ["ranked_serp_element.serp_item.rank_absolute", "<=", 30] // drop page 3+ accidents
  ],
  "order_by": ["keyword_data.keyword_info.search_volume,desc"]
}
```

Returns keywords each competitor *actually ranks for* on Google today, with
`volume`, `cpc`, `intent`, `keyword_difficulty`, `serp_position`. Cached at
`.cache/dataforseo/agg_{hash}.json` so re-runs are free.

The two filter thresholds matter:
- **`search_volume > 200`** — drops keywords no real human searches for. The
  long tail below 200 is mostly noise: typos, tracker queries, internal tool
  searches.
- **`rank_absolute <= 30`** — drops "accidental" rankings on page 3+. If a
  competitor ranks position 47 for some keyword, they're not actually
  competing for it.

Together, these filters yield only keywords that are (a) real demand and (b)
the competitor is actually fighting for.

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
- **`consensus`**: `count >= 2` — keywords ≥2 competitors rank for. This IS
  the category.
- **`outliers`**: `count == 1` — keywords only one competitor ranks for.
  Either noise OR a competitor's idiosyncratic content angle.

The consensus split is the key insight. **If 4 competitors rank for "best
crm for small business", that IS the category.** If only Salesforce ranks
for "enterprise sales engagement platform with quote-to-cash", that's a
Salesforce-specific marketing angle, not a market battleground.

### Step 3 — `selectTopKeywords` (deterministic)

Sorts consensus first by `(-count, -total_volume)`, picks top 60 candidates
to feed the LLM stage. Variety stratification reserves 30% of slots for
long-tail (4+ words), per-competitor exclusives, and informational-intent
backfill.

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
2. **REJECT**: branded keywords (just a competitor name), content-marketing
   noise (email etiquette templates, motivational quotes, generic business
   writing tips), off-topic
3. **KEEP**: head + long-tail mix, commercial + informational mix,
   persona/use-case variety

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

Why Opus, not regex? Opus distinguishes "crm vs salesforce"
(competitor-eval keyword, *good*) from "salesforce certification cost"
(brand-trivia, *bad*). Same surface keyword shape, very different commercial
value. That's the kind of judgment a deterministic filter can't make.

The `inferred_category` becomes a hard prior for the next stage.

### Step 5 — Sub-agents (Sonnet × 5 parallel) — the translators

This is where the actual SEO → prompt translation happens. Slice to 18
seeds, then **one Sonnet call per seed keyword**, 5 in parallel.

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

The sub-agent doesn't just see the keyword string. It sees the **commercial
evidence**:
- `intent: commercial` → bias toward `consideration` frame, not awareness
- `competitors_ranking: 4` → category-defining query, prompts should be
  category-positioned not niche
- `total_volume: 49500` → calibrates how generic vs specific to be
  (high-volume head term → narrow with persona; low-volume long-tail →
  keep close to original)

**The 6 hard rules each sub-agent follows.** Each one defends against a
specific failure mode:

| # | Rule | What it defends against |
|---|---|---|
| 1 | **Category gate** — if the keyword isn't actually about the inferred category, return `{prompts: []}` | DataForSEO returns *every* keyword a competitor ranks for, including their HR pages and brand-trivia |
| 2 | **Imperative noun phrases > questions** ("Best CRM for X" beats "What's the best CRM for X?") | Matches how buyers actually query LLMs. Imperatives produce more direct responses → easier brand attribution |
| 3 | **NEVER include a brand name** | Peec measures *which brand the LLM mentions unprompted*. Naming a brand biases the metric to ~100% |
| 4 | **Add ONE persona or constraint per prompt** ("Best CRM for music agencies" not "Best CRM") | Generic prompts return generic answers (always the top 3 brands). Specificity surfaces real visibility variance |
| 5 | **Cover ≥2 frames per keyword** (mix awareness + consideration) | Single-frame prompts under-sample the buyer journey |
| 6 | **40-90 char target, max 200** | Below 40: too generic. Above 200: LLM responses fragment, harder to parse for brand mentions |

18 seeds × 4 prompts = **~72 raw candidates**. Concurrency=5 keeps wall
time around 30s. Then exact dedup (lowercase, strip punctuation, collapse
whitespace) → ~65 candidates.

### Step 6 — Aggregator (Opus, single call) — semantic dedup + ratio

Receives all ~65 candidates as a numbered list. Single Opus call. System
prompt asks Opus to:
1. **Collapse semantic duplicates** — `"best CRM for small business"` and
   `"top CRM tools for small companies"` are the same query. Keep one.
2. Tiebreak: specific > generic, imperative > question, 40-90 chars preferred
3. **Enforce bucket ratio**: 60% consideration, 27% awareness, 13% brand-eval
4. **Final count**: 20-50 (20 minimum unless input was smaller, 50 max if
   all distinct)

Why two passes of dedup (exact then semantic)? Exact dedup catches `"best
CRM software"` vs `"Best CRM software."`. It does NOT catch `"best CRM for
small business"` vs `"top CRM tools for small companies"`. Those are
semantically identical and would dilute Peec's measurement. Only an LLM
with full-list context can decide what's redundant.

### The funnel math

```
10 competitors × 30 ranked keywords (or 10 with --limit)
                  ↓ aggregate + dedupe
                                              ~120-200 unique keywords
                  ↓ split
                                              consensus (~30) + outliers (~120)
                  ↓ selectTopKeywords (consensus first + variety stratification)
                                              60 candidates → LLM
                  ↓ Curator (Opus, 1 call)
                                              15-25 seeds + inferred category
                  ↓ slice
                                              18 seeds (or 5 with --limit)
                  ↓ Sub-agents (Sonnet × 5 parallel, 1 call each)
                                              ~72 raw prompts
                  ↓ exact dedup
                                              ~65 candidates
                  ↓ Aggregator (Opus, 1 call)
                                              20-50 final prompts → Peec
```

**Total prompt-gen LLM calls:** 1 curator + 18 sub-agents + 1 aggregator = **20 calls**
(or **7 calls** with `--limit`)
**Wall time:** ~55-90s (or ~25s with `--limit`)
**Cost:** ~$0.30-0.50 per run (~$0.15 with `--limit`)

### Why this beats the obvious alternatives

| Alternative | Problem |
|---|---|
| `for k in keywords: peec.create_prompt(k)` | Wrong shape. Google fragments don't trigger the LLM response patterns Peec measures against. |
| Ask GPT "give me 30 prompts about CRMs" | No grounding in real demand. Generic. |
| Use Ahrefs keyword expansion | Returns SEO long-tails, not buyer-question phrasings. Wrong shape. |
| Single LLM call with all 200 keywords + "generate prompts" | Loses signal in a wall of text. No bucket discipline. Heavy semantic duplication. |
| Hand-craft prompts | Doesn't scale. Doesn't update as the market shifts. |

What this pipeline does instead: **let real Google rankings define the
category, let Opus gate relevance, let parallel Sonnet sub-agents force
angle diversity, let Opus dedup at semantic level**. Every step has a
specific failure mode it's defending against.

---

## Stage 8 — Push to Peec (wipe-and-replace)

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

The own brand is updated *in place* (PATCH, not delete-and-recreate) so it
keeps `is_own=true`. Competitor colors cycle through 8 fixed hex values.
Country code on prompts auto-derived from input domain TLD.

A 2-second sleep between competitor delete and create batches dodges Peec's
metric-recalc race window — without it, ~5% of new brands come back with
ghost visibility from the just-deleted predecessor.

---

## Stage 9 — Snapshot composition

Peec is async/schedule-driven, but in practice prompts start running within
minutes — not the documented 24h. The default `--wait-peec 90` captures
partial coverage in the same run; full coverage typically lands in ~1 hour.
For the FlowMetrics demo run we hit **100% coverage (56/56 chats) at the 1h
mark**.

For ongoing tracking, run `lts snapshot --project-id <id>` hours/days later
to capture fuller coverage **without paying for a full run** (no LLM, no
GitHub).

### REST endpoints called

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
| Actions | `POST /actions` | MCP-only; degrades to `[]` on REST 404 |

### Output schema

The composer produces one JSON artifact per run:

```
meta                  project + brand list + coverage stats
scorecard             visibility / SoV / sentiment / position per brand, with rank
engine_breakdown      per-model gap (which AI engines have us behind)
prompt_breakdown      per-prompt strengths/weaknesses, weakness/winning flags
actions               prescriptive recommendations (MCP-only; [] on REST)
gap_targets           domains + URLs where competitors are cited but we aren't
owned_audit           our URLs working in AI search + classification mix
fanout_queries        actual search queries the LLMs used internally
url_contents          scraped markdown of top 10 gap URLs (for the rewriter stage)
diagnostics           5 wins (own brand at position 1-5) + 5 misses (competitor-only)
```

Threshold definitions baked in:
- `weakness_flag` = `own_visibility < 0.3`
- `winning_flag` = `own_visibility >= 0.7 AND own >= top_competitor`
- Outreach tier: HIGH ≥ 0.2, MEDIUM ≥ 0.08, LOW < 0.08

---

## Stage 10–11 — Context document + skill-driven strategy

Stage 9's snapshot answers "where are we losing?". Stage 11 answers "what
do we ship to start winning?" — but it can't run cold; it needs the brand
voice and the GEO evidence as a single, structured input.

**Stage 10** generates that input: `.agents/product-marketing-context.md`,
populated entirely from earlier stages — Brand block + ICP + positioning +
differentiators (from profile), Competitive Landscape table (from discover),
AI Visibility scorecard + per-prompt wins/losses + gap URLs + fanout queries
(from snapshot). 6KB on a real run.

This is the foundation file every vendored marketing skill expects. It
turns each skill from interactive (5–15 setup questions) into autonomous.

**Stage 11** composes 4 vendored [marketing
skills](skills/) — `site-architecture`,
`copywriting`, `ai-seo`, `schema-markup` — into a single Opus system prompt,
then makes one call with the foundation context + audit findings + page
inventory as the user message. Output: per-route directives (title,
description, schema blocks, copy hints) + proposed new pages (e.g.
`/vs/<top-competitor>` when Peec gap evidence supports it) + global JSON-LD
blocks (Organization, WebSite, Product).

Vendored from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
@ `1bcff9fc`. Skills not in the strategy compose pass
(`product-marketing-context`, `seo-audit`, `copy-editing`,
`competitor-alternatives`) are vendored for future expansion — see
[`skills/README.md`](skills/README.md).

---

## ⭐ Stage 12 — APPLY: fix the Lovable site INSIDE its stack

The third showpiece. **We modify the founder's repo using their framework's
own idioms** — not by injecting a foreign DOM mutation. So when they reopen
in Lovable, the result reads as native code they can keep editing.

### Vite + React (classic Lovable)

Strategy: edit `index.html` shell directly, idempotent via marker comments.

```html
<head>
  <meta charset="UTF-8" />
  <!-- lovabletoseo:meta START -->
  <title>...</title>
  <meta name="description" content="...">
  <link rel="canonical" href="...">
  <meta property="og:..." content="...">
  <meta name="twitter:..." content="...">
  <script type="application/ld+json">{...Organization...}</script>
  <script type="application/ld+json">{...WebSite...}</script>
  <!-- lovabletoseo:meta END -->
</head>
```

Existing user `<title>`, `<meta>`, `<link rel=canonical>`, and JSON-LD
`<script>` tags are stripped on apply so our injected block is the single
source of truth. Re-runs replace the block; founder can still freely add
their own meta tags outside the markers.

### TanStack Start (newer Lovable)

Strategy: generate `src/lovabletoseo/meta.ts`, then edit
`src/routes/__root.tsx` to import + spread it into the existing `head()`.

```tsx
// src/routes/__root.tsx — what we produce
import { lovabletoseoMeta, lovabletoseoLinks, lovabletoseoScripts } from "@/lovabletoseo/meta";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // ... founder's existing entries ...
      // lovabletoseo:start
      ...lovabletoseoMeta,    // ← us
      // lovabletoseo:end
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // lovabletoseo:start
      ...lovabletoseoLinks,
      // lovabletoseo:end
    ],
    scripts: [
      // lovabletoseo:start
      ...lovabletoseoScripts, // ← Org + WebSite + Product JSON-LD
      // lovabletoseo:end
    ],
  }),
  // ...
});
```

Plus the colocated managed module:

```tsx
// src/lovabletoseo/meta.ts — auto-generated, regenerated on each run
// lovabletoseo:managed — edit the strategy + re-run rather than editing here.
export const lovabletoseoMeta = [
  { title: "..." },
  { name: "description", content: "..." },
  { property: "og:title", content: "..." },
  // ...
];
```

Idempotency safety:
- Marker comments (`// lovabletoseo:start` / `:end`) wrap the spread blocks,
  so re-runs strip + re-insert without duplication.
- The strip regex uses `\s+` (whitespace only) between marker and
  `...spread` — early version used `[\s\S]*?` which combined with the
  spread-name anchor matched across multiple marker blocks (eating the
  founder's content between meta and links).
- `findMatchingClose` tracks bracket depth while skipping string literals
  and comments — avoids false matches on `]` inside content strings.
- Files are only written when content actually differs, so re-runs on the
  same day are clean no-ops at the git level.
- Verified idempotent across 3 runs on a fresh clone of `elnumae/toseo`.

### What APPLY also writes (any framework)

- `public/robots.txt` — `User-agent: * | Allow: / | Sitemap: <url>`,
  marker-managed for re-runs.
- `public/sitemap.xml` — covers `/`, every strategy.perRoute non-`/`, every
  proposed `newPages`. `lastmod` refreshes day-over-day.

### TanStack: actually building Stage 11's `newPages`

When STRATEGY proposes new pages (`/vs/<competitor>`, `/guides/<topic>`,
etc.) and the framework is TanStack Start, APPLY **generates real route
files** for them — not just sitemap entries. Two more touch points:

- **One LLM call per page** (Sonnet, ~$0.02 each) fills a
  Zod-validated content schema — never free-form TSX. A fixed template
  then renders the schema into a real `src/routes/<path>.tsx` file with:
    - `createFileRoute("/<path>")` + `Route.head()` containing per-page
      title, description, OG, Twitter, canonical, and JSON-LD
    - For `/vs/<x>` and `/compare/<x>`: FAQPage + WebPage-with-comparison
      JSON-LD, plus a 4–10-row feature comparison table with `winner: "us"
      | "them" | "tie"` honesty (model is told to concede ties + losses,
      not paper them over)
    - For `/guides/<topic>`: Article + FAQPage JSON-LD, plus 3–8 H2/p
      sections explicitly shaped to be quote-extractable by AI engines.
      The fanout queries from Peec are passed in as targeting hints — the
      generated content directly answers them.
  Real artifact: [PR #3 on flowmetrics-landing-page](https://github.com/comodoc/flowmetrics-landing-page/pull/3)
  — three full TanStack route files (140-145 lines each) for `/vs/klipfolio`,
  `/vs/databox`, `/vs/cometly` with honest comparison rows like *"Is
  Klipfolio better for agencies? — Yes, Klipfolio's agency plans include
  white-labeling, which FlowMetrics does not currently offer."*

- **Cross-linking sub-footer** is generated alongside. APPLY writes
  `src/lovabletoseo/nav.tsx` exporting `<LovabletoseoNav />` (a discrete
  bottom strip with `<Link>` elements to every generated page, grouped
  by archetype) then injects an import + render block into
  `__root.tsx`'s `RootShell` right before `<Scripts />`. Marker-managed:
    ```tsx
    {children}
    {/* lovabletoseo:nav-start */}
    <LovabletoseoNav />
    {/* lovabletoseo:nav-end */}
    <Scripts />
    ```
  Result: every generated page is reachable from any page on the site,
  AI crawlers traversing internal links pick up the entire set, and the
  founder's primary header in their homepage layout stays untouched.
  Verified rendering on flowmetrics-landing-page: every page (homepage
  + each comparison) emits the sub-footer with TanStack's `data-status="active"`
  + `aria-current="page"` for the current route.

### What APPLY does NOT do

- **No React component edits to existing pages.** The strategy's
  per-component copy recommendations (`hero`, `sections`, `cta`) appear
  in the report so the founder can apply them in Lovable. Auto-editing
  the founder's existing JSX is considered too risky for the round-trip
  preservation guarantee. Component edits to *existing* pages are a v2
  flag — *new* pages are fully generated (see above).
- **Vite + React: no new page files generated.** Page generation is
  TanStack-only in v1. Vite + React projects don't have a clean
  filesystem-routing convention to target. The strategy's `newPages`
  still land as sitemap entries + a "skipped, framework=vite-react"
  reason in `apply.json` so the founder can hand-build them from
  `strategy.json`.

---

## Stage 13 — Ship: round-trip back to GitHub

```bash
git checkout -B lovabletoseo/<short-jobId>
git add -A
git commit -m "lovabletoseo: SEO + GEO improvements"  # subject + body
git push --set-upstream origin lovabletoseo/<short-jobId>
gh pr create --base <default-branch> --head <branch> --title "..." --body "<report.md>"
```

Backend is pluggable (`clients/github.ts`). v1 ships with `gh` CLI —
works immediately if you have push access + `gh auth setup-git` configured.
A `github-app` backend is stubbed for v2 (`@octokit/auth-app` +
`@octokit/rest`) so swapping in real GitHub App OAuth is mechanical.

If APPLY produced no changes, SHIP skips cleanly. If `gh` isn't
authenticated or push is denied, SHIP downgrades to a "skipped" reason in
`ship.json` so the run still produces `report.md`.

---

## Cost & timing per run

| Stage | Latency | Cost (full / `--limit`) |
|---|---|---|
| 1. Ingest | ~3s | free |
| 2. Audit | <1s | free |
| 3. Prerender (skippable) | ~30s | ~$0.05 |
| 4. Profile (Tavily ×9 + Anthropic ×1) | ~17s | ~$0.02 + 9 Tavily credits |
| 5. Discover (Tavily 3-approach) | ~25s | ~15 Tavily credits |
| 5. Normalize + validate | ~10s | ~$0.01 |
| 6. DataForSEO ranked keywords | ~5s | ~$0.05–0.10 |
| 7. Prompt generation (1 Opus + 18 Sonnet + 1 Opus) | ~55s | ~$0.30 / ~$0.10 |
| 8. Peec push | ~5s | free (REST) |
| 9. Wait + snapshot (17 REST + composer) | 90s + ~15s | free |
| 10. Context + 11. Strategy (1 Opus) | <1s + ~30s | ~$0.05 |
| 12. Apply | <1s | free |
| 13. Ship (gh CLI) | ~5s | free |
| 14. Report | <1s | free |
| **Total (full)** | **~4 min** | **~$0.50 + 24 Tavily credits** |
| **Total (`--limit`)** | **~3 min** | **~$0.30 + 24 Tavily credits** |

---

## Quickstart

### 0. Prereqs

- Node ≥ 20
- `gh` CLI authenticated (`gh auth login` + `gh auth setup-git`)
- API keys (see `.env.example`):
  - `ANTHROPIC_API_KEY` — required, for the LLM stages
  - `TAVILY_API_KEY` — required, for profile + discover
  - `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` — required, for keywords
  - `PEEC_API_KEY` (company-scoped `skc-...`) + `PEEC_PROJECT_ID` — required, for push + snapshot

### 1. Install

```bash
git clone https://github.com/serg0x/peec-lovable-seo-geo
cd peec-lovable-seo-geo
npm install                # installs packages/core + apps/api workspaces
cp .env.example .env       # fill in your keys
```

### 2. Run the pipeline

Full run (10 final competitors / 30 keywords / 20+ prompts; ~$0.50 / ~4 min):

```bash
npx tsx packages/core/src/cli.ts run --repo https://github.com/<you>/<lovable-repo>
```

Limited run (~$0.30 / ~3 min — exercises every stage with reduced fan-out):

```bash
npx tsx packages/core/src/cli.ts run --repo <url> --limit
```

Useful flags:

- `--domain <domain>` — override the auto-derived `<repo-name>.lovable.app`. Use this if your site is on a custom domain or different lovable subdomain.
- `--no-prerender` — skip the static-render Sonnet call. Saves ~$0.05 + ~30s. APPLY still runs.
- `--wait-peec <seconds>` — sleep after the Peec push before snapshot, so the scheduler has time to start running prompts. Default 90. Pass `0` to skip.
- `--dry-run` — skip Peec push + the GitHub PR. Local artifacts only.

Each run writes to `runs/<date>-<jobId>/`:

```
inventory.json    audit.json     prerender.json
profile.json      discover.json  keywords.json
prompts.json      peec-push.json peec-snapshot.json
strategy.json     apply.json     ship.json
product-marketing-context.md     report.md
prerender/index.html
```

### 3. Pull a fresh Peec snapshot later

Peec keeps running prompts after the initial push. To capture fuller
coverage hours/days later **without paying for a full run**:

```bash
npx tsx packages/core/src/cli.ts snapshot --project-id or_<your-project> --days 7
```

Outputs `peec-snapshot.json` + `report.md` (scorecard, wins/losses, gap
URLs, fanout queries) in a fresh `runs/<date>-snapshot-<id>/` dir. No LLM
calls.

### 4. Demo landing (optional)

The marketing landing for the project lives at
[`apps/landing/`](apps/landing/) (vendored from
[elnumae/toseo](https://github.com/elnumae/toseo), refreshed). The Hero
form posts to `/api/scan` which is served by [`apps/api/`](apps/api/) — a
small Hono server returning the baked example run from
`examples/founder-mvp/baked-scan.json`.

```bash
# Terminal 1 — Hono backend
cd apps/api && npm run dev          # http://localhost:3001

# Terminal 2 — landing
cd apps/landing && bun install      # first time only
bun dev                              # http://localhost:5173
```

Paste any URL on the landing → see real diagnosis numbers (HubSpot 69% SoV,
FlowMetrics 0%, etc.) and the real PR diff from the flowmetrics run.

---

## Workspace layout

```
.
├── packages/
│   └── core/                        # the pipeline (npm workspace)
│       └── src/
│           ├── cli.ts                # `lts run` + `lts snapshot`
│           ├── pipeline/01–14*.ts    # the 14 stages
│           ├── clients/              # tavily, dataforseo, peec, llm, github
│           ├── lovable/              # framework-aware code mods (vite + tanstack)
│           ├── lib/domain.ts
│           ├── config/env.ts         # Zod-validated, fail-fast
│           ├── types/index.ts        # single source of truth, all Zod
│           └── scripts/              # smoke-{enrich,codemods,llm}, validate-smoke
├── apps/
│   ├── api/                         # Hono server for the landing demo
│   └── landing/                     # vendored toseo landing (Bun, separate from npm workspace)
├── skills/                          # vendored from coreyhaines31/marketingskills @ 1bcff9fc
├── docs/
│   ├── peec-research/               # design docs (analysis of 385 real Peec prompts, generation strategy, skills mapping)
│   ├── ARCHITECTURE.md
│   ├── GEO_PRINCIPLES.md
│   └── POSITIONING.md
└── examples/
    └── founder-mvp/baked-scan.json  # what /api/scan returns in DEMO_MODE=baked
```

---

## Modules

| File | Purpose |
|---|---|
| `packages/core/src/pipeline/01-ingest.ts` | clone repo + framework + Lovable detect + source walk |
| `packages/core/src/pipeline/02-audit.ts` | 12-category technical-SEO scanner |
| `packages/core/src/pipeline/03-prerender.ts` | Sonnet renders SPA → static HTML doc |
| `packages/core/src/pipeline/04-profile.ts` | deep self-profile (Tavily ×9 + Anthropic synthesis → 15-field profile) |
| `packages/core/src/pipeline/05-discover.ts` | Tavily 3-approach discovery + consensus + 5-step normalize + Anthropic validation |
| `packages/core/src/pipeline/06-keywords.ts` | DataForSEO ranked-keywords + consensus split + cache |
| `packages/core/src/pipeline/07-prompts.ts` | Curator (Opus) → Sub-agents (Sonnet ×N parallel) → Aggregator (Opus) |
| `packages/core/src/pipeline/08-peec-push.ts` | Peec REST writes (wipe-and-replace, 2s recalc-race sleep) |
| `packages/core/src/pipeline/09-peec-snapshot.ts` | 17 REST endpoints → unified snapshot |
| `packages/core/src/pipeline/10-context.ts` | `.agents/product-marketing-context.md` generator |
| `packages/core/src/pipeline/11-strategy.ts` | 4-skill compose → per-route directives + JSON-LD + newPages |
| `packages/core/src/pipeline/12-apply.ts` | framework-aware code mods (vite-react / tanstack-start) |
| `packages/core/src/pipeline/13-ship.ts` | gh CLI branch + commit + PR (GitHub App backend stubbed) |
| `packages/core/src/pipeline/14-report.ts` | Markdown brief used as PR body |
| `packages/core/src/lovable/inject-meta.ts` | Vite+React `index.html` shell mutation (idempotent markers) |
| `packages/core/src/lovable/inject-tanstack.ts` | TanStack Start `__root.tsx` + colocated `meta.ts` |
| `packages/core/src/lovable/generate-pages-tanstack.ts` | TanStack route file generation (one Sonnet call per `newPages` item, fills a Zod schema, fixed TSX template renders to `src/routes/<path>.tsx` with full per-page meta + JSON-LD) |
| `packages/core/src/lovable/inject-tanstack-nav.ts` | Cross-linking sub-footer: writes `src/lovabletoseo/nav.tsx`, injects `<LovabletoseoNav />` into `__root.tsx`'s `RootShell` between `{children}` and `<Scripts />` (marker-managed) |
| `packages/core/src/lovable/files.ts` | robots.txt + sitemap.xml writers |

---

## Honest caveats

- **APPLY v1 only mutates the shell** (meta tags + JSON-LD via `index.html`
  for vite-react, or `__root.tsx` + colocated `meta.ts` for tanstack-start).
  Next.js + Astro projects still get `robots.txt` + `sitemap.xml`; their
  `<head>` content needs to be applied to the framework's layout component
  manually. The strategy output in `strategy.json` tells you exactly what
  to paste.
- **APPLY v1 doesn't edit React component copy.** The `strategy.copy.*`
  fields appear in the report so the founder can apply them in Lovable.
  Auto-editing JSX is considered too risky for the round-trip guarantee.
- **SHIP uses the local `gh` CLI**, not a GitHub App. Works immediately if
  you have push access to the target repo and `gh auth setup-git` has been
  run. `clients/github.ts` has the swap point for a real GitHub App
  backend.
- **Peec is async.** First snapshot in the same run captures partial
  coverage (the `--wait-peec 90` default helps). Run `lts snapshot` again
  hours later for fuller data. Documented at ~24h lag; in practice we hit
  100% coverage in ~1 hour for an 8-prompt × 7-engine project.
- **DataForSEO Labs requires account verification.** If you see status
  code `40104` / `NOT_VERIFIED`, complete verification at
  [app.dataforseo.com](https://app.dataforseo.com).
- **MCP overlay deferred.** The Python prototype had an OAuth-gated Peec
  MCP client for `get_actions` recommendations; v1 uses REST only. Snapshot
  gracefully returns `[]` when the actions endpoint 404s.

---

## Smoke tests

Three scripts under `packages/core/src/scripts/`:

```bash
# Verify Anthropic key + SDK wiring (one cheap Haiku call)
npx tsx packages/core/src/scripts/smoke-llm.ts

# Run profile + discover only on a real domain (Tavily live, ~$0.05)
npm run smoke:enrich -- forgent.ai

# Run INGEST + AUDIT + APPLY on a local repo (no LLMs, no API spend)
npm run smoke:codemods -- /path/to/cloned-lovable-repo
```

---

## License + credits

MIT. See [LICENSE](LICENSE).

Built on top of:
- [Peec AI](https://peec.ai) — AI-visibility tracking + buyer-query data
- [Tavily](https://tavily.com) — search + extract + research
- [Anthropic Claude](https://anthropic.com) — Sonnet 4.6 + Opus 4.7 + Haiku 4.5
- [DataForSEO](https://dataforseo.com) — ranked-keyword data
- [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — vendored marketing skills
- [elnumae/toseo](https://github.com/elnumae/toseo) — vendored landing page
- Lovable — the apps we make discoverable

Built this weekend at the [Big Berlin Hack](https://luma.com/bigberlinhack?tk=XT3KOJ).

\#BuiltWithPeec
