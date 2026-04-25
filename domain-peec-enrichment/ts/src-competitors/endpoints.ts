import { dfsPost } from './client.js';
import type { RankedKeyword } from './types.js';

type RankedKeywordsPayload = {
  items: {
    keyword_data: {
      keyword: string;
      keyword_info?: { search_volume?: number; cpc?: number };
      keyword_properties?: { keyword_difficulty?: number };
      search_intent_info?: { main_intent?: string };
    };
    ranked_serp_element: {
      serp_item: { rank_absolute: number; url: string };
    };
  }[];
};

export async function fetchRankedKeywords(
  target: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  mustContainAny?: string[],
): Promise<{ keywords: RankedKeyword[]; cost: number }> {
  // Filters tuned to surface keywords competitors actually compete on:
  //  - search_volume > 200: drop micro-volume noise
  //  - rank_absolute <= 30: drop accidental rankings (page 4+ doesn't compete)
  //  - keyword LIKE %term%: optional topic filter pushed to DFS so we never
  //    even pay for off-topic content-marketing accidents (e.g. HubSpot's
  //    "email etiquette" article).
  const baseFilters: unknown[] = [
    ['keyword_data.keyword_info.search_volume', '>', 200],
    'and',
    ['ranked_serp_element.serp_item.rank_absolute', '<=', 30],
  ];

  // DFS doesn't reliably support nested OR groups in `filters`. Take the
  // first term as a single LIKE filter — works for the common case
  // (CRM software -> "crm"). For multi-term OR, the caller can do
  // separate fetches and merge.
  if (mustContainAny && mustContainAny.length > 0) {
    baseFilters.push('and', ['keyword_data.keyword', 'like', `%${mustContainAny[0]}%`]);
  }

  const json = await dfsPost<RankedKeywordsPayload>(
    'dataforseo_labs/google/ranked_keywords/live',
    [{
      target,
      location_code: locationCode,
      language_code: languageCode,
      limit,
      filters: baseFilters,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    }],
  );
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  const keywords: RankedKeyword[] = items.map((it) => ({
    keyword: it.keyword_data.keyword,
    search_volume: it.keyword_data.keyword_info?.search_volume ?? null,
    cpc: it.keyword_data.keyword_info?.cpc ?? null,
    keyword_difficulty: it.keyword_data.keyword_properties?.keyword_difficulty ?? null,
    intent: normalizeIntent(it.keyword_data.search_intent_info?.main_intent),
    serp_position: it.ranked_serp_element.serp_item.rank_absolute,
    serp_url: it.ranked_serp_element.serp_item.url,
  }));
  return { keywords, cost: json.cost };
}

function normalizeIntent(s: string | undefined): RankedKeyword['intent'] {
  if (!s) return null;
  const v = s.toLowerCase();
  if (['informational', 'navigational', 'commercial', 'transactional'].includes(v)) {
    return v as RankedKeyword['intent'];
  }
  return null;
}
