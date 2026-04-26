import {
  PeecError,
  getActions,
  getBrandReport,
  getChatContent,
  getDomainReport,
  getSearchQueries,
  getShoppingQueries,
  getUrlContent,
  getUrlReport,
  listBrands,
  listChats,
  listModels,
  listPrompts,
  type PeecBrand,
  type PeecModel,
  type PeecPrompt,
} from "../clients/peec.js";
import { type RunContext } from "../types/index.js";

// =============================================================================
// Output type — tightly tracks the Python composer
// =============================================================================

export type FlatBrandRow = {
  brand_id: string;
  brand_name: string;
  visibility: number | null;
  share_of_voice: number | null;
  mention_count: number | null;
  sentiment: number | null;
  position: number | null;
};

export type EngineBreakdown = {
  model: string;
  own_visibility: number;
  top_competitor: string | null;
  top_competitor_visibility: number;
  gap_pct: number;
};

export type PromptBreakdown = {
  prompt_id: string;
  prompt_text: string;
  own_visibility: number;
  own_position: number | null;
  own_sentiment: number | null;
  top_competitor: string | null;
  top_competitor_visibility: number;
  weakness_flag: boolean;
  winning_flag: boolean;
};

export type FlatDomainRow = {
  domain: string;
  classification: string | null;
  retrieved_percentage: number | null;
  retrieval_rate: number | null;
  citation_rate: number | null;
  retrieval_count: number | null;
  citation_count: number | null;
  competitors_cited: string[];
};

export type FlatUrlRow = {
  url: string;
  classification: string | null;
  title: string | null;
  channel_title: string | null;
  retrieval_count: number | null;
  citation_count: number | null;
  citation_rate: number | null;
  competitors_cited: string[];
};

export type ActionRecord = {
  scope: string;
  url_classification?: string | null;
  domain?: string | null;
  opportunity_score: number;
  gap_percentage?: number | null;
  coverage_percentage?: number | null;
  outreach_tier: "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
};

export type FanoutQuery = {
  query: string;
  count: number;
  source_combos: Array<{ prompt_id: string | null; model: string | null }>;
};

export type DiagnosticRecord = {
  chat_id: string;
  prompt_id: string | null;
  prompt_text: string;
  model: string | null;
  brands_mentioned: Array<{ name: string; position: number | null }>;
  source_urls: string[];
  excerpt: string;
  own_position?: number | null;
};

export type PeecSnapshot = {
  meta: {
    project_id: string;
    snapshot_at: string;
    date_range: { start: string; end: string; days: number };
    own_brand: { id: string | null; name: string | null; domains: string[] };
    competitors: Array<{ id: string; name: string; domains: string[] }>;
    active_models: string[];
    coverage: { expected: number; actual: number; pct: number };
  };
  scorecard: {
    own: FlatBrandRow | null;
    competitors: FlatBrandRow[];
    our_rank: number;
    total_brands_ranked: number;
  };
  engine_breakdown: EngineBreakdown[];
  prompt_breakdown: PromptBreakdown[];
  actions: ActionRecord[];
  gap_targets: {
    domains: FlatDomainRow[];
    urls: FlatUrlRow[];
  };
  owned_audit: {
    cited_urls: FlatUrlRow[];
    site_classification_mix: Record<string, number>;
  };
  fanout_queries: FanoutQuery[];
  fanout_queries_search: Array<Record<string, unknown>>;
  fanout_queries_shopping: Array<Record<string, unknown>>;
  diagnostics: { wins: DiagnosticRecord[]; misses: DiagnosticRecord[] };
  url_contents: Record<string, string>;
  _raw: {
    chat_count_total: number;
    chat_contents_sampled: number;
    domain_report_top: FlatDomainRow[];
    url_report_top: FlatUrlRow[];
  };
};

// =============================================================================
// Helpers
// =============================================================================

function safePct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 10000) / 10000 : 0;
}

function flattenBrandRow(r: Record<string, unknown>): FlatBrandRow {
  const brand = (r.brand as Record<string, unknown>) ?? {};
  return {
    brand_id: String(brand.id ?? ""),
    brand_name: String(brand.name ?? ""),
    visibility: (r.visibility as number | null) ?? null,
    share_of_voice: (r.share_of_voice as number | null) ?? null,
    mention_count: (r.mention_count as number | null) ?? null,
    sentiment: (r.sentiment as number | null) ?? null,
    position: (r.position as number | null) ?? null,
  };
}

