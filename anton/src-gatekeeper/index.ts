import { resolveLLM } from '../src-prompts/llm.js';
import { gatekeeperError } from './types.js';
import type { CandidateCompetitor, GatekeeperResult, GatekeeperVerdict } from './types.js';
import type { DomainContext } from '../src-context/types.js';

export type { CandidateCompetitor, GatekeeperResult, GatekeeperVerdict, GatekeeperError } from './types.js';

const SYSTEM = `You filter a list of candidate competitors against the company's profile. Your goal: keep only domains that are PLAUSIBLY DIRECT COMPETITORS of the company — solving the same problem for the same buyer in roughly the same way.

You receive:
1. The company's profile (brand, category, what they do, ICP, geography).
2. A numbered list of candidate domains, each with optional descriptor + why-relevant claim.

For each candidate, decide: keep or reject. Be aggressive about rejecting:
- Off-category sites that share keywords by accident (e.g. a Christian-publisher ranking near a spa company; a UI-animation tool near a procurement tool)
- Mass-content sites (Reddit, YouTube, Quora, Wikipedia)
- Domains with no obvious connection to the company's category
- Domains that operate in a clearly different geography or buyer segment
- Domains we cannot identify with reasonable confidence (mark as reject with reason "unknown / cannot verify")

Keep candidates that:
- Solve the same job-to-be-done for the same buyer
- Are reasonably close in size / market positioning
- The company's prospects would actually compare against during evaluation

QUALITY OVER QUANTITY: 6 verified competitors beat 12 noisy ones. If only 4 survive, output 4.

OUTPUT — only valid JSON, no fences, no prose:
{
  "context_summary": "<one sentence: what kind of company you're filtering for>",
  "verdicts": [
    {"domain": "<exact domain from input>", "decision": "keep"|"reject", "reason": "<1 short sentence>"}
  ]
}`;

export type GateOpts = {
  provider?: 'gemini' | 'anthropic';
  model?: string;
};

export async function gatekeeper(
  context: DomainContext,
  candidates: CandidateCompetitor[],
  opts: GateOpts = {},
): Promise<GatekeeperResult> {
  if (candidates.length === 0) {
    throw gatekeeperError('NO_CANDIDATES', 'gatekeeper got an empty candidate list');
  }

  const llm = resolveLLM({ provider: opts.provider, aggregatorModel: opts.model });
  const model = opts.model ?? llm.aggregatorModel;

  const profile = [
    `domain: ${context.domain}`,
    `brand_name: ${context.brand_name}`,
    `tagline: ${context.tagline}`,
    `category: ${context.category}`,
    `what_we_do: ${context.what_we_do}`,
    `icp: ${context.icp.join('; ') || '(unspecified)'}`,
    `geography: ${context.geography.join(', ') || '(unspecified)'}`,
  ].join('\n');

  const numbered = candidates.map((c, i) => {
    const desc = c.descriptor || c.why_relevant || '(no descriptor)';
    return `${i}. ${c.domain}${c.name ? ` — ${c.name}` : ''} | ${desc.slice(0, 200)}`;
  }).join('\n');

  const userMsg = `COMPANY PROFILE:\n${profile}\n\nCANDIDATES:\n${numbered}`;

  const reply = await llm.client.complete({
    model,
    system: SYSTEM,
    userJson: userMsg,
    maxTokens: 1500,
  });

  const fenced = reply.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced ? fenced[1] : reply;

  let parsed: { context_summary?: string; verdicts?: GatekeeperVerdict[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw gatekeeperError('PARSE_ERROR', `gatekeeper returned non-JSON: ${reply.slice(0, 200)}...`);
  }

  const byDomain = new Map(candidates.map((c) => [c.domain.toLowerCase(), c]));
  const kept: CandidateCompetitor[] = [];
  const rejected: { candidate: CandidateCompetitor; reason: string }[] = [];
  const warnings: string[] = [];

  for (const v of parsed.verdicts ?? []) {
    const cand = byDomain.get(String(v.domain).toLowerCase());
    if (!cand) continue;
    if (v.decision === 'keep') kept.push(cand);
    else rejected.push({ candidate: cand, reason: v.reason || '' });
  }

  // Sanity: if more than 60% rejected, surface a warning. Often signals that
  // the company profile itself is off, not the candidates.
  const total = kept.length + rejected.length;
  if (total > 0 && rejected.length / total > 0.6) {
    warnings.push(
      `gatekeeper rejected ${rejected.length}/${total} candidates (>60%). Verify the company profile is accurate.`,
    );
  }
  if (kept.length === 0) {
    warnings.push('gatekeeper kept 0 candidates. Falling back to top 6 unfiltered to avoid downstream failure.');
    return {
      context_summary: parsed.context_summary ?? '',
      kept: candidates.slice(0, 6),
      rejected,
      warnings,
    };
  }

  return {
    context_summary: parsed.context_summary ?? '',
    kept,
    rejected,
    warnings,
  };
}
