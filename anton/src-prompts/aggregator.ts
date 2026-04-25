import type { GeneratedPrompt } from './types.js';
import type { LLMClient } from './llm.js';

const SYSTEM = `You receive a numbered list of Peec AI tracking-prompt candidates produced by sub-agents. Your job is to clean the set and enforce the bucket ratio.

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

Final count: aim for 25 prompts. If quality is high, can output up to 30. If signal is thin, smaller is fine — never pad with weak prompts to hit a quota.

Within each bucket, prefer the most diverse SEMANTIC angles. If you have 5 "Best CRM for X" variants, pick the 3 most distinct personas/constraints; drop the rest.

Output ONLY valid JSON, no prose, no fences:
{
  "kept": [<list of 0-based input index numbers in the order you want them returned>],
  "rationale": "<1 short sentence on what you cut and why>"
}`;

export async function aggregatePrompts(
  client: LLMClient,
  candidates: GeneratedPrompt[],
  model: string,
): Promise<{ prompts: GeneratedPrompt[]; rationale: string }> {
  if (candidates.length <= 1) return { prompts: candidates, rationale: 'no aggregation needed' };

  const numbered = candidates
    .map((p, i) => `${i}. [${p.bucket}] ${p.query}`)
    .join('\n');

  const text = await client.complete({
    model,
    system: SYSTEM,
    userJson: numbered,
    maxTokens: 1500,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced ? fenced[1] : text;

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
    .map((i) => candidates[i]);

  return {
    prompts: kept.length > 0 ? kept : candidates,
    rationale: parsed.rationale ?? '',
  };
}
