# Generation Strategy — From CompetitorIntel to Peec Prompts

## Pipeline location

```
[scraped pages]
     |
     v
[1. EXTRACTION]      per-page, type-aware, see extraction-strategy.md
     |  CompetitorIntel × N competitors
     v
[2. AGGREGATION]     per-competitor → AggregatedIntel
     |  AggregatedIntel { consensus_keywords, outlier_keywords, gaps, ... }
     v
[3. MAPPING]         <-- THIS DOCUMENT
     |  candidate prompts (raw, ~80-120)
     v
[4. QUALITY GATE]    deterministic + Opus batch, see quality-gate.md
     |  filtered set 20-50 prompts
     v
[5. ASSEMBLY]        PromptSet object, ready for Peec employee
```

## Core principle: deterministic mapping, not creative generation

The agent does NOT free-form invent prompts about the brand. It walks a rule table where each row says: *if you see signal X in the intel, generate a candidate using template Y assigned to bucket Z*. The LLM only handles template-fill (which qualifier word fits, which phrasing reads natural) and the final quality gate.

This is laptop-friendly because:
- Mapping is pure code (no LLM)
- Template-fill is one batched Opus call covering all candidates at once
- Quality gate is one batched Opus call covering the survivors
- Total LLM calls per run: extraction passes + 2 (fill + gate)

## The mapping table

This is the core logic. Every intel signal has a rule.

| # | Intel signal | Bucket | Template (skill 42 patterns) | Notes |
|---|---|---|---|---|
| **1** | Consensus keyword (3+ competitors target) | Consideration | `Best [keyword] for [our_persona+constraint]` | Highest confidence. Always include. |
| **2** | Outlier keyword (1 competitor only) | Consideration | Same as #1 | Lower priority. Used to fill bucket if signal is thin. |
| **3** | Pain language (blog intros, homepage problem statements) | Awareness | `How do I [pain]?` / `Why is [problem]?` / `Is [pain assumption] true?` | Real Peec data showed many awareness prompts are concern-framed, not how-to-framed. Mix both. |
| **4** | Job-to-be-done (from docs, product pages) | Consideration / scenario | `Best tool for [JTBD]` / `How to [JTBD]` | Long-tail. Adds specificity. |
| **5** | Named competitor (from comparison pages, mentions) | Brand-eval | `[our_brand] vs [competitor] for [primary_use_case]` | Deterministic, one per top N competitors. No LLM judgement. |
| **6** | Competitor positioning differentiator (their unique claim) | Awareness | `Is [their claim] real?` / `Does [claim] actually work?` | Tests if AI surfaces are buying competitor's claims. Strategic intel. |
| **7** | Customer industry (from customer-story pages) | Consideration | `Best [category] for [industry]` | Industry-specific consideration prompts. |
| **8** | ICP language (job titles, segments from pricing/homepage) | Consideration | `Best [category] for [ICP_phrase]` | "Best CRM for engineers" pattern. |
| **9** | Coverage gap (theme appears in pains but no competitor targets) | Awareness | `[gap phrased as open question]` | The white-space play. Highest strategic value. |
| **10** | Use-case keyword (from product/feature pages) | Consideration | `How to [use case] with [category]` | Product-led queries. |

A run produces ~80-120 raw candidates. Quality gate culls to 20-50.

## Generation order (deterministic walk)

The agent walks the mapping in this order so the most strategic prompts are produced first and survive the gate even if quota is tight:

```
ORDER:
  1. Brand-eval (rule #5)        -- guaranteed minimum coverage
  2. Coverage gaps (rule #9)     -- highest strategic value
  3. Consensus keywords (rule #1) -- highest confidence
  4. Pain language (rule #3)     -- awareness floor
  5. ICP-qualified consideration (rules #7, #8) -- specificity
  6. JTBD / use-case (rules #4, #10) -- long-tail
  7. Competitor differentiators (rule #6) -- strategic awareness
  8. Outlier keywords (rule #2)  -- backfill only if quota allows
```

Why this order: if the gate culls aggressively, we still keep our anchors (brand-eval, coverage gaps, consensus) and lose only the long-tail backfill.

## The variable prompt count (20-50)

We do NOT target a fixed 30. The count comes from how much usable intel exists.

