import { readFile } from "node:fs/promises";

export type PeecConfig = {
  apiUrl: string;
  apiKey?: string;
  fixturePath?: string;
};

export type BrandReportRow = {
  brand_id: string;
  brand_name: string;
  visibility: number;
  mention_count: number;
  share_of_voice: number;
  sentiment: number;
  position: number;
};

export type SearchQuery = {
  prompt_id: string;
  chat_id: string;
  model_id: string;
  date: string;
  query_text: string;
};

export type UrlReportRow = {
  url: string;
  classification: string;
  title: string;
  citation_count: number;
  retrievals: number;
  citation_rate: number;
  mentioned_brand_ids: string[];
};

export type DiagnoseBundle = {
  brand_report: BrandReportRow[];
  search_queries: SearchQuery[];
  url_report: UrlReportRow[];
};

const DEFAULT_API_URL = "https://api.peec.ai/customer/v1";

/**
 * Direct Peec REST client. Auth is `X-API-Key` per docs.peec.ai.
 *
 * Fixture mode (PEEC_FIXTURE) loads a JSON file with the same shape so the
 * demo runs offline — useful for hackathon judging without provisioning an
 * Enterprise API key.
 */
export class PeecClient {
  private fixture?: DiagnoseBundle;

  constructor(private cfg: PeecConfig) {}

  async connect(): Promise<void> {
    if (this.cfg.fixturePath) {
      const raw = await readFile(this.cfg.fixturePath, "utf8");
      this.fixture = JSON.parse(raw) as DiagnoseBundle;
      return;
    }
    if (!this.cfg.apiKey) {
      throw new Error(
        "Peec needs PEEC_API_KEY (or run with PEEC_FIXTURE=path/to/fixture.json)",
      );
    }
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.cfg.apiUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.cfg.apiKey ?? "",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Peec ${path} failed: ${res.status} ${res.statusText} ${text}`);
    }
    return (await res.json()) as T;
  }

  async getBrandReport(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<BrandReportRow[]> {
    if (this.fixture) return this.fixture.brand_report;
    const data = await this.post<{ data: BrandReportRow[] } | BrandReportRow[]>(
      "/reports/brands",
      {
        project_id: projectId,
        start_date: range.start,
        end_date: range.end,
        limit: 50,
      },
    );
    return Array.isArray(data) ? data : data.data;
  }

  async listSearchQueries(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<SearchQuery[]> {
    if (this.fixture) return this.fixture.search_queries;
    const data = await this.post<{ data: SearchQuery[] } | SearchQuery[]>(
      "/queries/search",
      {
        project_id: projectId,
        start_date: range.start,
        end_date: range.end,
        limit: 200,
      },
    );
    return Array.isArray(data) ? data : data.data;
  }

  async getUrlReport(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<UrlReportRow[]> {
    if (this.fixture) return this.fixture.url_report;
    const data = await this.post<{ data: UrlReportRow[] } | UrlReportRow[]>(
      "/reports/urls",
      {
        project_id: projectId,
        start_date: range.start,
        end_date: range.end,
        limit: 50,
      },
    );
    return Array.isArray(data) ? data : data.data;
  }
}

export function defaultPeecApiUrl(): string {
  return process.env.PEEC_API_URL || DEFAULT_API_URL;
}
