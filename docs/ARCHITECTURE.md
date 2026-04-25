# Architecture

## Goals

1. **Closed loop.** Every enhancement is grounded in real LLM-search signal from Peec, not heuristics.
2. **Two-phase value.** Phase 1 (prerender) is shippable on its own — we don't need Peec data to fix the SPA-invisibility problem. Phase 2 (enhancement) is the differentiator.
3. **Replayable.** Each pipeline stage writes an artifact. Re-run any stage from saved input.
4. **Cheap to iterate.** Prompt caching means the second run on the same project is ~5x faster and cheaper.
5. **Non-invasive.** The output lives in `seo/` of the repo as a PR — Lovable stays the editor for the React source.

## Stage contracts

| # | Stage | Input | Artifact |
|---|---|---|---|
| 1 | ingest | GitHub URL or local path | `01-repo.json` (RepoMeta + sourceFiles) |
| 2 | prerender | RepoMeta | `02-prerendered.html` (static HTML, deployable) |
| 3 | diagnose | Peec project_id | `03-diagnose.json` (DiagnoseBundle) |
| 4 | strategize + enhance | PrerenderedPage + DiagnoseBundle | `04-brief.md`, `Site` |
| 5 | ship | Site + RepoMeta | branch on cloned repo, optional PR |

Stages are pure functions of their inputs (modulo Claude/Peec network calls). Swap any of them without touching the others.

## Why no scrape stage

We deliberately don't fetch the live URL. The repo is the source of truth — every line of content the founder edits in Lovable lives in the React components. Reading the repo gives us cleaner, more complete input than scraping a JS-rendered page would, and avoids the chicken-and-egg of "the site we're trying to fix is currently invisible".

## Phase 1: prerender (the SPA fix)

The prerenderer reads `index.html`, `src/App.tsx`, and every component under `src/` (capped at ~60 files / 80k chars total) and produces a single static HTML document. This document:

- Renders all the actual page content (no empty `<div id="root">`)
- Keeps the original Tailwind classes verbatim so the existing CSS bundle still styles it
- Keeps the `<script type="module">` tags so the SPA can still hydrate client-side — best of both worlds: instant indexable HTML AND working interactivity

This step alone solves the "my Lovable app isn't crawlable" problem. It would still ship value if Peec went down.

## Phase 2: diagnose + strategize + enhance

We hit three Peec REST endpoints in parallel:

- `POST /reports/brands` — visibility / SoV / sentiment / position vs competitors
- `POST /queries/search` — actual buyer queries observed across LLMs
- `POST /reports/urls` — which URLs the LLMs cite when they answer those queries

A 30-day window is the default — short enough to be current, long enough to have signal.

Auth is `X-API-Key`. For dev/demo we support a `PEEC_FIXTURE` mode that loads a JSON file with the same shape — that's what makes the demo runnable on any laptop without provisioning Enterprise API access.

The strategist takes the prerendered HTML + the Peec bundle and writes a markdown brief. The enhancer takes the prerendered HTML + that brief and emits the final HTML. We deliberately use two Claude calls so the brief is human-readable for debugging and demo storytelling.

## Claude usage

Three completions per run:

1. **Prerenderer** (Sonnet 4.6, ~8k output) — React source → static HTML.
2. **Strategist** (Sonnet 4.6, ~2k output) — prerendered HTML + Peec → brief.
3. **Enhancer** (Sonnet 4.6, ~8k output) — prerendered HTML + brief → final HTML.

All three use prompt caching:
- The system prompt (the playbook) is cached — stable across runs.
- The Peec context block is cached — stable across runs against the same project, so iterating on the page is cheap.

Model overrideable via `LTSEO_MODEL`.

## What ships in `seo/`

For v0:
- `index.html` — the enhanced static page (inline CSS, hydratable)
- `robots.txt` — points at the sitemap
- `sitemap.xml` — single-URL sitemap (multi-page is v0.5)

The host repo's existing React source is left untouched. Founders deploy `seo/` separately (Cloudflare Pages, Vercel, GitHub Pages) on a different subdomain (e.g. `www.<brand>.com`) while keeping the Lovable app at `<brand>.lovable.app`.

## Why no DB yet

The pipeline is stateless. Lift tracking (re-running diagnose later and diffing brand_report deltas) is the obvious v0.5 — we'd add SQLite for run history then. Not before.

## Future stages

- **6. measure** — schedule a follow-up Peec query 7 days post-deploy, diff brand_report deltas, post a Slack/email lift report.
- **7. iterate** — feed the lift delta back into the strategist as one more signal, re-enhance for round 2.
