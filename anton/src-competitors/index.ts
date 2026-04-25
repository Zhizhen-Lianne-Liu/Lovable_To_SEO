import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve as pathResolve } from 'node:path';
import { v4 as uuid } from 'uuid';
import { fetchRankedKeywords } from './endpoints.js';
import { aggregate } from './aggregate.js';
import { competitorError } from './types.js';
import type { AggregatedIntel, RankedKeyword } from './types.js';

export type {
  AggregatedIntel,
  AggregatedKeyword,
  RankedKeyword,
  CompetitorError,
} from './types.js';

const CACHE_DIR = pathResolve('.cache/dataforseo');

export type FetchOpts = {
  fresh?: boolean;
  keywordLimit?: number;     // per competitor, default 30
  locationCode?: number;     // 2840 = US, 2276 = DE, ...
  languageCode?: string;     // "en", "de", ...
  mustContainAny?: string[]; // DFS-side topic filter: keyword must contain ≥1 of these terms
};

export async function fetchAggregatedKeywords(
  competitors: string[],
  opts: FetchOpts = {},
): Promise<AggregatedIntel> {
  const cleaned = [...new Set(competitors.map(normalizeDomain).filter(Boolean) as string[])];
  if (cleaned.length === 0) {
    throw competitorError('INVALID_INPUT', 'competitors must be a non-empty list of domains.');
  }

  const keywordLimit = opts.keywordLimit ?? 30;
  const locationCode = opts.locationCode ?? 2840;
  const languageCode = opts.languageCode ?? 'en';
  const mustContain = (opts.mustContainAny ?? []).map((s) => s.toLowerCase()).sort();

  await mkdir(CACHE_DIR, { recursive: true });
  const cacheKey = `${cleaned.sort().join(',')}__${locationCode}_${languageCode}_k${keywordLimit}_t${mustContain.join('|')}`;
  const cachePath = join(CACHE_DIR, `agg_${hash(cacheKey)}.json`);

  if (!opts.fresh && (await exists(cachePath))) {
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as AggregatedIntel;
    return { ...cached, cached: true, costUsd: 0 };
  }

  const keywordsByCompetitor: Record<string, RankedKeyword[]> = {};
  let costUsd = 0;
  for (const domain of cleaned) {
    const { keywords, cost } = await fetchRankedKeywords(
      domain, locationCode, languageCode, keywordLimit, mustContain.length > 0 ? mustContain : undefined,
    );
    keywordsByCompetitor[domain] = keywords;
    costUsd += cost;
  }

  const { consensus, outliers } = aggregate(keywordsByCompetitor);

  const result: AggregatedIntel = {
    jobId: uuid(),
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

  await writeFile(cachePath, JSON.stringify(result, null, 2), 'utf8');
  return result;
}

function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const m = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/.*)?$/i);
  return m?.[1] ?? null;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function hash(s: string): string {
  // Tiny deterministic hash to keep cache filenames short.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
