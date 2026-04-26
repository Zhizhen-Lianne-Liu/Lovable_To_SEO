# Extraction Strategy — From Scraped Pages to Peec Prompts

## Module scope (locked)

- **Input**: `scraped_pages[]` from colleague's scraper. One entry per page across all competitors. Plus our own imported website's workdir for self-context.
- **Output**: `PromptSet { prompts: GeneratedPrompt[] }` — ready for a Peec employee to paste.

```
[scraped_pages from N competitors]  +  [our website context]
                |
                v
        [this module]
                |
                v
[PromptSet — 30 prompts default, configurable]
```

## Prompt count & taxonomy

Default total: **30 prompts**. Configurable via `opts.totalPrompts`.

| Bucket | Default count | Share | Generation method |
|---|---|---|---|
| Awareness — open category questions and concern-framed | 8 | 27% | Pain language from blog post H1/H2 + skill 38 |
| Keyword-based — "Best X for Y", scenario, how-to, comparison | 18 | 60% | Skill 07 keyword themes + skill 42 template-fill |
| Brand-eval — `<our_brand> vs <competitor>` | 4 | 13% | Deterministic, one per top competitor |

Rationale: matches the 385-prompt real-Peec corpus distribution (~40% best/top + ~10% A vs B + ~20% awareness + scenario + brand). Fits Peec entry-tier plan (~25 prompts).

**Tagging (mandatory)**: every prompt is tagged with `funnel_stage` (awareness | consideration | brand-eval), `country_code`, and `source_competitor` (or `none` for non-keyword-derived). Peec's reporting joins on tags; untagged prompts can't be sliced.

**Degradation rule**: if upstream signals are thin (e.g. <10 themed keywords across all competitors), scale the keyword bucket DOWN to what we have rather than padding. Never pad to hit 30.

## Page segmentation — read by type, not all the same

A general "read every page the same way" approach treats homepages like blog posts and loses signal. We classify each page first, then extract type-specific signals.

### Step 0: page-type classifier

Inputs: URL, H1, meta description, first 200 words of body.
Output: one of 7 types.

```
homepage      | URL = root, H1 mentions company tagline, "Sign up" CTA visible
pricing       | URL contains /pricing or /plans, H2s like "Free / Pro / Enterprise"
product       | URL like /product/* /features/* /solutions/*, feature-listing structure
blog_post     | URL contains /blog/ /resources/ /guides/, dated, narrative body
comparison    | URL like /vs/* /alternatives/*, H1 contains " vs " or "alternatives"
customer      | URL like /customers/* /case-studies/*, contains a customer name + outcome
docs          | URL contains /docs/ /help/ /support/, technical structure (code blocks, steps)
```

Cheap classifier: regex on URL + H1 keywords. Fall back to LLM only when ambiguous.

### Per-type extraction logic

Each page type has its own extraction prompt and produces a slice of `CompetitorIntel`.

| Type | What to extract | Used for |
|---|---|---|
| **homepage** | `brand_name`, `tagline`, `primary_value_prop`, `top_3_features`, `icp_language[]` (job titles, industries mentioned), `category_self_label` ("the operating system for X") | Builds *positioning context*. Drives the differentiator step. Fed to skill 33's value-prop section. |
| **pricing** | `tier_names`, `tier_target_segments` ("for teams", "for enterprise"), `feature_per_tier` summary | *ICP refinement*. Distinguishes prosumer vs enterprise positioning per competitor. |
| **product** | `value_prop_expansions[]`, `use_case_names[]`, `integration_names[]` | *Long-tail keyword fodder* and *jobs-to-be-done* sources. |
| **blog_post** | `slug_keyword` (from URL), `primary_keyword` (from H1), `secondary_keywords[]` (from H2s), `pain_language[]` (from intro paragraph), `audience_cue` (job role mentioned) | **The keyword extraction core.** Feeds skill 07's clustering. |
| **comparison** | `mentioned_competitors[]`, `framing_axes[]` ("price", "ease of use", "integrations"), `target_use_case` | *Direct competitor list* + brand-eval prompt seeds. |
| **customer** | `customer_industry`, `customer_size`, `customer_role`, `outcome_metric` | *ICP refinement*. Real customers reveal the actual segment vs marketing claims. |
| **docs** | `feature_names[]`, `integration_names[]`, `task_names[]` ("How to X"), `glossary_terms[]` | *How-to / use-case keywords* and *informational prompts*. |

### Common signal schema

Every extraction emits a slice of:

```ts
type CompetitorIntel = {
  competitor_domain: string;
  pages_analyzed: { url: string; page_type: PageType }[];

  // Positioning (from homepage + product + customer pages)
  positioning?: {
    category_label: string;
    value_prop: string;
    differentiators: string[];
  };

  // ICP signals (from pricing + customer + homepage)
  icp_signals: {
    job_titles: string[];        // ["heads of growth", "RevOps managers"]
    industries: string[];        // ["agencies", "fintech"]
    company_sizes: string[];     // ["startups", "enterprise"]
  };

  // Pain language (from blog intros + homepage)
  pains: string[];               // ["tracking attribution across 5 channels", "no-code is too rigid"]

  // Keyword surface (from blog posts + product + docs)
  keywords: {
    text: string;                // "best CRM for music agencies"
    intent: 'commercial' | 'informational' | 'navigational';
    source_url: string;
    source_page_type: PageType;
  }[];

  // Direct competitor mentions (from comparison + about pages)
  named_competitors: string[];
};
```

## Per-competitor first, then aggregate

Extract `CompetitorIntel` for each competitor in isolation. THEN aggregate across competitors:

```ts
type AggregatedIntel = {
  consensus_keywords: KeywordTheme[];   // 3+ competitors target it → high confidence
  outlier_keywords: KeywordTheme[];     // 1 competitor only → opportunity or noise
  coverage_gaps: string[];              // themes mentioned by none → potential white space
  consolidated_competitors: string[];   // all named competitors, deduped, ranked by mention count
  consensus_personas: string[];         // ICP signals that overlap across competitors
};
```

The aggregation step is where the *strategic value* lives. "5 competitors all target X" → highest-confidence prompts. "Only 1 targets Y" → either ahead of its time or noise. "None target Z but our pain analysis suggests buyers care" → white-space awareness prompts.

## Single page-type, single extraction call

Cost-control: for any one page, ONE LLM call (or zero, for cheap regex-extractable pages like docs). Don't run multiple skills on the same page. Skills define the *prompts* the LLM sees per page-type, not separate passes.

## What we never do

- **Read everything the same way.** Loses 80% of the signal.
- **Aggregate before per-competitor extraction.** You lose "competitor A is consumer, B is enterprise" context.
- **Ship raw keywords as prompts.** Always run through skill 42's template-fill.
- **Pad to hit prompt count.** Quality > quantity. Degrade gracefully.

## Open contract questions for colleague

1. Does the scraper deliver page **type** classification, or just raw URL+content? If raw, I do classification myself.
2. Does the scraper limit pages per competitor, or send everything? Suggest a cap (e.g. top 50 pages by inbound links / sitemap priority) to control my LLM cost.
3. What's the body format? Raw HTML, stripped Markdown, or structured (URL/H1/H2s/body separately)? Structured is preferred — reduces my parsing work.