function coverage(
  chats: Array<Record<string, unknown>>,
  prompts: PeecPrompt[],
  models: PeecModel[],
): { expected: number; actual: number; pct: number } {
  const seen = new Set<string>();
  for (const c of chats) {
    const pid = ((c.prompt as Record<string, unknown>) ?? {}).id;
    const mid = ((c.model as Record<string, unknown>) ?? {}).id;
    if (pid && mid) seen.add(`${String(pid)}::${String(mid)}`);
  }
  const expected = prompts.length * models.length;
  return { expected, actual: seen.size, pct: safePct(seen.size, expected) };
}

function engineBreakdown(
  rows: Array<Record<string, unknown>>,
  ownId: string | null,
): EngineBreakdown[] {
  const byModel = new Map<string, FlatBrandRow[]>();
  for (const r of rows) {
    const model = (r.model as Record<string, unknown>) ?? {};
    const mid = (model.id as string) ?? (r.model_id as string);
    if (!mid) continue;
    const flat = flattenBrandRow(r);
    const list = byModel.get(mid) ?? [];
    list.push(flat);
    byModel.set(mid, list);
  }
  const out: EngineBreakdown[] = [];
  for (const [mid, list] of byModel) {
    const own = list.find((x) => x.brand_id === ownId) ?? null;
    const competitors = list
      .filter((x) => x.brand_id !== ownId && (x.visibility ?? 0) > 0)
      .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0));
    const ownV = own?.visibility ?? 0;
    const topV = competitors[0]?.visibility ?? 0;
    out.push({
      model: mid,
      own_visibility: ownV,
      top_competitor: competitors[0]?.brand_name ?? null,
      top_competitor_visibility: topV,
      gap_pct: Math.max(0, topV - ownV),
    });
  }
  return out.sort((a, b) => b.gap_pct - a.gap_pct);
}

function promptBreakdown(
  rows: Array<Record<string, unknown>>,
  ownId: string | null,
  promptText: Map<string, string>,
): PromptBreakdown[] {
  const byPrompt = new Map<string, Array<FlatBrandRow & { _row: Record<string, unknown> }>>();
  for (const r of rows) {
    const prompt = (r.prompt as Record<string, unknown>) ?? {};
    const pid = (prompt.id as string) ?? (r.prompt_id as string);
    if (!pid) continue;
    const list = byPrompt.get(pid) ?? [];
    list.push({ ...flattenBrandRow(r), _row: r });
    byPrompt.set(pid, list);
  }
  const out: PromptBreakdown[] = [];
  for (const [pid, list] of byPrompt) {
    const own = list.find((x) => x.brand_id === ownId) ?? null;
    const competitors = list
      .filter((x) => x.brand_id !== ownId && (x.visibility ?? 0) > 0)
      .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0));
    const ownV = own?.visibility ?? 0;
    const topV = competitors[0]?.visibility ?? 0;
    out.push({
      prompt_id: pid,
      prompt_text: promptText.get(pid) ?? "",
      own_visibility: ownV,
      own_position: own?.position ?? null,
      own_sentiment: own?.sentiment ?? null,
      top_competitor: competitors[0]?.brand_name ?? null,
      top_competitor_visibility: topV,
      weakness_flag: ownV < 0.3,
      winning_flag: ownV >= 0.7 && ownV >= topV,
    });
  }
  return out.sort((a, b) => a.own_visibility - b.own_visibility);
}

function classifyOutreachTier(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.2) return "HIGH";
  if (score >= 0.08) return "MEDIUM";
  return "LOW";
}

function flattenDomainRow(
  r: Record<string, unknown>,
  brandLookup: Map<string, PeecBrand>,
): FlatDomainRow {
  const bids = (r.mentioned_brand_ids as string[]) ?? [];
  return {
    domain: String(r.domain ?? ""),
    classification: (r.classification as string | null) ?? null,
    retrieved_percentage: (r.retrieved_percentage as number | null) ?? null,
    retrieval_rate: (r.retrieval_rate as number | null) ?? null,
    citation_rate: (r.citation_rate as number | null) ?? null,
    retrieval_count: (r.retrieval_count as number | null) ?? null,
    citation_count: (r.citation_count as number | null) ?? null,
    competitors_cited: bids.map((b) => brandLookup.get(b)?.name ?? b),
  };
}

