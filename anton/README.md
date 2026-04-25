# Lovable → SEO/GEO — Keyword & Prompt Pipeline

This module is stages 1 and 2 of a larger pipeline that takes a Lovable.dev project, audits it for AI-search visibility, and rebuilds it for SEO/GEO. The other stages (audit, rebuild, deploy, tracking) are owned by other team members.

This module's job ends with **a list of Peec AI tracking prompts** generated from competitor SEO data. Peec employees paste those prompts into Peec; downstream stages consume the visibility results.

## Pipeline

```
[1] importFromUrl(url)                     stage 1 — done
       ↓ workdir
[2] fetchAggregatedKeywords(competitors)   stage 2a — DataForSEO
       ↓ AggregatedIntel { consensus, outliers }
[3] selectTopKeywords(intel)               stage 2b — score + variety, deterministic
       ↓ 50 candidates
[4] curateKeywords(candidates)             stage 2c — Sonnet, brand-agnostic relevance gate
       ↓ 12 viable seeds + inferred category
[5] generateForKeyword(seed) × N           stage 2d — Haikus, parallel, 3 prompts each
       ↓ ~36 raw prompts
[6] aggregatePrompts(raw)                  stage 2e — Sonnet, semantic dedup + bucket ratio
       ↓ ~25 final prompts
[hand-off] PromptSet JSON / Markdown
```

The curator step (stage 2c) is what makes the system **brand-agnostic**. It infers the category from the keyword pattern, so the same code works for CRM brands, project-management tools, natural-skincare brands, etc. without code changes.

## Setup

```bash
npm install
cp .env.example .env
# Fill in:
#   GITHUB_TOKEN       — public repo access (60 req/hr without, 5000 with)
#   DATAFORSEO_LOGIN   — DFS Basic auth
#   DATAFORSEO_PASSWORD
#   ANTHROPIC_API_KEY  — sub-agents + curator + aggregator
#   GEMINI_API_KEY     — optional alternative LLM provider
```

You can use Gemini instead of Anthropic by passing `--provider=gemini`. Anthropic is the default if `ANTHROPIC_API_KEY` is set; Gemini if only `GEMINI_API_KEY` is set.

## How to use

### Stage 1 — Import a Lovable project

```bash
npm run import -- https://github.com/<owner>/<repo>
```

Or as a function:

```ts
import { importFromUrl } from './src/index.js';
const result = await importFromUrl('https://github.com/owner/repo');
console.log(result.workdir, result.isLovable);
```

### Stage 2 — Fetch keywords + aggregate

```bash
npm run keywords -- atlassian.com asana.com monday.com
```

Or as a function:

```ts
import { fetchAggregatedKeywords } from './src-competitors/index.js';
const intel = await fetchAggregatedKeywords(['atlassian.com', 'asana.com'], {
  keywordLimit: 200,
  locationCode: 2840, // US
  languageCode: 'en',
});
```

### Full pipeline — competitors → prompts

```bash
npm run prompts -- --keyword-limit=200 attio.com hubspot.com pipedrive.com close.com folk.app
```

Or as a function:

```ts
import { fetchAggregatedKeywords } from './src-competitors/index.js';
import { generatePrompts } from './src-prompts/index.js';

const intel = await fetchAggregatedKeywords(competitors, { keywordLimit: 200 });
const set = await generatePrompts(intel);
console.log(set.prompts);
```

### Useful flags

```
--keyword-limit=200    keywords fetched per competitor (default 100)
--candidate-pool=50    keywords passed to the curator
--top-keywords=12      keywords passed to Haiku sub-agents
--prompts-per-keyword=3
--category="CRM software"  optional hint for the curator (it can override)
--must-contain="crm"   DFS-side LIKE filter (cheap relevance pre-filter)
--consensus-only       use only keywords ≥2 competitors rank for
--no-curator           skip the curator (use top-K by score directly)
--no-aggregator        skip the Sonnet dedup step
--provider=gemini      override LLM provider
--fresh                bypass the local DFS cache
```

## Contracts (TypeScript types)

