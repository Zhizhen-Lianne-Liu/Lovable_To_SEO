# Marketing Skills — Deep Analysis vs the New Workflow

## The new workflow (as I understand it)

```
[website]                  --> import module (done)
[competitors]              --> colleague's module
[scrape competitor sites]  --> colleague's module
[extract SEO keywords]     --> me (?)
[transform → Peec prompts] --> me
[Peec employees paste]     --> manual, out of scope
```

Open question: who owns *keyword extraction* — colleague (because they already have the scraped content in memory) or me (because the keywords are an input to my prompt generator)? My take: **colleague delivers raw scraped pages with structure (titles, H1s, slugs, body). I extract keywords inside my module so the extraction logic stays adjacent to the prompt-construction logic. Cleaner contract.**

## Skill-by-skill verdict for this workflow

I read 07, 33, 35, 38, and 42 in full. Verdicts:

### Skill 07 — search-term-mining → **TIER 1, KEEP**

Originally designed for Google Ads search-term reports, but the framework transfers cleanly. From the example: it groups raw terms into 5 themes — *integration-specific* (Salesforce, HubSpot), *use-case* (lead scoring), *comparison* (vs X), *pricing*, *enterprise*. **Those are exactly the Peec-prompt frames.** It's a built-in clustering + theming engine for any keyword corpus, including one extracted from competitor content. Use this in step 1 (consolidate keywords across competitors).

### Skill 42 — programmatic-seo-builder → **TIER 1, MVP-CRITICAL**

This is the bridge skill I missed in the earlier analysis. It contains the literal mapping from keyword → SEO-title format, and SEO titles are essentially Peec prompt shapes. From the skill's own table:

| Their pattern | Maps to Peec frame |
|---|---|
| `/best-[category]-for-[use-case]` → "Best CRM for Startups" | **B2 "Best/Top X for Y"** (40% of Peec corpus) |
| `[Product A] vs [Product B]: [Year]` → "Notion vs Airtable 2025" | **B4 "A vs B"** (10% of corpus) |
| `What is [Term]? Definition + Guide` → "What is SEO?" | **B1/awareness** |
| `How to [Action] + [Modifier]` → "How to convert PDF to Word free" | **B3 problem-solution** |

This means the keyword→prompt transformation is not "ask an LLM to do it" — it's a **deterministic template fill**, with the LLM only deciding *which* template to use per keyword. Way more reliable, way cheaper.

### Skill 38 — icp-research-assistant → **TIER 1, KEEP**

Critical for the *filter* step, not the generation step. Without it we'll naively mirror whatever competitors target. ICP-research gives us the persona-language ("knowledge workers", "HR teams", "engineers building custom revenue tools") that lets us *qualify* generic competitor keywords into specific Peec prompts. Real Peec data showed specificity comes from "category + persona + constraint" stacking — skill 38 produces the persona+constraint half of that.

### Skill 33 — competitor-teardown → **TIER 2, OPTIONAL**

The 100-point messaging-hierarchy rubric is overkill for prompt generation. What we actually need is the *positioning* output: "what problem do they solve, who's their ICP, what unique mechanism do they claim". That's the first 4 lines of the skill's output. Run skill 33 *once per competitor* but only consume the value-prop section. Skip the scoring rubric.

### Skill 35 — e2e-seo-assistant → **DEMOTE to reference-only**

Comprehensive but redundant for our use case. Its "Content Gap Framework" is good ("competitor keywords - what they rank for, you don't") but skill 07 covers the same ground more tightly. Its content-brief output is downstream of where we operate. Keep as a fallback if 07's clustering is too thin.

### Other skills I considered and rejected

| Skill | Why not |
|---|---|
| 13 competitor-creative-analysis | About ad creatives, not search |
| 20 keyword-cannibalization | Self-overlap, not what we need |
| 34 content-repurposer | Output format is wrong (atomized social, not prompts) |
| 09 ad-copy-variant-generator | Ad copy, not search prompts |

## My honest take on the competitor-keyword-injection strategy

**What's strong:**

1. **Real-world grounded.** Competitor blog content is empirical evidence of which keywords/topics already rank. Way better than LLM-imagined queries.
2. **Defensible to Peec employees.** "These prompts come from your top 5 competitors' actual content clusters" is a sentence that lands.
3. **Composable.** If colleague's scraper improves, our prompt set improves automatically. No coupling.

**What's weak — and what we need to add to make it work:**

1. **Bare keywords are an anti-pattern in Peec.** The 385-prompt analysis caught real users pasting raw SEO strings ("kreditkarte ohne schufa 2026") and noted these produce inconsistent chats. **We MUST run keywords through the skill-42 template-fill step before submission.** Cannot ship raw keywords as prompts.

