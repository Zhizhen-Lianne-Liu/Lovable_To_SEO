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
