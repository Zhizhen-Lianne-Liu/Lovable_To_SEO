import { competitorError } from './types.js';

const BASE = 'https://api.dataforseo.com/v3';

export type DfsTask<T> = {
  id: string;
  status_code: number;
  status_message: string;
  cost: number;
  result: T[] | null;
};

export type DfsResponse<T> = {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: DfsTask<T>[];
};

export async function dfsPost<T>(path: string, body: unknown): Promise<DfsResponse<T>> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw competitorError('AUTH', 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set in .env');
  }

  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw competitorError('NETWORK', `DataForSEO fetch failed: ${(e as Error).message}`);
  }

  // DFS often returns HTTP 4xx with a JSON body carrying the real reason
  // in `status_code` (e.g. 40104 = unverified account). Always read the
  // body before deciding the error mapping.
  let json: DfsResponse<T> | null = null;
  try {
    json = (await res.json()) as DfsResponse<T>;
  } catch {
    // body wasn't JSON
  }

  const dfsCode = json?.status_code;
  if (dfsCode === 40104) {
    throw competitorError(
      'NOT_VERIFIED',
      'DataForSEO account is not verified. Log in to https://app.dataforseo.com/ and complete verification before using the API.',
    );
  }
  if (dfsCode === 40402 || dfsCode === 40403) {
    throw competitorError('NO_CREDITS', `DataForSEO: ${json?.status_message ?? 'no credits'}`);
  }
  if (res.status === 401) throw competitorError('AUTH', 'DataForSEO credentials rejected.');
  if (res.status === 429) throw competitorError('RATE_LIMITED', 'DataForSEO rate-limited.');
  if (!res.ok || !json) {
    throw competitorError(
      'UNKNOWN',
      `DataForSEO HTTP ${res.status}${json ? ` (${dfsCode}: ${json.status_message})` : ''}.`,
    );
  }
  if (dfsCode !== 20000) {
    throw competitorError('UNKNOWN', `DataForSEO ${dfsCode}: ${json.status_message}`);
  }
  return json;
}
