# Architecture

## Goals

1. **Closed loop.** Every rebuild is grounded in real LLM-search signal from Peec, not heuristics.
2. **Replayable.** Each pipeline stage writes an artifact. Re-run any stage from saved input.
3. **Cheap to iterate.** Prompt caching means the second run on the same project is ~5x faster and cheaper.
4. **Non-invasive.** The rebuilt site lands in `seo/` of the repo as a PR — Lovable stays the editor for the React source.

## Stage contracts

| # | Stage | Input | Artifact |
|---|---|---|---|
| 0 | ingest | GitHub URL or local path | `00-repo.json` (RepoMeta + entry-file source) |
| 1 | scrape | live URL | `01-scrape.json` (ScrapedPage) |
| 2 | diagnose | Peec project_id | `02-diagnose.json` (DiagnoseBundle) |
| 3 | strategize | ScrapedPage + DiagnoseBundle | `03-brief.md` |
| 4 | rebuild | ScrapedPage + brief (+ RepoMeta) | `Site` object — emitted to `site/` |
| 5 | ship | Site + RepoMeta | branch on cloned repo, optional PR |

Stages are pure functions of their inputs (modulo Claude/Peec network calls). Swap any of them without touching the others.

## Two input modes

- **`--repo <github-url>`** — full pipeline. We clone the repo, run all 6 stages, commit the rebuilt site to `seo/<files>` on a new branch, optionally `gh pr create`.
- **`--url <live-url>`** — diagnose-only mode (no commit/PR). Useful for sales demos, audits, or sites we don't have repo access to.

When only `--repo` is given we infer the live URL as `<repo-name>.lovable.app`. Override with `--url`.

## Peec MCP usage

We hit four read tools per run, in parallel:

- `get_brand_report` — visibility / SoV / sentiment / position vs competitors
- `list_search_queries` — actual buyer queries observed across LLMs
- `get_url_report` — which URLs the LLMs cite when they answer those queries
- `get_actions` — Peec's own opportunity-scored recommendations (overview scope)

A 30-day window is the default — short enough to be current, long enough to have signal.

OAuth is browser-based. For dev/demo we support a `PEEC_FIXTURE` mode that loads a JSON file with the same shape — that's what makes the demo runnable without wiring OAuth on the judging laptop.

## Claude usage

Two completions per run:

1. **Strategist** (Sonnet 4.6, ~2k output) — synthesizes Peec + page into a brief.
2. **Rebuilder** (Sonnet 4.6, ~8k output) — emits the full optimized HTML.

Both use prompt caching:
- The system prompt (the playbook) is cached — stable across runs.
- The Peec context block is cached — stable across runs against the same project, so iterating on the page itself is cheap.

We can drop to Haiku for the strategist if we want sub-second briefs, or upgrade to Opus 4.7 for more nuanced rebuilds on flagship pages. Model is overrideable via `LTSEO_MODEL`.

## What ships in `seo/`

For v0:
- `index.html` — the rebuilt single-page site (inline CSS, no JS required)
- `robots.txt` — points at the sitemap
- `sitemap.xml` — single-URL sitemap (multi-page is v0.5)

The host repo's existing React source is left untouched. Founders deploy `seo/` separately (Cloudflare Pages, Vercel, GitHub Pages) on a different subdomain (e.g. `www.<brand>.com`) while keeping the Lovable app at `<brand>.lovable.app`.

## Why no DB yet

The pipeline is stateless. Lift tracking (re-running diagnose later and diffing brand_report deltas) is the obvious v0.5 — we'd add SQLite for run history then. Not before.

## Future stages

- **6. measure** — schedule a follow-up Peec query 7 days post-deploy, diff brand_report deltas, post a Slack/email lift report.
- **7. iterate** — feed the lift delta back into the strategist as one more signal, re-rebuild for round 2.
