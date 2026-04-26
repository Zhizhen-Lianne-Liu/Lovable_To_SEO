import { env } from "../config/env.js";
import { complete, completeJson, stripCodeFences } from "../clients/llm.js";
import { tavilyExtract, tavilyResearch, tavilySearch } from "../clients/tavily.js";
import { extractDomainsFromText, REVIEW_DOMAINS, rootDomain } from "../lib/domain.js";
import {
  type Competitor,
  type DiscoverResult,
  type Profile,
  type RunContext,
  type SelfProfile,
} from "../types/index.js";

// =============================================================================
// Stage 0: cheap self-profile (Tavily extract on the input domain)
// =============================================================================

export async function profileSelf(domain: string): Promise<SelfProfile> {
  let raw = "";
  try {
    const items = await tavilyExtract({
      urls: [domain],
      format: "markdown",
      query: "What does this company do? What is the brand name and category?",
      chunks_per_source: 3,
    });
    raw = (items[0]?.raw_content ?? "").slice(0, 8000);
  } catch (e) {
    console.warn(`  [self-profile] extract failed: ${(e as Error).message}`);
  }
  const heading = raw.match(/^#\s+([^\n]+)/m);
  const guess = heading?.[1]?.trim() ?? domain.split(".")[0]!;
  const titleGuess = guess.charAt(0).toUpperCase() + guess.slice(1);
  return {
    domain: rootDomain(domain),
    name_guess: titleGuess,
    raw_excerpt: raw.slice(0, 1500),
  };
}

// =============================================================================
// Approach A: Tavily /research with output_schema
// =============================================================================

const A_SCHEMA = (n: number): Record<string, unknown> => ({
  properties: {
    competitors: {
      type: "array",
      description: `Up to ${n} direct competitor brands`,
      items: {
        type: "object",
        description: "A single competitor",
        properties: {
          name: { type: "string", description: "Brand name" },
          domain: {
            type: "string",
            description: "Root domain only (e.g. example.com, no www. no path)",
          },
          description: { type: "string", description: "One-line description of the competitor" },
          why_relevant: {
            type: "string",
            description: "One-line reason this is a direct competitor",
          },
        },
      },
    },
  },
  required: ["competitors"],
});

function profileContextBlock(deep: Profile | null, self: SelfProfile): string {
  if (!deep) {
    return `Brand: ${self.name_guess}\nDomain: ${self.domain}\n\nHomepage excerpt:\n${self.raw_excerpt}`;
  }
  const items = [
    `Brand: ${deep.name || self.name_guess}`,
    `Domain: ${deep.domain || self.domain}`,
    `Industry: ${deep.industry || "(unknown)"}`,
    `Category: ${deep.category_for_search || "(unknown)"}`,
    `What they do: ${deep.occupation || "(unknown)"}`,
    `Audience: ${deep.audience || "(unknown)"}`,
    `Audience sophistication: ${deep.audience_sophistication || "(unknown)"}`,
    `Products: ${deep.products_and_services.join(", ") || "(unknown)"}`,
    `Scale tier: ${deep.scale_tier || "(unknown)"}`,
    `Pricing tier: ${deep.pricing_tier || "(unknown)"}`,
    `Key differentiators: ${deep.key_differentiators.join(", ") || "(unknown)"}`,
  ];
  if (deep.competitor_signals.length) {
    items.push(`Competitors mentioned in source material: ${deep.competitor_signals.join(", ")}`);
  }
  return items.join("\n");
}

async function approachA(
  self: SelfProfile,
  deep: Profile | null,
  n = 10,
): Promise<{ competitors: Competitor[]; sources: unknown[]; error?: string }> {
  const scaleClause = deep?.scale_tier
    ? ` Match the brand's scale tier (${deep.scale_tier}) — do not return enterprise incumbents like Salesforce / SAP / Adobe if the brand is a startup.`
    : "";
  const question =
    `List the top ${n} direct competitors of the company at ${self.domain} (${self.name_guess}). ` +
    `Direct competitor = same buyer, same primary problem, comparable scale tier. ` +
    `EXCLUDE: parent companies, subsidiaries, customers, vendors, brands in adjacent but non-competing categories.${scaleClause} ` +
    `Return root domain only (e.g. samsung.com, not www.samsung.com or samsung.com/products). ` +
    `Ground-truth context about the input company:\n\n${profileContextBlock(deep, self)}`;

  const body = await tavilyResearch({ question, output_schema: A_SCHEMA(n), model: "mini" });
  if (body.status !== "completed") {
    return { competitors: [], sources: [], error: body.status };
  }
  let content: Record<string, unknown> | undefined;
  if (typeof body.content === "string") {
    try {
      content = JSON.parse(body.content);
    } catch {
      content = {};
    }
  } else if (body.content && typeof body.content === "object") {
    content = body.content;
  }
  const items = (content?.competitors as Array<Record<string, unknown>>) ?? [];
  return {
    competitors: items.slice(0, n).map((c) => ({
      domain: rootDomain(String(c.domain ?? "")),
      name: String(c.name ?? c.domain ?? ""),
      description: c.description ? String(c.description) : undefined,
      why_relevant: c.why_relevant ? String(c.why_relevant) : undefined,
    })),
    sources: body.sources ?? [],
  };
}

// =============================================================================
// Approach B: multi-channel search + co-occurrence scoring
// =============================================================================

const CHANNEL_WEIGHTS: Record<string, number> = {
  alternatives: 2,
  vs: 3,
  g2: 2,
  category: 1,
  reddit: 1,
  buyers: 2,
};

async function approachB(
  self: SelfProfile,
  deep: Profile | null,
  n = 10,
): Promise<{ competitors: Competitor[]; raw_answers: Record<string, string>; error?: string }> {
  const brand = self.name_guess;
  const selfDomain = self.domain;
  const exclude = new Set([selfDomain]);

  const category = deep?.category_for_search;
  const audience = deep?.audience;
  const scale = deep?.scale_tier;

  const queries: Array<[string, string]> =
    category && audience
      ? (() => {
          const catClause = ` in the ${category} space for ${audience}`;
          const scaleClause = scale ? `, match ${scale} scale` : "";
          return [
            ["alternatives", `What are the top alternatives to ${brand} (${selfDomain})${catClause}${scaleClause}? List with their websites.`],
            ["vs", `Which companies compete head-to-head with ${brand} (${selfDomain})${catClause}? Include their domains.`],
            ["category", `Leading companies in the ${category} category for ${audience}. List names and domains.`],
            ["buyers", `Buyers shortlisting ${brand} in ${category} for ${audience} — which other companies would they evaluate? Include domains.`],
          ];
        })()
      : [
          ["alternatives", `What are the top alternatives to ${brand} (${selfDomain})? List with their websites.`],
          ["vs", `What companies compete head-to-head with ${brand} (${selfDomain})? Include their domains.`],
          ["category", `What is the product category of ${brand} (${selfDomain})? Who are the leading companies in that category?`],
          ["buyers", `If a buyer evaluating ${brand} (${selfDomain}) wanted to compare options, which companies and domains would they shortlist?`],
        ];

  const candidates = new Map<string, Competitor & { score: number; channels: string[] }>();
  const rawAnswers: Record<string, string> = {};

  for (const [channel, query] of queries) {
    let answer = "";
    try {
      const res = await tavilySearch({
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: "advanced",
      });
      answer = res.answer ?? "";
    } catch (e) {
      console.warn(`  [B] channel ${channel} failed: ${(e as Error).message}`);
      continue;
    }
    rawAnswers[channel] = answer;
    for (const d of extractDomainsFromText(answer, exclude)) {
      let entry = candidates.get(d);
      if (!entry) {
        entry = {
          domain: d,
          name: (d.split(".")[0] ?? d).replace(/^./, (c) => c.toUpperCase()),
          score: 0,
          channels: [],
        };
        candidates.set(d, entry);
      }
      entry.score += CHANNEL_WEIGHTS[channel] ?? 1;
      if (!entry.channels.includes(channel)) entry.channels.push(channel);
    }
  }

  const ranked = Array.from(candidates.values()).sort(
    (a, b) => b.score - a.score || b.channels.length - a.channels.length,
  );
  return { competitors: ranked.slice(0, n), raw_answers: rawAnswers };
}

// =============================================================================
// Approach C: single search + include_answer="advanced", extract domains
// =============================================================================

async function approachC(
  self: SelfProfile,
  deep: Profile | null,
  n = 10,
): Promise<{ competitors: Competitor[]; raw_answer: string; error?: string }> {
  const brand = self.name_guess;
  const category = deep?.category_for_search;
  const audience = deep?.audience;
  const scale = deep?.scale_tier;
  let grounded = "";
  if (category && audience) grounded = ` in the ${category} space for ${audience}`;
  if (scale) grounded += `, match ${scale} scale`;
  const query =
    `Who are the top ${n} direct competitors of ${brand} (${self.domain})${grounded}? ` +
    `List each with their domain. Same product category, same buyer.`;

  const res = await tavilySearch({
    query,
    search_depth: "advanced",
    max_results: 15,
    include_answer: "advanced",
  });
  const answer = res.answer ?? "";
  const re = /\b([a-z0-9-]+\.(?:com|io|ai|co|net|app|de|fr|uk|tech|org))\b/g;
  const found = new Set<string>();
  for (const m of answer.toLowerCase().matchAll(re)) {
    if (m[1]) found.add(m[1]);
  }
  found.delete(self.domain);
  const out: Competitor[] = [];
  const seen = new Set<string>();
  for (const d of Array.from(found).slice(0, n)) {
    if (seen.has(d) || REVIEW_DOMAINS.includes(d)) continue;
    seen.add(d);
    out.push({
      domain: d,
      name: (d.split(".")[0] ?? d).replace(/^./, (c) => c.toUpperCase()),
    });
  }
  return { competitors: out, raw_answer: answer };
}

// =============================================================================
// Normalize: parent/child merge, canonical names, dedupe, why-relevant backfill, rank
// =============================================================================

const PARENT_OF: Record<string, string> = {
  "mi.com": "xiaomi.com",
  "redmi.com": "xiaomi.com",
  "poco.com": "xiaomi.com",
  "honor.com": "huawei.com",
};

const NAME_SUFFIX_NOISE = /\b(?:CRM|App|Inc\.?|LLC|Ltd\.?|GmbH|Co\.?|Corp\.?|Software|Platform|Cloud|Online|Official|Website|Home|Page)\b/gi;

function canonName(raw: string): string {
  if (!raw) return "";
  let n = raw.replace(NAME_SUFFIX_NOISE, "").trim();
  n = n.replace(/\s+/g, " ");
  return n.replace(/^[\s\-|,:;]+|[\s\-|,:;]+$/g, "");
}

type NormCandidate = Competitor & {
  votes: number;
  approaches: string[];
};

function mergeCandidates(candidates: NormCandidate[]): NormCandidate[] {
  const byDomain = new Map<string, NormCandidate>();
  for (const c of candidates) {
    let d = rootDomain(c.domain);
    d = PARENT_OF[d] ?? d;
    if (!d) continue;
    let slot = byDomain.get(d);
    if (!slot) {
      slot = {
        domain: d,
        name: c.name ?? "",
        votes: 0,
        approaches: [],
        why_relevant: c.why_relevant ?? "",
        description: c.description ?? "",
      };
      byDomain.set(d, slot);
    }
    slot.votes += c.votes ?? 1;
    for (const a of c.approaches ?? []) {
      if (!slot.approaches.includes(a)) slot.approaches.push(a);
    }
    if (c.why_relevant && !slot.why_relevant) slot.why_relevant = c.why_relevant;
    if (c.description && !slot.description) slot.description = c.description;
  }
  return Array.from(byDomain.values()).map((c) => ({
    ...c,
    approaches: [...c.approaches].sort(),
  }));
}

const NAMES_SCHEMA: Record<string, unknown> = {
  properties: {
    names: {
      type: "array",
      description: "One entry per input domain",
      items: {
        type: "object",
        description: "Canonical name for one domain",
        properties: {
          domain: { type: "string", description: "Matches an input domain exactly" },
          canonical_name: {
            type: "string",
            description:
              "The canonical brand or company name (no 'CRM'/'Inc.'/'Software' suffixes, no taglines)",
          },
        },
      },
    },
  },
  required: ["names"],
};

async function enrichCanonicalNames(candidates: NormCandidate[]): Promise<NormCandidate[]> {
  if (candidates.length === 0) return candidates;
  const needsLookup: NormCandidate[] = [];
  for (const c of candidates) {
    const existing = c.name ?? "";
    const slug = (c.domain.split(".")[0] ?? "").toLowerCase();
    const domainDerived = !existing || existing.toLowerCase() === slug;
    if (!domainDerived && existing) {
      c.canonical_name = canonName(existing);
    } else {
      needsLookup.push(c);
    }
  }
  if (needsLookup.length === 0) return candidates;

  const listing = needsLookup.map((c) => `- ${c.domain}`).join("\n");
  const question =
    "For each of these domains, return the canonical brand name as it would appear " +
    "on a logo or in a sentence like 'X is a CRM'. Strip suffixes like 'CRM', 'Inc.', " +
    "'Software', and never return taglines.\n\n" +
    listing;

  let body;
  try {
    body = await tavilyResearch({ question, output_schema: NAMES_SCHEMA, model: "mini" });
  } catch (e) {
    console.warn(`  [enrich] research call failed: ${(e as Error).message}`);
    for (const c of needsLookup) c.canonical_name = c.name || c.domain;
    return candidates;
  }
  if (body.status !== "completed") {
    for (const c of needsLookup) c.canonical_name = c.name || c.domain;
    return candidates;
  }
  let content: Record<string, unknown> = {};
  if (typeof body.content === "string") {
    try {
      content = JSON.parse(body.content);
    } catch {
      /* ignore */
    }
  } else if (body.content && typeof body.content === "object") {
    content = body.content;
  }
  const nameMap = new Map<string, string>();
  for (const r of (content.names as Array<Record<string, unknown>>) ?? []) {
    nameMap.set(rootDomain(String(r.domain ?? "")), String(r.canonical_name ?? ""));
  }
  for (const c of needsLookup) {
    const name = nameMap.get(c.domain) ?? "";
    c.canonical_name = name ? canonName(name) : c.name || c.domain;
  }
  return candidates;
}

function dedupeByName(candidates: NormCandidate[]): NormCandidate[] {
  const byCanon = new Map<string, NormCandidate>();
  const sorted = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  for (const c of sorted) {
    const key = (c.canonical_name || c.name || "").toLowerCase().trim() || c.domain;
    const existing = byCanon.get(key);
    if (!existing) {
      byCanon.set(key, c);
    } else {
      existing.votes = (existing.votes ?? 0) + (c.votes ?? 0);
      const merged = new Set([...(existing.approaches ?? []), ...(c.approaches ?? [])]);
      existing.approaches = [...merged].sort();
      if (!existing.why_relevant && c.why_relevant) existing.why_relevant = c.why_relevant;
    }
  }
  return Array.from(byCanon.values());
}

const REASONS_SCHEMA: Record<string, unknown> = {
  properties: {
    reasons: {
      type: "array",
      description: "One entry per input brand",
      items: {
        type: "object",
        description: "Reason for one brand",
        properties: {
          domain: { type: "string", description: "Matches the input domain" },
          why: {
            type: "string",
            description: "One-line reason this brand competes with the input company",
          },
        },
      },
    },
  },
  required: ["reasons"],
};

async function backfillWhy(candidates: NormCandidate[], self: SelfProfile): Promise<NormCandidate[]> {
  const missing = candidates.filter((c) => !c.why_relevant);
  if (missing.length === 0) return candidates;
  const listing = missing
    .map((c) => `- ${c.canonical_name || c.domain} (${c.domain})`)
    .join("\n");
  const brandName = self.name_guess || self.domain;
  const question =
    `For each of these brands, write a one-line reason why they are a direct ` +
    `competitor of ${brandName} (${self.domain}). Same buyer, same product category, ` +
    `comparable scale tier:\n\n${listing}`;

  let body;
  try {
    body = await tavilyResearch({ question, output_schema: REASONS_SCHEMA, model: "mini" });
  } catch (e) {
    console.warn(`  [backfill] research call failed: ${(e as Error).message}`);
    return candidates;
  }
  if (body.status !== "completed") return candidates;
  let content: Record<string, unknown> = {};
  if (typeof body.content === "string") {
    try {
      content = JSON.parse(body.content);
    } catch {
      /* ignore */
    }
  } else if (body.content && typeof body.content === "object") {
    content = body.content;
  }
  const byDomain = new Map<string, string>();
  for (const r of (content.reasons as Array<Record<string, unknown>>) ?? []) {
    byDomain.set(rootDomain(String(r.domain ?? "")), String(r.why ?? ""));
  }
  for (const c of candidates) {
    if (!c.why_relevant && byDomain.get(c.domain)) c.why_relevant = byDomain.get(c.domain);
  }
  return candidates;
}

function rankFinal(
  candidates: NormCandidate[],
  approachAPicks: Competitor[],
  n = 10,
): NormCandidate[] {
  const aDomains = new Set(approachAPicks.map((c) => rootDomain(c.domain)));
  const consensus = candidates
    .filter((c) => (c.votes ?? 0) >= 2)
    .sort(
      (a, b) =>
        (b.votes ?? 0) - (a.votes ?? 0) || (b.approaches?.length ?? 0) - (a.approaches?.length ?? 0),
    );
  const consensusDomains = new Set(consensus.map((c) => c.domain));
  const fillers = candidates
    .filter((c) => aDomains.has(c.domain) && !consensusDomains.has(c.domain))
    .sort(
      (a, b) =>
        (b.votes ?? 0) - (a.votes ?? 0) || (b.approaches?.length ?? 0) - (a.approaches?.length ?? 0),
    );
  const fillerDomains = new Set(fillers.map((f) => f.domain));
  const rest = candidates
    .filter((c) => !consensusDomains.has(c.domain) && !fillerDomains.has(c.domain))
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return [...consensus, ...fillers, ...rest].slice(0, n);
}

async function normalize(
  consensusRaw: Array<{ domain: string; name: string; votes: number; channels?: string[] }>,
  approachAPicks: Competitor[],
  self: SelfProfile,
  n = 10,
): Promise<NormCandidate[]> {
  const aLookup = new Map<string, Competitor>();
  for (const c of approachAPicks) aLookup.set(rootDomain(c.domain), c);
  const enriched: NormCandidate[] = consensusRaw.map((c) => {
    const a = aLookup.get(rootDomain(c.domain));
    return {
      domain: rootDomain(c.domain),
      name: c.name,
      votes: c.votes,
      approaches: c.channels ?? [],
      why_relevant: a?.why_relevant ?? "",
      description: a?.description ?? "",
    };
  });

  console.log("  [normalize] step 1: parent/child merge…");
  const step1 = mergeCandidates(enriched);
  console.log(`           ${consensusRaw.length} → ${step1.length} after pre-merge`);

  console.log("  [normalize] step 2: canonical names from homepages (Tavily research)…");
  const step2 = await enrichCanonicalNames(step1);

  console.log("  [normalize] step 3: dedupe by canonical name…");
  const step3 = dedupeByName(step2);
  console.log(`           ${step1.length} → ${step3.length} after name dedupe`);

  console.log("  [normalize] step 4: backfill why_relevant for missing entries…");
  const step4 = await backfillWhy(step3, self);

  console.log("  [normalize] step 5: final rank…");
  return rankFinal(step4, approachAPicks, n);
}

// =============================================================================
// Validation: Anthropic relevance gate against deep profile
// =============================================================================

const VALIDATE_SYSTEM = `You are a competitive-intelligence validator. Given a brand profile and a list of candidate competitors, classify each candidate as a TRUE direct competitor or NOT.

A TRUE direct competitor:
- Solves the same primary problem for the same buyer
- Operates at a comparable scale tier (don't pair startups with Fortune 500 incumbents)
- Operates in the same category (not adjacent-but-different)
- Targets the same geography/audience or a strong superset

REJECT candidates that are:
- Parent companies, subsidiaries, or holding companies
- Customers, vendors, or integrations of the brand
- Mass-content sites (Reddit, YouTube, Wikipedia, Quora)
- In a clearly different category
- Vastly larger or vastly smaller in scale tier
- Unverifiable / unknown to you

OUTPUT — only valid JSON, no fences, no prose:
{
  "verdicts": [
    {"domain": "<exact domain from input>", "validated": true|false, "reason": "<one sentence>"}
  ]
}`;

async function validateAgainstProfile(
  candidates: NormCandidate[],
  deep: Profile,
  targetN = 10,
): Promise<NormCandidate[]> {
  if (candidates.length === 0) return candidates;
  const profileBlock = [
    `Brand: ${deep.name}`,
    `Domain: ${deep.domain}`,
    `Industry: ${deep.industry}`,
    `Category: ${deep.category_for_search}`,
    `What they do: ${deep.occupation}`,
    `Audience: ${deep.audience}`,
    `Scale tier: ${deep.scale_tier}`,
  ].join("\n");
  const candidateBlock = candidates
    .map((c) => {
      const name = c.canonical_name || c.name || c.domain;
      const why = c.why_relevant ? ` | ${c.why_relevant.slice(0, 120)}` : "";
      return `- ${c.domain} | ${name}${why}`;
    })
    .join("\n");
  const userMsg = `BRAND PROFILE:\n${profileBlock}\n\nCANDIDATES:\n${candidateBlock}`;

  let parsed: { verdicts?: Array<{ domain: string; validated: boolean; reason?: string }> };
  try {
    const text = await complete({
      model: env().PROFILE_MODEL,
      max_tokens: 1500,
      system: VALIDATE_SYSTEM,
      user: userMsg,
    });
    parsed = JSON.parse(stripCodeFences(text));
  } catch (e) {
    console.warn(`  [validate] gate failed: ${(e as Error).message} — keeping unfiltered`);
    return candidates;
  }

  const byDomain = new Map<string, { validated: boolean; reason: string }>();
  for (const v of parsed.verdicts ?? []) {
    byDomain.set(v.domain.toLowerCase(), {
      validated: Boolean(v.validated),
      reason: v.reason ?? "",
    });
  }
  for (const c of candidates) {
    const v = byDomain.get(c.domain.toLowerCase());
    if (v) {
      c.validated = v.validated;
      c.validation_reason = v.reason;
    } else {
      c.validated = null;
      c.validation_reason = "no verdict returned";
    }
  }

  const validated = candidates.filter((c) => c.validated === true);
  const unknown = candidates.filter((c) => c.validated === null);
  const rejected = candidates.filter((c) => c.validated === false);
  const out: NormCandidate[] = [...validated];
  for (const c of unknown) {
    if (out.length >= targetN) break;
    out.push(c);
  }
  for (const c of rejected) {
    if (out.length >= targetN) break;
    out.push(c);
  }
  for (const c of rejected) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// =============================================================================
// Public entry point
// =============================================================================

export async function discover(args: {
  ctx: RunContext;
  domain: string;
  profile: Profile;
}): Promise<DiscoverResult> {
  const { domain, profile: deep } = args;
  console.log(`[discover] ${domain}`);

  console.log("  [0a] cheap profile (Tavily extract on input)…");
  const self = await profileSelf(domain);
  console.log(`        brand guess: ${self.name_guess}`);

  const result: DiscoverResult = {
    input: domain,
    self,
    deep_profile: deep,
    approaches: {
      A_research: { competitors: [] },
      B_cooccur: { competitors: [] },
      C_answer: { competitors: [] },
    },
    raw_consensus: [],
    final: [],
  };

  console.log("  [A] /research with output_schema (30-90s)…");
  try {
    const a = await approachA(self, deep);
    result.approaches.A_research = a;
    console.log(`        → ${a.competitors.length} competitors`);
  } catch (e) {
    console.warn(`        ERROR: ${(e as Error).message}`);
    result.approaches.A_research = { competitors: [], error: (e as Error).message };
  }

  console.log("  [B] multi-channel answer-extraction…");
  try {
    const b = await approachB(self, deep);
    result.approaches.B_cooccur = b;
    console.log(`        → ${b.competitors.length} candidates`);
  } catch (e) {
    console.warn(`        ERROR: ${(e as Error).message}`);
    result.approaches.B_cooccur = { competitors: [], error: (e as Error).message };
  }

  console.log("  [C] search + include_answer (single shot)…");
  try {
    const c = await approachC(self, deep);
    result.approaches.C_answer = c;
    console.log(`        → ${c.competitors.length} competitors`);
  } catch (e) {
    console.warn(`        ERROR: ${(e as Error).message}`);
    result.approaches.C_answer = { competitors: [], error: (e as Error).message };
  }

  // Cross-approach voting
  const votes = new Map<string, number>();
  const names = new Map<string, string>();
  const channels = new Map<string, string[]>();
  for (const key of ["A_research", "B_cooccur", "C_answer"] as const) {
    const items = result.approaches[key].competitors;
    for (const item of items) {
      const d = rootDomain(item.domain);
      if (!d) continue;
      votes.set(d, (votes.get(d) ?? 0) + 1);
      if (!names.has(d)) names.set(d, item.name);
      const channelList = channels.get(d) ?? [];
      if (!channelList.includes(key)) channelList.push(key);
      channels.set(d, channelList);
    }
  }
  const consensus = Array.from(votes.entries())
    .map(([d, v]) => ({
      domain: d,
      name: names.get(d) ?? d,
      votes: v,
      channels: channels.get(d) ?? [],
    }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 30);
  result.raw_consensus = consensus;
  console.log(
    `  [consensus] ${consensus.filter((c) => c.votes >= 2).length} domains found by ≥2 approaches`,
  );

  console.log("  [normalize]");
  const aPicks = result.approaches.A_research.competitors;
  let normalized = await normalize(consensus, aPicks, self, 15);

  if (deep && normalized.length) {
    console.log("  [validate] Anthropic relevance gate vs deep profile…");
    try {
      normalized = await validateAgainstProfile(normalized, deep, 10);
      const kept = normalized.filter((c) => c.validated === true).length;
      console.log(`        → ${kept} validated as direct competitors of ${normalized.length}`);
    } catch (e) {
      console.warn(`        ! validation failed: ${(e as Error).message}`);
    }
  }

  result.final = normalized.slice(0, 10);
  console.log(`  [final] top ${result.final.length}:`);
  for (const c of result.final) {
    const flag = c.validated === true ? "✓" : c.validated === false ? "✗" : " ";
    const name = c.canonical_name || c.name;
    const why = (c.why_relevant ?? c.validation_reason ?? "").slice(0, 80);
    console.log(`    ${flag} ${name.padEnd(20)} ${c.domain.padEnd(30)} v=${c.votes} ${why}`);
  }
  return result;
}
