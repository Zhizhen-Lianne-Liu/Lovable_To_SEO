# Worked example — Receiptly (a tiny Lovable MVP)

This is the demo fixture we use on stage. It models the *actual* lovabletoseo wedge: a one-page founder app with **near-zero LLM visibility** today, fighting incumbents (Wave, QuickBooks, FreshBooks) for buyer mindshare.

The brand is fictional (Receiptly — an AI receipt scanner for freelancers) but the Peec signal is shaped exactly like what a real Lovable founder would see in their first month.

## The setup

- Lovable repo: `https://github.com/founder/receiptly` (substitute your own demo repo)
- Live URL: `https://receiptly.lovable.app`
- Peec project: `demo`

## Run it

```bash
PEEC_FIXTURE=examples/founder-mvp/peec-fixture.json \
ANTHROPIC_API_KEY=sk-ant-... \
  pnpm dev run \
    --repo https://github.com/founder/receiptly \
    --url https://receiptly.lovable.app \
    --project-id demo
```

Add `--open-pr` once you've got `gh auth status` working to push a real PR.

## What the founder sees

Before — the Lovable hero copy is generic ("Track receipts, save time"). LLMs never quote this page; they quote Wave, QuickBooks, NerdWallet.

After (the rebuilt `seo/index.html` PR) — Peec told us:
- Top 3 buyer queries are *comparison-shaped* ("Wave vs FreshBooks", "alternative to QuickBooks").
- Buyers filter on *cost* ("no monthly fee").
- LLMs cite UGC threads (Reddit) and editorial roundups (NerdWallet) — not vendor pages.

So the rebuilder ships:
- A `<title>` that targets "AI receipt scanner that exports to spreadsheet"
- A direct-answer-first H2 ("Free, forever, with no row caps")
- A real comparison table — Receiptly / Wave / QuickBooks / FreshBooks
- An FAQ section using the actual Peec query strings as questions
- JSON-LD `Organization` + `SoftwareApplication` + `FAQPage` blocks
- A first-paragraph stat ("scans 50 receipts in under 60 seconds") with a real cited source

The PR description quotes back the exact Peec opportunity scores so the founder sees *why* each edit was made.

## Why this beats the LovableHTML approach

LovableHTML prerenders what's there. If the Lovable page already says "Track receipts, save time" — that's what gets indexed. Empty content stays empty.

We rebuild the *content itself* against Peec signal. That's the difference between getting indexed and getting cited.
