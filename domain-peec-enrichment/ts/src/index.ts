import { v4 as uuid } from 'uuid';
import { resolve } from './resolver.js';
import { fetchAndExtract } from './fetcher.js';
import { detect } from './detector.js';
import type { ImportResult } from './types.js';

export type { ImportResult, ImportError } from './types.js';

export async function importFromUrl(
  url: string,
  opts: { fresh?: boolean } = {},
): Promise<ImportResult> {
  const jobId = uuid();
  const repo = await resolve(url);
  const fetched = await fetchAndExtract(repo.owner, repo.repo, jobId, opts.fresh ?? false);
  const detection = await detect(fetched.workdir);

  return {
    jobId,
    workdir: fetched.workdir,
    repoMeta: {
      owner: repo.owner,
      repo: repo.repo,
      sha: fetched.sha,
      sourceUrl: repo.sourceUrl,
    },
    isLovable: detection.isLovable,
    detectionReasons: detection.detectionReasons,
    cached: fetched.cached,
  };
}
