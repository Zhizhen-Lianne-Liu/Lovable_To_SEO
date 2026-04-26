import { env } from "../config/env.js";
import { type Intent, type RankedKeyword } from "../types/index.js";

const BASE = "https://api.dataforseo.com/v3";

export type DataForSeoErrorCode =
  | "INVALID_INPUT"
  | "AUTH"
  | "NOT_VERIFIED"
  | "RATE_LIMITED"
  | "NO_RESULTS"
  | "NETWORK"
  | "NO_CREDITS"
  | "UNKNOWN";

export class DataForSeoError extends Error {
  constructor(
    public readonly code: DataForSeoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DataForSeoError";
  }
}

type DfsTask<T> = {
  id: string;
  status_code: number;
  status_message: string;
  cost: number;
  result: T[] | null;
};

type DfsResponse<T> = {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: DfsTask<T>[];
};

async function dfsPost<T>(path: string, body: unknown): Promise<DfsResponse<T>> {
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = env();
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new DataForSeoError("NETWORK", `DataForSEO fetch failed: ${(e as Error).message}`);
  }

  // DFS often returns HTTP 4xx with a JSON body carrying the real reason in
  // status_code (e.g. 40104 = unverified account). Always read the body
  // before deciding the error mapping.
  let json: DfsResponse<T> | null = null;
  try {
    json = (await res.json()) as DfsResponse<T>;
  } catch {
    /* body wasn't JSON */
  }

  const dfsCode = json?.status_code;
  if (dfsCode === 40104) {
    throw new DataForSeoError(
      "NOT_VERIFIED",
      "DataForSEO account is not verified. Log in to https://app.dataforseo.com/ and complete verification before using the API.",
    );
  }
  if (dfsCode === 40402 || dfsCode === 40403) {
    throw new DataForSeoError("NO_CREDITS", `DataForSEO: ${json?.status_message ?? "no credits"}`);
  }
  if (res.status === 401) throw new DataForSeoError("AUTH", "DataForSEO credentials rejected.");
  if (res.status === 429) throw new DataForSeoError("RATE_LIMITED", "DataForSEO rate-limited.");
  if (!res.ok || !json) {
    throw new DataForSeoError(
      "UNKNOWN",
      `DataForSEO HTTP ${res.status}${json ? ` (${dfsCode}: ${json.status_message})` : ""}.`,
    );
  }
  if (dfsCode !== 20000) {
    throw new DataForSeoError("UNKNOWN", `DataForSEO ${dfsCode}: ${json.status_message}`);
  }
  return json;
}

type RankedKeywordsItem = {
  keyword_data: {
    keyword: string;
    keyword_info?: { search_volume?: number; cpc?: number };
    keyword_properties?: { keyword_difficulty?: number };
    search_intent_info?: { main_intent?: string };
  };
  ranked_serp_element: {
    serp_item: { rank_absolute: number; url: string };
  };
};

function normalizeIntent(s: string | undefined): Intent {
  if (!s) return null;
  const v = s.toLowerCase();
  if (v === "informational" || v === "navigational" || v === "commercial" || v === "transactional") {
    return v;
  }
  return null;
}

export async function fetchRankedKeywords(args: {
  target: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  mustContainAny?: string[];
}): Promise<{ keywords: RankedKeyword[]; cost: number }> {
  // Filters tuned to surface keywords competitors actually compete on:
  //  - search_volume > 200: drop micro-volume noise
  //  - rank_absolute <= 30: drop accidental rankings (page 4+ doesn't compete)
  //  - keyword LIKE %term%: optional topic filter pushed to DFS so we never
  //    even pay for off-topic content-marketing accidents.
  const baseFilters: unknown[] = [
    ["keyword_data.keyword_info.search_volume", ">", 200],
    "and",
    ["ranked_serp_element.serp_item.rank_absolute", "<=", 30],
  ];

  // DFS doesn't reliably support nested OR groups in `filters`. Take the
  // first term as a single LIKE filter — works for the common case
  // (CRM software -> "crm"). For multi-term OR, the caller can do separate
  // fetches and merge.
  if (args.mustContainAny && args.mustContainAny.length > 0) {
    baseFilters.push("and", ["keyword_data.keyword", "like", `%${args.mustContainAny[0]}%`]);
  }

  const json = await dfsPost<{ items: RankedKeywordsItem[] }>(
    "dataforseo_labs/google/ranked_keywords/live",
    [
      {
        target: args.target,
        location_code: args.locationCode,
        language_code: args.languageCode,
        limit: args.limit,
        filters: baseFilters,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ],
  );

  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  const keywords: RankedKeyword[] = items.map((it) => ({
    keyword: it.keyword_data.keyword,
    search_volume: it.keyword_data.keyword_info?.search_volume ?? null,
    cpc: it.keyword_data.keyword_info?.cpc ?? null,
    keyword_difficulty: it.keyword_data.keyword_properties?.keyword_difficulty ?? null,
    intent: normalizeIntent(it.keyword_data.search_intent_info?.main_intent),
    serp_position: it.ranked_serp_element.serp_item.rank_absolute,
    serp_url: it.ranked_serp_element.serp_item.url,
  }));
  return { keywords, cost: json.cost };
}
