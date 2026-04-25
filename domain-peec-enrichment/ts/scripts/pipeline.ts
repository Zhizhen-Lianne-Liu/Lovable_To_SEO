import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { buildDomainContext } from '../src-context/index.js';
import { fetchAggregatedKeywords } from '../src-competitors/index.js';
import { generatePrompts } from '../src-prompts/index.js';

// Standalone TS test harness: context check + DFS keywords + prompts.
// The CANONICAL end-to-end flow goes through ../../py/research/orchestrate.py
// which has Tavily competitor discovery + Anthropic validation gate +
// Peec push + snapshot. This script only exists for testing the TS pipeline
// in isolation when you already have a competitor list.
//
// usage:
//   npm run pipeline -- forgent.ai --candidates=tendium.com,mytender.io,govdash.com
//   npm run pipeline -- forgent.ai --candidates-from=path/to/results.json [--fresh]
const args = process.argv.slice(2);
const domain = args.find((a) => !a.startsWith('--'));
const fresh = args.includes('--fresh');
const candidatesRaw = stringFlag(args, '--candidates');
const candidatesFrom = stringFlag(args, '--candidates-from');

if (!domain) {
  console.error('usage: npm run pipeline -- <domain> [--candidates=a.com,b.com] [--candidates-from=path/to/results.json] [--fresh]');
  process.exit(1);
}

const targetDomain: string = domain;

run().catch((e) => {
  console.error('error:', (e as Error).message);
  console.error('cause:', (e as Error & { cause?: unknown }).cause);
  process.exit(1);
});

async function run() {
  console.log(`[1/3] building domain context for ${targetDomain}`);
  const context = await buildDomainContext(targetDomain);
  console.log(`      brand_name : ${context.brand_name}`);
  console.log(`      tagline    : ${context.tagline}`);
  console.log(`      category   : ${context.category}`);
  console.log(`      icp        : ${context.icp.join(' | ') || '(none)'}`);
  console.log(`      geography  : ${context.geography.join(', ') || '(none)'}`);
  console.log('');

  console.log(`[2/3] loading competitor candidates`);
  const candidates = await loadCandidates();
  console.log(`      ${candidates.length} candidates: ${candidates.slice(0, 5).join(', ')}…`);
  console.log('');

  if (candidates.length === 0) {
    console.error('no competitors provided. aborting.');
    process.exit(2);
  }

  console.log(`[3/3] keyword + prompt generation`);
  const intel = await fetchAggregatedKeywords(candidates, {
    fresh, keywordLimit: 200, locationCode: 2840, languageCode: 'en',
  });
  console.log(`      DFS cost: $${intel.costUsd}  consensus=${intel.consensus.length}  outliers=${intel.outliers.length}`);

  const set = await generatePrompts(intel, {
    topKeywords: 18,
    promptsPerKeyword: 4,
    category: context.category || undefined,
  });
  console.log(`      model: ${set.modelUsed}`);
  console.log(`      prompts: ${set.prompts.length}`);
  for (const w of set.warnings) console.log(`      ${w[0] === '[' ? '' : '- '}${w}`);
  console.log('');

  const consideration = set.prompts.filter((p) => p.bucket === 'consideration');
  const awareness = set.prompts.filter((p) => p.bucket === 'awareness');
  console.log(`consideration (${consideration.length}):`);
  for (const p of consideration) console.log(`  - ${p.query}  [${p.source_keyword}]`);
  if (awareness.length > 0) {
    console.log('');
    console.log(`awareness (${awareness.length}):`);
    for (const p of awareness) console.log(`  - ${p.query}  [${p.source_keyword}]`);
  }
}

async function loadCandidates(): Promise<string[]> {
  if (candidatesRaw) {
    return candidatesRaw.split(',').map((d) => d.trim()).filter(Boolean);
  }
  if (candidatesFrom) {
    const raw = JSON.parse(await readFile(candidatesFrom, 'utf8'));
    // Accept the shape py/research/discover.py emits.
    const list = Array.isArray(raw) ? raw : (raw.final ?? raw.competitors ?? []);
    return list
      .map((c: { domain?: string }) => c.domain)
      .filter((d: unknown): d is string => typeof d === 'string' && d.length > 0);
  }
  console.error('no candidates provided. pass --candidates=a.com,b.com or --candidates-from=path/to/results.json');
  process.exit(1);
}

function stringFlag(args: string[], name: string): string | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f?.split('=')[1];
}
