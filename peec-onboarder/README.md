# peec-onboarder

**Phase 0 of the Lovable_To_SEO pipeline.** Given a single domain, discover competitors via Tavily, push them to a Peec AI project, push the prompts to monitor, then snapshot the visibility data once Peec runs the prompts.

This is the upstream feeder for the Phase 2 enhancement pipeline — by the time `src/peec/` queries Peec, the project here is already populated and has fresh chat data.

## What it does

```
domain  →  discover competitors (Tavily)  →  push brands to Peec (REST)
                                          →  push prompts (REST)
                                          →  wait ~60s for chats to land
                                          →  snapshot scorecard / gap / actions
                                          →  snapshot.json  (handoff)
```

Three Tavily approaches run in parallel and we keep the consensus list (≥2-of-3 agreement) plus structured-output picks. The Peec push wipes existing competitors and replaces with the new set so the project converges to a clean state per run.

## Setup (one-time)

```bash
cd peec-onboarder
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # then fill in TAVILY_API_KEY + PEEC_API_KEY
```

The Peec API key must be **company-scoped** (`skc-...`) — generate at https://app.peec.ai/api-keys.

### MCP authentication (one-time, only if you want actions data)

The Peec REST API doesn't expose the `get_actions` endpoint. To pull recommendations programmatically, the snapshot step uses the Peec MCP server (`https://api.peec.ai/mcp`), which requires OAuth.

```bash
python3 research/mcp_client.py <project_id>
```

A browser opens once, you log in to Peec, click Allow. The token persists in `.peec_oauth.json` (gitignored). Subsequent runs are headless.

## Run end-to-end

```bash
python3 research/orchestrate.py \
  --domain attio.com \
  --project-id or_c8e713b5-...
```

The project must already exist in the Peec dashboard — Peec doesn't expose project creation via API.

## Modules

| File | Purpose |
|---|---|
| `research/discover.py`   | Tavily competitor discovery (3 approaches: `/research`, multi-channel co-occurrence, single-shot answer) |
| `research/normalize.py`  | Canonical-name dedupe, parent/child folding, why-relevant backfill |
| `research/push.py`       | Peec REST: update own brand + wipe and recreate competitors |
| `research/orchestrate.py`| End-to-end CLI: discover → push → wait → snapshot |
| `research/snapshot.py`   | Compose the GEO-actionable JSON from REST endpoints |
| `research/mcp_client.py` | MCP client for the actions data REST can't fetch |

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
