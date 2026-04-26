# lovabletoseo landing

The marketing landing page for **lovabletoseo** — vendored from
[elnumae/toseo](https://github.com/elnumae/toseo) at commit `9a2fc9a`.

## Stack

- TanStack Start + Vite 7 + React 19
- Cloudflare Workers (`wrangler.jsonc` + `@cloudflare/vite-plugin`)
- Tailwind v4 + bespoke components in `src/components/site/*`
- Bun (own lockfile + 50+ deps)

## Why this is OUTSIDE the npm workspace

Vendoring this here as-is keeps it self-contained: it has its own large
dep tree and uses Bun, while `packages/core` uses npm + a smaller dep
set. Mixing them via npm workspaces makes the root `npm install` slow
and risks dep-version conflicts. So `apps/landing` is intentionally
listed in `.gitignore` for `node_modules/` only — not in the root
`workspaces` array.

## Run locally

```bash
cd apps/landing
bun install         # first time only
bun dev             # → http://localhost:5173
```

The Hero form on `/` POSTs to `/api/scan`. In dev, that's proxied to
the Hono server at `http://localhost:3001` (see `vite.config.ts`).

Run the API alongside in a second terminal:

```bash
cd apps/api
npm run dev         # → http://localhost:3001
```

## What's wired

- `Hero.tsx` — paste a URL, submits to `/api/scan`
- `ScanFlow.tsx` — animated progress while we wait
- `Diagnosis.tsx` — renders the response from `/api/scan`
- `PrDiff.tsx` — renders the unified diff from the response
- `GithubModal.tsx` — placeholder; real OAuth flow is P4 SHIP territory

## Stale stuff that was refreshed on vendor

- `__root.tsx` previously read "SEO Genesis" / "Lovable App" — replaced.
- `Diagnosis.tsx` had hardcoded "QuickBooks 51% · Wave 28%" placeholder — now fed from API response.
- `Header.tsx` "Sign in" button has no behavior in v1; left as visual only.

## Re-vendor

```bash
gh repo clone elnumae/toseo /tmp/toseo
rsync -a --exclude='.git/' --exclude='node_modules/' --exclude='bun.lockb' --exclude='package-lock.json' /tmp/toseo/ apps/landing/
# then re-apply the lovabletoseo customizations to package.json + __root.tsx
```
