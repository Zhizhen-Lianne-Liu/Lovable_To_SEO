import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DataForSeoError, fetchRankedKeywords } from "../clients/dataforseo.js";
import {
  type AggregatedKeyword,
  type KeywordResult,
  type RankedKeyword,
  type RunContext,
} from "../types/index.js";

const CACHE_DIR = resolve(".cache/dataforseo");

export type KeywordsOpts = {
  fresh?: boolean;
  keywordLimit?: number;     // per competitor, default 30
  locationCode?: number;     // 2840 = US, 2276 = DE, ...
  languageCode?: string;     // "en", "de", ...
  mustContainAny?: string[]; // DFS-side topic filter
};

export async function keywords(args: {
  ctx: RunContext;
  competitors: string[];
  opts?: KeywordsOpts;
}): Promise<KeywordResult> {
  const opts = args.opts ?? {};
  const cleaned = [...new Set(args.competitors.map(normalizeDomain).filter((d): d is string => !!d))];
  if (cleaned.length === 0) {
    throw new DataForSeoError(
      "INVALID_INPUT",
      "competitors must be a non-empty list of domains.",
    );
  }

  const keywordLimit = opts.keywordLimit ?? 30;
  const locationCode = opts.locationCode ?? 2840;
  const languageCode = opts.languageCode ?? "en";
  const mustContain = (opts.mustContainAny ?? []).map((s) => s.toLowerCase()).sort();

  await mkdir(CACHE_DIR, { recursive: true });
  const cacheKey =
    `${cleaned.sort().join(",")}__${locationCode}_${languageCode}_k${keywordLimit}_t${mustContain.join("|")}`;
  const cachePath = join(CACHE_DIR, `agg_${stableHash(cacheKey)}.json`);

  if (!opts.fresh && (await fileExists(cachePath))) {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as KeywordResult;
    return { ...cached, cached: true, costUsd: 0 };
  }

  const keywordsByCompetitor: Record<string, RankedKeyword[]> = {};
  let costUsd = 0;
  for (const target of cleaned) {
    console.log(`  [keywords] ${target}…`);
    const { keywords: rows, cost } = await fetchRankedKeywords({
      target,
      locationCode,
      languageCode,
      limit: keywordLimit,
      mustContainAny: mustContain.length > 0 ? mustContain : undefined,
    });
    keywordsByCompetitor[target] = rows;
    costUsd += cost;
    console.log(`             → ${rows.length} keywords, $${cost.toFixed(4)}`);
  }

  const { consensus, outliers } = aggregate(keywordsByCompetitor);

  const result: KeywordResult = {
    jobId: randomUUID(),
    competitors: cleaned,
    locationCode,
    languageCode,
    keywordsByCompetitor,
    consensus,
    outliers,
    cached: false,
    fetchedAt: new Date().toISOString(),
    costUsd: round4(costUsd),
  };
  await writeFile(cachePath, JSON.stringify(result, null, 2), "utf8");
  console.log(
    `  [keywords] consensus=${consensus.length} outliers=${outliers.length}  total=$${result.costUsd}`,
  );
  return result;
}

function aggregate(
  keywordsByCompetitor: Record<string, RankedKeyword[]>,
): { consensus: AggregatedKeyword[]; outliers: AggregatedKeyword[] } {
  const map = new Map<string, AggregatedKeyword>();
  for (const [domain, kws] of Object.entries(keywordsByCompetitor)) {
    for (const kw of kws) {
      const key = kw.keyword.toLowerCase().trim();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          keyword: key,
          intent: kw.intent,
          total_volume: kw.search_volume ?? 0,
          avg_difficulty: kw.keyword_difficulty,
          ranking_competitors: [domain],
          best_position: kw.serp_position,
          count: 1,
        });
      } else {
        existing.total_volume += kw.search_volume ?? 0;
        existing.ranking_competitors.push(domain);
        existing.count += 1;
        if (kw.serp_position < existing.best_position) existing.best_position = kw.serp_position;
        if (kw.keyword_difficulty != null) {
          existing.avg_difficulty =
            existing.avg_difficulty == null
              ? kw.keyword_difficulty
              : (existing.avg_difficulty + kw.keyword_difficulty) / 2;
        }
      }
    }
  }
  const all = [...map.values()].sort(
    (a, b) => b.count - a.count || b.total_volume - a.total_volume,
  );
  return {
    consensus: all.filter((k) => k.count >= 2),
    outliers: all.filter((k) => k.count === 1),
  };
}

function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const m = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/.*)?$/i);
  return m?.[1] ?? null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function stableHash(s: string): string {
  // Tiny deterministic hash to keep cache filenames short.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
