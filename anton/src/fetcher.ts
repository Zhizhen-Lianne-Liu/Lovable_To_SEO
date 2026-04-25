import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { importError } from './types.js';

const CACHE_DIR = pathResolve('.cache/tarballs');

export type FetchResult = {
  workdir: string;
  cached: boolean;
  sha?: string;
};

export async function fetchAndExtract(
  owner: string,
  repo: string,
  jobId: string,
  fresh: boolean,
): Promise<FetchResult> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `${owner}__${repo}.tar.gz`);
  const cached = !fresh && (await exists(cachePath));

  if (!cached) await downloadTarball(owner, repo, cachePath);

  const extractRoot = join(tmpdir(), `import-${jobId}`);
  await mkdir(extractRoot, { recursive: true });
  await pipeline(createReadStream(cachePath), extract({ cwd: extractRoot }));

  const sha = await flattenWrapper(extractRoot);
  return { workdir: extractRoot, cached, sha };
}

async function downloadTarball(owner: string, repo: string, dest: string): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/tarball`;
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'lovable-import-module',
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: 'follow' });
  } catch (e) {
    throw importError('NETWORK', `GitHub fetch failed: ${(e as Error).message}`);
  }

  if (!res.ok) {
    if (res.status === 404) throw importError('NOT_FOUND', `Repo ${owner}/${repo} not found.`);
    if (res.status === 401) {
      throw importError('PRIVATE_REPO', `Repo ${owner}/${repo} is private or the token is invalid.`);
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw importError(
          'RATE_LIMITED',
          'GitHub rate limit hit. Add GITHUB_TOKEN to .env to raise it from 60/hr to 5000/hr.',
        );
      }
      throw importError(
        'PRIVATE_REPO',
        `GitHub returned 403 for ${owner}/${repo} (forbidden or token lacks access).`,
      );
    }
    throw importError('UNKNOWN', `GitHub returned HTTP ${res.status} for ${owner}/${repo}.`);
  }

  if (!res.body) throw importError('NETWORK', 'GitHub returned an empty body.');
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

// GitHub tarballs wrap content in a folder named {owner}-{repo}-{sha}.
// Move its contents up so workdir contains package.json directly.
// Returns the SHA parsed from the wrapper name, if any.
async function flattenWrapper(extractRoot: string): Promise<string | undefined> {
  const entries = await readdir(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length !== 1) return undefined;

  const wrapperName = dirs[0].name;
  const wrapper = join(extractRoot, wrapperName);
  const inner = await readdir(wrapper);
  for (const name of inner) {
    await rename(join(wrapper, name), join(extractRoot, name));
  }
  await rm(wrapper, { recursive: true, force: true });
  return wrapperName.match(/-([0-9a-f]{7,40})$/i)?.[1];
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

