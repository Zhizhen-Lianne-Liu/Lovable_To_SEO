# peec-onboarder

**End-to-end Peec setup + insights pipeline.** Given a single domain, discover competitors (Tavily), generate Peec tracking prompts (Anton's pipeline in `../anton/`), push brands + prompts to a Peec project, wait for chats to land, snapshot the visibility data.

This is the upstream feeder for the rest of Lovable_To_SEO — by the time `src/peec/` queries Peec, the project is already populated, has prompts running, and has fresh chat data.

## What it does

```
domain
  ↓ Tavily 3-approach competitor discovery (research/discover.py)
competitors[10]
  ↓ Anton's keyword + prompt pipeline (anton/scripts/prompts.ts)
prompts[20-50]
  ↓ Peec REST push (research/push.py)
  ↓   - PATCH own brand
  ↓   - wipe + create competitor brands
  ↓   - wipe + create prompts
  ↓ wait ~60s for chats
  ↓ snapshot composer (research/snapshot.py + research/mcp_client.py)
snapshot.json — Peec insights for next stage
```

Three Tavily approaches run in parallel and we keep the consensus list (≥2-of-3 agreement) plus structured-output picks. Anton's pipeline takes those domains, hits DataForSEO for keyword overlap, runs an Opus relevance gate to infer category, then parallel Sonnet sub-agents to generate ~70 raw prompts, then an Opus dedup pass to converge on 20–50 final prompts. The Peec push wipes existing competitors + prompts and replaces them so the project converges to a clean state per run.

## Setup (one-time)

```bash
# From the repo root:
cp .env.example .env                            # fill in PEEC_API_KEY, TAVILY_API_KEY,
                                                # ANTHROPIC_API_KEY, DATAFORSEO_LOGIN/PASSWORD
cd peec-onboarder
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../anton
npm install                                     # one-time, ~30s
```

Single source of truth for env vars is **the repo-root `.env`**. Both the orchestrator and Anton's CLI read from it (with a fallback chain). The Peec API key must be **company-scoped** (`skc-...`) — generate at https://app.peec.ai/api-keys.

### MCP authentication (one-time, only if you want actions data)

The Peec REST API doesn't expose the `get_actions` endpoint. To pull recommendations programmatically, the snapshot step uses the Peec MCP server (`https://api.peec.ai/mcp`), which requires OAuth.

```bash
python3 research/mcp_client.py <project_id>
```

A browser opens once, you log in to Peec, click Allow. The token persists in `.peec_oauth.json` (gitignored). Subsequent runs are headless.

## Run end-to-end

```bash
# Full pipeline: discover → generate prompts → push → snapshot
python3 research/orchestrate.py \
  --domain attio.com \
  --project-id or_<your-project-id>

# Useful flags
#   --country DE             override country (default auto-detected from TLD)
#   --skip-prompts           skip Anton's step (faster, no DataForSEO/Anthropic spend)
#   --prompts-from <file>    inject pre-generated prompts.json instead of running Anton
#   --skip-research <file>   reuse a prior Tavily results.json
#   --wait-seconds 90        post-push wait before snapshot (default 90)
#   --no-snapshot            skip readback (just push)
#   --dry-run                show plan without writing
```

The project must already exist in the Peec dashboard — Peec doesn't expose project creation via API.

## Modules

| File | Purpose |
|---|---|
| `research/discover.py`    | Tavily competitor discovery (3 approaches: `/research`, multi-channel co-occurrence, single-shot answer) |
| `research/normalize.py`   | Canonical-name dedupe, parent/child folding, why-relevant backfill |
| `research/anton_runner.py`| Subprocess wrapper around `../anton/scripts/prompts.ts` |
| `research/push.py`        | Peec REST: update own brand + wipe-and-replace competitors and prompts |
| `research/orchestrate.py` | End-to-end CLI: discover → prompts (Anton) → push → wait → snapshot |
| `research/snapshot.py`    | Compose the GEO-actionable JSON from REST endpoints |
| `research/mcp_client.py`  | MCP client for the actions data REST can't fetch |

## Output

`data/<project_id>/snapshot_<timestamp>.json` — single artifact for the next pipeline stage. Schema:

```
meta              project + brand list + coverage stats
scorecard         visibility / SoV / sentiment / position per brand, with rank
engine_breakdown  per-model gap (where each AI engine has us behind)
prompt_breakdown  per-prompt strengths/weaknesses
actions           prescriptive recommendations from Peec (MCP-only)
gap_targets       domains + URLs where competitors are cited but we aren't
owned_audit       what URLs of ours are working in AI search
fanout_queries    actual search terms the LLMs use internally
diagnostics       sample wins + misses for context
```

## Empirical timing

Pushed prompts produce chat data within seconds:

| T from prompt push | What's available |
|---|---|
| ~20s  | First chats from Google AI Overview |
| ~45s  | Three Google models populated |
| ~60s  | 6 of 7 active models populated, brand report fully usable |
| ~24h  | Microsoft Copilot (slowest scraper) catches up |

## Known constraints

- **Project creation is dashboard-only** — there's no `POST /projects` endpoint, so the project must exist before this runs.
- **Actions data is MCP-only** — REST has zero coverage for the recommendations layer. We use the official `mcp` Python SDK with persistent OAuth tokens (`mcp_client.py`).
- **Wipe-and-replace** — every run deletes existing competitor brands and recreates from the fresh research. The own brand is updated in place so it keeps its `is_own=true` flag.
