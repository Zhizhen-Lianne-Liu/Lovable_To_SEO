# Lovable_To_SEO

**The AI marketer every early-stage founder needs.**

Lovable lets you ship a landing page in an afternoon. Then it dies — invisible to Google, invisible to ChatGPT, invisible to the buyers comparing you to incumbents. `lovabletoseo` is the closing loop: it reads your Lovable page, asks [Peec AI](https://peec.ai) where you actually lose mindshare to competitors across LLMs, and ships a re-optimized page tuned for both classic SEO **and** GEO (Generative Engine Optimization — getting cited by ChatGPT, Perplexity, Gemini, Claude).

> Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**.

---

## The pipeline

```
Lovable URL
    │
    ▼
┌────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│ 1. SCRAPE  │ ─► │ 2. DIAGNOSE     │ ─► │ 3. STRATEGIZE│ ─► │ 4. REWRITE   │ ─► │ 5. SHIP    │
│ HTML +     │    │ Peec MCP:       │    │ Claude turns │    │ Claude edits │    │ diff +     │
│ copy tree  │    │ • get_actions   │    │ Peec data +  │    │ for SEO+GEO: │    │ HTML out + │
│            │    │ • brand_report  │    │ page into a  │    │ schema, Q&A, │    │ recurring  │
│            │    │ • search_queries│    │ rewrite brief│    │ tables, meta │    │ lift check │
│            │    │ • url_report    │    │              │    │              │    │            │
└────────────┘    └─────────────────┘    └──────────────┘    └──────────────┘    └────────────┘
```

Each stage writes a JSON artifact to `out/` so you can inspect, replay, or swap any step.

---

## Why this wins

Most "AI SEO tools" guess. We don't.

| Signal | Source | What it tells us |
|---|---|---|
| What buyers actually ask LLMs | Peec `list_search_queries` | Real query targets — not Ahrefs guesses |
| Which URLs LLMs cite when they answer | Peec `get_url_report` | The shape of content that wins citations |
| Where competitors crush us | Peec `get_brand_report` | Share-of-voice gaps to attack first |
| Highest-ROI fixes | Peec `get_actions` | Opportunity-scored edit list |
| The page itself | Scrape | What we have to work with |

Claude fuses all five into a rewrite that targets the *actual* gap. Then we re-measure on Peec and show the lift.

---

## Quickstart

```bash
pnpm install
cp .env.example .env       # add ANTHROPIC_API_KEY + Peec OAuth or PEEC_FIXTURE

# Demo run with bundled Attio fixture (no Peec auth needed)
PEEC_FIXTURE=examples/attio/peec-fixture.json \
  pnpm dev run https://attio.lovable.app --project-id demo

# Real run against Peec
pnpm dev run https://your-app.lovable.app \
  --project-id <peec_project_id>
```

Outputs land in `out/<run-id>/`:

- `01-scrape.json` — extracted page tree
- `02-diagnose.json` — Peec signals
- `03-brief.md` — strategist brief (human-readable)
- `04-optimized.html` — the rewritten page
- `05-diff.patch` — unified diff vs. original
- `report.md` — exec summary with predicted lift

---

## What "GEO" means here

GEO = Generative Engine Optimization. It's how you become the source LLMs *quote* when a buyer asks "what's the best CRM for early-stage teams?". The rewriter applies a concrete playbook (see [`docs/GEO_PRINCIPLES.md`](docs/GEO_PRINCIPLES.md)):

- **Direct, extractable answers** at the top of every section (LLMs grab the first 1–2 sentences under a heading)
- **Comparison tables** for every "X vs Y" query the buyer asks
- **Cited stats** with linked sources — LLMs prefer evidence-backed claims
- **Schema.org JSON-LD** (Product, FAQPage, Organization) so engines parse you correctly
- **Entity consistency** — same brand name, same descriptors, every time
- **Q&A blocks** sized to fit a model's quote window (≈40–80 words)

Classic SEO is still in (titles, meta, headings, internal links, alt text) — it's the floor, not the ceiling.

---

## Roadmap

- [x] CLI pipeline, fixture-mode demo
- [x] Peec MCP read tools wired
- [x] Claude rewriter with prompt-cached system prompt
- [ ] Auto-PR back to the Lovable GitHub repo
- [ ] Web app at [lovabletoseo.com](https://lovabletoseo.com) — paste URL, get diff
- [ ] Recurring lift tracking (cron + Peec re-measure)
- [ ] Multi-page site crawl (not just one URL)
- [ ] "Brand voice lock" — keep tone, only fix structure

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

MIT (existing). See [`LICENSE`](LICENSE).
