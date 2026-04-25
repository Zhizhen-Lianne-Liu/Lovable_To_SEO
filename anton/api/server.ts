import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importFromUrl } from '../src/index.js';
import type { ImportError } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json());

app.post('/api/import', async (req, res) => {
  const { url, fresh } = (req.body ?? {}) as { url?: unknown; fresh?: unknown };
  if (typeof url !== 'string' || !url.trim()) {
    const body: ImportError = { error: 'Body must include { url: string }.', code: 'INVALID_URL' };
    return res.status(400).json(body);
  }

  try {
    const result = await importFromUrl(url, { fresh: fresh === true });
    res.json(result);
  } catch (e) {
    const cause = (e as Error & { cause?: ImportError }).cause;
    const body: ImportError = cause ?? {
      error: (e as Error).message ?? 'Unknown error',
      code: 'UNKNOWN',
    };
    const status = statusForCode(body.code);
    res.status(status).json(body);
  }
});

app.use(express.static(join(__dirname, 'public')));

app.listen(PORT, () => {
  const tokenSet = Boolean(process.env.GITHUB_TOKEN);
  console.log(`[import-module] listening on http://localhost:${PORT}`);
  console.log(`[import-module] GITHUB_TOKEN ${tokenSet ? 'is set' : 'NOT set (60 req/hr limit)'}`);
});

function statusForCode(code: ImportError['code']): number {
  switch (code) {
    case 'INVALID_URL':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'PRIVATE_REPO':
      return 401;
    case 'RATE_LIMITED':
      return 429;
    case 'NETWORK':
      return 502;
    default:
      return 500;
  }
}
