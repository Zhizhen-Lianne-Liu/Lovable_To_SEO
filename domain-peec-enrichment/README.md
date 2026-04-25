# domain-peec-enrichment

**One folder. One command. Domain in → Peec project enriched out.**

This is the unified end-to-end pipeline. Everything you need to run the flow is in this folder. No switching between `anton/`, `peec-onboarder/`, or anywhere else.

## What this does

```
domain (e.g. forgent.ai)
  ↓ Tavily 3-approach competitor discovery       py/research/discover.py
  ↓ Domain context check (Tavily extract+search) ts/src-context/
  ↓ Gatekeeper filter (drops false positives)    ts/src-gatekeeper/
  ↓ DataForSEO keyword aggregation               ts/src-competitors/
  ↓ Curator → parallel sub-agents → aggregator   ts/src-prompts/
prompt set (20-50 Peec-shaped prompts)
  ↓ Peec push (wipe + create brands + prompts)   py/research/push.py
  ↓ Wait + snapshot (chats, brand reports)       py/research/snapshot.py
final snapshot.json
```

The TypeScript side handles the prompt-generation pipeline. The Python side handles competitor discovery, Peec REST orchestration, and snapshot composition. They talk via a JSON file the orchestrator writes between stages.

## Setup (one-time)

```bash
cp .env.example .env
# fill in: PEEC_API_KEY, ANTHROPIC_API_KEY, DATAFORSEO_LOGIN/PASSWORD,
#         TAVILY_API_KEY, PEEC_PROJECT_ID

# TypeScript side
cd ts && npm install && cd ..

# Python side (Python 3.10+)
cd py
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

The Peec project must already exist in the Peec dashboard — Peec doesn't expose project creation via API. Grab the project ID from the URL of any project page (`or_<uuid>`).

## Run end-to-end

```bash
./run.sh forgent.ai or_c8e713b5-a4c0-415f-8cd7-f516d726e8ce
```

That's the whole thing. It will:

1. Discover ~10 competitors via Tavily (3 parallel approaches with consensus voting)
2. Build a domain context profile via Tavily extract (with search fallback)
3. Run the gatekeeper to reject false-positive competitors
4. Fetch keywords for the surviving competitors via DataForSEO
5. Generate 20-50 Peec-shaped prompts via curator + parallel sub-agents + aggregator
6. Push the brands and prompts to your Peec project
7. Wait 90 seconds for Peec to start running prompts
8. Snapshot the visibility data and write `snapshot.json`

## Useful flags (passed through to the orchestrator)

```
--country DE              Override country detection (default: from TLD)
--dry-run                 Run discovery + show plan, no Peec writes
--skip-prompts            Skip the Anthropic-driven prompt-gen step
--prompts-from <file>     Inject pre-generated prompts.json instead
--skip-research <file>    Reuse a prior Tavily results.json
--no-snapshot             Skip the readback snapshot
--no-mcp                  Skip the MCP actions overlay (default if no .peec_oauth.json)
--wait-seconds 90         Post-push wait before snapshot
```

## Components — what's where

```
domain-peec-enrichment/
├── README.md                  ← you are here
├── CLAUDE.md                  ← handoff guide for the next AI agent
├── BACKLOG.md                 ← scoped, ready-to-pick-up improvements
├── .env.example               ← single source of truth for env vars
├── .gitignore
├── run.sh                     ← one-command end-to-end runner
│
├── ts/                        ← TypeScript pipeline (prompt generation)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/                   stage 1 — Lovable URL → workdir
│   ├── src-competitors/       DataForSEO keyword aggregation
│   ├── src-context/           domain context (Tavily extract + search fallback)
│   ├── src-gatekeeper/        cross-checks Tavily candidates against context
│   ├── src-prompts/           curator → sub-agents → aggregator → 20-50 prompts
│   ├── scripts/               CLI: import, keywords, prompts, pipeline
│   ├── peec-ai-research/      design docs (read for the why)
│   └── README.md              TypeScript-side details
│
└── py/                        ← Python orchestrator (Tavily + Peec REST + snapshot)
    ├── requirements.txt
    ├── README.md              Python-side details
    └── research/
        ├── discover.py        Tavily 3-approach competitor discovery
        ├── normalize.py       Canonical-name dedupe + relevance backfill
        ├── anton_runner.py    Subprocess wrapper around ../ts/scripts/prompts.ts
        ├── push.py            Peec REST: wipe-and-replace brands + prompts
        ├── snapshot.py        Pull chats + reports + actions, compose summary
        ├── readback.py        Peec REST helpers
        ├── mcp_client.py      Peec MCP server (OAuth) for actions data
        └── orchestrate.py     End-to-end CLI — what run.sh calls
```

## Per-stage standalone runs (for debugging)

If you want to run just one stage without the full pipeline:

**TypeScript-side (prompt generation):**
```bash
cd ts
npm run pipeline -- forgent.ai --candidates=tendium.com,vapi.ai,bland.ai
# or
npm run pipeline -- forgent.ai --candidates-from=path/to/tavily-results.json
# or per-stage:
npm run import -- https://github.com/owner/repo
npm run keywords -- atlassian.com asana.com monday.com
npm run prompts -- attio.com hubspot.com pipedrive.com
```

**Python-side (Tavily / Peec):**
```bash
cd py && source .venv/bin/activate
python3 research/discover.py forgent.ai
python3 research/orchestrate.py --domain forgent.ai --project-id or_xxx --skip-prompts
```

## Cost per end-to-end run (approximate)

| Service | Cost |
|---|---|
| Tavily | $0 (1000 free/month on dev tier) |
| DataForSEO | $0.10–0.20 (5–10 competitors × ~$0.02 each) |
| Anthropic | $0.40–0.50 (Sonnet sub-agents + Opus curator + Opus aggregator) |
| Peec | depends on plan |
| **Total per run** | **~$0.50–0.70** |

Cheaper config available — pass `--model=claude-haiku-4-5-20251001 --aggregator-model=claude-sonnet-4-6` to drop to ~$0.15.

## Output count

20–50 prompts per run. The aggregator picks the right number based on data signal — never pads with weak prompts to hit a quota. Floor is enforced at 20 unless input itself was thinner.

Bucket ratio target (loose, data-driven):
- 60% consideration ("Best X for Y", "Top X tools")
- 27% awareness ("What is X?", "How does X work?")
- 13% brand-eval (`X vs Y`) — currently empty, deterministic step still in BACKLOG

## v0 limitations

- Public GitHub repos only for stage 1 (Lovable import).
- Brand-eval bucket not yet emitted (deterministic step, ~30 lines, see BACKLOG).
- Peec MCP overlay requires interactive OAuth setup once; without it, `--no-mcp` skips actions/recommendations.
- DataForSEO Labs requires account verification at https://app.dataforseo.com/.
- Niche/small-footprint brands (e.g. small EU B2B SaaS) may produce thin prompt sets due to DFS coverage gaps. Pipeline degrades gracefully — see logs for sufficiency warnings.

## See also

- `CLAUDE.md` — handoff guide for the next AI agent picking this up
- `BACKLOG.md` — scoped, prioritized improvements with implementation sketches
- `ts/peec-ai-research/` — design history and decision rationale