function flattenUrlRow(
  r: Record<string, unknown>,
  brandLookup: Map<string, PeecBrand>,
): FlatUrlRow {
  const bids = (r.mentioned_brand_ids as string[]) ?? [];
  return {
    url: String(r.url ?? ""),
    classification: (r.classification as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    channel_title: (r.channel_title as string | null) ?? null,
    retrieval_count: (r.retrieval_count as number | null) ?? null,
    citation_count: (r.citation_count as number | null) ?? null,
    citation_rate: (r.citation_rate as number | null) ?? null,
    competitors_cited: bids.map((b) => brandLookup.get(b)?.name ?? b),
  };
}

async function aggregateActions(
  projectId: string,
  overview: Array<Record<string, unknown>>,
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];
  for (const row of overview) {
    const score = (row.opportunity_score as number | null) ?? 0;
    if (score <= 0) continue;
    const scope = String((row.action_group_type as string | null) ?? "").toLowerCase();
    const urlClass = (row.url_classification as string | null) ?? null;
    const domain = (row.domain as string | null) ?? null;
    let drill: Array<Record<string, unknown>> = [];
    try {
      const args: Parameters<typeof getActions>[0] = { projectId, scope };
      if ((scope === "owned" || scope === "editorial") && urlClass) args.url_classification = urlClass;
      if ((scope === "reference" || scope === "ugc") && domain) args.domain = domain;
      drill = await getActions(args);
    } catch (e) {
      if (e instanceof PeecError) continue;
      throw e;
    }
    for (const d of drill) {
      actions.push({
        scope,
        url_classification: urlClass,
        domain,
        opportunity_score: score,
        gap_percentage: (row.gap_percentage as number | null) ?? null,
        coverage_percentage: (row.coverage_percentage as number | null) ?? null,
        outreach_tier: classifyOutreachTier(score),
        recommendation: String(d.text ?? ""),
      });
    }
  }
  return actions.sort((a, b) => b.opportunity_score - a.opportunity_score);
}

function fanoutQueries(chatContents: Array<Record<string, unknown>>): FanoutQuery[] {
  const counter = new Map<string, number>();
  const sources = new Map<string, Set<string>>();
  for (const c of chatContents) {
    const queries = (c.queries as string[] | null) ?? [];
    const pid = ((c.prompt as Record<string, unknown>) ?? {}).id ?? null;
    const mid = ((c.model as Record<string, unknown>) ?? {}).id ?? null;
    for (const q of queries) {
      counter.set(q, (counter.get(q) ?? 0) + 1);
      const set = sources.get(q) ?? new Set<string>();
      set.add(`${String(pid ?? "")}::${String(mid ?? "")}`);
      sources.set(q, set);
    }
  }
  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
  return sorted.map(([query, count]) => ({
    query,
    count,
    source_combos: [...(sources.get(query) ?? new Set())].map((key) => {
      const [prompt_id, model] = key.split("::");
      return {
        prompt_id: prompt_id || null,
        model: model || null,
      };
    }),
  }));
}

function diagnostics(
  chatContents: Array<Record<string, unknown>>,
  ownId: string | null,
  promptText: Map<string, string>,
): { wins: DiagnosticRecord[]; misses: DiagnosticRecord[] } {
  const wins: DiagnosticRecord[] = [];
  const misses: DiagnosticRecord[] = [];
  for (const c of chatContents) {
    const bm = (c.brands_mentioned as Array<Record<string, unknown>> | null) ?? [];
    const own = bm.find((b) => b.id === ownId);
    const msgs = (c.messages as Array<Record<string, unknown>> | null) ?? [];
    const last = msgs.length >= 2 ? msgs[msgs.length - 1] : null;
    const excerpt = String((last?.content as string | undefined) ?? "").slice(0, 600);
    const promptId = ((c.prompt as Record<string, unknown>) ?? {}).id as string | undefined;
    const record: DiagnosticRecord = {
      chat_id: String(c.id ?? ""),
      prompt_id: promptId ?? null,
      prompt_text: (promptId && promptText.get(promptId)) || "",
      model: (((c.model as Record<string, unknown>) ?? {}).id as string | undefined) ?? null,
      brands_mentioned: bm.map((b) => ({
        name: String(b.name ?? ""),
        position: (b.position as number | null) ?? null,
      })),
      source_urls: ((c.sources as Array<Record<string, unknown>> | null) ?? [])
        .map((s) => String(s.url ?? ""))
        .filter(Boolean)
        .slice(0, 5),
      excerpt,
    };
    if (own) {
      record.own_position = (own.position as number | null) ?? null;
      wins.push(record);
    } else if (bm.length > 0) {
      misses.push(record);
    }
  }
  wins.sort((a, b) => (a.own_position ?? 99) - (b.own_position ?? 99));
  misses.sort((a, b) => b.brands_mentioned.length - a.brands_mentioned.length);
  return { wins: wins.slice(0, 5), misses: misses.slice(0, 5) };
}

