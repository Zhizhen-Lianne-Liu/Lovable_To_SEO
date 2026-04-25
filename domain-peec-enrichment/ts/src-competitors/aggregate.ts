import type { AggregatedKeyword, RankedKeyword } from './types.js';

export function aggregate(
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
        // running mean for difficulty (skip nulls)
        if (kw.keyword_difficulty != null) {
          existing.avg_difficulty =
            existing.avg_difficulty == null
              ? kw.keyword_difficulty
              : (existing.avg_difficulty + kw.keyword_difficulty) / 2;
        }
      }
    }
  }

  const all = [...map.values()].sort((a, b) => b.count - a.count || b.total_volume - a.total_volume);
  return {
    consensus: all.filter((k) => k.count >= 2),
    outliers: all.filter((k) => k.count === 1),
  };
}
