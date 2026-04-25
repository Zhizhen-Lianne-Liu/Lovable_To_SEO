# Worked example — Receiptly (a tiny Lovable MVP)

This is the demo fixture we use on stage. It models the *actual* lovabletoseo wedge: a one-page Lovable founder app with **near-zero LLM visibility** today, fighting incumbents (Wave, QuickBooks, FreshBooks) for buyer mindshare.

The brand is fictional (Receiptly — an AI receipt scanner for freelancers) but the Peec signal is shaped exactly like what a real Lovable founder would see in their first month.

## The setup

- Lovable repo: `https://github.com/founder/receiptly` (substitute your own demo repo)
- Peec project: `demo`

## Run it

```bash
PEEC_FIXTURE=examples/founder-mvp/peec-fixture.json \
ANTHROPIC_API_KEY=sk-ant-... \
  npm run dev -- run \
    --repo https://github.com/founder/receiptly \
    --project-id demo
```

Add `--open-pr` once you've got `gh auth status` working to push a real PR.

## The two reveals on stage

**Reveal 1 — the SPA-invisibility problem.** Open `out/<run-id>/02-prerendered.html`. Show that the cloned Lovable repo's `index.html` is just an empty `<div id="root">` — that's what Google and ChatGPT see today. The prerendered output is the same page but with all the React-rendered content baked into static HTML. Same Tailwind styles, same hydration scripts, but now *crawlable*. **This artifact alone is shippable** — it works without any Peec data.

**Reveal 2 — the Peec-driven enhancement.** Open `out/<run-id>/04-brief.md` and `out/<run-id>/site/index.html`. Peec told us:

- Top 3 buyer queries are *comparison-shaped* ("Wave vs FreshBooks", "alternative to QuickBooks").
- Buyers filter on *cost* ("no monthly fee").
- LLMs cite UGC threads (Reddit) and editorial roundups (NerdWallet) — not vendor pages.

The enhancer layered into the prerendered HTML:
- A `<title>` and `<meta description>` targeting "AI receipt scanner that exports to spreadsheet"
- A direct-answer-first H2 ("Free, forever, with no row caps")
- A real `<table>` comparing Receiptly / Wave / QuickBooks / FreshBooks
- An FAQ section using the actual Peec query strings as questions
- JSON-LD `Organization` + `SoftwareApplication` + `FAQPage` blocks
- Improved alt text on hero imagery

The PR description quotes back the exact buyer queries from Peec so the founder sees *why* each edit was made. **Same layout. Same brand voice. New cite-ability.**

## Why this beats the LovableHTML approach

LovableHTML prerenders what's there. If the Lovable page already says "Track receipts, save time" — that's what gets indexed. Empty content stays empty.

We do both halves: convert the SPA to static HTML *and* enhance the content per Peec signal. That's the difference between getting indexed and getting cited.
