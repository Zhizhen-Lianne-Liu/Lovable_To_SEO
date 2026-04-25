import { contextError } from './types.js';

type TavilyExtractResp = {
  results: { url: string; raw_content?: string; content?: string; title?: string }[];
  failed_results?: { url: string; error: string }[];
};

export async function tavilyExtract(url: string): Promise<{ content: string; title?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw contextError('NO_API_KEY', 'TAVILY_API_KEY must be set in .env');

  let res: Response;
  try {
    res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url],
        extract_depth: 'basic',
      }),
    });
  } catch (e) {
    throw contextError('FETCH_FAILED', `Tavily fetch failed: ${(e as Error).message}`);
  }

  if (!res.ok) {
    throw contextError('FETCH_FAILED', `Tavily HTTP ${res.status}`);
  }

  const data = (await res.json()) as TavilyExtractResp;
  const item = data.results?.[0];
  if (!item || !(item.raw_content || item.content)) {
    const failed = data.failed_results?.[0];
    throw contextError(
      'EXTRACT_FAILED',
      failed ? `Tavily could not extract ${url}: ${failed.error}` : `Tavily returned no content for ${url}`,
    );
  }

  return {
    content: (item.raw_content || item.content || '').slice(0, 8000), // cap for LLM context
    title: item.title,
  };
}