// =============================================================================
// Public entry point
// =============================================================================

export async function peecSnapshot(args: {
  ctx: RunContext;
  projectId?: string;
  days?: number;
  pullChatContents?: boolean;
}): Promise<PeecSnapshot> {
  const days = args.days ?? 7;
  const pullChats = args.pullChatContents ?? true;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 86400_000);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const opts = args.projectId ? { projectId: args.projectId } : undefined;
  const projId = args.projectId; // for getActions which requires non-undefined
  console.log(`[snapshot] window=${start}→${end}`);

  // 1. Configuration
  const [brands, prompts, models] = await Promise.all([
    listBrands(opts),
    listPrompts(opts),
    listModels(opts),
  ]);
  const activeModels = models.filter((m) => m.is_active);
  const own = brands.find((b) => b.is_own) ?? null;
  const ownId = own?.id ?? null;
  const competitorBrands = brands.filter((b) => !b.is_own);
  const brandLookup = new Map(brands.map((b) => [b.id, b]));
  const promptText = new Map<string, string>();
  for (const p of prompts) {
    promptText.set(p.id, p.text ?? "");
  }
  console.log(
    `  brands: 1 own + ${competitorBrands.length} competitors  |  prompts: ${prompts.length}  |  active models: ${activeModels.length}`,
  );

  // 2. Chats — coverage + diagnostics
  const chats = await listChats({ ...opts, start, end });
  const cov = coverage(chats, prompts, activeModels);
  console.log(
    `  chats: ${chats.length}  coverage: ${cov.actual}/${cov.expected} (${(cov.pct * 100).toFixed(0)}%)`,
  );

  const chatContents: Array<Record<string, unknown>> = [];
  if (pullChats && chats.length) {
    const sample = chats.slice(0, 30);
    console.log(`  fetching content for ${sample.length} chats…`);
    for (const c of sample) {
      try {
        const content = await getChatContent({ ...opts, chatId: String(c.id) });
        chatContents.push(content);
      } catch {
        // ignore — keep what we have
      }
    }
  }

  // 3. Brand reports
  console.log("  brand reports…");
  const [overall, perModel, perPrompt] = await Promise.all([
    getBrandReport({ ...opts, start, end }),
    getBrandReport({ ...opts, start, end, dimensions: ["model_id"] }),
    getBrandReport({ ...opts, start, end, dimensions: ["prompt_id"] }),
  ]);

  // 4. Domain + URL reports (overall + gap)
  console.log("  domain & url reports…");
  const [domainsAll, domainsGap, urlsAll, urlsGap] = await Promise.all([
    getDomainReport({ ...opts, start, end, limit: 200 }),
    getDomainReport({ ...opts, start, end, gapOnly: true, limit: 200 }),
    getUrlReport({ ...opts, start, end, limit: 200 }),
    getUrlReport({ ...opts, start, end, gapOnly: true, limit: 200 }),
  ]);

  // 5. Actions — overview + drill all non-zero slices
  console.log("  actions…");
  const overview = await getActions({ ...(opts ?? {}), scope: "overview" });
  const actions = projId ? await aggregateActions(projId, overview) : await aggregateActions("", overview);

  // 5b. Fanout queries
  console.log("  fanout queries (search + shopping)…");
  let fanoutSearch: Array<Record<string, unknown>> = [];
  let fanoutShopping: Array<Record<string, unknown>> = [];
  try {
    fanoutSearch = await getSearchQueries({ ...opts, start, end });
  } catch (e) {
    console.warn(`    [warn] search queries failed: ${(e as Error).message}`);
  }
  try {
    fanoutShopping = await getShoppingQueries({ ...opts, start, end });
  } catch (e) {
    console.warn(`    [warn] shopping queries failed: ${(e as Error).message}`);
  }

  // 5c. URL content for top 10 gap URLs (cap at 5KB each)
  console.log("  url content for top gap URLs (max 10)…");
  const urlContents: Record<string, string> = {};
  for (const r of urlsGap.slice(0, 10)) {
    const url = r.url as string | undefined;
    if (!url) continue;
    try {
      const res = await getUrlContent({ ...opts, url });
      const data = (res.data as Record<string, unknown> | undefined) ?? res;
      const md = String((data as Record<string, unknown>).content ?? "");
      urlContents[url] = md.slice(0, 5000);
    } catch {
      // ignore — keep what we have
    }
  }

  // 6. Compose
  const ownMetrics =
    overall.find((r) => ((r.brand as Record<string, unknown>) ?? {}).id === ownId) ?? null;
  const ownFlat = ownMetrics ? flattenBrandRow(ownMetrics) : null;
  const competitorFlat = overall
    .filter((r) => ((r.brand as Record<string, unknown>) ?? {}).id !== ownId)
    .map(flattenBrandRow)
    .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0));
  const ownV = ownFlat?.visibility ?? 0;
  const rank = 1 + competitorFlat.filter((c) => (c.visibility ?? 0) > ownV).length;

  const ownDomains = own?.domains ?? [];
  const citedOwned = urlsAll
    .filter((r) => ownDomains.some((d) => String(r.url ?? "").includes(d)))
    .map((r) => flattenUrlRow(r, brandLookup));

  const classificationCounts = new Map<string, number>();
  let totalRetrievals = 0;
  for (const r of domainsAll) {
    const cls = (r.classification as string | null) ?? "OTHER";
    const ret = (r.retrieval_count as number | null) ?? 0;
    classificationCounts.set(cls, (classificationCounts.get(cls) ?? 0) + ret);
    totalRetrievals += ret;
  }
  const classificationMix: Record<string, number> = {};
  for (const [k, v] of classificationCounts) {
    classificationMix[k] = totalRetrievals > 0 ? Math.round((v / totalRetrievals) * 10000) / 10000 : 0;
  }

  return {
    meta: {
      project_id: args.projectId ?? "",
      snapshot_at: new Date().toISOString(),
      date_range: { start, end, days },
      own_brand: { id: ownId, name: own?.name ?? null, domains: ownDomains },
      competitors: competitorBrands.map((b) => ({
        id: b.id,
        name: b.name,
        domains: b.domains ?? [],
      })),
      active_models: activeModels.map((m) => m.id),
      coverage: cov,
    },
    scorecard: {
      own: ownFlat,
      competitors: competitorFlat,
      our_rank: rank,
      total_brands_ranked: 1 + competitorFlat.filter((c) => (c.visibility ?? 0) > 0).length,
    },
    engine_breakdown: engineBreakdown(perModel, ownId),
    prompt_breakdown: promptBreakdown(perPrompt, ownId, promptText),
    actions,
    gap_targets: {
      domains: domainsGap.map((r) => flattenDomainRow(r, brandLookup)),
      urls: urlsGap.map((r) => flattenUrlRow(r, brandLookup)),
    },
    owned_audit: {
      cited_urls: citedOwned,
      site_classification_mix: classificationMix,
    },
    fanout_queries: fanoutQueries(chatContents),
    fanout_queries_search: fanoutSearch,
    fanout_queries_shopping: fanoutShopping,
    diagnostics: diagnostics(chatContents, ownId, promptText),
    url_contents: urlContents,
    _raw: {
      chat_count_total: chats.length,
      chat_contents_sampled: chatContents.length,
      domain_report_top: domainsAll.slice(0, 30).map((r) => flattenDomainRow(r, brandLookup)),
      url_report_top: urlsAll.slice(0, 30).map((r) => flattenUrlRow(r, brandLookup)),
    },
  };
}
