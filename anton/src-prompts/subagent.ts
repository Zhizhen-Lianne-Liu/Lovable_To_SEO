import { v4 as uuid } from 'uuid';
import type { AggregatedKeyword } from '../src-competitors/types.js';
import type { GeneratedPrompt } from './types.js';
import { promptError } from './types.js';
import type { LLMClient } from './llm.js';

function systemPrompt(category: string | undefined, promptsPerKeyword: number): string {
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

export async function generateForKeyword(
  client: LLMClient,
  keyword: AggregatedKeyword,
  model: string,
  category: string | undefined,
  promptsPerKeyword: number,
): Promise<GeneratedPrompt[]> {
  const userPayload = {
    keyword: keyword.keyword,
    intent: keyword.intent ?? 'unknown',
    total_volume: keyword.total_volume,
    competitors_ranking: keyword.count,
    best_position: keyword.best_position,
  };

  const text = await client.complete({
    model,
    system: systemPrompt(category, promptsPerKeyword),
    userJson: JSON.stringify(userPayload, null, 2),
    maxTokens: 1200,
  });

  const parsed = parseJson(text);

  return (parsed.prompts ?? []).map<GeneratedPrompt>((p) => ({
    id: uuid(),
    query: String(p.query ?? '').trim(),
    bucket: p.bucket === 'awareness' ? 'awareness' : 'consideration',
    source_keyword: keyword.keyword,
    source_competitors: keyword.ranking_competitors,
    hypothesis: String(p.hypothesis ?? ''),
  })).filter((p) => p.query.length > 0 && p.query.length <= 200);
}

function parseJson(text: string): { prompts?: { query?: string; bucket?: string; frame?: string; hypothesis?: string }[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    throw promptError('PARSE_ERROR', `Sub-agent returned non-JSON output: ${text.slice(0, 200)}...`);
  }
}
