import { PeecClient, type DiagnoseBundle } from "../peec/client.js";

/**
 * Pulls everything we need from Peec in one go. We default to a 30-day window
 * so we get enough signal without ancient noise.
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

  // Parallelize the four reads — no dependencies between them.
  const [brand_report, search_queries, url_report, actions] = await Promise.all([
    peec.getBrandReport(projectId, range),
    peec.listSearchQueries(projectId, range),
    peec.getUrlReport(projectId, range),
    peec.getActions(projectId, range),
  ]);

  return { brand_report, search_queries, url_report, actions };
}
