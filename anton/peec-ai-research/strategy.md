# Prompt Generation Strategy

## Goal

Given a website (output of the import module), produce a structured list of prompts that, when run through Peec AI, reveal how the brand / site ranks and is mentioned in AI search engine answers.

## Why this is non-trivial

You can't just throw a site at Peec. Peec measures visibility for *queries*. The strategic question is: *which queries should we test?* A weak prompt set produces a flattering or misleading visibility report. A strong prompt set covers the actual ways the target buyer talks about the problem in an AI chat.

## The skills we use (and why)

The marketing-skills repo has no GEO-native skill. We compose three SEO/positioning skills to produce the inputs a good prompt set needs:

| Skill | Path | What it gives us | Why we need it |
|---|---|---|---|
| **icp-research-assistant** | `Skills for Claude/38-...icp-research-assistant.md` | Personas, pains, objections, buying triggers, messaging angles | Tells us *what the buyer types into ChatGPT* — the question shape |
| **competitor-teardown** | `Skills for Claude/33-...competitor-teardown.md` | Competitor list, brand positioning, value prop, differentiation | Lets us write head-to-head + category prompts |
| **e2e-seo-assistant** | `Skills for Claude/35-google-e2e-seo-assistant.md` | Target keywords, content gaps, topic clusters | Provides keyword/topic seeds for category and problem prompts |

Skills are run in this order: **38 first** (frames the buyer), **33 second** (frames the market), **35 third** (frames the topical surface area). Each later skill is given the prior outputs as context.

## The prompt taxonomy

Every prompt the agent generates falls into one of five buckets. Each bucket tests a different kind of AI-search visibility.

| Bucket | Question shape | Tests | Example (for a fictional "Loom" alternative) |
|---|---|---|---|
| **B1. Direct brand** | "What is X?" / "Tell me about X." | Does the AI know the brand at all? Visibility floor. | "What is Tella?" |
| **B2. Category recall** | "Best [category] tools in 2026" / "Top [N] [category] for [ICP]" | Share-of-voice in category answers | "What are the best async video tools for product teams?" |
| **B3. Problem-solution** | "How do I [job-to-be-done]?" / "[pain phrased as question]" | Discoverability via the buyer's actual problem language | "How do I record a quick walkthrough video for my team without scheduling a meeting?" |
| **B4. Comparison** | "[brand] vs [competitor]" / "[competitor] alternatives" | Head-to-head positioning, framing, and which brand "wins" the comparison | "Loom vs Tella" |
| **B5. Use-case / scenario** | "Best tool for [specific job]" | Long-tail and scenario-specific recall | "Best tool for recording an investor update video" |

## Prompt count target

Per website:
- B1: 1–3 prompts (brand variations, including misspellings)
- B2: 5–10 prompts (one per major category claim from skill 33)
- B3: 10–20 prompts (one per top pain / job-to-be-done from skill 38)
- B4: 5–15 prompts (one per top competitor × 2 framings: "X vs Y" and "Y alternatives")
- B5: 5–10 prompts (specific scenarios from skills 38 + 35)

Total: **~30–60 prompts per site**. Sized so a Peec run is meaningful but not wasteful.

## The pipeline (stage 2 of the larger system)

```
[website workdir]   <-- output of import module (stage 1)
        |
        v
[1. website-context-extractor]
   - Reads workdir: package.json, README, src/pages/index, meta tags, hero copy, /about, sitemap
   - Emits: { brand, tagline, value_prop, pages: [{url, h1, summary}], existing_keywords }
        |
        v
[2. skill-runner]
   - Loads skill 38 -> runs against website-context -> persona JSON
   - Loads skill 33 -> runs against website-context + persona -> positioning + competitor list JSON
   - Loads skill 35 -> runs against all of the above -> keyword / topic / intent map
        |
        v
[3. prompt-synthesizer]
   - Takes the three JSON outputs, walks the taxonomy B1-B5,
     emits one Prompt object per generated query
        |
        v
[Prompts JSON]   <-- output of stage 2; input to stage 3 (Peec runner)
```

## The Prompt object (contract)

```ts
type GeneratedPrompt = {
  id: string;                          // uuid
  bucket: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  query: string;                       // exactly what we send to Peec / the LLM
  hypothesis: string;                  // what we expect to see if the brand is well-ranked
  source_skill: string;                // e.g. "icp-research-assistant"
  source_evidence: string;             // 1-line reason this prompt was generated (pain X, competitor Y, ...)
};

type PromptSet = {
  jobId: string;
  websiteWorkdir: string;              // links back to import-module result
  brand: string;
  generatedAt: string;
  prompts: GeneratedPrompt[];
};
```

This shape is what stage 3 (Peec runner) will consume. Keeping it identical-pattern to `ImportResult` so the pipeline composes cleanly.

## Open strategy questions (need your call)

1. **Skill execution model**: do we run the 3 skills against a real LLM (Claude API) every time, or cache the persona/competitor/keyword JSON per website and only re-run on demand? Caching is cheaper and lets you hand-edit before prompt synthesis.
2. **User-supplied seeds**: should the user be allowed to inject their own competitors and target keywords before stage 2 runs, or do we trust the skills entirely? Manual override is a 30-min add-on but very useful for hackathon demos.
3. **Prompt dedup / quality filter**: should we add a final pass that asks the LLM "remove any prompt that sounds like marketing copy or that a real user would never type"? Cuts the prompt set by ~30%, raises quality.
4. **Bucket weighting**: equal coverage across B1–B5, or weight by what Peec is best at? (Need answer from the Peec API research before deciding.)
