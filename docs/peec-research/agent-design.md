# Agentic Prompt Generator — Design

## Job

Take a website (`workdir` from the import module) and produce a list of Peec-ready prompts. Output is plain strings + metadata. Peec employees paste them into Peec.

**Input**: `workdir` (extracted website code) + optional user hints (target market, primary competitor, focus topic).
**Output**: `PromptSet` JSON (see Contract below) + a Markdown report grouping prompts by bucket with reasoning.

## Hard constraints from Peec

- Each prompt is a single string, **1–200 characters**.
- Each prompt is paired with a **country code** (ISO2). Defaults to `"US"` unless the website context implies otherwise.
- Prompts must read like things a real human types into ChatGPT / Perplexity. Not marketing copy. Not branded SEO keywords. Not commands.

These are the only mechanical rules. Everything else is judgement, which is what makes this an agent problem and not a template problem.

## The agent loop (4 steps)

```
[workdir + optional user hints]
         |
         v
[1. EXTRACT website context]                 (deterministic, no LLM)
   - Read package.json, README, src/pages/index.*, public meta tags, hero copy
   - Emit: { brand_name, tagline, value_prop_sentence, top_pages: [{path, h1, summary}], detected_keywords[] }
         |
         v
[2. PROFILE the brand]                       (1 LLM call: skill 38 icp-research + skill 33 competitor-teardown)
   - Input: website context (from step 1)
   - Output: { personas[], pains[], jobs_to_be_done[], category, competitors[], positioning_statement }
         |
         v
[3. GENERATE prompt candidates]              (1 LLM call: bucket-aware generator using profile from step 2)
   - For each bucket B1-B5, ask the LLM to produce N candidates
   - LLM must return for each: { bucket, query, hypothesis, source_evidence }
         |
         v
[4. FILTER + DEDUPE]                         (1 LLM call: quality pass)
   - Drop: prompts >200 chars, duplicates (semantic), prompts that name the brand outside B1/B4, marketing-copy tone
   - Cap at 50 prompts total. Re-balance buckets if any bucket overflows.
         |
         v
[PromptSet]
```

Three LLM calls total per run. Cacheable per workdir. Cost-bounded.

## Why an agent, not a template

A pure template ("Best X tools for Y") fails at step 2 (profiling) and step 4 (filtering). The judgement that needs to happen:
- Picking the right *category words* for B2. "video tools" vs "async video for product teams" — wildly different ranking surfaces.
- Detecting when the website *is in two markets at once* (e.g. an analytics tool used by both growth marketers and devs) and splitting the persona.
- Calling out competitors that are not on the website but are real competitors (mined from positioning, not from the site itself).
- Rejecting prompts that read like SEO keywords ("best video tool 2026 free") instead of human questions.

A template can't do any of these. An agent given the right structured profile can.

## The Prompt contract (already in strategy.md, repeated for ergonomics)

```ts
type GeneratedPrompt = {
  id: string;                          // uuid
  bucket: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  query: string;                       // 1–200 chars, what gets pasted into Peec
  country_code: string;                // ISO2, default "US"
  hypothesis: string;                  // 1 line: what we expect Peec to show
  source_evidence: string;             // 1 line: which profile fact triggered this prompt
  source_skill?: 'icp-research' | 'competitor-teardown' | 'e2e-seo';
};

type PromptSet = {
  jobId: string;
  websiteWorkdir: string;
  brand: string;
  generatedAt: string;
  profile: BrandProfile;               // intermediate output from step 2 — kept for transparency
  prompts: GeneratedPrompt[];
};
```

## What the agent sees as a system prompt (sketch)

The generator agent (step 3) gets:

```
You are generating Peec AI tracking prompts for {brand}.

CONTEXT (from prior steps):
- Category: {category}
- Personas: {personas}
- Top jobs-to-be-done: {jobs_to_be_done}
- Competitors: {competitors}
- Positioning: {positioning_statement}

YOUR JOB: produce {N} prompts per bucket. Output JSON only.

BUCKETS:
- B1 Direct brand. Tests baseline awareness. Format: "What is {brand}?", "Who makes {brand}?", "Is {brand} legit?". 1-3 prompts.
- B2 Category recall. Tests share-of-voice when the buyer asks the category question. Format: "What are the best {category}?" "Top {N} {category} for {persona}?". 5-10 prompts.
- B3 Problem-solution. Tests discoverability via the buyer's pain language, NOT the category word. Format: rephrase each pain or job-to-be-done as a natural question. 10-20 prompts.
- B4 Comparison. Tests positioning. Format: "{brand} vs {competitor}", "{competitor} alternatives". 5-15 prompts.
- B5 Use-case / scenario. Tests long-tail and specific scenario recall. Format: "Best tool for {specific scenario from JTBD}". 5-10 prompts.

RULES:
1. Every query is 1-200 chars.
2. B2/B3/B5 must NOT name the brand. The point is to see if the AI brings up the brand unprompted.
3. Prompts must sound like a human chatting with an AI, not like Google searches.
4. Prefer specificity over breadth ("best async video tool for distributed engineering teams" beats "best video tool").
5. For each prompt, give a one-line hypothesis (what success looks like) and one-line evidence (which profile fact triggered it).

Output schema: {prompts: [{bucket, query, hypothesis, source_evidence}]}
```

The filter agent (step 4) gets the candidate list + a checklist of anti-patterns to remove.

## Quality controls

| Check | How |
|---|---|
| Length cap | Reject any `query.length > 200` post-LLM (rare but happens) |
| Brand leak in B2/B3/B5 | Regex check; route violators back through the generator with a "do not name the brand" reminder |
| Semantic duplicates | Embed all queries, cluster at 0.92 cosine, keep the longest from each cluster |
| Tone (marketing vs human) | Filter LLM call: "would a real person type this into ChatGPT? yes/no". Drop the no's. |
| Bucket balance | If any bucket > 30% of total or < 10% of target, regenerate that bucket only |

## What we deliver to a Peec employee

Two artifacts per run:

1. **`prompts.json`** — machine-readable PromptSet
2. **`prompts.md`** — human-readable report:
   - Brand profile summary (4-6 lines)
   - Each bucket as a section, with prompts as a bulleted list, each followed by italicized hypothesis + evidence
   - "Notes for the operator" — caveats, things to manually verify (e.g. "we assumed US market — change to DE if needed")

The Markdown is what a Peec employee reads, copies, and pastes prompt-by-prompt into Peec.

## Open design questions (to resolve once peec-prompt-patterns.md returns)

1. Do real Peec users write prompts at the natural-question end ("how do I record a quick demo?") or the keyword end ("best demo recording tools 2026")? Affects the bucket-3 system prompt.
2. Is there a Peec convention around country codes per prompt (e.g. one prompt repeated across countries) that we should mirror?
3. Does Peec expose any "topic" taxonomy we should align our buckets to, or are buckets ours alone?
4. Median prompt length in real Peec data — to set a target length for the generator instead of just enforcing the 200-char cap.
