import { contextError } from './types.js';

type TavilyExtractResp = {
  results: { url: string; raw_content?: string; content?: string; title?: string }[];
  failed_results?: { url: string; error: string }[];
};

type TavilySearchResp = {
  answer?: string;
  results?: { url: string; title: string; content: string }[];
};

export async function tavilyExtract(url: string): Promise<{ content: string; title?: string; source: 'extract' | 'search-fallback' }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw contextError('NO_API_KEY', 'TAVILY_API_KEY must be set in .env');

  // First try direct extract
  const direct = await tryExtract(url, apiKey);
  if (direct) return { ...direct, source: 'extract' };

  // Fallback: search-based context. Tavily often can't extract sites that
  // block bots, use heavy JS, or geo-restrict. The /search endpoint with
  // include_answer="advanced" gives us a summary + top-3 result snippets,
  // which is enough context to build a DomainContext.
  const search = await trySearch(url, apiKey);
  if (search) return { ...search, source: 'search-fallback' };

  throw contextError('EXTRACT_FAILED', `Tavily could not extract OR search ${url}`);
}

async function tryExtract(url: string, apiKey: string): Promise<{ content: string; title?: string } | null> {
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, urls: [url], extract_depth: 'basic' }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TavilyExtractResp;
    const item = data.results?.[0];
    if (!item) return null;
    const content = (item.raw_content || item.content || '').trim();
    if (content.length < 100) return null;
    return { content: content.slice(0, 8000), title: item.title };
  } catch {
    return null;
  }
}

async function trySearch(url: string, apiKey: string): Promise<{ content: string; title?: string } | null> {
  // Build a concrete query from the domain.
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${domain} product overview what does it do`,
        max_results: 5,
        include_answer: 'advanced',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TavilySearchResp;
    const parts: string[] = [];
    if (data.answer) parts.push(`SUMMARY: ${data.answer}`);
    for (const r of data.results ?? []) {
      parts.push(`---\nSOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`);
    }
    const content = parts.join('\n\n').slice(0, 8000);
    if (content.length < 100) return null;
    return { content, title: `${domain} (search-fallback)` };
  } catch {
    return null;
  }
}
