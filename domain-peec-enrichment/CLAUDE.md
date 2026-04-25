# For the next Claude — handoff guide

You are picking up an end-to-end pipeline that takes a domain and produces a populated Peec project with running prompts. Read this file and `README.md` first; together they're the fastest path into context.

## How to read the codebase

Two languages, one folder. Both read env from `domain-peec-enrichment/.env` (single source of truth).

- **`py/`** — Python orchestrator. Owns: Tavily competitor discovery, Peec REST push, snapshot composition, MCP overlay (OAuth-gated). Entry point: `py/research/orchestrate.py`.
- **`ts/`** — TypeScript prompt-generation pipeline. Owns: domain context check, gatekeeper, DataForSEO keyword aggregation, curator, sub-agents, aggregator. Entry point per stage in `ts/scripts/`.

The Python orchestrator calls into the TypeScript pipeline as a **subprocess** for prompt generation (see `py/research/anton_runner.py` — it runs `npm run prompts -- ...` and reads the JSON the script writes via `--out`).

## What's done

| Stage | Module | Status |
|---|---|---|
| 1. Lovable URL → workdir | `ts/src/` | Done. |
| 2. Tavily competitor discovery | `py/research/discover.py` | Done. 3 parallel approaches, consensus voting. |
| 3. Domain context check | `ts/src-context/` | Done. Tavily extract with search fallback. |
| 4. Gatekeeper filter | `ts/src-gatekeeper/` | Done. Cross-checks candidates against context. |
| 5. DataForSEO keywords | `ts/src-competitors/` | Done. Score+variety selection, consensus aggregation. |
| 6. Curator + sub-agents + aggregator | `ts/src-prompts/` | Done. Sonnet sub-agents, Opus curator + aggregator. |
| 7. Peec push | `py/research/push.py` | Done. Wipe-and-replace brands + prompts. |
| 8. Peec snapshot | `py/research/snapshot.py` | Done. Pulls chats + reports. |
| 9. MCP actions overlay | `py/research/mcp_client.py` | Done but requires interactive OAuth setup. |

## What is NOT done — see `BACKLOG.md`

Top items by impact:

1. **Brand-eval bucket** (the missing 13%). Deterministic, no LLM. ~30 lines.
2. **People Also Ask integration**. Verified live: ~$0.036/run, ~47 awareness questions per run. Wiring sketch in BACKLOG #1.
3. **Multi-region DFS fetch**. Currently single country code. Niche EU brands hit data sparsity that multi-region would solve.
4. **Data-sufficiency gate**. When DFS returns <2 consensus + <10 outliers, abort cleanly with `INSUFFICIENT_KEYWORD_SIGNAL` instead of pushing weak prompts.
5. **Pre-cluster keywords semantically** before sub-agents see them. Cuts sub-agent count by 30-40%.

## Where the bodies are buried

- **`PEEC_API_KEY`** must be company-scoped (`skc-...`), not project-scoped. Project keys can't list other projects.
- **DataForSEO Labs requires account verification**. Symptom: status_code 40104, all daily limits show 0 in `/v3/appendix/user_data`. Mapped to `NOT_VERIFIED` in `ts/src-competitors/client.ts`.
- **Gemini free-tier hits 429 instantly on parallel calls.** The TS auto-detect prefers Anthropic when both keys are present (see `ts/src-prompts/llm.ts`).
- **Tavily extract fails on bot-blocking sites** (e.g. telli.io). The context module falls back to Tavily search automatically (see `ts/src-context/tavily.ts`).
- **Curator can override the user's `--category` hint.** That's intentional — data > human guess. Look for `curator inferred category: ...` in warnings.
- **The Sonnet/Opus aggregator returns INDICES, not prompt text.** Faster + lets us preserve `id`, `source_competitors`, `hypothesis`. If you change the input format, update the aggregator's system prompt.
- **MCP setup is interactive once.** Run `py/.venv/bin/python3 py/research/mcp_client.py <project_id>` in a terminal. Browser opens, user clicks Allow, token persists in `.peec_oauth.json` (gitignored). Subsequent runs are headless.
- **Peec is async/schedule-driven.** `POST /prompts` only registers; chats appear ~24h later. The orchestrator's 90-second post-push wait gets you partial coverage (~60%), not full.

## Read this first (in order)

For the why behind the design:

1. `ts/peec-ai-research/PLAN.md` — overall pipeline plan
2. `ts/peec-ai-research/peec-prompt-patterns.md` — empirical analysis of 385 real Peec prompts. THE source of truth for what a "good" Peec prompt looks like.
3. `ts/peec-ai-research/generation-strategy.md` — deterministic mapping from intel signals to prompt buckets
4. `ts/peec-ai-research/skills-deep-analysis.md` — why we use marketing skills 07 / 38 / 42 specifically

## Code style — match what's there

- TypeScript: strict mode, ES modules, Node 20+, native fetch. Each `src*/` file under ~150 lines. Comments only when WHY isn't obvious.
- Python: 3.10+, virtualenv per folder, requests + mcp packages.
- Errors throw with `.cause` set to a typed error shape. See `ts/src/types.ts` `importError()` for the pattern.
- CLI scripts are thin wrappers — all logic in modules.

## Run it

```bash
cd domain-peec-enrichment
cp .env.example .env  # fill in keys
./run.sh forgent.ai or_<peec_project_id>
```

Expected: 4-5 minutes, ~$0.50-0.70 cost, snapshot.json output.

## If you're going to extend this

- Don't introduce a third language. TS for prompt-gen, Python for orchestration.
- Don't add HTTP servers. Everything is callable as a function or via CLI/run.sh.
- Don't fork the env. Both stacks read from `domain-peec-enrichment/.env`.
- New design notes go in `ts/peec-ai-research/`. New backlog items go in `BACKLOG.md`.
- Keep the LLM abstraction in `ts/src-prompts/llm.ts`. New providers slot in there.
- The `DomainContext` schema (`ts/src-context/types.ts`) is the contract between context-check and gatekeeper. Don't change it without updating both.
