import { z } from "zod";

export const Profile = z.object({
  name: z.string(),
  domain: z.string(),
  tagline: z.string(),
  occupation: z.string(),
  industry: z.string(),
  category_for_search: z.string(),
  target_markets: z.array(z.string()),
  audience: z.string(),
  audience_sophistication: z.string(),
  products_and_services: z.array(z.string()),
  pricing_tier: z.string(),
  scale_tier: z.string(),
  brand_presentation: z.array(z.string()),
  key_differentiators: z.array(z.string()),
  competitor_signals: z.array(z.string()),
});
export type Profile = z.infer<typeof Profile>;

export const Competitor = z.object({
  domain: z.string(),
  name: z.string(),
  description: z.string().optional(),
  votes: z.number().int().nonnegative().optional(),
  validated: z.boolean().optional(),
});
export type Competitor = z.infer<typeof Competitor>;

export const DiscoverResult = z.object({
  input: z.string(),
  self: z.object({
    domain: z.string(),
    name_guess: z.string().optional(),
    raw_excerpt: z.string().optional(),
  }),
  deep_profile: Profile.nullable(),
  approaches: z.object({
    A_research: z.object({ competitors: z.array(Competitor) }),
    B_cooccur: z.object({ competitors: z.array(Competitor) }),
    C_answer: z.object({ competitors: z.array(Competitor) }),
  }),
  raw_consensus: z.array(Competitor),
  final: z.array(Competitor),
});
export type DiscoverResult = z.infer<typeof DiscoverResult>;

export const AggregatedKeyword = z.object({
  keyword: z.string(),
  total_volume: z.number().nullable(),
  avg_difficulty: z.number().nullable(),
  ranking_competitors: z.array(z.string()),
  best_position: z.number().nullable(),
  count: z.number().int().nonnegative(),
});
export type AggregatedKeyword = z.infer<typeof AggregatedKeyword>;

export const KeywordResult = z.object({
  consensus: z.array(AggregatedKeyword),
  outliers: z.array(AggregatedKeyword),
  fetched_at: z.string(),
});
export type KeywordResult = z.infer<typeof KeywordResult>;

export const GeneratedPrompt = z.object({
  query: z.string(),
  bucket: z.enum(["consideration", "awareness", "brand-eval"]),
  frame: z.string(),
  hypothesis: z.string(),
  source_keyword: z.string().optional(),
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
