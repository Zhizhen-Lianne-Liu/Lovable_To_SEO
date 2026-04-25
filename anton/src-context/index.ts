import { resolveLLM } from '../src-prompts/llm.js';
import type { LLMClient } from '../src-prompts/llm.js';
import { tavilyExtract } from './tavily.js';
import { contextError } from './types.js';
import type { DomainContext } from './types.js';

export type { DomainContext, ContextError } from './types.js';

const SYSTEM = `You receive raw text scraped from a company's homepage. Extract a tight structured profile.

OUTPUT — only valid JSON, no fences:
{
  "brand_name": "<short brand name as it appears on the site>",
  "tagline": "<1-line value proposition, max 80 chars>",
  "category": "<2-4 word category that captures what the company actually sells>",
  "what_we_do": "<1-2 sentences in plain language, ICP-relevant>",
  "icp": ["<persona/segment 1>", "<persona/segment 2>"],
  "geography": ["<ISO 3166-1 alpha-2 codes>"],
  "language": "<primary site language as ISO 639-1: en, de, fr, ...>"
}

RULES:
- Categories must be specific. "AI software" is too vague; prefer "AI tender response automation" or "AI sales coaching".
- ICP must be plural-noun phrases describing buyer segments, not generic ("everyone" / "businesses" / "users" are forbidden).
- Geography: infer from URL paths (/de/, /fr/), language tags, mentioned currencies, mentioned country names, customer logos. If ambiguous or global, use ["global"].
- If the page is too thin or generic to determine a field, use "" (empty string) or [] — DO NOT invent.
- Language: the dominant content language, NOT the user-selected locale.`;

export type BuildOpts = {
  provider?: 'gemini' | 'anthropic';
  model?: string;
};

export async function buildDomainContext(domain: string, opts: BuildOpts = {}): Promise<DomainContext> {
  const llm = resolveLLM({ provider: opts.provider, aggregatorModel: opts.model });
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const { content } = await tavilyExtract(url);

  const reply = await llm.client.complete({
    model: opts.model ?? llm.aggregatorModel,
    system: SYSTEM,
    userJson: `URL: ${url}\n\nHomepage text:\n${content}`,
    maxTokens: 800,
  });

  const fenced = reply.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced ? fenced[1] : reply;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw contextError('PARSE_ERROR', `LLM returned non-JSON: ${reply.slice(0, 200)}...`);
  }

  return {
    domain: stripProtocol(domain),
    brand_name: String(parsed.brand_name ?? '').trim(),
    tagline: String(parsed.tagline ?? '').trim(),
    category: String(parsed.category ?? '').trim(),
    what_we_do: String(parsed.what_we_do ?? '').trim(),
    icp: Array.isArray(parsed.icp) ? parsed.icp.map(String).filter(Boolean) : [],
    geography: Array.isArray(parsed.geography) ? parsed.geography.map(String).filter(Boolean) : [],
    language: String(parsed.language ?? '').trim(),
    source_evidence: content.slice(0, 300),
    fetchedAt: new Date().toISOString(),
  };
}

function stripProtocol(s: string): string {
  return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
}

// silence unused import warning
export const _internal = { LLMClient: null as unknown as LLMClient };
