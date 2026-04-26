import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { complete } from "../clients/llm.js";
import {
  type AggregatedKeyword,
  type GeneratedPrompt,
  type KeywordResult,
  type Profile,
  type PromptSet,
  type RunContext,
} from "../types/index.js";

// =============================================================================
// Step 1 — deterministic narrowing: score + variety stratification
// =============================================================================

export type SelectOpts = {
  topK?: number;
  consensusOnly?: boolean;
  varietySlots?: number;
};

// score = consensus_count × log10(volume + 1) × (1 / best_position)
// Rewards keywords where MULTIPLE competitors rank WELL, not just whatever has
// the highest absolute search volume.
function scoreKeyword(k: AggregatedKeyword): number {
  const consensusFactor = Math.max(1, k.count);
  const volumeFactor = Math.log10(Math.max(0, k.total_volume) + 1);
  const positionFactor = 1 / Math.max(1, k.best_position);
  return consensusFactor * volumeFactor * positionFactor;
}

const GENERIC_SINGLE_WORDS = new Set([
  "login",
  "log in",
  "sign in",
  "signin",
  "free",
  "support",
  "help",
  "pricing",
  "docs",
  "api",
  "download",
  "demo",
  "app",
]);

function buildCompetitorStems(competitors: string[]): string[] {
  const stems = new Set<string>();
  for (const c of competitors) {
    const stem = c
      .toLowerCase()
      .replace(/\.(com|io|app|dev|ai|co|net|org|so|us)$/i, "")
      .replace(/[^a-z0-9]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const s of stem) if (s.length >= 3) stems.add(s);
  }
  return [...stems];
}

