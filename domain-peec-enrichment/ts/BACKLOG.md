# Backlog — improvements not built yet

Items below are scoped, partly researched or partly tested, and ready to pick up. Listed in rough priority order.

## 1. People Also Ask integration (tested, ready to wire)

**Status**: probed against live DFS, response shape verified, cost confirmed.

**Endpoint**: `POST serp/google/organic/live/advanced` with `{keyword, location_code, language_code, depth: 10}`. The response includes a `people_also_ask` item containing 0-4 questions per keyword.

**Empirical results from 4 test keywords**:
- Hit rate ~75% (comparison-style queries like "X vs Y" often have no PAA block)
- 3-4 PAA per hit when present
- Quality is mostly on-topic; occasional Google quirks ("Is Microsoft Word a CRM?", off-topic tax-law tangents)
- Cost: $0.002 per keyword. For 18 curated keywords ≈ **$0.036 per run** for ~47 real awareness questions.

**Why valuable**: PAA questions are real human-typed queries with answer-engine surface coverage. Better trust signal than LLM-generated awareness prompts. They *augment* (not replace) the Sonnet sub-agent output.

**Implementation sketch**:
1. New file `src-prompts/paa.ts`. Function `fetchPaaForKeywords(keywords: string[], opts): Promise<PaaQuestion[]>`.
2. Reuse `src-competitors/client.ts` `dfsPost` for auth + error mapping.
3. Filter response: keep only `items.find(i => i.type === 'people_also_ask').items[].title`.
4. In `src-prompts/index.ts`, after curator picks the 18 viable keywords, fan out PAA fetches in parallel (concurrency=5 is fine for DFS).
5. Convert each PAA into `GeneratedPrompt { bucket: 'awareness', source_keyword, source: 'paa' }` with a synthetic hypothesis.
6. Feed PAA prompts into the aggregator pool alongside Sonnet output. The Opus aggregator already filters tangents.

**Estimated scope**: ~80 lines of code + ~30 lines of tests.

## 2. Brand-eval bucket (the missing 13%)

The bucket distribution target is 60/27/13. Brand-eval (13%) is currently 0 because we never inject `<our_brand> vs <competitor>` prompts.

**Why deterministic, no LLM needed**:
- Inputs: `ourBrand: string` (the brand name), `competitors: string[]` (already in `AggregatedIntel`)
- For each top N competitors (default 4), emit one prompt: `${ourBrand} vs ${competitor}` and one `${competitor} alternatives`
- Tag bucket: `brand-eval`

**Implementation sketch**:
- Add `ourBrand?: string` to `GenerateOpts`
- New file `src-prompts/brand-eval.ts` with a pure function `buildBrandEvalPrompts(ourBrand, competitors): GeneratedPrompt[]`
- Append to the prompt list before the aggregator (or after — aggregator will preserve them since they're tagged `brand-eval`)

**Estimated scope**: ~30 lines.

## 3. Related Searches expansion

Same DFS endpoint as PAA returns a `related_searches` block with 5-10 Google-suggested related queries per keyword. Free side-channel from any PAA call (no extra cost).

**Implementation**: when adding PAA, also extract `items.find(i => i.type === 'related_searches').items[]`. Treat as additional seed keywords (commercial intent assumed) before the next pipeline run, OR feed directly into the prompt aggregator as candidate consideration prompts after a `Best ${term}` template.

## 4. Multi-term DFS topic filter

Currently `--must-contain` accepts only a single LIKE term because DFS doesn't reliably accept nested OR groups in `filters`. Workaround: do N separate `fetchRankedKeywords` calls (one per term) and union client-side.

**Trade-off**: linear cost increase per term. For 3 terms × 5 competitors that's 15 DFS calls instead of 5 (~$0.30 vs ~$0.10). Worth it when a category needs disambiguating (e.g. "CRM" + "sales pipeline" + "deal management" together).

**Code location**: `src-competitors/endpoints.ts` `fetchRankedKeywords` already accepts `mustContainAny: string[]` but only uses `[0]`. Replace with a Promise.all loop, then de-dupe results by keyword string.

## 5. Pre-cluster keywords before sub-agents

Currently "crm software", "customer relationship management software", "crm tools" each spawn separate Sonnet sub-agents and produce variants of the same prompts. The Opus aggregator catches the dupes downstream, but we waste sub-agent calls.

**Approach**: cluster aggregated keywords by stem (or by simple lemma) before passing to sub-agents. One sub-agent per cluster, given the cluster representative + the variant list. Cuts sub-agent count by ~30-40%.

**Trade-off**: can lose specificity. The variants sometimes carry useful semantic differentiation ("crm tools" implies a different intent than "crm software platform"). Stem-cluster carefully.

**Code location**: new file `src-prompts/cluster.ts`, called in `index.ts` between curator and sub-agents.

## 6. AI Overview tracking (for stage 4 visibility, not stage 2)

The SERP-advanced endpoint also returns an `ai_overview` block when Google's AI Overview is rendered for that query (~80% of our test queries). Includes the answer text and the cited source URLs.

**Why deferred**: this is downstream value (stage 4 visibility analysis), not stage 2 prompt generation. But if we already paid for the SERP call (PAA item 1 above), we get this data for free. Stash it in `AggregatedIntel.serpExtras` for stage 4 to consume later.

## 7. Per-domain DFS cache

Current cache key is `competitors.sort().join(',')` plus settings. Adding 1 competitor invalidates the entire cache. A per-domain cache (`{domain}__{settings}.json`) lets us add competitors incrementally without re-fetching the others.

**Trade-off**: more cache files, more disk reads on warm runs. Tiny win unless the caller iterates on the competitor list often.

## 8. Localization beyond country code

The pipeline takes `location_code` (e.g. 2276 for DE) and `language_code` (`de`) but our prompt templates and the LLM system prompts are hardcoded English. For the German Revolut / Japanese TwoBreath examples we found in real Peec data, prompts must be in the local language.

**Approach**: detect language from the imported Lovable site's `<html lang>` attr and meta tags during stage 1. Pass through `AggregatedIntel.languageCode` to the sub-agents. Adapt the system prompts to ask for prompts in `${languageCode}` instead of English.

**Code location**: `src/detector.ts` for detection, `src-prompts/subagent.ts` and `aggregator.ts` for system-prompt parameterization.

## 9. Domain Intersection endpoint

`dataforseo_labs/google/domain_intersection/live` takes 2-3 domains and returns keywords ALL of them rank for, server-side. Could replace our client-side `aggregate.ts` consensus calculation.

**Trade-off**: limited to 2-3 domains per call. For 5+ competitors we'd need to chain calls or stick with client-side. Probably not worth the refactor unless competitor sets always stay ≤3.
