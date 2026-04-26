import { z } from "zod";

// Per the synth system prompt: any scalar field MAY be null when the source
// material doesn't support it. Arrays default to []. name/domain are the only
// fields the pipeline truly can't proceed without — everything else is
// best-effort. Keep this lenient to match the Python contract.
export const Profile = z.object({
  name: z.string(),
  domain: z.string(),
  tagline: z.string().nullable(),
  occupation: z.string().nullable(),
  industry: z.string().nullable(),
  category_for_search: z.string().nullable(),
  target_markets: z.array(z.string()),
  audience: z.string().nullable(),
  audience_sophistication: z.string().nullable(),
  products_and_services: z.array(z.string()),
  pricing_tier: z.string().nullable(),
  scale_tier: z.string().nullable(),
  brand_presentation: z.array(z.string()),
  key_differentiators: z.array(z.string()),
  competitor_signals: z.array(z.string()),
});
export type Profile = z.infer<typeof Profile>;

export const Competitor = z.object({
  domain: z.string(),
  name: z.string(),
  canonical_name: z.string().optional(),
  description: z.string().optional(),
  why_relevant: z.string().optional(),
  votes: z.number().int().nonnegative().optional(),
  approaches: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  score: z.number().optional(),
  validated: z.boolean().nullable().optional(),
  validation_reason: z.string().optional(),
});
export type Competitor = z.infer<typeof Competitor>;

export const SelfProfile = z.object({
  domain: z.string(),
  name_guess: z.string(),
  raw_excerpt: z.string(),
});
export type SelfProfile = z.infer<typeof SelfProfile>;

export const DiscoverResult = z.object({
  input: z.string(),
  self: SelfProfile,
  deep_profile: Profile.nullable(),
  approaches: z.object({
    A_research: z.object({
      competitors: z.array(Competitor),
      sources: z.array(z.unknown()).optional(),
      error: z.string().optional(),
    }),
    B_cooccur: z.object({
      competitors: z.array(Competitor),
      raw_answers: z.record(z.string()).optional(),
      error: z.string().optional(),
    }),
    C_answer: z.object({
      competitors: z.array(Competitor),
      raw_answer: z.string().optional(),
      error: z.string().optional(),
    }),
  }),
  raw_consensus: z.array(Competitor),
  final: z.array(Competitor),
});
export type DiscoverResult = z.infer<typeof DiscoverResult>;

export const Intent = z
  .enum(["informational", "navigational", "commercial", "transactional"])
  .nullable();
export type Intent = z.infer<typeof Intent>;

export const RankedKeyword = z.object({
  keyword: z.string(),
  search_volume: z.number().nullable(),
  cpc: z.number().nullable(),
  keyword_difficulty: z.number().nullable(),
  intent: Intent,
  serp_position: z.number(),
  serp_url: z.string(),
});
export type RankedKeyword = z.infer<typeof RankedKeyword>;

export const AggregatedKeyword = z.object({
  keyword: z.string(),
  intent: Intent,
  total_volume: z.number(),
  avg_difficulty: z.number().nullable(),
  ranking_competitors: z.array(z.string()),
  best_position: z.number(),
  count: z.number().int().nonnegative(),
});
export type AggregatedKeyword = z.infer<typeof AggregatedKeyword>;

export const KeywordResult = z.object({
  jobId: z.string(),
  competitors: z.array(z.string()),
  locationCode: z.number(),
  languageCode: z.string(),
  keywordsByCompetitor: z.record(z.array(RankedKeyword)),
  consensus: z.array(AggregatedKeyword),
  outliers: z.array(AggregatedKeyword),
  cached: z.boolean(),
  fetchedAt: z.string(),
  costUsd: z.number(),
});
export type KeywordResult = z.infer<typeof KeywordResult>;

export const GeneratedPrompt = z.object({
  id: z.string(),
  query: z.string(),
  bucket: z.enum(["consideration", "awareness", "brand-eval"]),
  source_keyword: z.string().nullable(),
  source_competitors: z.array(z.string()),
  hypothesis: z.string(),
});
export type GeneratedPrompt = z.infer<typeof GeneratedPrompt>;

export const PromptSet = z.object({
  jobId: z.string(),
  competitors: z.array(z.string()),
  prompts: z.array(GeneratedPrompt),
  modelUsed: z.string(),
  generatedAt: z.string(),
  warnings: z.array(z.string()),
});
export type PromptSet = z.infer<typeof PromptSet>;

export const RouteInfo = z.object({
  path: z.string(),
  filePath: z.string(),
  framework: z.enum(["vite-react", "next", "tanstack-start", "unknown"]),
  isCSR: z.boolean(),
});
export type RouteInfo = z.infer<typeof RouteInfo>;

export const Inventory = z.object({
  repoUrl: z.string(),
  cloneDir: z.string(),
  framework: z.enum(["vite-react", "next", "tanstack-start", "unknown"]),
  isLovable: z.boolean(),
  routes: z.array(RouteInfo),
  packageJson: z.record(z.unknown()),
});
export type Inventory = z.infer<typeof Inventory>;

export const AuditFinding = z.object({
  route: z.string(),
  category: z.enum([
    "title",
    "description",
    "og",
    "twitter",
    "canonical",
    "robots",
    "sitemap",
    "schema",
    "headings",
    "alt-text",
    "semantic-html",
    "csr-rendering",
  ]),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  current: z.string().optional(),
  recommended: z.string().optional(),
});
export type AuditFinding = z.infer<typeof AuditFinding>;

export const AuditReport = z.object({
  findings: z.array(AuditFinding),
  totalRoutes: z.number(),
  csrRoutes: z.number(),
  schemaCoverage: z.number(),
});
export type AuditReport = z.infer<typeof AuditReport>;

export const RunContext = z.object({
  jobId: z.string(),
  outDir: z.string(),
  repoUrl: z.string(),
  startedAt: z.string(),
});
export type RunContext = z.infer<typeof RunContext>;
