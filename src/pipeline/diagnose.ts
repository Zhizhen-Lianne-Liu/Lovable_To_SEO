import { PeecClient, type DiagnoseBundle } from "../peec/client.js";

/**
 * Pull what we need from the Peec REST API in one round-trip set.
 * 30-day default window — current enough, enough signal.
 */
export async function diagnose(
  peec: PeecClient,
  projectId: string,
): Promise<DiagnoseBundle> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const range = {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };

  const [brand_report, search_queries, url_report] = await Promise.all([
    peec.getBrandReport(projectId, range),
    peec.listSearchQueries(projectId, range),
    peec.getUrlReport(projectId, range),
  ]);

  return { brand_report, search_queries, url_report };
}
