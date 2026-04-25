// Multi-path .env loader: try ts-local first, then the parent folder
// (domain-peec-enrichment/.env — the canonical single source of truth shared
// with py/). This makes the script work whether you run it from ts/ or via
// the Python orchestrator's subprocess (cwd=ts/).
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
for (const candidate of ['.env', '../.env']) {
  const abs = resolvePath(process.cwd(), candidate);
  if (existsSync(abs)) {
    dotenv.config({ path: abs });
    break;
  }
}

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchAggregatedKeywords } from '../src-competitors/index.js';
import { generatePrompts } from '../src-prompts/index.js';

// usage:
//   npm run prompts -- atlassian.com asana.com monday.com
//   npm run prompts -- --fresh --keyword-limit=40 --top-k=30 atlassian.com asana.com
//   npm run prompts -- --location=2276 --language=de hubspot.de pipedrive.de
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const consensusOnly = args.includes('--consensus-only');
const skipAggregator = args.includes('--no-aggregator');
const keywordLimit = numericFlag(args, '--keyword-limit') ?? 200;
const topKeywords = numericFlag(args, '--top-keywords') ?? 18;
const promptsPerKeyword = numericFlag(args, '--prompts-per-keyword') ?? 4;
const locationCode = numericFlag(args, '--location') ?? 2840;
const languageCode = stringFlag(args, '--language') ?? 'en';
const provider = stringFlag(args, '--provider') as 'gemini' | 'anthropic' | undefined;
const subagentModel = stringFlag(args, '--model');
const aggregatorModel = stringFlag(args, '--aggregator-model');
const category = stringFlag(args, '--category');
const candidatePool = numericFlag(args, '--candidate-pool') ?? 60;
const skipCurator = args.includes('--no-curator');
const outPath = stringFlag(args, '--out');     // write the full PromptSet JSON to this file
const quiet = args.includes('--quiet');         // suppress the human-readable preview to stdout
const mustContainRaw = stringFlag(args, '--must-contain');
// --must-contain is now optional and explicit. The curator agent does the
// brand-agnostic relevance filtering. Don't auto-derive from --category.
const mustContainAny = mustContainRaw
  ? mustContainRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const competitors = args.filter((a) => !a.startsWith('--'));

if (competitors.length === 0) {
  console.error('usage: npm run prompts -- [flags] <domain> [<domain> ...]');
  console.error('  flags: --fresh --keyword-limit=N --top-k=N --chunk-size=N --location=N --language=xx --model=name');
  process.exit(1);
}

run().catch((e) => {
  console.error('error:', (e as Error).message);
  console.error('cause:', (e as Error & { cause?: unknown }).cause);
  process.exit(1);
});

async function run() {
  console.log(`[1/2] fetching keywords for: ${competitors.join(', ')}`);
  if (mustContainAny.length > 0) console.log(`      DFS topic filter: keyword contains any of [${mustContainAny.join(', ')}]`);
  const intel = await fetchAggregatedKeywords(competitors, {
    fresh, keywordLimit, locationCode, languageCode, mustContainAny,
  });
  console.log(`      cached=${intel.cached} cost=$${intel.costUsd} consensus=${intel.consensus.length} outliers=${intel.outliers.length}`);

  console.log(`[2/2] generating prompts (provider=${provider ?? 'auto'}, candidates=${candidatePool}, top-keywords=${topKeywords}, prompts-per-keyword=${promptsPerKeyword}${category ? `, category-hint="${category}"` : ''}${consensusOnly ? ', consensus-only' : ''}${skipCurator ? ', no-curator' : ''}${skipAggregator ? ', no-aggregator' : ''})`);
  const set = await generatePrompts(intel, {
    provider, subagentModel, aggregatorModel,
    candidatePool, topKeywords, promptsPerKeyword, category,
    consensusOnly, skipCurator, skipAggregator,
  });

  // Write the full PromptSet JSON for downstream consumers (orchestrators).
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(set, null, 2));
    console.error(`[json] wrote PromptSet → ${outPath}`); // stderr keeps stdout human-readable
  }

  if (quiet) return;

  console.log('');
  console.log(`competitors    : ${set.competitors.join(', ')}`);
  console.log(`model used     : ${set.modelUsed}`);
  console.log(`prompts        : ${set.prompts.length}`);
  if (set.warnings.length > 0) {
    console.log('warnings       :');
    for (const w of set.warnings) console.log(`  - ${w}`);
  }
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

function numericFlag(args: string[], name: string): number | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f ? Number(f.split('=')[1]) : undefined;
}
function stringFlag(args: string[], name: string): string | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f?.split('=')[1];
}

// Derive a sensible DFS-side topic filter from the category string. Splits on
// spaces, drops the word "software"/"tools"/etc, takes remaining words.
// "CRM software" -> ["crm"], "project management tools" -> ["project management"].
function deriveMustContainFromCategory(category: string | undefined): string[] {
  if (!category) return [];
  const stop = new Set(['software', 'tools', 'tool', 'platform', 'platforms', 'app', 'apps', 'system', 'systems', 'service', 'services']);
  const words = category.toLowerCase().split(/\s+/).filter((w) => w && !stop.has(w));
  if (words.length === 0) return [];
  // For multi-word categories like "project management", keep them as one phrase.
  return [words.join(' ')];
}
