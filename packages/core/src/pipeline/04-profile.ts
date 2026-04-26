import { env } from "../config/env.js";
import { completeJson } from "../clients/llm.js";
import { tavilyExtract, tavilySearch } from "../clients/tavily.js";
import { Profile, type RunContext } from "../types/index.js";

const OWN_SITE_PATHS = ["", "/about", "/about-us", "/pricing", "/product", "/products", "/solutions"];

const EXTERNAL_DOMAINS = [
  "crunchbase.com",
  "linkedin.com",
  "wikipedia.org",
  "g2.com",
  "capterra.com",
  "producthunt.com",
];

const SYSTEM_PROMPT = `You are a brand-intelligence analyst. You read raw text scraped from a company's website plus external descriptions (Crunchbase, LinkedIn, G2, Wikipedia, etc.) and produce a structured profile.

Be specific and grounded — only claim things the source text supports. If the source is ambiguous or doesn't mention a field, return null. Never invent facts.

CRITICAL field rules:
- category_for_search: 2-4 words a buyer would type into Google or ChatGPT to find this category. NOT marketing-speak. Example: "podcast audio cleanup", "AI tender bid automation", "natural deodorant" — NOT "audio enhancement platform" or "next-generation procurement intelligence".
- scale_tier: pick exactly one. "startup" (seed-Series A, <50 employees), "growth" (Series B-C, 50-500), "mid-market" (~500-2000), "enterprise" (Fortune 500-scale incumbents like Salesforce, SAP, Adobe).
- competitor_signals: ONLY brand names actually mentioned in the source text — comparison pages, "alternatives to X" copy, external listings naming peers. Mark as the literal mention, not your guess. Empty array if none mentioned.
- audience_sophistication: "novice" (general consumers) | "intermediate" (professional but non-expert in the category) | "expert" (deep practitioners).
- target_markets: array of strings ("global", "US", "EU", "DACH", etc.).
- pricing_tier: "free" | "freemium" | "paid" | "enterprise" | null.
- products_and_services: 2-6 concrete items, not categories.

OUTPUT — only valid JSON, no fences, no prose. Every field MUST be present (use null or [] if unsupported):
{
  "name": "<short brand name>",
  "tagline": "<1-line value prop, max 80 chars, or null>",
  "occupation": "<one paragraph plain-English: what the company does, who it serves, and how>",
  "industry": "<short phrase: 'X for Y'>",
  "category_for_search": "<2-4 words>",
  "target_markets": ["<region 1>", "..."],
  "audience": "<plural noun phrase>",
  "audience_sophistication": "<novice|intermediate|expert>",
  "products_and_services": ["<item 1>", "..."],
  "pricing_tier": "<free|freemium|paid|enterprise|null>",
  "scale_tier": "<startup|growth|mid-market|enterprise>",
  "brand_presentation": ["<adjective 1>", "..."],
  "key_differentiators": ["<concrete differentiator 1>", "..."],
  "competitor_signals": ["<brand name mentioned in source>", "..."]
}`;

const ARRAY_FIELDS = new Set([
  "target_markets",
  "products_and_services",
  "brand_presentation",
  "key_differentiators",
  "competitor_signals",
]);

const SCALAR_FIELDS = [
  "name",
  "tagline",
  "occupation",
  "industry",
  "category_for_search",
  "audience",
  "audience_sophistication",
  "pricing_tier",
  "scale_tier",
] as const;

async function fetchOwnSite(domain: string): Promise<string[]> {
  try {
    const urls = OWN_SITE_PATHS.map((p) => `https://${domain}${p}`);
    const items = await tavilyExtract({ urls, format: "markdown" });
    return items.map((it) => it.raw_content.slice(0, 6000));
  } catch (e) {
    console.warn(`  [profile] own-site extract failed: ${(e as Error).message}`);
    return [];
  }
}

async function fetchExternal(
  nameGuess: string | undefined,
  domain: string,
): Promise<{ answer: string; results: Array<{ url: string; title: string; content: string }> }> {
  const seed = nameGuess || domain;
  try {
    const data = await tavilySearch({
      query: `${seed} company description what does it do`,
      include_domains: EXTERNAL_DOMAINS,
      include_answer: "basic",
      max_results: 5,
      search_depth: "basic",
    });
    return {
      answer: data.answer,
      results: data.results.slice(0, 3).map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content.slice(0, 600),
      })),
    };
  } catch (e) {
    console.warn(`  [profile] external search failed: ${(e as Error).message}`);
    return { answer: "", results: [] };
  }
}

function fillSchemaDefaults(parsed: Record<string, unknown>, domain: string): Record<string, unknown> {
  const out = { ...parsed };
  for (const f of SCALAR_FIELDS) {
    if (out[f] === undefined) out[f] = null;
  }
  for (const f of ARRAY_FIELDS) {
    if (!Array.isArray(out[f])) out[f] = [];
  }
  out.domain = domain;
  return out;
}

export async function profile(args: {
  ctx: RunContext;
  domain: string;
  nameGuess?: string;
}): Promise<Profile> {
  const { domain, nameGuess } = args;
  console.log(`[profile] enriching ${domain}…`);

  console.log("  [1/3] own-site multi-page extract…");
  const ownSiteTexts = await fetchOwnSite(domain);
  const totalChars = ownSiteTexts.reduce((s, t) => s + t.length, 0);
  console.log(`        got ${ownSiteTexts.length} pages, ${totalChars} chars`);

  console.log("  [2/3] external descriptions search…");
  const external = await fetchExternal(nameGuess, domain);
  console.log(`        answer: ${external.answer.length} chars, ${external.results.length} sources`);

  const ownText = ownSiteTexts.join("\n\n---\n\n").slice(0, 15000);
  const parts: string[] = [];
  if (external.answer) parts.push(`SUMMARY:\n${external.answer}`);
  for (const r of external.results) {
    parts.push(`--- ${r.url}\nTITLE: ${r.title}\n${r.content}`);
  }
  const externalText = parts.join("\n\n").slice(0, 6000);

  const userMsg =
    `DOMAIN: ${domain}\n` +
    `NAME (guess): ${nameGuess || "(unknown)"}\n\n` +
    `=== OWN-SITE TEXT ===\n${ownText || "(no own-site content available)"}\n\n` +
    `=== EXTERNAL DESCRIPTIONS ===\n${externalText || "(no external descriptions found)"}`;

  console.log(`  [3/3] Anthropic synthesis (${env().PROFILE_MODEL})…`);
  const raw = await completeJson<Record<string, unknown>>({
    model: env().PROFILE_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    user: userMsg,
  });

  const filled = fillSchemaDefaults(raw, domain);
  const validated = Profile.parse(filled);

  console.log(`  → category_for_search: ${validated.category_for_search}`);
  console.log(`  → scale_tier:           ${validated.scale_tier}`);
  console.log(`  → audience:             ${validated.audience}`);
  return validated;
}
