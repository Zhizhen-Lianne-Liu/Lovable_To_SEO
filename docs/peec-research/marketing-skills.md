# Marketing Skills Repo Research

Source: https://github.com/irinabuht12-oss/marketing-skills/

## Repo summary

- **What it is**: "Ryze AI - Claude Marketing Skills." A library of free Claude-compatible marketing skills (prompt templates) covering paid ads audits, SEO, CRO, ICP research, content, and tracking.
- **Who built it**: [Ryze AI](https://get-ryze.ai) — a paid-ads automation product. The skills are marketing collateral for their main product (Clawdbot).
- **Last update**: 2026-02-20 (commit: "Fix frontmatter: move platform into metadata block"). Active.
- **README pitch**: "17 free skills that turn Claude into your marketing assistant." (Repo actually contains 44 Claude skills + 17 Clawdbot agent skills + a 4-agent Ads Crew.)

## Skill format

Skills follow the **Anthropic Claude Skill convention** (frontmatter + Markdown body), not a custom JSON/YAML schema. Each `.md` file is self-contained.

**Frontmatter (YAML):**
```yaml
---
name: e2e-seo-assistant
description: Full SEO workflow covering technical audits, content gaps... Use when given a site and target keywords...
metadata:
  platform: Google
---
```

Fields:
- `name`: kebab-case skill ID
- `description`: 1-3 sentences. Includes a "Use when..." trigger phrase for skill routing.
- `metadata.platform`: one of `Google`, `Meta`, `Google and Meta`, `LinkedIn`, `Reddit`.

**Body structure (consistent pattern):**
1. `# Title` + 1-line tagline
2. `## Process` — 5-7 numbered steps
3. Several `## <Framework / Checklist>` sections with tables
4. `## Output Format` — fenced code block with a fillable Markdown report template (often using `[bracketed placeholders]` and traffic-light emoji `🟢/🟡/🔴`)
5. `## Example` — sample input + sample filled output
6. `## Guidelines` — bullet-point heuristics

**How to parameterize**: skills do NOT define explicit input variables. Inputs are described in prose ("Use when given a site and target keywords"). The agent must extract intended inputs from `description` + `Process` step 1 + `Example` input. Output format is a Markdown template the model fills in.

## Repo structure

```
README.md
Skills for Claude/        # 44 .md files (numbered 01-44) — main library
Skills for Clawdbot/      # 17 .md files — Clawdbot product agent skills
Clawdbot Ads Crew/        # 4 agent personas + workflow.md
all-marketing-skills.zip
banner.png
```

No top-level manifest / index.json. The README has a curated table of 14 highlighted skills but it is incomplete vs the actual file list. **For programmatic use, glob `Skills for Claude/*.md` and parse frontmatter directly.**

## Full skill inventory (Skills for Claude)

| # | Name | Path | Description |
|---|------|------|-------------|
| 01 | cpa-diagnostics | `Skills for Claude/01-google-and-meta-cpa-diagnostics.md` | Diagnose CPA spike root causes across audience, bid, creative, LP, budget, competitors |
| 02 | wasted-spend-finder | `02-google-and-meta-wasted-spend-finder.md` | Find zero-conversion search terms / placements / audiences; produce exclusion lists |
| 03 | budget-scenario-planner | `03-...budget-scenario-planner.md` | Model CPA/ROAS/volume impact of budget changes |
| 04 | creative-fatigue-detection | `04-meta-creative-fatigue-detection.md` | Flag fatiguing creatives via frequency/CTR/CPM trends |
| 05 | client-report-narratives | `05-...client-report-narratives.md` | Write executive summary paragraph for client reports |
| 06 | anomaly-detection | `06-...anomaly-detection.md` | Flag unusual perf changes (CPC, CVR, spend, CTR) with context |
| 07 | search-term-mining | `07-google-search-term-mining.md` | Surface high-intent search terms not yet bid on |
| 08 | audience-overlap-analysis | `08-meta-audience-overlap-analysis.md` | Identify cannibalising Meta ad-set overlap |
| 09 | ad-copy-variant-generator | `09-...ad-copy-variant-generator.md` | Generate ad-copy variants based on top performers |
| 10 | landing-page-audit | `10-...landing-page-audit.md` | Audit ad-to-LP message match, CTAs, friction |
| 11 | bid-strategy-recommendations | `11-google-bid-strategy-recommendations.md` | Recommend bid strategy per campaign |
| 12 | day-hour-performance-breakdown | `12-...day-hour-performance-breakdown.md` | Day-of-week / hour-of-day perf with schedule recommendations |
| 13 | competitor-creative-analysis | `13-meta-competitor-creative-analysis.md` | Categorize competitor ads from Meta Ad Library / Google ATC |
| 14 | quality-score-breakdown | `14-google-quality-score-breakdown.md` | Break down Google QS components per keyword |
| 15 | channel-mix-optimizer | `15-...channel-mix-optimizer.md` | Optimal budget split across channels via marginal ROAS |
| 16 | conversion-path-analysis | `16-...conversion-path-analysis.md` | Map funnel drop-offs and stage contributions |
| 17 | account-structure-review | `17-...account-structure-review.md` | Flag over/under-segmentation of campaigns |
| 18 | frequency-cap-recommendations | `18-meta-frequency-cap-recommendations.md` | Recommend Meta frequency caps |
| 19 | roas-forecasting | `19-...roas-forecasting.md` | 30/60/90-day ROAS projections with confidence intervals |
| 20 | keyword-cannibalization-check | `20-google-keyword-cannibalization-check.md` | Find self-competing Google keywords/campaigns |
| 21 | ad-extension-audit | `21-google-ad-extension-audit.md` | Audit Google Ads extensions, write replacements |
| 22 | retargeting-window-analysis | `22-meta-retargeting-window-analysis.md` | Determine optimal retargeting window from conversion lag |
| 23 | campaign-naming-convention-builder | `23-...campaign-naming-convention-builder.md` | Build cross-platform campaign naming convention |
| 24 | geo-performance-analysis | `24-...geo-performance-analysis.md` | Geographic perf breakdown + bid adjustments (NB: "geo" = geography, not GEO/AI search) |
| 25 | device-performance-split | `25-...device-performance-split.md` | Mobile/desktop/tablet perf splits |
| 26 | attribution-model-comparison | `26-...attribution-model-comparison.md` | Compare attribution models side-by-side |
| 27 | pacing-monitor | `27-...pacing-monitor.md` | Track daily spend vs monthly target |
| 28 | ab-test-setup-and-analysis | `28-...ab-test-setup-and-analysis.md` | Design + monitor + call A/B tests with stat sig |
| 29 | performance-benchmarking | `29-...performance-benchmarking.md` | Compare metrics vs vertical benchmarks |
| 30 | weekly-account-summary | `30-...weekly-account-summary.md` | Plain-English weekly multi-account summary |
| 31 | ab-test-analyzer | `31-...ab-test-analyzer.md` | Stat-sig calculator + sample size + next-test ideation |
| 32 | ad-spend-allocator | `32-...ad-spend-allocator.md` | Multi-channel reallocation via MER + marginal ROAS |
| 33 | competitor-teardown | `33-...competitor-teardown.md` | Positioning/messaging/CTA teardown of competitor LPs |
| 34 | content-repurposer | `34-...content-repurposer.md` | Atomize 1 pillar into 8+ platform-specific derivatives |
| 35 | e2e-seo-assistant | `35-google-e2e-seo-assistant.md` | Full SEO: technical + on-page + content gaps + backlinks + briefs |
| 36 | email-sequence-writer | `36-...email-sequence-writer.md` | Full nurture sequences with subject + preview + body |
| 37 | google-ads-audit | `37-google-ads-audit.md` | Full Google Ads diagnostic |
| 38 | icp-research-assistant | `38-...icp-research-assistant.md` | B2B persona builder: pains, objections, triggers, angles |
| 39 | landing-page-audit (CRO version) | `39-...landing-page-audit.md` | CRO LP audit, prioritized by impact |
| 40 | linkedin-ads-audit | `40-linkedin-ads-audit.md` | LinkedIn Ads B2B audit |
| 41 | meta-ads-audit | `41-meta-ads-audit.md` | Meta/FB/IG account audit |
| 42 | programmatic-seo-builder | `42-google-programmatic-seo-builder.md` | Scalable pSEO templates + schema + linking |
| 43 | reddit-ads-audit | `43-reddit-ads-audit.md` | Reddit Ads audit |
| 44 | utm-tracking-generator | `44-...utm-tracking-generator.md` | UTM + GA4 event naming taxonomy |

(Clawdbot folders are operational agent specs for Ryze's product and not relevant to a Peec AI prompt-template use case.)

## Top picks for GEO / Peec AI use case

Important caveat: **no skill in this repo is purpose-built for AI-search visibility (GEO / answer-engine optimization)**. The closest fits are SEO + competitor + ICP + LP analysis skills that produce structured brand/positioning data Peec AI can rank against.

| Rank | Skill | Path | Inputs (extracted) | Output format |
|---|---|---|---|---|
| 1 | e2e-seo-assistant | `Skills for Claude/35-google-e2e-seo-assistant.md` | site URL + target keywords | Markdown report: technical health score, on-page issues table, content gaps table, backlink opps, content brief, prioritized action plan, confidence level |
| 2 | competitor-teardown | `Skills for Claude/33-...competitor-teardown.md` | competitor URL or screenshot | Value prop analysis, messaging hierarchy scorecard (100pt rubric), strengths/weaknesses, differentiation recommendations |
| 3 | icp-research-assistant | `Skills for Claude/38-...icp-research-assistant.md` | product + target market | Persona doc: demographics, psychographics, buying behavior, pain points, objections, triggers, messaging angles |
| 4 | landing-page-audit (CRO) | `Skills for Claude/39-...landing-page-audit.md` | LP URL or screenshot | Above-fold eval, headline framework scoring, trust signals audit, prioritized fix list |
| 5 | programmatic-seo-builder | `Skills for Claude/42-google-programmatic-seo-builder.md` | niche + data source | Page-type definition, title pattern, template, internal-linking plan, JSON-LD schema |
| 6 | content-repurposer | `Skills for Claude/34-...content-repurposer.md` | one pillar piece (URL or text) | LinkedIn posts, tweet threads, email snippets, ad hooks, video scripts |
| 7 | ad-copy-variant-generator | `Skills for Claude/09-...ad-copy-variant-generator.md` | top-performing ads | New ad-copy variants matched to winning patterns |

Why these: a Peec AI ranking workflow needs (a) a clear positioning + ICP profile of the brand to know what queries to test, (b) a competitor benchmark to compare AI-search visibility against, and (c) an SEO/content brief to drive remediation. Skills 1-4 cover that loop.

## Notes on programmatic use

1. **Loader**: `glob('Skills for Claude/*.md')` then for each file, parse YAML between the first two `---` lines. Use `gray-matter` (Node) or `python-frontmatter` (Python).
2. **Index**: build an in-memory registry keyed by `name`, with fields `{name, description, platform, body, path}`. The `description` field's "Use when..." clause is the routing signal — feed it to a router LLM/agent for skill selection.
3. **Parameterization**: skills are not parameterized templates with variables. To make them callable, wrap each skill body in a system prompt and pass user-supplied inputs (URL, brand, keywords) as the user message. The body of the skill stays static; the user message slot carries the input. Example pattern:
   ```
   system = skill.body
   user   = f"Site: {url}\nTarget keywords: {keywords}"
   ```
4. **Output parsing**: each skill's `## Output Format` block defines the report shape. To structure for downstream Peec AI submission, post-process the Markdown (or instruct the model to emit JSON matching the same shape). For Peec AI specifically, you likely want to extract: brand name, target queries/topics, competitor list, content URLs.
5. **Caveat**: skill quality is even but generic. They are prompt scaffolds, not workflows with tool calls. None hit external APIs — all rely on user-pasted data or model knowledge. Add your own data-fetch step (URL fetch, SERP scrape) before invoking.