function isUsefulKeyword(k: AggregatedKeyword, competitorStems: string[]): boolean {
  if (k.intent === "navigational") return false;
  const lower = k.keyword.toLowerCase();
  if (GENERIC_SINGLE_WORDS.has(lower)) return false;
  for (const stem of competitorStems) {
    // 4+ char stems: substring match catches "closecrm" as well as "close crm"
    if (stem.length >= 4 && lower.includes(stem)) return false;
    // 3 char stems: word boundary only — too short to safely substring
    if (stem.length === 3 && new RegExp(`\\b${stem}\\b`, "i").test(lower)) return false;
  }
  return true;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function selectTopKeywords(
  intel: KeywordResult,
  opts: SelectOpts = {},
): AggregatedKeyword[] {
  const topK = opts.topK ?? 10;
  const reservedForVariety = Math.max(0, opts.varietySlots ?? Math.floor(topK * 0.3));
  const scoredSlots = topK - reservedForVariety;

  const competitorStems = buildCompetitorStems(intel.competitors);
  const rawPool = opts.consensusOnly ? [...intel.consensus] : [...intel.consensus, ...intel.outliers];
  const pool = rawPool.filter((k) => isUsefulKeyword(k, competitorStems));

  const scored = pool
    .map((k) => ({ k, score: scoreKeyword(k) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.k);

  const picks = new Map<string, AggregatedKeyword>();
  for (const k of scored.slice(0, scoredSlots)) picks.set(k.keyword, k);

  if (reservedForVariety > 0) {
    // Variety axis 1: long-tail (4+ words). Aggregator likes specificity.
    const longTail = pool
      .filter((k) => wordCount(k.keyword) >= 4)
      .sort((a, b) => scoreKeyword(b) - scoreKeyword(a));
    for (const k of longTail) {
      if (picks.size >= topK) break;
      if (!picks.has(k.keyword)) picks.set(k.keyword, k);
    }

    // Variety axis 2: per-competitor exclusives. One wedge keyword per
    // competitor that no one else ranks for. Surfaces differentiation.
    if (!opts.consensusOnly) {
      for (const dom of intel.competitors) {
        if (picks.size >= topK) break;
        const ownTop = intel.outliers
          .filter((k) => k.ranking_competitors[0] === dom)
          .sort((a, b) => scoreKeyword(b) - scoreKeyword(a))[0];
        if (ownTop && !picks.has(ownTop.keyword)) picks.set(ownTop.keyword, ownTop);
      }
    }

    // Variety axis 3: informational intent backfill. Awareness fuel.
    const informational = pool
      .filter((k) => k.intent === "informational")
      .sort((a, b) => scoreKeyword(b) - scoreKeyword(a));
    for (const k of informational) {
      if (picks.size >= topK) break;
      if (!picks.has(k.keyword)) picks.set(k.keyword, k);
    }
  }

  return [...picks.values()].slice(0, topK);
}

// =============================================================================
// Step 2 — curator (Opus): infer category + select 15-25 viable keywords
// =============================================================================

const CURATOR_SYSTEM = `You are a SEO curator. You receive ~50 keywords that several competitor websites rank for, with metadata. Your job has two parts.

PART 1 — INFER THE CATEGORY.
Look at the keyword cluster pattern and decide what business category these competitors are in. The dominant theme wins. Examples:
- Keywords like "best crm for small business", "sales pipeline", "contact management" → category: "CRM software"
- Keywords like "project management tool", "kanban board", "task tracker" → category: "project management"
- Keywords like "natural deodorant", "aluminum-free", "vegan skincare" → category: "natural personal care"

Output a SHORT category label (2-4 words).

PART 2 — SELECT 15-25 VIABLE KEYWORDS.
Pick keywords that genuinely represent the COMPETITIVE LANDSCAPE for that inferred category. REJECT:

- BRANDED KEYWORDS that are just one of the competitors' names (e.g. "attio", "hubspot login")
- OFF-TOPIC noise. Many competitor sites rank for unrelated content-marketing pieces (e.g. "email etiquette" on a CRM blog, "motivational quotes" on a sales tool's site, "value proposition templates" on any B2B SaaS site). DROP THESE — they appear high-volume but don't represent what the brand actually competes for.
- GENERIC business terms with no category specificity ("management abbreviations", "team names", "faq templates", "what is a value proposition").
- Single-word vague terms unless they're THE category-defining word.

KEEP variety:
- Mix of head terms (1-2 words: e.g. "crm", "sales pipeline") and long-tail (4+ words: e.g. "best crm for small business under 50 dollars")
- Mix of intents (commercial + informational)
- Mix of use-cases / personas / constraints

QUALITY OVER QUANTITY: 15 great keywords beat 25 mediocre ones. If only 12 survive, output 12. The downstream sub-agents need at least 12 viable seeds to produce a meaningful prompt set; aim for 15-25 if the data supports it.

OUTPUT — only valid JSON, no fences, no prose:
{
  "inferred_category": "<2-4 word category label>",
  "selected": [<0-based indices from the input list, ordered most→least useful>],
  "rationale": "<one sentence: what theme you saw and what you cut>"
}`;

type CurationResult = {
  selected: AggregatedKeyword[];
  inferredCategory: string;
  rationale: string;
};

async function curateKeywords(
  candidates: AggregatedKeyword[],
  hint: string | undefined,
): Promise<CurationResult> {
  if (candidates.length <= 15) {
    return {
      selected: candidates,
      inferredCategory: hint ?? "unknown",
      rationale: "no curation needed (≤15 candidates)",
    };
  }

  const numbered = candidates
    .map((k, i) => {
      const intent = (k.intent ?? "n/a").padStart(13);
      const vol = String(k.total_volume).padStart(7);
      return `${String(i).padStart(3)}. [${intent}] vol=${vol} count=${k.count} pos=${k.best_position}  ${k.keyword}`;
    })
    .join("\n");

  const userMsg = hint
    ? `Category hint from caller (treat as soft suggestion, override if data disagrees): ${hint}\n\nKeywords:\n${numbered}`
    : `Keywords:\n${numbered}`;

  const text = await complete({
    model: env().CURATOR_MODEL,
    max_tokens: 800,
    system: CURATOR_SYSTEM,
    user: userMsg,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced?.[1] ?? text;

  let parsed: { inferred_category?: string; selected?: number[]; rationale?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      selected: candidates.slice(0, 18),
      inferredCategory: hint ?? "unknown",
      rationale: `curator returned non-JSON, kept top 18 by score (raw: ${text.slice(0, 80)}...)`,
    };
  }

  const indices = (parsed.selected ?? []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
  );
  const seen = new Set<number>();
  const picked = indices
    .filter((i) => (seen.has(i) ? false : (seen.add(i), true)))
    .map((i) => candidates[i])
    .filter((k): k is AggregatedKeyword => !!k);

  return {
    selected: picked.length > 0 ? picked : candidates.slice(0, 18),
    inferredCategory: parsed.inferred_category ?? hint ?? "unknown",
    rationale: parsed.rationale ?? "",
  };
}

// =============================================================================
// Step 3 — sub-agent (Sonnet, parallel): per-keyword prompt generation
// =============================================================================

function subagentSystem(category: string | undefined, promptsPerKeyword: number): string {
  const categoryClause = category
    ? `These keywords come from competitors in the **${category}** space. CRITICAL: REJECT the keyword entirely if it is not about ${category} or its direct adjacent topics. Many competitors are content-marketing-heavy and rank for off-topic generic business content (email etiquette, motivational quotes, value proposition writing, etc.) — those MUST be rejected. If the keyword is off-topic, return an empty prompts array.`
    : `Reject the keyword if it's too generic or off-topic.`;

  return `You generate Peec AI tracking prompts for ONE keyword at a time.

A Peec prompt is a SHORT (40-90 chars), HUMAN-SOUNDING question or imperative noun phrase that a real person would type into ChatGPT, Perplexity, or Gemini.

You will receive ONE keyword with metadata (intent, total search volume, how many competitors rank for it).

${categoryClause}

If the keyword is on-topic, generate ${promptsPerKeyword} DIVERSE prompts that explore the keyword from DIFFERENT funnel angles. The prompts MUST cover at least 2 different frames from this menu:

1. AWARENESS — open question about the topic. The buyer doesn't know yet.
   "What is X?" / "How does X work?" / "Why does X matter for Y?"
   Bucket: "awareness"

2. CONSIDERATION (most common) — the buyer is evaluating the category.
   "Best [keyword-driven category] for [persona]"
   "Top [category] tools for [use case]"
   "[category] for [specific persona+constraint]"
   Bucket: "consideration"

3. SCENARIO / use-case — a specific job-to-be-done.
   "Best tool for [specific scenario derived from keyword]"
   "How to [specific task] with [category]"
   Bucket: "consideration"

For ${promptsPerKeyword} prompts per keyword, aim for ~1 awareness + ~${Math.max(1, promptsPerKeyword - 1)} consideration. If a frame doesn't fit naturally for this keyword, skip it — better to output fewer great prompts than padded mediocre ones.

RULES:
- 1-200 chars, target 40-90.
- Imperative noun phrases beat questions ("Best X for Y" beats "What is the best X for Y?").
- Stack one persona or one constraint to add specificity. Generic "Best CRM" is too broad. "Best CRM for music agencies" is good.
- NEVER include a brand name — these prompts test unbranded discovery.
- Every prompt must explore the SAME keyword/topic, not drift. Different frames, same topic.

OUTPUT: ONLY valid JSON. Schema:
{
  "prompts": [
    {
      "query": "...",
      "bucket": "consideration" | "awareness",
      "frame": "best-x-for-y" | "open-question" | "scenario",
      "hypothesis": "<one short sentence: what visibility looks like>"
    }
  ]
}

If the keyword is off-topic, return: { "prompts": [] }`;
}

async function generateForKeyword(
  keyword: AggregatedKeyword,
  category: string | undefined,
  promptsPerKeyword: number,
): Promise<GeneratedPrompt[]> {
  const userPayload = {
    keyword: keyword.keyword,
    intent: keyword.intent ?? "unknown",
    total_volume: keyword.total_volume,
    competitors_ranking: keyword.count,
    best_position: keyword.best_position,
  };

  const text = await complete({
    model: env().SUBAGENT_MODEL,
    max_tokens: 1200,
    system: subagentSystem(category, promptsPerKeyword),
    user: JSON.stringify(userPayload, null, 2),
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenced?.[1] ?? text;
  let parsed: { prompts?: Array<{ query?: string; bucket?: string; hypothesis?: string }> };
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error(`Sub-agent returned non-JSON output: ${text.slice(0, 200)}...`);
  }

  return (parsed.prompts ?? [])
    .map<GeneratedPrompt>((p) => ({
      id: randomUUID(),
      query: String(p.query ?? "").trim(),
      bucket: p.bucket === "awareness" ? "awareness" : "consideration",
      source_keyword: keyword.keyword,
      source_competitors: keyword.ranking_competitors,
      hypothesis: String(p.hypothesis ?? ""),
    }))
    .filter((p) => p.query.length > 0 && p.query.length <= 200);
}

// =============================================================================
// Step 4 — aggregator (Opus): semantic dedup + 60/27/13 bucket ratio
// =============================================================================

const AGGREGATOR_SYSTEM = `You receive a numbered list of Peec AI tracking-prompt candidates produced by sub-agents. Your job is to clean the set and enforce the bucket ratio.

CRITICAL: Remove SEMANTIC duplicates. If multiple prompts mean essentially the same thing, keep ONLY ONE. Examples that must be collapsed:
- "Best CRM software for small teams" + "Best CRM software for small businesses" + "Best CRM for small business" => keep ONE
- "What is customer relationship management?" + "What is CRM and how does it work?" + "What is customer relationship management software?" => keep ONE

Tiebreaking when collapsing duplicates:
1. Prefer specific over generic ("Best CRM for music agencies" beats "Best CRM software")
2. Prefer imperative noun phrases over questions when the meaning is identical ("Best X for Y" beats "What is the best X for Y?")
3. Prefer 40-90 char queries; reject anything under 25 chars
4. Drop anything off-topic for a tracked-brand visibility test

BUCKET RATIO TARGET — enforce as best as the data allows:
- 60% consideration ("Best X for Y" / "Top X tools" frames)
- 27% awareness ("What is X?" / "How does X work?" frames)
- 13% reserved for brand-eval (often empty in this stage)

Final count rules:
- MINIMUM 20 prompts. Never output fewer than 20 unless the candidate list itself was smaller (in which case output everything that survived dedup).
- MAXIMUM 50 prompts. Never pad with weak entries to inflate the count.
- Pick the count by quality and diversity: if you have 50 distinct, on-topic, well-phrased candidates, output 50. If many overlap or read as filler, output closer to 20. The right number is whatever the topic genuinely supports.

Within each bucket, prefer the most diverse SEMANTIC angles. If you have 8 "Best CRM for X" variants, pick the 4-6 most distinct personas/constraints; drop the rest.

Output ONLY valid JSON, no prose, no fences:
{
  "kept": [<list of 0-based input index numbers in the order you want them returned>],
  "rationale": "<1 short sentence on what you cut and why>"
}`;

async function aggregatePrompts(
  candidates: GeneratedPrompt[],
): Promise<{ prompts: GeneratedPrompt[]; rationale: string }> {
  if (candidates.length <= 1) return { prompts: candidates, rationale: "no aggregation needed" };

  const numbered = candidates.map((p, i) => `${i}. [${p.bucket}] ${p.query}`).join("\n");

  const text = await complete({
    model: env().AGGREGATOR_MODEL,
    max_tokens: 1500,
    system: AGGREGATOR_SYSTEM,
    user: numbered,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced?.[1] ?? text;

  let parsed: { kept?: number[]; rationale?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      prompts: candidates,
      rationale: `aggregator returned non-JSON, kept all candidates (raw: ${text.slice(0, 80)}...)`,
    };
  }

  const keptIdx = (parsed.kept ?? []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
  );
  const seen = new Set<number>();
  const kept = keptIdx
    .filter((i) => (seen.has(i) ? false : (seen.add(i), true)))
    .map((i) => candidates[i])
    .filter((p): p is GeneratedPrompt => !!p);

  return {
    prompts: kept.length > 0 ? kept : candidates,
    rationale: parsed.rationale ?? "",
  };
}

// =============================================================================
// Public entry point
// =============================================================================

export type GenerateOpts = {
  candidatePool?: number;
  topKeywords?: number;
  promptsPerKeyword?: number;
  concurrency?: number;
  consensusOnly?: boolean;
  skipCurator?: boolean;
  skipAggregator?: boolean;
};

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        const item = items[idx]!;
        out[idx] = { status: "fulfilled", value: await fn(item) };
      } catch (e) {
        out[idx] = { status: "rejected", reason: e };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export async function prompts(args: {
  ctx: RunContext;
  keywords: KeywordResult;
  profile: Profile;
  opts?: GenerateOpts;
}): Promise<PromptSet> {
  const opts = args.opts ?? {};
  const candidatePool = opts.candidatePool ?? 60;
  const topKeywords = opts.topKeywords ?? 18;
  const promptsPerKeyword = opts.promptsPerKeyword ?? 4;
  const warnings: string[] = [];

  console.log("[prompts] step 1: deterministic narrowing…");
  const candidates = selectTopKeywords(args.keywords, {
    topK: candidatePool,
    consensusOnly: opts.consensusOnly,
  });
  if (candidates.length === 0) {
    throw new Error(
      "No usable keywords. Re-run keyword fetch with a higher limit or more competitors.",
    );
  }
  console.log(`           → ${candidates.length} candidates`);

  let seeds = candidates.slice(0, topKeywords);
  let inferredCategory = args.profile.category_for_search ?? undefined;
  if (!opts.skipCurator) {
    console.log("[prompts] step 2: curator…");
    try {
      const curation = await curateKeywords(candidates, inferredCategory);
      seeds = curation.selected.slice(0, topKeywords);
      inferredCategory = curation.inferredCategory;
      warnings.push(`curator inferred category: "${curation.inferredCategory}"`);
      if (curation.rationale) warnings.push(`curator: ${curation.rationale}`);
      console.log(`           → ${seeds.length} seeds, category="${curation.inferredCategory}"`);
    } catch (e) {
      warnings.push(`curator failed (using top-${topKeywords} by score): ${(e as Error).message}`);
    }
  }
  if (seeds.length === 0) throw new Error("Curator returned 0 keywords.");

  console.log(`[prompts] step 3: ${seeds.length} sub-agents (concurrency=${opts.concurrency ?? 5})…`);
  const concurrency = opts.concurrency ?? 5;
  const results = await runWithConcurrency(seeds, concurrency, (k) =>
    generateForKeyword(k, inferredCategory, promptsPerKeyword),
  );
  const subagentPrompts: GeneratedPrompt[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") subagentPrompts.push(...r.value);
    else warnings.push(`sub-agent for "${seeds[i]?.keyword}" failed: ${(r.reason as Error).message}`);
  });
  console.log(`           → ${subagentPrompts.length} raw prompts`);

  // Cheap exact-match dedup before sending to the aggregator.
  const seen = new Set<string>();
  const deduped: GeneratedPrompt[] = [];
  for (const p of subagentPrompts) {
    const key = p.query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  let final = deduped;
  let aggregatorTag = "";
  if (!opts.skipAggregator && deduped.length > 1) {
    console.log("[prompts] step 4: aggregator…");
    aggregatorTag = env().AGGREGATOR_MODEL;
    try {
      const agg = await aggregatePrompts(deduped);
      final = agg.prompts;
      if (agg.rationale) warnings.push(`aggregator: ${agg.rationale}`);
    } catch (e) {
      warnings.push(`aggregator failed (kept all candidates): ${(e as Error).message}`);
    }
    console.log(`           → ${final.length} final prompts`);
  }

  return {
    jobId: randomUUID(),
    competitors: args.keywords.competitors,
    prompts: final,
    modelUsed: aggregatorTag
      ? `${env().SUBAGENT_MODEL} + ${aggregatorTag}`
      : env().SUBAGENT_MODEL,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}
