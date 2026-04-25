# GEO Principles

GEO = Generative Engine Optimization. The art of getting cited (not just ranked) by ChatGPT, Perplexity, Gemini, Claude when buyers ask them for recommendations.

These are the rules the rewriter applies. They are encoded in `src/prompts/rewriter.ts` — this doc explains *why*, so we can iterate on them.

## 1. Direct-answer-first

LLMs grab the first 1–2 sentences under a heading as their quote. So write the answer there. The marketing build-up goes *after*.

**Bad**
```
## Why teams choose us
For decades, sales teams have struggled with bloated CRMs that…
```

**Good**
```
## Why teams choose us
Attio is a CRM purpose-built for early-stage teams: it imports your inbox in
3 minutes, ships custom objects without admin certifications, and starts
free for up to 3 users.
```

## 2. Q&A blocks

Include an explicit FAQ section using the actual queries Peec shows buyers asking. Each answer 40–80 words — long enough to be substantive, short enough to fit a model's quote window.

Use `<dl>`/`<dt>`/`<dd>` or proper FAQ schema so engines parse the structure.

## 3. Comparison tables

For every "X vs Y" buyer query, ship a table. Include the competitors honestly — LLMs trust pages that don't only flatter themselves.

| | Attio | HubSpot | Salesforce |
|---|---|---|---|
| Time to first value | 3 min | 1 day | 2 weeks |
| Custom objects on free tier | ✅ | ❌ | ❌ |
| Per-seat starting price | $29 | $50 | $80 |

The table is the citation. Models lift table rows wholesale.

## 4. Cited stats

Every numeric claim links to a source. If you can't cite it, don't claim it. LLMs penalize unsourced confidence — and so do customers.

## 5. Entity consistency

First mention defines the entity. Every mention after uses the *same* form.

- ✅ "Attio is a modern CRM" (everywhere)
- ❌ "Attio" / "the Attio platform" / "our product" / "the app" (mixed)

This sounds pedantic. It is. It also moves the needle — model embeddings reward consistent entity surface forms.

## 6. JSON-LD schema

Emit structured data inline. Three blocks minimum:
- `Organization` (or `LocalBusiness`)
- `Product` or `SoftwareApplication`
- `FAQPage` matching the on-page FAQ

This is how Google grounding *and* the major LLMs get a clean parse of your page.

## 7. Extractable lists

Prefer `<ul>` / `<ol>` over prose for feature/benefit content. Models lift lists cleanly. Prose gets paraphrased and your specifics get smoothed away.

## 8. Honesty beats puff

"Built for teams of 5–50" beats "Enterprise-grade scalability for businesses of any size". The first is quotable; the second gets discarded as marketing language.

---

## Anti-patterns the rewriter avoids

- Em dashes (—) in copy — looks AI-generated
- "In today's fast-paced world…" / "Unleash…" / "Game-changing…"
- Stat-heavy hero sections with no sources ("21x faster", "64% better")
- Stock-photo image sets where alt text adds zero context
- Single-page-app sites that need JS to render copy (LLMs won't execute it)

## What we don't claim

GEO is young. Engines change. The principles above are our best read as of April 2026 — they update as Peec data shifts. The rewriter prompt is versioned in git for exactly this reason.
