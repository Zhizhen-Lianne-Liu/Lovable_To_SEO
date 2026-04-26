# Peec AI — Prompt Patterns

What a *good prompt* looks like inside Peec AI. Evidence: (a) Peec's blog on prompt selection, (b) third-party reviews, (c) **385 real prompts** pulled from 14 live projects via `GET /customer/v1/prompts?project_id=...` with `$PEEC_API_KEY`. API contract: prompt = string 1–200 chars + `country_code` + optional `topic_id`/`tag_ids` (see `peec-api.md`).

## Real example prompts

All verbatim. API source = `GET /customer/v1/prompts?project_id=…`.

1. `What's the best CRM for marketing agencies under 50 people?` — [docs.peec.ai/intro-to-peec-ai](https://docs.peec.ai/intro-to-peec-ai)
2. `Will electric vehicles hold their value?` — [blog: how-to-choose-the-right-prompts-for-llm-tracking](https://peec.ai/blog/how-to-choose-the-right-prompts-for-llm-tracking)
3. `Best electric cars under $50k` — same blog
4. `Online banks with minimal fees for international transfers` — same blog
5. `Best banking apps for teaching kids about money` — same blog
6. `Tesla vs Rivian` — same blog
7. `Attio vs Salesforce for complex multi-source data integration` — API `or_47ccb54e…`
8. `Best CRM for engineers building custom internal revenue tools` — API `or_47ccb54e…`
9. `Easiest CRM to integrate with Slack and external product databases` — API `or_47ccb54e…`
10. `Best deodorant balm without aluminum or baking soda` — API `or_516942aa…` (AKT London)
11. `Compare Wild vs Native vs AKT London deodorant` — same project
12. `Best natural deodorant for heavy sweaters` — same project
13. `Nothing Ear (3) vs Sony WF-1000XM5 for sound quality` — API `or_faaa7625…`
14. `Best minimalist smartphone for design students under $500` — same project
15. `What is the best CRM for music booking agencies?` — API `or_f6b948e9…`
16. `Welche Banking-App bietet die fairsten Wechselkurse für den Urlaub?` — API `or_9f405267…` (Revolut, DE)
17. `初心者カップルのためのマインドフルネスエクササイズ` — API `or_d59b90de…` (TwoBreath, JP)
18. `BYD sustainability initiatives compared to other global EV brands` — API `or_52698861…`

## Prompt patterns observed

Across 385 real prompts:

- **Length is short.** Median **54 chars / 8 words**, mean 52.8, range 11–161. Almost no one uses the full 200-char budget — it's a guardrail, not a target.
- **Most prompts are NOT questions.** Only **19%** end with `?`. The dominant shape is an imperative noun phrase: *"Best CRM for X"*, *"Compare A vs B for Z"*.
- **Top opening words** (~50% of corpus): `best` (50), `how`/`what` (22 each), `which` (21), `compare` (20), `most` (16), `top` (15).
- **Three dominant frames:**
  1. **"Best/Top X for Y"** — superlative + category + qualifier. ~40% of corpus.
  2. **"A vs B [for use case]"** — head-to-head, e.g. *"Tesla vs Rivian"*. ~10%, but highest late-funnel signal.
  3. **Open concern question** — e.g. *"Will electric vehicles hold their value?"*. Awareness-stage; tracks category sentiment.
- **Brand usage is bimodal.** Either fully non-branded, or brand appears in a comparison (*"Attio vs HubSpot…"*). Solo branded prompts are rare; Peec's blog says to "include brand evaluation prompts separately" so they don't skew aggregate visibility.
- **Specificity comes from stacked qualifiers, not length.** Good prompts = category + persona + constraint. e.g. *"Best CRM platforms for product-led growth teams tracking user adoption"*.
- **Localization is per-prompt.** German and Japanese projects use native-language prompt text, not English plus a country code. `country_code` sets the IP origin; the text itself is also translated.

## What makes a good Peec prompt

1. **Short and declarative, ~6–12 words.** Match the median. If it doesn't fit in 100 chars you're stacking too many qualifiers.
2. **Lead with a buyer frame, not your brand.** Start with `best`, `top`, `compare`, `which`, `how`. Peec's blog: track non-branded prompts capturing "the actual discovery opportunity."
3. **Stack one persona + one constraint.** *"Best X for [persona] [doing Y]"*. Generic *"Best CRM"* is too broad; *"Best CRM for music booking agencies"* gives a real retrieval target.
4. **Use head-to-head prompts for late-funnel.** `<Brand> vs <Competitor> for <use case>` is the highest-intent shape. Tag separately so it doesn't inflate awareness visibility.
5. **Cover all three funnel stages.** Peec recommends 10–20 awareness + 20–30 consideration + a small purchase/brand-eval set. ~25 total is the entry-plan limit.
6. **Localize the text, not just `country_code`.** If country is DE, write in German.
7. **Tag aggressively.** Funnel stage, persona, geo, product line. Peec's reporting joins on tags; untagged prompts can't be sliced.

## Anti-patterns

- **Branded-only as the bulk.** *"Is Tesla worth it?"* — high mention rate, near-zero learning. Use sparingly, tag as brand-eval.
- **Single-keyword prompts.** Real API example: `kreditkarte ohne schufa 2026`. SEO keyword pasted verbatim — AI surfaces answer it inconsistently across runs.
- **Vague superlatives with no qualifier.** Real: *"What is the most popular car brand?"* (`or_14bf78d5`). Model picks a stable global default; almost no daily variance to learn from.
- **Off-topic test prompts.** Real: *"What is the best kebap restaurant in Berlin?"* in a battery-manufacturer project. Burns a daily-run credit on noise.
- **Stuffed prompts near the 200-char limit.** Real (158 chars): *"Give me good battery cars in the european market in 2026, which gives good leasing options with insurance and good less carbon footprints in their supply chain"*. Models compress this differently each run, killing comparability.
- **(Constructed)** Avoid opinion or future-prediction prompts (*"will X exist in 2030?"*) — answers drift, metrics get noisy.

## Implications for agent design

An agent auto-generating Peec prompts from a website should (1) extract the site's primary **category**, **personas**, and 2–3 differentiating **constraints**, then (2) emit three buckets: ~12 awareness concern-questions, ~18 *"Best/Top [category] for [persona+constraint]"* consideration prompts, and ~5 *"[Brand] vs [Competitor]"* head-to-heads. Target 6–12 words, native language for the country code, with funnel/persona tags pre-attached. Optimize for **specificity via stacked qualifiers**, never single keywords or branded-only. Median target: 54 chars, 8 words.
