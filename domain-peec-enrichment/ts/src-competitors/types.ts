export type RankedKeyword = {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  keyword_difficulty: number | null;
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional' | null;
  serp_position: number;
  serp_url: string;
};

export type AggregatedKeyword = {
  keyword: string;
  intent: RankedKeyword['intent'];
  total_volume: number;                  // sum across competitors that rank for it
  avg_difficulty: number | null;
  ranking_competitors: string[];         // domains that rank for it
  best_position: number;                 // best (lowest) serp position across those competitors
  count: number;                         // how many competitors rank for it
};

export type AggregatedIntel = {
  jobId: string;
  competitors: string[];
  locationCode: number;
  languageCode: string;
  keywordsByCompetitor: Record<string, RankedKeyword[]>;
  consensus: AggregatedKeyword[];        // 2+ competitors rank for it
  outliers: AggregatedKeyword[];         // exactly 1 competitor ranks for it
  cached: boolean;
  fetchedAt: string;
  costUsd: number;
};

export type CompetitorError = {
  error: string;
  code:
    | 'INVALID_INPUT'
    | 'AUTH'
    | 'NOT_VERIFIED'
    | 'RATE_LIMITED'
    | 'NO_RESULTS'
    | 'NETWORK'
    | 'NO_CREDITS'
    | 'UNKNOWN';
};

export function competitorError(code: CompetitorError['code'], message: string): Error {
  const err = new Error(message);
  (err as Error & { cause: CompetitorError }).cause = { error: message, code };
  return err;
}
