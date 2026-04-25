# Lovable_To_SEO

**Your Lovable app is secretly a React SPA. That's why nobody finds it.**

You shipped a landing page in Lovable. It looks great. What you didn't know: under the hood it's a Vite + React single-page app. Google sees an empty `<div id="root">`. ChatGPT sees nothing to cite. The page doesn't exist as far as the AI-search world is concerned.

`lovabletoseo` fixes both halves of the problem in one PR. We clone your repo, convert the SPA into deployable static HTML (so it's *findable*), then enhance it with [Peec AI](https://peec.ai) buyer-query data so it's *actually cited* when someone asks an LLM for a recommendation.

> Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**.
> Domain: [lovabletoseo.com](https://lovabletoseo.com)

---

## The two-phase value prop

```
Phase 1 — fix the SPA invisibility problem
   React source → static HTML → indexable, cite-able, deploy-anywhere site
   (this alone ships a real win — works without any Peec data)

Phase 2 — enhance with Peec signal
   Peec API tells us what buyers actually ask LLMs and which URLs get cited
   We layer that into the static page: FAQ, comparison table, JSON-LD,
   targeted meta — without redesigning the page
```

The first phase is the lightbulb moment for the Lovable founder who didn't know any of this was a problem. The second is what beats every "SEO audit" tool on the market.

---

## The pipeline

```
GitHub repo URL  ──►  ┌─────────────┐  clone, detect Vite+React, read source files
                      │ 1. INGEST   │
                      ├─────────────┤
                      │ 2. PRERENDER│  Claude renders the React source into one
                      │             │  static HTML doc. Already shippable.
                      ├─────────────┤
                      │ 3. DIAGNOSE │  Peec REST API: /reports/brands,
                      │             │  /queries/search, /reports/urls
                      ├─────────────┤
                      │ 4. STRATEGY │  Claude → enhancement brief grounded
                      │  + ENHANCE  │  in Peec signal; Claude layers FAQ /
                      │             │  comparison table / JSON-LD into the
                      │             │  prerendered HTML — same layout, same voice
                      ├─────────────┤
                      │ 5. SHIP     │  commit `seo/index.html` + robots.txt +
                      │             │  sitemap.xml on a new branch, optionally
                      │             │  `gh pr create`
                      └─────────────┘
```

Each stage drops a JSON or HTML artifact into `out/<run-id>/` so you can inspect, replay, or swap any step.

---

## Quickstart

```bash
npm install
cp .env.example .env       # add ANTHROPIC_API_KEY + (PEEC_API_KEY | PEEC_FIXTURE)

# Demo run with the bundled fixture (no Peec auth needed)
PEEC_FIXTURE=examples/founder-mvp/peec-fixture.json \
  npm run dev -- run \
    --repo https://github.com/your-team/your-lovable-app \
    --project-id demo

# Real run — clone, prerender, enhance, push branch, open PR
npm run dev -- run \
  --repo https://github.com/your-team/your-lovable-app \
  --project-id <peec_project_id> \
  --open-pr
```

Outputs land in `out/<run-id>/`:

- `01-repo.json` — cloned-repo metadata + source-file list
- `02-prerendered.html` — the SPA-to-static conversion (already a wins-by-itself artifact)
- `03-diagnose.json` — Peec signal
- `04-brief.md` — strategist brief
- `05-diff.patch` — what enhancement changed vs prerendered
- `site/` — the final static site (`index.html` + `robots.txt` + `sitemap.xml`)
- `report.md` — exec summary you can paste into Slack

When `--repo` is given the final `site/` is committed to a fresh branch under `seo/`. With `--open-pr` we push and call `gh pr create`.

---

## Why we win the track

Most "AI SEO tools" guess. We don't.

| Signal | Source | What it tells us |
|---|---|---|
| What buyers ask LLMs | Peec `/queries/search` | Real query targets — not Ahrefs guesses |
| Which URLs LLMs cite | Peec `/reports/urls` | The shape of content that wins citations |
| Where competitors crush us | Peec `/reports/brands` | Share-of-voice gaps to attack first |
| The page itself | Cloned repo | The React source we can actually edit |

Claude fuses all four into an enhancement that targets the *actual* gap. Then we re-measure on Peec next week and show the lift.

---

## What "GEO" means here

GEO = Generative Engine Optimization. Becoming the source LLMs *quote* when a buyer asks "what's the best receipt scanner for freelancers?". The enhancer applies a concrete playbook — see [`docs/GEO_PRINCIPLES.md`](docs/GEO_PRINCIPLES.md):

- **Direct, extractable answers** at the top of every section
- **Comparison tables** for every "X vs Y" buyer query
- **Cited stats** with linked sources
- **Schema.org JSON-LD** (Organization, SoftwareApplication, FAQPage)
- **Entity consistency** — same brand surface form everywhere
- **Q&A blocks** sized for LLM quote windows (40–80 words)

Classic SEO is the floor (titles, meta, headings, alt text) — not the ceiling.

---

## HTTP API (Python FastAPI service)

The CLI above is the local tool. The Python service at `src/lovable_to_seo/` powers the web app — same pipeline, exposed over HTTP.

```
POST /run
   → [Ingest]   clone to /tmp/ltseo-{run_id}/
   → asyncio.gather(
         [Prerender] Agent SDK loop                    # reads local disk
                     → /tmp/ltseo-{run_id}/seo/        # local scratch only
                       index.html (markup + inlined CSS + assets/)
         [Diagnose]  httpx → Peec REST (3 in parallel) # hits network
     )                                                  # run concurrently
   → [Analyze]  pure Python decision table → ActionItem list
   → [Enhance]  Agent SDK loop
                → edits /tmp/ltseo-{run_id}/seo/index.html in place
                → writes seo/robots.txt, seo/sitemap.xml
   → [Ship]     read /tmp/ltseo-{run_id}/seo/* off disk
                strip "seo/" prefix → publish at repo ROOT on main:
                  index.html, robots.txt, sitemap.xml, assets/
                GitHub Git Data API → blobs → fresh tree (no base_tree)
                → fast-forward main
   → RunResult { commit_url, commit_sha, run_id }
```

`seo/` is local scratch only — it never appears on the remote. Ship replaces `main` entirely (one-way migration; original React source stays in the parent commit and is recoverable via `git revert HEAD`).

```bash
# Spin up
cp .env.example .env   # add ANTHROPIC_API_KEY + GITHUB_TOKEN
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn lovable_to_seo.main:app --reload

# Dry run (no GitHub push, uses fixture Peec data)
curl -X POST localhost:8000/run/sync \
  -H "Content-Type: application/json" \
  -d '{"github_repo_url":"https://github.com/owner/repo",
       "peec_project_id":"demo","own_brand_id":"br_receiptly","push":false}'

# Preview the output locally (macOS-compatible path)
SEO_DIR=$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name "ltseo-*" -type d | xargs ls -dt 2>/dev/null | head -1)
python3 -m http.server 8080 --directory "$SEO_DIR/seo"

# Poll async run
curl localhost:8000/run/{run_id}
```

---

## Roadmap

- [x] CLI pipeline, fixture-mode demo
- [x] Peec REST API wired (brands, search, urls)
- [x] GitHub repo ingest + branch-and-PR ship stage
- [x] Source → static prerender (Phase 1)
- [x] Peec-driven enhancement (Phase 2)
- [ ] Web app at [lovabletoseo.com](https://lovabletoseo.com) — paste repo URL, get PR
- [ ] OAuth GitHub App (so non-technical founders don't touch the CLI)
- [ ] Multi-page Lovable apps (per-route prerender + enhance)
- [ ] Recurring lift tracking (cron + Peec re-measure)

---

## Architecture & positioning

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — pipeline contracts and stage IO
- [`docs/POSITIONING.md`](docs/POSITIONING.md) — vs LovableHTML and the SEO-tool field
- [`docs/GEO_PRINCIPLES.md`](docs/GEO_PRINCIPLES.md) — the rules the enhancer applies

## License

MIT. See [`LICENSE`](LICENSE).
