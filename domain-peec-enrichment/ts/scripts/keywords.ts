import 'dotenv/config';
import { fetchAggregatedKeywords } from '../src-competitors/index.js';

// usage:
//   npm run keywords -- atlassian.com asana.com monday.com
//   npm run keywords -- --fresh atlassian.com asana.com
//   npm run keywords -- --limit=20 atlassian.com asana.com
//   npm run keywords -- --location=2276 --language=de hubspot.de pipedrive.de
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const keywordLimit = numericFlag(args, '--limit') ?? 30;
const locationCode = numericFlag(args, '--location') ?? 2840;
const languageCode = stringFlag(args, '--language') ?? 'en';
const competitors = args.filter((a) => !a.startsWith('--'));

if (competitors.length === 0) {
  console.error('usage: npm run keywords -- [--fresh] [--limit=N] [--location=N] [--language=xx] <domain> [<domain> ...]');
  process.exit(1);
}

fetchAggregatedKeywords(competitors, { fresh, keywordLimit, locationCode, languageCode })
  .then((r) => {
    console.log(`competitors    : ${r.competitors.join(', ')}`);
    console.log(`cached         : ${r.cached}`);
    console.log(`cost USD       : ${r.costUsd}`);
    console.log(`consensus kw   : ${r.consensus.length} (>=2 competitors)`);
    console.log(`outlier kw     : ${r.outliers.length} (1 competitor)`);
    console.log('');
    console.log('top consensus:');
    for (const k of r.consensus.slice(0, 15)) {
      const intent = (k.intent ?? 'n/a').padStart(13);
      const vol = k.total_volume.toString().padStart(8);
      console.log(`  [${intent}] vol=${vol} count=${k.count} pos=${k.best_position}  ${k.keyword}`);
    }
  })
  .catch((e) => {
    console.error('error:', (e as Error).message);
    console.error('cause:', (e as Error & { cause?: unknown }).cause);
    process.exit(1);
  });

function numericFlag(args: string[], name: string): number | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f ? Number(f.split('=')[1]) : undefined;
}
function stringFlag(args: string[], name: string): string | undefined {
  const f = args.find((a) => a.startsWith(`${name}=`));
  return f?.split('=')[1];
}
