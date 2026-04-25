# For the next Claude — handoff guide

You are picking up a hackathon project. Anton built stages 1 and 2 of a pipeline that takes a Lovable.dev project URL and produces a list of Peec AI tracking prompts. Your colleague (whoever invoked you) is now extending this further. Read this file and `README.md` first; they are the fastest path into context.

## What's done

| Stage | Module | Status |
|---|---|---|
| 1. Lovable URL → workdir | `src/` (`importFromUrl`) | Done. Tested against real Lovable repos. |
| 2a. Competitors → DFS keywords | `src-competitors/` (`fetchAggregatedKeywords`) | Done. Tested on 5 competitors, ~$0.10/run. |
| 2b. Score + variety selection | `src-prompts/select.ts` (`selectTopKeywords`) | Done. Deterministic, no LLM. |
| 2c. Curator agent | `src-prompts/curator.ts` (`curateKeywords`) | Done. Opus, brand-agnostic. Verified inferring "CRM software" without hint. |
| 2d. Per-keyword sub-agents | `src-prompts/subagent.ts` (`generateForKeyword`) | Done. Sonnet, parallel, 4 prompts per keyword. |
| 2e. Final aggregator | `src-prompts/aggregator.ts` (`aggregatePrompts`) | Done. Opus, semantic dedup + 60/27/13 ratio. Outputs 20-50 prompts. |
| LLM abstraction | `src-prompts/llm.ts` | Done. Anthropic + Gemini, auto-detect from env. |

## What is NOT done — likely your job

See `BACKLOG.md` at the repo root for the full list with implementation sketches and cost estimates. Highlights below.

In rough priority order:

1. **Brand-eval bucket** (the missing 13%). Deterministic, no LLM needed. For each top competitor, append one prompt of the form `<our_brand> vs <competitor>` to the PromptSet. Needs a `brand` input (the user's brand name + domain). Hook into `generatePrompts` with a new opt `ourBrand?: string`. ~30 lines.

2. **Multi-term DFS topic filter.** Right now `--must-contain` accepts only a single LIKE term because DFS rejects nested filter arrays. Two ways forward: (a) do N separate `fetchRankedKeywords` calls with one term each and union the results client-side, (b) try the `keyword_in` operator instead of `like` (slightly different semantics). Approach (a) is more robust. See `src-competitors/endpoints.ts` line ~38.

3. **Stage 3 — Peec submission.** Anton chose to *not* auto-submit prompts; Peec employees paste them manually. If your colleague decides to automate the submission, the API is documented in `peec-ai-research/peec-api.md`. Use the `X-API-Key` header (NOT `Bearer`). Note: Peec is **schedule-driven**, ~24h lag between prompt creation and first chat. There is no on-demand run endpoint.

4. **Stage 4 — Peec result polling + visibility report.** Once prompts are registered, poll `GET /chats?prompt_id=...&start_date=...` then `GET /chats/{id}/content`. Aggregate visibility/position/sentiment per prompt. Output a `VisibilityReport` keyed by prompt + bucket.

5. **Stage 5 — Recommendations.** Take a `VisibilityReport` and emit website-improvement actions per low-visibility prompt. The `target_page_or_gap` field is the planned linkage but isn't populated yet — see `peec-ai-research/generation-strategy.md`.

## Where the bodies are buried — gotchas

- **DFS account verification.** The DataForSEO key only works AFTER the account is verified at https://app.dataforseo.com/. Symptom: status_code 40104, all daily limits show 0 in `/v3/appendix/user_data`. The error is mapped to `NOT_VERIFIED` in `src-competitors/client.ts`.

- **Gemini free-tier hits 429 immediately on parallel calls.** The system auto-detects provider and sets concurrency to 1 for Gemini. If you switch to a paid Gemini plan, override with `opts.concurrency`.

- **Brand-leak filter in `select.ts`** uses competitor stems (substring match for ≥4 char names, word-boundary for 3-char). If you add competitors with very generic stems like "do" or "go", relax this carefully.

- **Curator can override the user's `--category` hint.** That's intentional — the data is more reliable than the human's guess. Look for `curator inferred category: ...` in `warnings`.

- **Cache keys include all relevant params** (location, language, keyword limit, must-contain). Changing any of them triggers a fresh DFS fetch. Cache lives at `.cache/dataforseo/agg_*.json`.

- **The Sonnet aggregator returns INDICES, not prompt text.** Faster + lets us preserve `id`, `source_competitors`, `hypothesis`. If you change the input format, update the aggregator's system prompt.

- **All sub-agent calls are JSON-mode.** If a model returns prose or fences, the regex fallback in `subagent.ts` strips them. If you swap models, sanity-check the JSON parsing.

## Read this first (in order)

For the design philosophy and *why* things are built this way:

1. `peec-ai-research/PLAN.md` — overall pipeline plan
2. `peec-ai-research/peec-prompt-patterns.md` — empirical analysis of 385 real Peec prompts. THE source of truth for what a "good" Peec prompt looks like.
3. `peec-ai-research/generation-strategy.md` — the deterministic mapping from intel signals to prompt buckets
4. `peec-ai-research/skills-deep-analysis.md` — why we use marketing skills 07 / 38 / 42 specifically
5. `peec-ai-research/extraction-strategy.md` — the page-segmentation approach (now superseded by DataForSEO but useful context)

## Code style — match what's there

- TypeScript strict mode. ES modules. Native fetch (Node 20+).
- Each `src*/` file under ~150 lines. Split if it grows.
- Comments only when WHY isn't obvious. No JSDoc for self-evident params.
- Errors throw `Error` with `.cause` set to a typed `*Error` shape. See `src/types.ts` `importError()` for the pattern.
- CLI scripts in `scripts/` are thin wrappers — all logic lives in `src*/`.
- No HTTP server. Everything is callable as a function or via `npm run`.

## Run it locally

```bash
npm install
cp .env.example .env  # fill in DFS + Anthropic keys
npm run prompts -- --provider=anthropic --keyword-limit=200 attio.com hubspot.com pipedrive.com close.com folk.app
```

Expected: ~17-25 prompts, ~$0.20 cost, ~30 seconds.

## If you're going to extend this

- Stay minimalist. Anton explicitly chose CLI-only (no HTTP server) for simplicity. Don't add Express back unless required.
- Keep the LLM abstraction. New providers go in `src-prompts/llm.ts`.
- Follow the existing module pattern: `index.ts` exports the public function, supporting files for client/types/logic. Don't merge stages into one file.
- The `peec-ai-research/` folder is design history. New design notes go there. Don't delete old ones — they document the path of decisions.
