import type { AggregatedIntel, AggregatedKeyword } from '../src-competitors/types.js';

// Score formula:
//   score = consensus_count × log10(volume + 1) × (1 / best_position)
// This rewards keywords where MULTIPLE competitors rank WELL, not just
// whatever has the highest absolute search volume.
//
//   - consensus_count: how many competitors compete for it. Strong signal.
//   - log10(volume): diminishing returns on volume — a keyword with 100K
//     vol isn't 10x better than one with 10K, just ~1.5x better.
//   - 1 / best_position: position 1 weighs more than position 30. Anyone
//     can rank position 50; ranking position 3 means the keyword is real.
//
// We pick top K by score. The variety stratification is folded in by giving
// 70% of slots to scored keywords + 30% reserved for explicit variety
// (long-tail, per-competitor exclusives, awareness terms).

export type SelectOpts = {
  topK?: number;                // total seed count (default 10)
  consensusOnly?: boolean;
  varietySlots?: number;        // how many of topK are reserved for variety (default ~30%)
};

export function scoreKeyword(k: AggregatedKeyword): number {
  const consensusFactor = Math.max(1, k.count);
  const volumeFactor = Math.log10(Math.max(0, k.total_volume) + 1);
  const positionFactor = 1 / Math.max(1, k.best_position);
  return consensusFactor * volumeFactor * positionFactor;
}

export function selectTopKeywords(intel: AggregatedIntel, opts: SelectOpts = {}): AggregatedKeyword[] {
  const topK = opts.topK ?? 10;
  const reservedForVariety = Math.max(0, opts.varietySlots ?? Math.floor(topK * 0.3));
  const scoredSlots = topK - reservedForVariety;

  const competitorStems = buildCompetitorStems(intel.competitors);

  const rawPool = opts.consensusOnly ? [...intel.consensus] : [...intel.consensus, ...intel.outliers];
  const pool = rawPool.filter((k) => isUsefulKeyword(k, competitorStems));

  // Score-ranked main pick.
  const scored = pool
    .map((k) => ({ k, score: scoreKeyword(k) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.k);

  const picks = new Map<string, AggregatedKeyword>();
  for (const k of scored.slice(0, scoredSlots)) picks.set(k.keyword, k);

  if (reservedForVariety > 0) {
    // Variety axis 1: long-tail (>=4 words) — the aggregator likes specificity.
    const longTail = pool.filter((k) => wordCount(k.keyword) >= 4)
      .sort((a, b) => scoreKeyword(b) - scoreKeyword(a));
    for (const k of longTail) {
      if (picks.size >= topK) break;
      if (!picks.has(k.keyword)) picks.set(k.keyword, k);
    }

    // Variety axis 2: per-competitor exclusives. One wedge keyword per
    // competitor that no one else ranks for. Useful even if individual
    // score is low because it surfaces differentiation.
    if (!opts.consensusOnly) {
      for (const dom of intel.competitors) {
        if (picks.size >= topK) break;
        const ownTop = intel.outliers
          .filter((k) => k.ranking_competitors[0] === dom)
          .sort((a, b) => scoreKeyword(b) - scoreKeyword(a))[0];
        if (ownTop && !picks.has(ownTop.keyword)) picks.set(ownTop.keyword, ownTop);
      }
    }

    // Variety axis 3: informational intent backfill. Awareness fuel.
    const informational = pool.filter((k) => k.intent === 'informational')
      .sort((a, b) => scoreKeyword(b) - scoreKeyword(a));
    for (const k of informational) {
      if (picks.size >= topK) break;
      if (!picks.has(k.keyword)) picks.set(k.keyword, k);
    }
  }

  return [...picks.values()].slice(0, topK);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// Strip common TLDs and dashes from competitor domains to get rejection stems.
// e.g. "close.com" -> ["close"], "monday.com" -> ["monday"], "lovable.dev" -> ["lovable"].
function buildCompetitorStems(competitors: string[]): string[] {
  const stems = new Set<string>();
  for (const c of competitors) {
    const stem = c.toLowerCase()
      .replace(/\.(com|io|app|dev|ai|co|net|org|so|us)$/i, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const s of stem) {
      if (s.length >= 3) stems.add(s);
    }
  }
  return [...stems];
}

// A keyword is useful for prompt generation if:
//  - intent is NOT navigational (people are searching for a brand they know)
//  - it does NOT contain any competitor's brand stem (these become brand-eval
//    prompts in a separate dedicated stage, not consideration prompts)
//  - it's not single-word generic ("login", "free", "support")
const GENERIC_SINGLE_WORDS = new Set([
  'login', 'log in', 'sign in', 'signin', 'free', 'support',
  'help', 'pricing', 'docs', 'api', 'download', 'demo', 'app',
]);

function isUsefulKeyword(k: { keyword: string; intent: string | null }, competitorStems: string[]): boolean {
  if (k.intent === 'navigational') return false;
  const lower = k.keyword.toLowerCase();
  if (GENERIC_SINGLE_WORDS.has(lower)) return false;
  // Substring match for brand stems: "closecrm" must be filtered too, not
  // just "close crm". A 4+ char competitor name appearing anywhere in the
  // keyword strongly suggests it's a brand-related query.
  for (const stem of competitorStems) {
    if (stem.length >= 4 && lower.includes(stem)) return false;
    if (stem.length === 3 && new RegExp(`\\b${stem}\\b`, 'i').test(lower)) return false;
  }
  return true;
}
