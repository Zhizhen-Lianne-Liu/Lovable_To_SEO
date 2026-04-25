# Lovable Import Module

First stage of a pipeline that takes a Lovable.dev project, rebuilds it for SEO/GEO, and redeploys it. This module accepts a Lovable project URL, GitHub repo URL, or `owner/repo` slug, fetches the source tarball, extracts it to a workdir, and detects whether the project is built with Lovable. Other modules (audit, rebuild, deploy, tracking) consume the resulting `ImportResult` over its TypeScript contract or via the HTTP API.

## Contract

```ts
export type ImportResult = {
  jobId: string;
  workdir: string;            // absolute path to extracted code
  repoMeta: {
    owner: string;
    repo: string;
    sha?: string;
    sourceUrl: string;        // what the user originally pasted
  };
  isLovable: boolean;
  detectionReasons: string[]; // e.g. ["package.json has vite", "src/components/ui/ exists"]
  cached: boolean;            // true if tarball came from local cache
};

export type ImportError = {
  error: string;              // human-readable
  code: 'INVALID_URL' | 'NOT_FOUND' | 'NOT_LOVABLE' | 'PRIVATE_REPO' | 'RATE_LIMITED' | 'NETWORK' | 'UNKNOWN';
};
```

On failure, `importFromUrl` throws an `Error` whose `.cause` is an `ImportError`-shaped object. `NOT_LOVABLE` is a soft signal — the function still resolves with `isLovable: false`, it never throws for it.

## Setup

```bash
npm install
cp .env.example .env
# Add a GitHub personal access token to .env. No scopes are required for
# public repos. It just bumps the rate limit from 60/hr to 5000/hr.
# Create one here: https://github.com/settings/tokens
```

## Use as HTTP

```bash
curl -X POST http://localhost:3000/api/import \
  -H 'content-type: application/json' \
  -d '{"url":"https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID","fresh":false}'
```

## Use as a function

```ts
import { importFromUrl } from './src/index.js';

const result = await importFromUrl('https://github.com/owner/repo');
console.log(result.workdir, result.isLovable);
```

## Test from the terminal

```bash
npm run import -- https://github.com/owner/repo
```

## Dev workflow

```
npm install
cp .env.example .env  # add your GITHUB_TOKEN
npm run dev
# open http://localhost:3000
```

## Known v0 limitations

- Public GitHub repos only. No private-repo or OAuth support yet.
- Single-page Lovable apps only (no monorepos / sub-paths).
- Resolver only follows the first `github.com/{owner}/{repo}` link in the Lovable HTML.
- Tarball cache never expires. Pass `fresh: true` (or check the UI box) to force re-fetch.
- `sha` is parsed from GitHub's tarball wrapper folder name; if GitHub changes that format, `sha` becomes `undefined`.
