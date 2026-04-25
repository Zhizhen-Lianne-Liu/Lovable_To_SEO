# Architecture

## Goals

1. **Closed loop.** Every rewrite is grounded in real LLM-search signal from Peec, not heuristics.
2. **Replayable.** Each pipeline stage writes a JSON artifact. Re-run any stage from saved input.
3. **Cheap to iterate.** Prompt caching means the second run on the same project is ~5x faster and cheaper.
4. **Fits in a hackathon repo.** Pure TypeScript, no infra, no DB for v0.

## Stage contracts

| # | Stage | Input | Output artifact |
|---|---|---|---|
| 1 | scrape | URL | `01-scrape.json` (ScrapedPage) |
| 2 | diagnose | Peec project_id | `02-diagnose.json` (DiagnoseBundle) |
| 3 | strategize | ScrapedPage + DiagnoseBundle | `03-brief.md` |
| 4 | rewrite | ScrapedPage + brief | `04-optimized.html` |
| 5 | diff | original + optimized | `05-diff.patch` + `report.md` |

Stages are pure functions of their inputs (modulo Claude/Peec network calls). Swap any of them without touching the others.

## Peec MCP usage

We hit four read tools per run, in parallel:

- `get_brand_report` — visibility / SoV / sentiment / position vs competitors
- `list_search_queries` — actual buyer queries observed across LLMs
- `get_url_report` — which URLs the LLMs cite when they answer those queries
- `get_actions` — Peec's own opportunity-scored recommendations (overview scope)

A 30-day window is the default — short enough to be current, long enough to have signal.

OAuth is browser-based, so for dev/demo we support a `PEEC_FIXTURE` mode that loads a JSON file with the same shape. This is what makes the demo runnable without wiring OAuth on the judging laptop.

## Claude usage

Two completions per run:

1. **Strategist** (Sonnet 4.6, ~2k output) — synthesizes Peec + page into a brief.
2. **Rewriter** (Sonnet 4.6, ~8k output) — emits the full optimized HTML.

Both use prompt caching:
- The system prompt (the playbook) is cached — stable across runs.
- The Peec context block is cached — stable across runs against the same project, so iterating on the page itself is cheap.

We can drop to Haiku for the strategist if we want sub-second briefs, or upgrade to Opus 4.7 for more nuanced rewrites on flagship pages. Model is overrideable via `LTSEO_MODEL`.

## Why no DB yet

The pipeline is stateless. Lift tracking (re-running diagnose later and diffing brand_report deltas) is the obvious v0.5 — we'd add SQLite for run history then. Not before.

## Future: auto-PR

Lovable apps sync to GitHub. The natural next step is: take `04-optimized.html`, locate the corresponding component(s) in the Lovable repo, open a PR. That's a dedicated stage 6, not part of v0.
