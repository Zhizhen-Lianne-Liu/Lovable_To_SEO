# Worked example — Attio vs Salesforce/HubSpot

This is the demo run we use to show judges what the pipeline produces.
The Peec data is a hand-curated fixture that mirrors what the live MCP returns
for the Peec test project.

## Run it

```bash
PEEC_FIXTURE=examples/attio/peec-fixture.json \
ANTHROPIC_API_KEY=sk-ant-... \
  pnpm dev run https://attio.com --project-id demo
```

(Substitute the real Lovable URL for the Attio test project when demoing.)

## What you should see in `out/<run-id>/`

- **02-diagnose.json** — the Peec signal: Salesforce dominates SoV (0.51), HubSpot
  is second (0.34), Attio sits at 0.11 with a sentiment edge. The top three actions
  are: build a head-to-head comparison page, ship more G2 reviews, make pricing
  extractable.
- **03-brief.md** — the strategist's plan, naming the 5 buyer queries to win
  and the page edits priority-ordered.
- **04-optimized.html** — the rewritten page. Things to check:
  - new `<title>` targets "modern CRM alternative to Salesforce"
  - first H2 answer is a single citable sentence
  - new `<table>` comparing Attio / HubSpot / Salesforce honestly
  - new FAQ section with the actual buyer queries
  - JSON-LD blocks for Organization + SoftwareApplication + FAQPage
- **report.md** — exec summary you can paste into Slack.

## What to point at on stage

The strategist's brief is the wow moment — it cites real Peec query strings
and real opportunity scores, not generic SEO advice. That's the unlock: every
recommendation traces back to a buyer who actually asked an LLM that question.
