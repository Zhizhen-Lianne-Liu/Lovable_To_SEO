import type { AggregatedKeyword } from '../src-competitors/types.js';
import type { LLMClient } from './llm.js';

const SYSTEM = `You are a SEO curator. You receive ~50 keywords that several competitor websites rank for, with metadata. Your job has two parts.

PART 1 — INFER THE CATEGORY.
Look at the keyword cluster pattern and decide what business category these competitors are in. The dominant theme wins. Examples:
- Keywords like "best crm for small business", "sales pipeline", "contact management" → category: "CRM software"
- Keywords like "project management tool", "kanban board", "task tracker" → category: "project management"
- Keywords like "natural deodorant", "aluminum-free", "vegan skincare" → category: "natural personal care"

Output a SHORT category label (2-4 words).

PART 2 — SELECT 10-15 VIABLE KEYWORDS.
Pick keywords that genuinely represent the COMPETITIVE LANDSCAPE for that inferred category. REJECT:

- BRANDED KEYWORDS that are just one of the competitors' names (e.g. "attio", "hubspot login")
- OFF-TOPIC noise. Many competitor sites rank for unrelated content-marketing pieces (e.g. "email etiquette" on a CRM blog, "motivational quotes" on a sales tool's site, "value proposition templates" on any B2B SaaS site). DROP THESE — they appear high-volume but don't represent what the brand actually competes for.
- GENERIC business terms with no category specificity ("management abbreviations", "team names", "faq templates", "what is a value proposition").
- Single-word vague terms unless they're THE category-defining word.

KEEP variety:
- Mix of head terms (1-2 words: e.g. "crm", "sales pipeline") and long-tail (4+ words: e.g. "best crm for small business under 50 dollars")
- Mix of intents (commercial + informational)
- Mix of use-cases / personas / constraints

QUALITY OVER QUANTITY: 10 great keywords beat 15 mediocre ones. If only 8 keywords survive, output 8.

OUTPUT — only valid JSON, no fences, no prose:
{
  "inferred_category": "<2-4 word category label>",
  "selected": [<0-based indices from the input list, ordered most→least useful>],
  "rationale": "<one sentence: what theme you saw and what you cut>"
}`;

export type CurationResult = {
  selected: AggregatedKeyword[];
  inferredCategory: string;
  rationale: string;
};

export async function curateKeywords(
  client: LLMClient,
  candidates: AggregatedKeyword[],
  model: string,
  hint?: string,
): Promise<CurationResult> {
  if (candidates.length <= 12) {
    return { selected: candidates, inferredCategory: hint ?? 'unknown', rationale: 'no curation needed (≤12 candidates)' };
  }

  const numbered = candidates.map((k, i) => {
    const intent = (k.intent ?? 'n/a').padStart(13);
    const vol = String(k.total_volume).padStart(7);
    return `${String(i).padStart(3)}. [${intent}] vol=${vol} count=${k.count} pos=${k.best_position}  ${k.keyword}`;
  }).join('\n');

  const userMsg = hint
    ? `Category hint from caller (treat as soft suggestion, override if data disagrees): ${hint}\n\nKeywords:\n${numbered}`
    : `Keywords:\n${numbered}`;

  const text = await client.complete({
    model,
    system: SYSTEM,
    userJson: userMsg,
    maxTokens: 800,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced ? fenced[1] : text;

  let parsed: { inferred_category?: string; selected?: number[]; rationale?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      selected: candidates.slice(0, 12),
      inferredCategory: hint ?? 'unknown',
      rationale: `curator returned non-JSON, kept top 12 by score (raw: ${text.slice(0, 80)}...)`,
    };
  }

  const indices = (parsed.selected ?? []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
  );
  const seen = new Set<number>();
  const picked = indices
    .filter((i) => (seen.has(i) ? false : (seen.add(i), true)))
    .map((i) => candidates[i]);

  return {
    selected: picked.length > 0 ? picked : candidates.slice(0, 12),
    inferredCategory: parsed.inferred_category ?? hint ?? 'unknown',
    rationale: parsed.rationale ?? '',
  };
}