```python
# pseudocode
candidates = walk_mapping(intel)        # 80-120 raw
gated = quality_gate(candidates)        # whatever passes

# floor + ceiling
if len(gated) < 20:
  expand: relax outlier-keyword rule, lower specificity threshold, retry
  if still < 20: ship what we have, flag in output as "thin signal — consider re-running with more competitors"

if len(gated) > 50:
  prune: drop lowest-priority candidates by mapping order until <= 50
  rebalance buckets to target ratio (27/60/13) within the cap
```

This gives the gate authority to size the set to actual quality, not pad to 30.

## Bucket-ratio enforcement (soft, not hard)

Target 27/60/13. The gate computes actuals after culling. If a bucket is more than ±10pp off target:

- **Awareness too low** → re-walk rule #3 with relaxed pain-similarity threshold, generate more candidates, gate again
- **Consideration too low** → re-walk rule #2 (outlier keywords), backfill from competitor docs/use-cases
- **Brand-eval count is fixed** = `min(top_N_competitors, 4-6)`. Not ratio-driven.

Maximum 2 retries per bucket. Beyond that, ship the imbalanced set and flag the imbalance in `PromptSet.warnings`.

## Templates (skill 42 mapping → exact strings)

These are the literal templates the LLM template-fill step uses. Variables in `{braces}`.

```
# Consideration (rules 1, 2, 7, 8)
"Best {category} for {persona_or_industry}"
"Top {category} for {persona_or_industry}"
"Which {category} is best for {persona_or_industry}?"
"{category} for {persona_or_industry} under {price_or_size_constraint}"

# Awareness (rules 3, 6, 9)
"Is {claim} actually true?"
"Why is {problem} so hard?"
"Will {trend_assertion}?"
"What is the best way to {pain_paraphrase}?"
"{problem} solutions"

# Brand-eval (rule 5)
"{our_brand} vs {competitor}"
"{our_brand} vs {competitor} for {primary_use_case}"
"{competitor} alternatives"

# Scenario / JTBD (rules 4, 10)
"How to {jtbd}"
"Best tool for {jtbd_specific_scenario}"
```

LLM template-fill receives: the template + the intel signal that triggered it + brand context. Returns: the filled string + a one-line hypothesis. Single batch call covers all candidates.

## Inputs vs outputs at each step

| Step | In | Out |
|---|---|---|
| 1. Extraction | scraped pages | `CompetitorIntel[]` per competitor |
| 2. Aggregation | `CompetitorIntel[]` | `AggregatedIntel` |
| 3. Mapping (this doc) | `AggregatedIntel` + brand profile | `Candidate[]` (template + filled vars + bucket + priority) |
| 4. Template-fill (Opus batch) | `Candidate[]` | `RawPrompt[]` (string + hypothesis + bucket + source) |
| 5. Quality gate (Opus batch) | `RawPrompt[]` | `GeneratedPrompt[]` 20-50 + warnings |
| 6. Assembly | `GeneratedPrompt[]` + meta | `PromptSet` |

## Why this works for the website-improvement loop

Reframing in light of "Peec ranks → recommendations on the website":

Each generated prompt has a `target_page_or_gap` field set during mapping. Examples:
- Rule #1 (consensus keyword) → `target_page_or_gap: "blog post on {keyword} — content gap if we don't have one"`
- Rule #5 (brand-eval) → `target_page_or_gap: "/compare/{competitor} comparison page"`
- Rule #9 (coverage gap) → `target_page_or_gap: "new awareness-stage content cluster on {gap_topic}"`

This means every prompt's Peec result maps to a concrete website fix. When Peec returns "you have 0% visibility on prompt X", the recommendation is already wired in: build/improve the page named in `target_page_or_gap`. The quality gate enforces this — any prompt without a `target_page_or_gap` fails.

That's the highest-leverage gate criterion for the demo. It forces every prompt to be tied to a concrete website improvement, not just a tracking metric.

## Open implementation choices

1. **Persona+constraint phrasing** in templates: agent-derived from skill 38 each run, or stored as a session-level config the user can edit before generation? Hybrid is cleanest: agent suggests 3, user confirms or overrides one.
2. **Top N competitors for brand-eval**: hard cap at 4 (matches 13% bucket share), or scale with total prompt count? Hard 4 keeps the bucket clean.
3. **Language for templates**: detect from imported website's `<html lang>` and translate templates accordingly, or keep all English for v0? V0: English only with a TODO. V1: localized.
4. **Mapping rule weights**: equal priority within the order, or score-based (e.g. consensus_strength × ICP_match)? Score-based is better but needs more dev. V0: order-only.
