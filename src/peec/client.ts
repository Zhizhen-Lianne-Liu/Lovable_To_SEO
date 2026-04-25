import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type PeecConfig = {
  mcpUrl: string;
  oauthToken?: string;
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

export type Action = {
  text?: string;
  group_type: string;
  url_classification?: string;
  domain?: string;
  opportunity_score: number;
  relative_opportunity_score: number;
};

export type DiagnoseBundle = {
  brand_report: BrandReportRow[];
  search_queries: SearchQuery[];
  url_report: UrlReportRow[];
  actions: Action[];
};

/**
 * Wraps the Peec MCP. In fixture mode (PEEC_FIXTURE set) we skip the network
 * entirely so the demo runs offline — useful for hackathon judging.
 */
export class PeecClient {
  private client?: Client;
  private fixture?: DiagnoseBundle;

  constructor(private cfg: PeecConfig) {}

  async connect(): Promise<void> {
    if (this.cfg.fixturePath) {
      const raw = await readFile(this.cfg.fixturePath, "utf8");
      this.fixture = JSON.parse(raw) as DiagnoseBundle;
      return;
    }
    if (!this.cfg.oauthToken) {
      throw new Error(
        "Peec MCP needs PEEC_OAUTH_TOKEN (or run with PEEC_FIXTURE=...)",
      );
    }
    const transport = new StreamableHTTPClientTransport(
      new URL(this.cfg.mcpUrl),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${this.cfg.oauthToken}` },
        },
      },
    );
    this.client = new Client(
      { name: "lovabletoseo", version: "0.1.0" },
      { capabilities: {} },
    );
    await this.client.connect(transport);
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.client) throw new Error("PeecClient not connected");
    const res = await this.client.callTool({ name, arguments: args });
    // Peec returns JSON in the first content block (text type).
    const block = (res.content as Array<{ type: string; text?: string }>)[0];
    if (!block?.text) throw new Error(`Peec ${name} returned no content`);
    return JSON.parse(block.text) as T;
  }

  async getBrandReport(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<BrandReportRow[]> {
    if (this.fixture) return this.fixture.brand_report;
    return this.call("get_brand_report", {
      project_id: projectId,
      start_date: range.start,
      end_date: range.end,
      limit: 50,
    });
  }

  async listSearchQueries(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<SearchQuery[]> {
    if (this.fixture) return this.fixture.search_queries;
    return this.call("list_search_queries", {
      project_id: projectId,
      start_date: range.start,
      end_date: range.end,
      limit: 200,
    });
  }

  async getUrlReport(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<UrlReportRow[]> {
    if (this.fixture) return this.fixture.url_report;
    return this.call("get_url_report", {
      project_id: projectId,
      start_date: range.start,
      end_date: range.end,
      limit: 50,
    });
  }

  async getActions(
    projectId: string,
    range: { start: string; end: string },
  ): Promise<Action[]> {
    if (this.fixture) return this.fixture.actions;
    return this.call("get_actions", {
      project_id: projectId,
      start_date: range.start,
      end_date: range.end,
      scope: "overview",
    });
  }

  async close(): Promise<void> {
    await this.client?.close();
  }
}
