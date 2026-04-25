import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { buildDomainContext } from '../src-context/index.js';
import { gatekeeper } from '../src-gatekeeper/index.js';
import { fetchAggregatedKeywords } from '../src-competitors/index.js';
import { generatePrompts } from '../src-prompts/index.js';
import type { CandidateCompetitor } from '../src-gatekeeper/types.js';

// usage:
//   npm run pipeline -- forgent.ai
//   npm run pipeline -- forgent.ai --candidates-from=path/to/tavily-results.json
//   npm run pipeline -- forgent.ai --candidates=tendium.com,mytender.io,govdash.com
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
  console.log(`[1/4] building domain context for ${targetDomain}`);
  const context = await buildDomainContext(targetDomain);
  console.log(`      brand_name : ${context.brand_name}`);
  console.log(`      tagline    : ${context.tagline}`);
  console.log(`      category   : ${context.category}`);
  console.log(`      icp        : ${context.icp.join(' | ') || '(none)'}`);
  console.log(`      geography  : ${context.geography.join(', ') || '(none)'}`);
  console.log(`      language   : ${context.language}`);
  console.log('');

  console.log(`[2/4] gathering candidate competitors`);
  const candidates = await loadCandidates();
  console.log(`      ${candidates.length} raw candidates`);
  console.log('');

  console.log(`[3/4] gatekeeper filtering`);
  const gate = await gatekeeper(context, candidates);
  console.log(`      context summary: ${gate.context_summary}`);
  console.log(`      kept (${gate.kept.length}):`);
  for (const c of gate.kept) console.log(`        + ${c.domain}`);
  console.log(`      rejected (${gate.rejected.length}):`);
  for (const r of gate.rejected.slice(0, 10)) console.log(`        - ${r.candidate.domain}  (${r.reason})`);
  for (const w of gate.warnings) console.log(`      WARNING: ${w}`);
  console.log('');

  if (gate.kept.length === 0) {
    console.error('no competitors survived the gatekeeper. aborting.');
    process.exit(2);
  }

  console.log(`[4/4] keyword + prompt generation on filtered competitors`);
  const competitorDomains = gate.kept.map((c) => c.domain);
  // Use US (location 2840, en) by default — broadest DFS data. The Peec
  // country tagging happens at submission time, not here.
  const intel = await fetchAggregatedKeywords(competitorDomains, {
    fresh, keywordLimit: 200, locationCode: 2840, languageCode: 'en',
  });
  console.log(`      DFS cost: $${intel.costUsd}  consensus=${intel.consensus.length}  outliers=${intel.outliers.length}`);

  const set = await generatePrompts(intel, {
    topKeywords: 18, promptsPerKeyword: 4,
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

async function loadCandidates(): Promise<CandidateCompetitor[]> {
  if (candidatesRaw) {
    return candidatesRaw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => ({ domain: d }));
  }
  if (candidatesFrom) {
    const raw = JSON.parse(await readFile(candidatesFrom, 'utf8'));
    // Accept the shape Tom's research/discover.py emits.
    const list = Array.isArray(raw) ? raw : (raw.final ?? raw.competitors ?? []);
    return list.map((c: { domain: string; name?: string; why_relevant?: string; description?: string }) => ({
      domain: c.domain,
      name: c.name,
      descriptor: c.description,
      why_relevant: c.why_relevant,
    }));
  }
  console.error('no candidates provided. pass --candidates=a.com,b.com or --candidates-from=path/to/results.json');
  process.exit(1);
}

function stringFlag(args: string[], name: string): string | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f?.split('=')[1];
}
