# Lovable_To_SEO

**The AI marketer for tiny Lovable apps.**

You shipped a landing page in Lovable. It looks great. It does not exist on Google or in ChatGPT. `lovabletoseo` connects to your repo, asks [Peec AI](https://peec.ai) what your buyers actually ask LLMs, and ships a redesigned static-HTML version of your site as a PR — purpose-built to rank *and* get cited.

> Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**.
> Domain: [lovabletoseo.com](https://lovabletoseo.com)

---

## The wedge

The typical Lovable user is a non-technical founder with a 1–3 page MVP, near-zero LLM visibility, and incumbents already cited every time a buyer asks an AI assistant for a recommendation. They don't want to migrate frameworks. They want traffic.

We're not [LovableHTML](https://lovablehtml.com). LovableHTML prerenders what's there. We *rewrite the content itself* using Peec's data on what queries LLMs are actually serving — so the version that ships is the one that gets cited.

---

## The pipeline

```
GitHub repo URL  ──►  ┌────────────┐
(or local --path)     │ 0. INGEST  │  clone, detect Lovable stack (Vite+React), read source
                      ├────────────┤
Live lovable.app URL  │ 1. SCRAPE  │  pull rendered HTML & content tree
(auto-inferred)       ├────────────┤
                      │ 2. DIAGNOSE│  Peec MCP: get_actions, get_brand_report,
                      │            │            list_search_queries, get_url_report
                      ├────────────┤
                      │ 3. STRATEGY│  Claude → rewrite brief grounded in Peec signal
                      ├────────────┤
                      │ 4. REBUILD │  Claude → static site (index.html + robots + sitemap),
                      │            │            JSON-LD, FAQ, comparison table, citations
                      ├────────────┤
                      │ 5. SHIP    │  commit to `seo/` on a new branch, optionally `gh pr create`
                      └────────────┘
```

Each stage drops a JSON/MD artifact into `out/<run-id>/` so you can inspect, replay, or swap any step.

---

## Quickstart

```bash
pnpm install
cp .env.example .env       # add ANTHROPIC_API_KEY + (PEEC_OAUTH_TOKEN | PEEC_FIXTURE)

# Demo run with the bundled Receiptly fixture (no Peec auth needed)
PEEC_FIXTURE=examples/founder-mvp/peec-fixture.json \
  pnpm dev run \
    --repo https://github.com/your-team/your-lovable-app \
    --project-id demo

# Real run — clone, rebuild, push branch, open PR
pnpm dev run \
  --repo https://github.com/your-team/your-lovable-app \
  --project-id <peec_project_id> \
  --open-pr
```

Outputs land in `out/<run-id>/`:

- `00-repo.json` — cloned-repo metadata + entry-file source
- `01-scrape.json` — extracted page tree
- `02-diagnose.json` — Peec signal
- `03-brief.md` — strategist brief
- `site/` — the rebuilt static site
- `05-diff.patch` — unified diff vs. original
- `report.md` — exec summary you can paste into Slack

When `--repo` is given the rebuilt site is committed to a fresh branch under `seo/`. With `--open-pr` we push and call `gh pr create`.

---

## Why we win the track

Most "AI SEO tools" guess. We don't.

| Signal | Source | What it tells us |
|---|---|---|
| What buyers ask LLMs | Peec `list_search_queries` | Real query targets — not Ahrefs guesses |
| Which URLs LLMs cite | Peec `get_url_report` | The shape of content that wins citations |
| Where competitors crush us | Peec `get_brand_report` | Share-of-voice gaps to attack first |
| Highest-ROI fixes | Peec `get_actions` | Opportunity-scored edit list |
| The page itself | Repo + scrape | What we have to work with |

Claude fuses all five into a rebuild that targets the *actual* gap. Then we re-measure on Peec next week and show the lift.

---

## What "GEO" means here

GEO = Generative Engine Optimization. Becoming the source LLMs *quote* when a buyer asks "what's the best receipt scanner for freelancers?". The rebuilder applies a concrete playbook — see [`docs/GEO_PRINCIPLES.md`](docs/GEO_PRINCIPLES.md):

- **Direct, extractable answers** at the top of every section
- **Comparison tables** for every "X vs Y" buyer query
- **Cited stats** with linked sources
- **Schema.org JSON-LD** (Organization, SoftwareApplication, FAQPage)
- **Entity consistency** — same brand surface form everywhere
- **Q&A blocks** sized for LLM quote windows (40–80 words)

Classic SEO is the floor (titles, meta, headings, alt text) — not the ceiling.

---

## Roadmap

- [x] CLI pipeline, fixture-mode demo
- [x] Peec MCP read tools wired
- [x] GitHub repo ingest + branch-and-PR ship stage
- [x] Claude rebuilder with prompt-cached system prompt
- [ ] Web app at [lovabletoseo.com](https://lovabletoseo.com) — paste repo URL, get PR
- [ ] OAuth GitHub App (so non-technical founders don't touch the CLI)
- [ ] Multi-page crawl + per-route rebuild
- [ ] Recurring lift tracking (cron + Peec re-measure)
- [ ] Optional Cloudflare-Worker proxy mode (for users who can't redeploy)

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/POSITIONING.md`](docs/POSITIONING.md).

## License

MIT. See [`LICENSE`](LICENSE).
