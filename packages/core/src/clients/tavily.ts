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
  query?: string;
  chunks_per_source?: number;
  timeoutMs?: number;
}): Promise<TavilyExtractItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 120_000);
  try {
    const body: Record<string, unknown> = {
      urls: args.urls,
      format: args.format ?? "markdown",
    };
    if (args.query) body.query = args.query;
    if (args.chunks_per_source !== undefined) body.chunks_per_source = args.chunks_per_source;
    const r = await fetch(`${TAVILY_API}/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

export type TavilyResearchBody = {
  status: "pending" | "in_progress" | "completed" | "failed";
  request_id?: string;
  content?: string | Record<string, unknown>;
  sources?: Array<{ url?: string; title?: string }>;
  error?: string;
};

export async function tavilyResearch(args: {
  question: string;
  output_schema: Record<string, unknown>;
  model?: "auto" | "mini";
  pollIntervalMs?: number;
  deadlineMs?: number;
}): Promise<TavilyResearchBody> {
  const submit = await fetch(`${TAVILY_API}/research`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env().TAVILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: args.question,
      model: args.model ?? "auto",
      output_schema: args.output_schema,
    }),
  });
  if (!submit.ok) {
    const body = await submit.text().catch(() => "");
    throw new Error(`Tavily research submit ${submit.status}: ${body.slice(0, 200)}`);
  }
  const submitBody = (await submit.json()) as { request_id: string };
  const requestId = submitBody.request_id;

  const interval = args.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + (args.deadlineMs ?? 300_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const poll = await fetch(`${TAVILY_API}/research/${requestId}`, {
      headers: { Authorization: `Bearer ${env().TAVILY_API_KEY}` },
    });
    if (!poll.ok) {
      const body = await poll.text().catch(() => "");
      throw new Error(`Tavily research poll ${poll.status}: ${body.slice(0, 200)}`);
    }
    const body = (await poll.json()) as TavilyResearchBody;
    if (body.status === "completed" || body.status === "failed") return body;
  }
  throw new Error("Tavily /research polling exceeded 5 min");
}
