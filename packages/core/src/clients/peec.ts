import { env } from "../config/env.js";

// =============================================================================
// Types
// =============================================================================

export type PeecBrand = {
  id: string;
  name: string;
  domains: string[];
  color: string;
  aliases?: string[];
  is_own?: boolean;
  created_at?: string;
};

export type PeecPrompt = {
  id: string;
  text: string;
  country_code: string;
  topic_id?: string | null;
  tag_ids?: string[];
  created_at?: string;
};

export type BrandCreate = {
  name: string;
  domains: string[];
  color?: string;
  aliases?: string[];
};

export type PromptCreate = {
  text: string;
  country_code?: string;
  topic_id?: string;
  tag_ids?: string[];
};

export class PeecError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "PeecError";
  }
}

// =============================================================================
// Low-level fetch
// =============================================================================

function projectId(override?: string): string {
  return override ?? env().PEEC_PROJECT_ID;
}

function headers(): HeadersInit {
  return {
    "x-api-key": env().PEEC_API_KEY,
    "content-type": "application/json",
  };
}

async function peecFetch(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  args: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<Response> {
  const base = env().PEEC_API_URL;
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(args.query ?? {})) {
    url.searchParams.set(k, String(v));
  }
  return fetch(url, {
    method,
    headers: headers(),
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
  });
}