2. **Pure mirroring loses our wedge.** If 5 competitors all target *"best CRM for agencies"*, we'll generate 50 prompts about that exact keyword. Zero will test what makes *us* different. Fix: the ICP/positioning step (skill 38 + skill 33's value-prop section) should output 1–3 *differentiator constraints* (e.g. "for agencies that bill hourly", "for music booking specifically"). Every Peec prompt then becomes `competitor_keyword + our_constraint`. Forces our wedge into the prompt set instead of pure mirroring.

3. **Keyword scraping is biased toward commercial intent.** Competitor blog SEO targets are 80%+ "best/top/vs/alternatives" — mid-to-late funnel. Real Peec data has ~20% awareness/concern questions ("Will EVs hold their value?"). Pure keyword extraction will *miss this entirely.* Fix: derive awareness prompts not from competitor *keywords* but from competitor *pain-point copy* — the headlines, the H2s on their blog posts that frame the problem. Use skill 38's pain-point taxonomy to harvest these.

4. **Brand-eval prompts (`<our brand> vs <competitor>`) need separate handling.** Pure keyword extraction won't surface these because no competitor blog says "us vs you". Fix: for each competitor we scrape, deterministically generate one `our_brand vs competitor_brand for primary_use_case` prompt. ~5 head-to-heads guaranteed per run, regardless of what the keyword extraction returns.

5. **Volume + dedup.** 5 competitors × 100 blog posts × ~5 head keywords each ≈ 2500 keyword candidates. Skill 07's grouping handles this. But we still need a hard top-N cap *before* template-fill, otherwise we're paying LLM tokens on noise.

6. **Localization.** If the imported site is German, do we send German Peec prompts? My take: **language must match the imported site's primary content language.** Detect from `<html lang>` and meta tags during the import stage. Set `country_code` accordingly. We already have the import module producing the workdir, so this is cheap.

## Revised stage 2 pipeline

```
[ImportResult.workdir]  +  [competitor_scrapes from colleague]
        |
        v
[1. EXTRACT brand profile]                       (skill 38 + skill 33)
   Output: { brand, category, personas[], pains[],
             positioning, differentiator_constraints[2-3] }
        |
        v
[2. EXTRACT + CLUSTER competitor keywords]       (skill 07 — keyword theming)
   Output: { themes: [{ name, keywords[], intent: 'commercial'|'awareness',
                       source_competitors[], frequency }] }
        |
        v
[3. RELEVANCE FILTER]                            (LLM call: brand profile × themes)
   Drop themes that don't intersect our ICP / positioning.
   Score: ICP match × competitive importance × topical fit.
   Cap: top 20 themes.
        |
        v
[4. TEMPLATE-FILL → Peec prompts]                (skill 42 patterns, deterministic)
   For each surviving theme keyword:
     - Map to one of: "Best X for Y", "A vs B", "What is X", "How to Y"
     - Inject one differentiator_constraint as the qualifier
     - Localize to website language
        |
        v
[5. INJECT brand-eval prompts]                   (deterministic, per competitor)
   For each competitor: "<our_brand> vs <competitor> for <primary_use_case>"
        |
        v
[6. INJECT awareness prompts]                    (skill 38's pain-points → questions)
   ~10-15 open category-concern questions derived from pains, not from keywords
        |
        v
[7. QUALITY FILTER]                              (length cap, tone, dedup, brand-leak)
        |
        v
[PromptSet — ~25-50 prompts, balanced funnel-stage taxonomy]
```

Steps 4, 5, 6 give us **all three Peec frames** in their **observed proportions** (40% best/top, 10% comparison, ~20% awareness, plus brand-eval).

## What I need from you to lock the design

1. **Who owns keyword extraction**: colleague (delivers `keywords[]`) or me (colleague delivers `scraped_pages[]`, I extract)? My recommendation: I do it, fed by structured scraped pages.
2. **The brand-eval question**: for the `<our brand> vs <competitor>` prompts, do we always want them, or only when the brand has explicitly positioned against that competitor? Default-always is simpler and matches Peec's "track these separately" guidance.
3. **Differentiator constraints**: agent-derived from skill 38, or user-supplied at runtime? Hybrid is best: agent suggests 3, user can override one in the UI.
4. **Awareness-prompt sourcing**: from competitor pain-point copy (richer, slower) or from skill 38 alone (faster, less grounded)? My pick: pain-point copy if colleague's scraper exposes blog post H2s; skill 38 fallback otherwise.

## Revised skill set (final)

| Tier | Skill | Role |
|---|---|---|
| 1 | 07 search-term-mining | Cluster + theme keywords from competitor scrapes |
| 1 | 38 icp-research-assistant | Persona, pains, differentiator constraints |
| 1 | 42 programmatic-seo-builder | Keyword → Peec-prompt template fill |
| 2 | 33 competitor-teardown (positioning section only) | Per-competitor positioning context |
| Ref | 35 e2e-seo-assistant | Fallback content-gap framework |

Down from the original 3 to a tighter 3+1+ref. Less to load, less to render, sharper.
