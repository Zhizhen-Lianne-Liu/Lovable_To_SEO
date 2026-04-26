# lovabletoseo

**The AI marketer for Lovable founders.**

Your Lovable app is secretly a React SPA. Google sees an empty `<div id="root">`.
ChatGPT, Perplexity, and Claude have nothing to cite. As far as the AI-search
world is concerned, the page doesn't exist.

`lovabletoseo` clones your Lovable GitHub repo, fixes the technical SEO and
GEO gaps, runs an intelligence pipeline against [Peec AI](https://peec.ai)
+ [Tavily](https://tavily.com) + [DataForSEO](https://dataforseo.com), and
PRs the result back so you can keep iterating in Lovable.

> Built for the **Big Berlin Hack — Peec AI 0→1 AI Marketer track**.

---

## What it does, in one paragraph

Paste a GitHub URL. We clone the repo, audit the technical SEO, prerender the
SPA to static HTML, build a deep brand profile via Tavily, discover competitors
via three parallel Tavily approaches with consensus voting, pull DataForSEO
ranked-keywords for those competitors, generate 20–50 high-quality Peec prompts
through a curator → sub-agents → aggregator chain, push everything to your Peec
project, capture an AI-visibility snapshot, run a strategy pass against vendored
[marketing skills](skills/), apply the recommended `<head>` meta + JSON-LD +
robots.txt + sitemap.xml to the cloned tree, and open a PR back to your repo.

You review the diff in Lovable. Done.

---

## The 14-stage pipeline

```
GitHub repo URL
     │
     ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 1. INGEST    │  │ 2. AUDIT     │  │ 3. PRERENDER │
│ clone, detect│  │ heuristic    │  │ React → one  │
│ framework +  │  │ tech-SEO scan│  │ static HTML  │
│ Lovable sig  │  │ (12 cats)    │  │ doc (Sonnet) │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┴─────────────────┘
                         │
       ┌─────────────────┴─────────────────┬─────────────────┐
       ▼                                   ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 4. PROFILE   │  │ 5. DISCOVER  │  │ 6. KEYWORDS  │  │ 7. PROMPTS   │
│ Tavily 3-src │  │ Tavily 3-app │  │ DataForSEO   │  │ curator +    │
│ + Sonnet     │  │ consensus +  │  │ ranked       │  │ sub-agents + │
│ synth → 15-  │  │ relevance gt │  │ keywords     │  │ aggregator   │
│ field profile│  │ → top N comps│  │ → consensus  │  │ → 20-50      │
│              │  │              │  │   + outliers │  │   prompts    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┴─────────────────┴─────────────────┘
                                  │
       ┌──────────────────────────┴──────────────────────────┐
       ▼                                                     ▼
┌──────────────┐                                      ┌──────────────┐
│ 8. PEEC PUSH │ wipe-and-replace brands + prompts    │ 9. SNAPSHOT  │
│ to your Peec │  in your Peec project                │ visibility,  │
│ project      │  (own brand patched in place)        │ wins/losses, │
│              │                                      │ gap URLs,    │
│              │                                      │ fanout queries│
└──────┬───────┘                                      └──────┬───────┘
       └──────────────────────────┬──────────────────────────┘
                                  ▼
                          ┌──────────────┐
                          │10. CONTEXT   │ generates
                          │    .agents/  │ product-marketing-context.md
                          │    *.md      │ (foundation for skills)
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │11. STRATEGY  │ composes 4 vendored skills
                          │ Opus call    │ (site-arch, copywriting, ai-seo,
                          │              │ schema-markup) → per-route
                          │              │ directives
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │12. APPLY     │ index.html shell mutation
                          │              │ (Helmet/JSON-LD), robots.txt,
                          │              │ sitemap.xml. Idempotent via
                          │              │ markers. Vite+React only in v1.
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │13. SHIP      │ branch + commit + PR via gh CLI
                          │              │ (GitHub App backend stubbed in
                          │              │ clients/github.ts for v2).
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │14. REPORT    │ markdown brief: scorecard,
                          │              │ wins/losses, changes shipped,
                          │              │ caveats. Used as PR body.
                          └──────────────┘
```

---

## Real demo: live run on a real Lovable repo

We ran this end-to-end against [comodoc/flowmetrics-landing-page](https://github.com/comodoc/flowmetrics-landing-page)
in `--limit` mode. **The artifacts are real:**

- **PR opened:** [comodoc/flowmetrics-landing-page#1](https://github.com/comodoc/flowmetrics-landing-page/pull/1)
- **Peec project:** test3 (`or_7718dbbc-...`) → 6 brands + 8 prompts pushed
- **Snapshot at 1h:** 100% coverage, 56/56 chats processed
- **Findings:** FlowMetrics 0% visibility / 0% SoV / rank 4 of 4. HubSpot dominates with 69% SoV.
- **Top-cited URLs the AIs use instead:** HBS blog (108x), SEMrush (33x), Monday.com (27x), Klipfolio's KPI page (26x), HubSpot's glossary (16x).
- **Fanout queries the AIs ran:** "KPIs definition", "examples of KPIs in business", "What are performance indicators in marketing?" — pure GEO targeting evidence.

Cost: ~$0.30 (Anthropic ~$0.20, DataForSEO $0.055, Tavily ~$0.05). Time: ~5 min.

The full run report lives at [`runs/2026-04-26-snapshot-5763d374/report.md`](runs/) — gitignored, regenerable.

---

## Quickstart

### 0. Prereqs

- Node ≥ 20
- `gh` CLI authenticated (`gh auth login` + `gh auth setup-git`)
- API keys (see `.env.example`):
  - `ANTHROPIC_API_KEY` — required, for the LLM stages
  - `TAVILY_API_KEY` — required, for profile + discover
  - `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` — required, for keywords
  - `PEEC_API_KEY` (company-scoped `skc-...`) + `PEEC_PROJECT_ID` — required, for push + snapshot

### 1. Install

```bash
git clone https://github.com/<you>/lovabletoseo
cd lovabletoseo
npm install                # installs packages/core + apps/api workspaces
cp .env.example .env       # fill in your keys
```

### 2. Run the pipeline

Full run (10 final competitors / 30 keywords / 20+ prompts; ~$0.50–0.70 / ~5 min):

```bash
npx tsx packages/core/src/cli.ts run --repo https://github.com/<you>/<lovable-repo>
```

Limited run (5 / 10 / 6–8 prompts; ~$0.30 / ~3–4 min — exercises every stage):

```bash
npx tsx packages/core/src/cli.ts run --repo <url> --limit
```

Useful flags:

- `--domain <domain>` — override the auto-derived `<repo-name>.lovable.app`. Use this if your site is on a custom domain or a different lovable subdomain.
- `--no-prerender` — skip the static-render Sonnet call. Saves ~$0.05 + ~30s. APPLY still runs.
- `--wait-peec <seconds>` — sleep after the Peec push before snapshot, so the scheduler has time to start running prompts. Default 90. Pass `0` to skip and snapshot whatever's there immediately.
- `--dry-run` — skip Peec push + the GitHub PR. Local artifacts only.

Each run writes to `runs/<date>-<jobId>/`:

```
inventory.json    audit.json    prerender.json
profile.json      discover.json keywords.json
prompts.json      peec-push.json peec-snapshot.json
strategy.json     apply.json    ship.json
product-marketing-context.md    report.md
prerender/index.html
```

### 3. Pull a fresh Peec snapshot later

Peec's scheduler keeps running your prompts after the initial push. To capture
fuller coverage hours/days later **without paying for a full run**:

```bash
npx tsx packages/core/src/cli.ts snapshot --project-id or_<your-project> --days 7
```

Outputs `peec-snapshot.json` + `report.md` (scorecard, wins/losses, gap URLs, fanout queries) in a fresh `runs/<date>-snapshot-<id>/` dir. No LLM calls.

### 4. Demo landing (optional)

The marketing landing for the project lives at `apps/landing` (vendored from
[elnumae/toseo](https://github.com/elnumae/toseo), refreshed). Serves the
baked example run from `examples/founder-mvp/baked-scan.json`.

```bash
# Terminal 1 — Hono backend
cd apps/api && npm run dev          # http://localhost:3001

# Terminal 2 — landing
cd apps/landing && bun install      # first time only
bun dev                              # http://localhost:5173
```

Paste any URL on the landing → see real diagnosis numbers (HubSpot 69% SoV,
FlowMetrics 0%, etc.) and the real PR diff from the flowmetrics run.

---

## Workspace layout

```
.
├── packages/
│   └── core/                        # the pipeline (npm workspace)
│       └── src/
│           ├── cli.ts                # `lts run` + `lts snapshot`
│           ├── pipeline/01–14*.ts    # the 14 stages
│           ├── clients/              # tavily, dataforseo, peec, llm, github
│           ├── lovable/              # framework-aware code mods
│           ├── lib/domain.ts
│           ├── config/env.ts         # Zod-validated, fail-fast
│           ├── types/index.ts        # single source of truth, all Zod
│           └── scripts/              # smoke-{enrich,codemods,llm}, validate-smoke
├── apps/
│   ├── api/                         # Hono server for the landing demo
│   └── landing/                     # vendored toseo landing (Bun, separate from npm workspace)
├── skills/                          # vendored from coreyhaines31/marketingskills @ 1bcff9fc
│   ├── product-marketing-context/   #   foundation, read by every other skill
│   ├── site-architecture/           #   composed in STRATEGY
│   ├── copywriting/                 #   composed in STRATEGY
│   ├── ai-seo/                      #   composed in STRATEGY
│   ├── schema-markup/               #   composed in STRATEGY
│   ├── seo-audit/                   #   reference (not yet composed)
│   ├── copy-editing/                #   reference (not yet composed)
│   └── competitor-alternatives/     #   reference (not yet composed)
├── docs/
│   ├── peec-research/               # Anton's design docs (analysis of 385 real Peec prompts, generation strategy, skills mapping)
│   ├── ARCHITECTURE.md
│   ├── GEO_PRINCIPLES.md
│   └── POSITIONING.md
└── examples/
    └── founder-mvp/baked-scan.json  # what /api/scan returns in DEMO_MODE=baked
```

---

## How the marketing skills work

Every skill in `skills/` is a folder containing a `SKILL.md` (YAML frontmatter
+ markdown body). They were designed for interactive use inside Claude Code,
where the user triggers them by phrasing.

For our pipeline, we adapt them in two ways:

1. **`pipeline/10-context.ts` pre-populates `.agents/product-marketing-context.md`**
   from Profile + Discover + Peec snapshot output. This is the foundation file
   every skill reads first to skip its 5–15 question setup interview.

2. **`pipeline/11-strategy.ts` composes 4 of the 8 skills**
   (`site-architecture`, `copywriting`, `ai-seo`, `schema-markup`) into a
   single Opus system prompt with a non-interactive preamble. The output is
   structured per-route directives + global JSON-LD blocks, validated against
   a Zod schema.

The other 4 skills (`product-marketing-context`, `seo-audit`, `copy-editing`,
`competitor-alternatives`) are vendored for future expansion or human review —
not yet composed into the strategy pass.

---

## Honest caveats

- **APPLY v1 only mutates the `index.html` shell** (meta tags + JSON-LD)
  for `vite-react` projects. TanStack Start, Next.js, and Astro projects
  still get the right `robots.txt` + `sitemap.xml` written, but the shell
  meta needs to be applied to the framework's `<head>` component manually.
  The strategy output in `strategy.json` tells you exactly what to paste.

- **APPLY v1 doesn't edit React component copy.** The `strategy.copy.*`
  fields (per-component hero/sections/CTA recommendations) appear in the
  report so the founder can apply them in Lovable. Auto-editing JSX is
  considered too risky for the round-trip preservation guarantee.

- **SHIP uses the local `gh` CLI**, not a GitHub App. Works immediately if
  you have push access to the target repo and `gh auth setup-git` has been
  run. `clients/github.ts` has the swap point for a real GitHub App backend.

- **Peec is async.** First snapshot in the same run captures partial
  coverage (the `--wait-peec 90` default helps). Run `lts snapshot` again
  hours later for fuller data. Documented at ~24h lag; in practice we hit
  100% coverage in ~1 hour for an 8-prompt × 7-engine project.

- **DataForSEO Labs requires account verification.** If you see status
  code `40104` / `NOT_VERIFIED`, complete verification at
  [app.dataforseo.com](https://app.dataforseo.com).

- **MCP overlay deferred.** The Python pipeline had an OAuth-gated Peec
  MCP client for `get_actions` recommendations; we deferred this in v1
  since the REST snapshot covers everything needed for the demo. Snapshot
  gracefully returns `[]` when the actions endpoint 404s.

---

## Smoke tests

Three scripts under `packages/core/src/scripts/`:

```bash
# Verify Anthropic key + SDK wiring (one cheap Haiku call)
npx tsx packages/core/src/scripts/smoke-llm.ts

# Run profile + discover only on a real domain (Tavily live, ~$0.05)
npm run smoke:enrich -- forgent.ai

# Run INGEST + AUDIT + APPLY on a local repo (no LLMs, no API spend)
npm run smoke:codemods -- /path/to/cloned-lovable-repo
```

---

## License + credits

MIT. See [LICENSE](LICENSE).

Built on top of:
- [Peec AI](https://peec.ai) — AI-visibility tracking + buyer-query data
- [Tavily](https://tavily.com) — search + extract + research
- [Anthropic Claude](https://anthropic.com) — Sonnet 4.6 + Opus 4.7 + Haiku 4.5
- [DataForSEO](https://dataforseo.com) — ranked-keyword data
- [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — vendored marketing skills
- [elnumae/toseo](https://github.com/elnumae/toseo) — vendored landing page
- Lovable — the apps we make discoverable