```ts
// stage 1
type ImportResult = {
  jobId: string;
  workdir: string;
  repoMeta: { owner, repo, sha?, sourceUrl };
  isLovable: boolean;
  detectionReasons: string[];
  cached: boolean;
};

// stage 2 — keywords
type AggregatedIntel = {
  jobId: string;
  competitors: string[];
  locationCode: number;
  languageCode: string;
  keywordsByCompetitor: { [domain: string]: RankedKeyword[] };
  consensus: AggregatedKeyword[];   // 2+ competitors rank for it
  outliers: AggregatedKeyword[];    // 1 competitor only
  cached: boolean;
  fetchedAt: string;
  costUsd: number;
};

type AggregatedKeyword = {
  keyword: string;
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional' | null;
  total_volume: number;
  avg_difficulty: number | null;
  ranking_competitors: string[];
  best_position: number;
  count: number;
};

// stage 2 — prompts
type PromptSet = {
  jobId: string;
  competitors: string[];
  prompts: GeneratedPrompt[];
  modelUsed: string;
  generatedAt: string;
  warnings: string[];
};

type GeneratedPrompt = {
  id: string;
  query: string;                        // 1-200 chars; what gets pasted into Peec
  bucket: 'consideration' | 'awareness' | 'brand-eval';
  source_keyword: string | null;
  source_competitors: string[];
  hypothesis: string;
};
```

## Cost per run (rough)

| Step | Cost |
|---|---|
| DFS keyword fetch (5 competitors × 200 keywords) | $0.10–0.15 |
| Curator (1 Sonnet call) | ~$0.01 |
| Sub-agents (~12 Haiku calls in parallel) | ~$0.02 |
| Aggregator (1 Sonnet call) | ~$0.02 |
| **Total per run** | **~$0.15–0.25** |

Cached DFS responses are free on subsequent runs (`.cache/dataforseo/agg_*.json`).

## File layout

```
.
├── src/                          stage 1 — Lovable URL → workdir
│   ├── index.ts                  importFromUrl(url, opts?)
│   ├── resolver.ts               URL → { owner, repo }
│   ├── fetcher.ts                tarball fetch + extract + cache
│   ├── detector.ts               is-this-Lovable check
│   └── types.ts
├── src-competitors/              stage 2a — DataForSEO
│   ├── index.ts                  fetchAggregatedKeywords(competitors[], opts?)
│   ├── client.ts                 Basic-auth wrapper, full error mapping
│   ├── endpoints.ts              fetchRankedKeywords + DFS filters
│   ├── aggregate.ts              consensus/outliers across competitors
│   └── types.ts
├── src-prompts/                  stage 2b-e — keywords → Peec prompts
│   ├── index.ts                  generatePrompts(intel, opts?)
│   ├── select.ts                 deterministic scoring + variety
│   ├── curator.ts                Sonnet — brand-agnostic relevance gate
│   ├── subagent.ts               Haiku — 1 keyword → 3 diverse prompts
│   ├── aggregator.ts             Sonnet — semantic dedup + bucket ratio
│   ├── llm.ts                    provider abstraction (Anthropic | Gemini)
│   └── types.ts
├── scripts/
│   ├── import.ts                 CLI for stage 1
│   ├── keywords.ts               CLI for stage 2a
│   └── prompts.ts                CLI for full pipeline
└── peec-ai-research/             design docs (read these for the why)
    ├── PLAN.md
    ├── strategy.md
    ├── extraction-strategy.md
    ├── generation-strategy.md
    ├── peec-api.md
    ├── peec-prompt-patterns.md
    ├── marketing-skills.md
    ├── skills-deep-analysis.md
    └── agent-design.md
```

## Bucket ratio target

Aiming for the funnel split observed in real Peec data and Peec's own published guidance:

| Bucket | Share | Frame |
|---|---|---|
| Consideration | 60% | "Best X for Y", "Top X tools" |
| Awareness | 27% | "What is X?", "How does X work?" |
| Brand-eval | 13% | "X vs Y" (not yet implemented — deterministic, no LLM needed) |

The aggregator enforces this loosely; data quality wins over hitting an exact ratio.

## v0 limitations

- Public GitHub repos only for stage 1.
- Brand-eval bucket isn't generated yet (would be a deterministic step using competitor list + a brand name).
- DFS `must-contain` filter only supports a single LIKE term (DFS doesn't reliably accept nested OR groups).
- Gemini free-tier hits 429 on parallel sub-agents; system auto-throttles to concurrency=1 for Gemini.
- Tarball cache (stage 1) and DFS cache (stage 2) never expire — pass `--fresh` to refresh.
- DFS Labs API requires account verification at https://app.dataforseo.com/ before any call works.

## Testing brand-agnosticism

The curator step is what makes this work for any brand, not just CRM. To verify, run with completely different industries and watch the curator infer the right category each time:

```bash
npm run prompts -- monday.com asana.com clickup.com notion.so       # → "project management"
npm run prompts -- mailchimp.com convertkit.com beehiiv.com         # → "email marketing"
npm run prompts -- wildcosmetics.com aktlondon.com nativecos.com    # → "natural personal care"
```

The curator outputs its inferred category as a warning in the run output.
