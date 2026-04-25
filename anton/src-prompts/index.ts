import { v4 as uuid } from 'uuid';
import { generateForKeyword } from './subagent.js';
import { aggregatePrompts } from './aggregator.js';
import { curateKeywords } from './curator.js';
import { selectTopKeywords } from './select.js';
import { resolveLLM } from './llm.js';
import { promptError } from './types.js';
import type { AggregatedIntel } from '../src-competitors/types.js';
import type { GeneratedPrompt, PromptSet } from './types.js';
import type { Provider } from './llm.js';

export type { GeneratedPrompt, PromptSet, PromptError } from './types.js';
export type { Provider } from './llm.js';

export type GenerateOpts = {
  provider?: Provider;
  subagentModel?: string;
  aggregatorModel?: string;
  candidatePool?: number;        // how many keywords feed the curator (default 50)
  topKeywords?: number;          // how many keywords drive sub-agents AFTER curation (default 12)
  promptsPerKeyword?: number;    // diverse prompts each sub-agent emits (default 3)
  category?: string;             // soft hint for the curator (it can override)
  consensusOnly?: boolean;
  skipAggregator?: boolean;
  skipCurator?: boolean;         // skip the curator step (uses scored top-K directly)
  concurrency?: number;
};

export async function generatePrompts(
  intel: AggregatedIntel,
  opts: GenerateOpts = {},
): Promise<PromptSet> {
  const llm = resolveLLM({
    provider: opts.provider,
    subagentModel: opts.subagentModel,
    aggregatorModel: opts.aggregatorModel,
  });

  const candidatePool = opts.candidatePool ?? 50;
  const topKeywords = opts.topKeywords ?? 12;
  const promptsPerKeyword = opts.promptsPerKeyword ?? 3;
  const warnings: string[] = [];

  // Step 1: deterministic narrowing — score top N for the curator to read.
  const candidates = selectTopKeywords(intel, { topK: candidatePool, consensusOnly: opts.consensusOnly });
  if (candidates.length === 0) {
    throw promptError(
      'NO_KEYWORDS',
      'No usable keywords in AggregatedIntel. Re-run keyword fetch with a higher limit or more competitors.',
    );
  }

  // Step 2: curator agent — infers category, picks the viable seeds.
  // Brand-agnostic: works for any company, not just CRM.
  let seeds = candidates.slice(0, topKeywords);
  let inferredCategory = opts.category;
  if (!opts.skipCurator) {
    try {
      const curation = await curateKeywords(llm.client, candidates, llm.aggregatorModel, opts.category);
      seeds = curation.selected.slice(0, topKeywords);
      inferredCategory = curation.inferredCategory;
      warnings.push(`curator inferred category: "${curation.inferredCategory}"`);
      if (curation.rationale) warnings.push(`curator: ${curation.rationale}`);
    } catch (e) {
      warnings.push(`curator failed (using top-${topKeywords} by score): ${(e as Error).message}`);
    }
  }
  if (seeds.length === 0) {
    throw promptError('NO_KEYWORDS', 'Curator returned 0 keywords.');
  }
  if (seeds.length < topKeywords) {
    warnings.push(`only ${seeds.length} seed keywords selected (requested ${topKeywords})`);
  }

  // Step 3: 1 sub-agent per keyword. Each emits ~promptsPerKeyword diverse prompts.
  const concurrency = opts.concurrency ?? (llm.provider === 'gemini' ? 1 : 5);
  const results = await runWithConcurrency(
    seeds,
    concurrency,
    (k) => generateForKeyword(llm.client, k, llm.subagentModel, inferredCategory, promptsPerKeyword),
  );

  const prompts: GeneratedPrompt[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') prompts.push(...r.value);
    else warnings.push(`sub-agent for "${seeds[i].keyword}" failed: ${(r.reason as Error).message}`);
  });

  // Cheap exact-match dedup before sending to the aggregator.
  const seen = new Set<string>();
  const deduped: GeneratedPrompt[] = [];
  for (const p of prompts) {
    const key = p.query.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  let final = deduped;
  let aggregatorTag = '';
  if (!opts.skipAggregator && deduped.length > 1) {
    aggregatorTag = llm.aggregatorModel;
    try {
      const agg = await aggregatePrompts(llm.client, deduped, llm.aggregatorModel);
      final = agg.prompts;
      if (agg.rationale) warnings.push(`aggregator: ${agg.rationale}`);
    } catch (e) {
      warnings.push(`aggregator failed (kept all candidates): ${(e as Error).message}`);
    }
  }

  return {
    jobId: uuid(),
    competitors: intel.competitors,
    prompts: final,
    modelUsed: aggregatorTag ? `${llm.subagentModel} + ${aggregatorTag} (${llm.provider})` : `${llm.subagentModel} (${llm.provider})`,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

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
        out[idx] = { status: 'fulfilled', value: await fn(items[idx]) };
      } catch (e) {
        out[idx] = { status: 'rejected', reason: e };
      }
    }
  });
  await Promise.all(workers);
  return out;
}
