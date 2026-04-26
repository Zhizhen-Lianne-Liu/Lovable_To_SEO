import { env } from "../config/env.js";

const TAVILY_API = "https://api.tavily.com";

export type TavilyExtractItem = {
  url: string;
  raw_content: string;
  title?: string;
};

export type TavilySearchResult = {
  url: string;
  title: string;
  content: string;
  score?: number;
};

export type TavilySearchResponse = {
  answer: string;
  results: TavilySearchResult[];
};

export async function tavilyExtract(args: {
  urls: string[];
  format?: "markdown" | "text";
  timeoutMs?: number;
}): Promise<TavilyExtractItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 120_000);
  try {
    const r = await fetch(`${TAVILY_API}/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: args.urls, format: args.format ?? "markdown" }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Tavily extract ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = (await r.json()) as { results?: Array<{ url: string; raw_content?: string; content?: string; title?: string }> };
    return (data.results ?? [])
      .map((it) => ({
        url: it.url,
        raw_content: (it.raw_content ?? it.content ?? "").trim(),
        title: it.title,
      }))
      .filter((it) => it.raw_content.length >= 100);
  } finally {
    clearTimeout(timer);
  }
}

export async function tavilySearch(args: {
  query: string;
  include_domains?: string[];
  exclude_domains?: string[];
  include_answer?: "basic" | "advanced" | false;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  timeoutMs?: number;
}): Promise<TavilySearchResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 60_000);
  try {
    const r = await fetch(`${TAVILY_API}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: args.query,
        include_domains: args.include_domains,
        exclude_domains: args.exclude_domains,
        include_answer: args.include_answer ?? "basic",
        max_results: args.max_results ?? 5,
        search_depth: args.search_depth ?? "basic",
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Tavily search ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = (await r.json()) as {
      answer?: string;
      results?: Array<{ url: string; title?: string; content?: string; score?: number }>;
    };
    return {
      answer: data.answer ?? "",
      results: (data.results ?? []).map((it) => ({
        url: it.url,
        title: it.title ?? "",
        content: it.content ?? "",
        score: it.score,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type TavilyResearchSubmit = { request_id: string };
export type TavilyResearchPoll =
  | { status: "pending" | "in_progress" }
  | { status: "completed"; result: unknown }
  | { status: "failed"; error?: string };

export async function tavilyResearchSubmit(args: {
  query: string;
  output_schema?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<TavilyResearchSubmit> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 60_000);
  try {
    const r = await fetch(`${TAVILY_API}/research`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: args.query, output_schema: args.output_schema }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Tavily research submit ${r.status}: ${body.slice(0, 200)}`);
    }
    return (await r.json()) as TavilyResearchSubmit;
  } finally {
    clearTimeout(timer);
  }
}

export async function tavilyResearchPoll(requestId: string): Promise<TavilyResearchPoll> {
  const r = await fetch(`${TAVILY_API}/research/${requestId}`, {
    headers: { Authorization: `Bearer ${env().TAVILY_API_KEY}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Tavily research poll ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as TavilyResearchPoll;
}
