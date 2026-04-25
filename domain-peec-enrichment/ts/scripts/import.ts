import 'dotenv/config';
import { importFromUrl } from '../src/index.js';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run import -- <lovable-or-github-url>');
  process.exit(1);
}

importFromUrl(url)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error('error:', (e as Error).message);
    console.error('cause:', (e as Error & { cause?: unknown }).cause);
    process.exit(1);
  });
