import { importError } from './types.js';

export type ResolvedRepo = {
  owner: string;
  repo: string;
  sourceUrl: string;
};

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i;
const LOVABLE_RE = /^https?:\/\/lovable\.dev\/projects\/([^/\s?#]+)/i;
const BARE_SLUG_RE = /^([a-z0-9][a-z0-9-_.]*)\/([a-z0-9][a-z0-9-_.]*)$/i;
const GH_LINK_IN_HTML_RE = /https?:\/\/github\.com\/([a-z0-9][a-z0-9-_.]*)\/([a-z0-9][a-z0-9-_.]*)/i;

export async function resolve(url: string): Promise<ResolvedRepo> {
  const trimmed = url.trim();
  if (!trimmed) throw importError('INVALID_URL', 'URL is empty.');

  const gh = trimmed.match(GITHUB_REPO_RE);
  if (gh) return { owner: gh[1], repo: stripGit(gh[2]), sourceUrl: trimmed };

  const slug = trimmed.match(BARE_SLUG_RE);
  if (slug) return { owner: slug[1], repo: stripGit(slug[2]), sourceUrl: trimmed };

  const lov = trimmed.match(LOVABLE_RE);
  if (lov) return resolveFromLovable(trimmed);

  throw importError(
    'INVALID_URL',
    'URL must be a GitHub repo URL, a Lovable project URL, or an "owner/repo" slug.',
  );
}

async function resolveFromLovable(url: string): Promise<ResolvedRepo> {
  let html: string;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'lovable-import-module' } });
    if (!res.ok) {
      throw importError('NOT_FOUND', `Lovable returned HTTP ${res.status} for ${url}.`);
    }
    html = await res.text();
  } catch (e) {
    if (e instanceof Error && (e as Error & { cause?: unknown }).cause) throw e;
    throw importError('NETWORK', `Could not reach Lovable: ${(e as Error).message}`);
  }

  const m = html.match(GH_LINK_IN_HTML_RE);
  if (!m) {
    throw importError(
      'NOT_FOUND',
      'No GitHub link found on the Lovable project page. Is the project published with GitHub sync?',
    );
  }
  return { owner: m[1], repo: stripGit(m[2]), sourceUrl: url };
}

function stripGit(s: string): string {
  return s.replace(/\.git$/i, '');
}