async function readJsonOrThrow<T>(res: Response, opName: string): Promise<T> {
  if (res.status >= 400) {
    const body = await res.text().catch(() => "");
    throw new PeecError(res.status, `Peec ${opName} ${res.status}`, body.slice(0, 300));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// =============================================================================
// Brands
// =============================================================================

export async function listBrands(opts: { projectId?: string; limit?: number } = {}): Promise<PeecBrand[]> {
  const res = await peecFetch("GET", "/brands", {
    query: { project_id: projectId(opts.projectId), limit: opts.limit ?? 1000 },
  });
  const json = await readJsonOrThrow<{ data: PeecBrand[] }>(res, "listBrands");
  return json.data ?? [];
}

export async function createBrand(
  body: BrandCreate,
  opts: { projectId?: string } = {},
): Promise<PeecBrand> {
  const res = await peecFetch("POST", "/brands", {
    query: { project_id: projectId(opts.projectId) },
    body,
  });
  return readJsonOrThrow<PeecBrand>(res, "createBrand");
}

export async function updateBrand(
  id: string,
  body: Partial<BrandCreate>,
  opts: { projectId?: string } = {},
): Promise<PeecBrand> {
  const res = await peecFetch("PATCH", `/brands/${id}`, {
    query: { project_id: projectId(opts.projectId) },
    body,
  });
  return readJsonOrThrow<PeecBrand>(res, "updateBrand");
}

export async function deleteBrand(
  id: string,
  opts: { projectId?: string } = {},
): Promise<void> {
  const res = await peecFetch("DELETE", `/brands/${id}`, {
    query: { project_id: projectId(opts.projectId) },
  });
  if (res.status >= 400) {
    const body = await res.text().catch(() => "");
    throw new PeecError(res.status, `Peec deleteBrand ${res.status}`, body.slice(0, 300));
  }
}

// =============================================================================
// Prompts
// =============================================================================

export async function listPrompts(opts: { projectId?: string; limit?: number } = {}): Promise<PeecPrompt[]> {
  const res = await peecFetch("GET", "/prompts", {
    query: { project_id: projectId(opts.projectId), limit: opts.limit ?? 1000 },
  });
  const json = await readJsonOrThrow<{ data: PeecPrompt[] }>(res, "listPrompts");
  return json.data ?? [];
}

export async function createPrompt(
  body: PromptCreate,
  opts: { projectId?: string } = {},
): Promise<PeecPrompt> {
  const text = body.text.slice(0, 200);
  const res = await peecFetch("POST", "/prompts", {
    query: { project_id: projectId(opts.projectId) },
    body: { ...body, text, country_code: body.country_code ?? "US" },
  });
  return readJsonOrThrow<PeecPrompt>(res, "createPrompt");
}

export async function deletePrompt(
  id: string,
  opts: { projectId?: string } = {},
): Promise<void> {
  const res = await peecFetch("DELETE", `/prompts/${id}`, {
    query: { project_id: projectId(opts.projectId) },
  });
  if (res.status >= 400) {
    const body = await res.text().catch(() => "");
    throw new PeecError(res.status, `Peec deletePrompt ${res.status}`, body.slice(0, 300));
  }
}

// =============================================================================
// Models, chats, reports, queries (snapshot stage)
// =============================================================================

export type PeecModel = {
  id: string;
  name: string;
  is_active: boolean;
  provider?: string;
};

export async function listModels(opts: { projectId?: string } = {}): Promise<PeecModel[]> {
  const res = await peecFetch("GET", "/models", {
    query: { project_id: projectId(opts.projectId) },
  });
  const json = await readJsonOrThrow<{ data: PeecModel[] }>(res, "listModels");
  return json.data ?? [];
}

export async function listChats(args: {
  projectId?: string;
  start: string;
  end: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const res = await peecFetch("GET", "/chats", {
    query: {
      project_id: projectId(args.projectId),
      start_date: args.start,
      end_date: args.end,
      limit: args.limit ?? 10000,
    },
  });
  const json = await readJsonOrThrow<{ data: Array<Record<string, unknown>> }>(res, "listChats");
  return json.data ?? [];
}

export async function getChatContent(args: {
  projectId?: string;
  chatId: string;
}): Promise<Record<string, unknown>> {
  const res = await peecFetch("GET", `/chats/${args.chatId}/content`, {
    query: { project_id: projectId(args.projectId) },
  });
  return readJsonOrThrow<Record<string, unknown>>(res, "getChatContent");
}

export type ReportFilter = {
  field: string;
  operator: string;
  value: number | string | boolean;
};

export async function getBrandReport(args: {
  projectId?: string;
  start: string;
  end: string;
  dimensions?: string[];
  filters?: ReportFilter[];
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const body: Record<string, unknown> = {
    start_date: args.start,
    end_date: args.end,
    limit: args.limit ?? 10000,
  };
  if (args.dimensions) body.dimensions = args.dimensions;
  if (args.filters) body.filters = args.filters;
  const res = await peecFetch("POST", "/reports/brands", {
    query: { project_id: projectId(args.projectId) },
    body,
  });
  const json = await readJsonOrThrow<{ data: Array<Record<string, unknown>> }>(res, "getBrandReport");
  return json.data ?? [];
}

export async function getDomainReport(args: {
  projectId?: string;
  start: string;
  end: string;
  gapOnly?: boolean;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const body: Record<string, unknown> = {
    start_date: args.start,
    end_date: args.end,
    limit: args.limit ?? 200,
    order_by: [{ field: "citation_count", direction: "desc" }],
  };
  if (args.gapOnly) body.filters = [{ field: "gap", operator: "gte", value: 1 }];
  const res = await peecFetch("POST", "/reports/domains", {
    query: { project_id: projectId(args.projectId) },
    body,
  });
  const json = await readJsonOrThrow<{ data: Array<Record<string, unknown>> }>(res, "getDomainReport");
  return json.data ?? [];
}

export async function getUrlReport(args: {
  projectId?: string;
  start: string;
  end: string;
  gapOnly?: boolean;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const body: Record<string, unknown> = {
    start_date: args.start,
    end_date: args.end,
    limit: args.limit ?? 200,
    order_by: [{ field: "retrieval_count", direction: "desc" }],
  };
  if (args.gapOnly) body.filters = [{ field: "gap", operator: "gte", value: 1 }];
  const res = await peecFetch("POST", "/reports/urls", {
    query: { project_id: projectId(args.projectId) },
    body,
  });
  const json = await readJsonOrThrow<{ data: Array<Record<string, unknown>> }>(res, "getUrlReport");
  return json.data ?? [];
}

export async function getActions(args: {
  projectId?: string;
  scope: string;
  url_classification?: string;
  domain?: string;
}): Promise<Array<Record<string, unknown>>> {
  const body: Record<string, unknown> = { scope: args.scope };
  if (args.url_classification) body.url_classification = args.url_classification;
  if (args.domain) body.domain = args.domain;
  const res = await peecFetch("POST", "/actions", {
    query: { project_id: projectId(args.projectId) },
    body,
  });
  // Public REST endpoint returns 404 unless MCP-elevated auth — degrade gracefully.
  if (res.status === 404) return [];
  const json = await readJsonOrThrow<{ data?: Array<Record<string, unknown>> }>(res, "getActions");
  return json.data ?? [];
}

export async function getUrlContent(args: {
  projectId?: string;
  url: string;
}): Promise<Record<string, unknown>> {
  const res = await peecFetch("POST", "/sources/urls/content", {
    query: { project_id: projectId(args.projectId) },
    body: { url: args.url },
  });
  return readJsonOrThrow<Record<string, unknown>>(res, "getUrlContent");
}

export async function getSearchQueries(args: {
  projectId?: string;
  start: string;
  end: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const res = await peecFetch("POST", "/queries/search", {
    query: { project_id: projectId(args.projectId) },
    body: { start_date: args.start, end_date: args.end, limit: args.limit ?? 500 },
  });
  const json = await readJsonOrThrow<{ data?: Array<Record<string, unknown>> }>(res, "getSearchQueries");
  return json.data ?? [];
}

export async function getShoppingQueries(args: {
  projectId?: string;
  start: string;
  end: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const res = await peecFetch("POST", "/queries/shopping", {
    query: { project_id: projectId(args.projectId) },
    body: { start_date: args.start, end_date: args.end, limit: args.limit ?? 500 },
  });
  const json = await readJsonOrThrow<{ data?: Array<Record<string, unknown>> }>(res, "getShoppingQueries");
  return json.data ?? [];
}

// =============================================================================
// Constants used by the push stage
// =============================================================================

export const COMPETITOR_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export const OWN_BRAND_COLOR = "#000000";
