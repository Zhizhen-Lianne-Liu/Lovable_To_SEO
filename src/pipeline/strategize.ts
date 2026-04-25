import type { ClaudeClient } from "../claude/client.js";
import type { DiagnoseBundle } from "../peec/client.js";
import type { ScrapedPage } from "./scrape.js";
import { STRATEGIST_SYSTEM } from "../prompts/strategist.js";

const PAGE_SUMMARY_LIMIT = 4000;

function summarizePage(page: ScrapedPage): string {
  const lines: string[] = [];
  lines.push(`URL: ${page.url}`);
  lines.push(`<title>: ${page.title}`);
  lines.push(`<meta description>: ${page.metaDescription}`);
  lines.push(`H1: ${page.h1.join(" | ")}`);
  lines.push(`H2: ${page.h2.slice(0, 12).join(" | ")}`);
  lines.push(`H3: ${page.h3.slice(0, 12).join(" | ")}`);
  lines.push(`Word count: ${page.wordCount}`);
  lines.push("");
  lines.push("First paragraphs:");
  let used = 0;
  for (const p of page.paragraphs) {
    if (used + p.length > PAGE_SUMMARY_LIMIT) break;
    lines.push(`- ${p}`);
    used += p.length;
  }
  return lines.join("\n");
}

function summarizeDiagnose(d: DiagnoseBundle): string {
  const out: string[] = [];
  out.push("## Brand report (visibility, share-of-voice, sentiment, position)");
  for (const b of d.brand_report.slice(0, 8)) {
    out.push(
      `- ${b.brand_name}: vis=${b.visibility} sov=${b.share_of_voice} sent=${b.sentiment} pos=${b.position}`,
    );
  }
  out.push("");
  out.push("## Top buyer queries on LLMs");
  const seen = new Set<string>();
  for (const q of d.search_queries) {
    if (seen.has(q.query_text)) continue;
    seen.add(q.query_text);
    out.push(`- "${q.query_text}"`);
    if (seen.size >= 25) break;
  }
  out.push("");
  out.push("## URLs LLMs cite (top by citation_rate)");
  for (const u of d.url_report.slice(0, 15)) {
    out.push(
      `- ${u.url} — ${u.title} (cites=${u.citation_count}, rate=${u.citation_rate}, class=${u.classification})`,
    );
  }
  out.push("");
  out.push("## Peec opportunity actions");
  for (const a of d.actions.slice(0, 12)) {
    out.push(
      `- [${a.opportunity_score.toFixed(2)}] ${a.group_type}${a.url_classification ? ` / ${a.url_classification}` : ""}${a.domain ? ` (${a.domain})` : ""}${a.text ? `: ${a.text}` : ""}`,
    );
  }
  return out.join("\n");
}

/**
 * Strategist stage: reads the page + Peec bundle, returns a markdown brief
 * the rewriter will execute. The Peec bundle goes in the cached context block
 * so subsequent runs against the same project hit the prompt cache.
 */
export async function strategize(
  claude: ClaudeClient,
  page: ScrapedPage,
  diagnose: DiagnoseBundle,
): Promise<string> {
  return claude.complete({
    system: STRATEGIST_SYSTEM,
    cachedContext: `# Peec signal\n\n${summarizeDiagnose(diagnose)}`,
    user: `# Current page\n\n${summarizePage(page)}\n\nWrite the rewrite brief now.`,
    maxTokens: 2000,
  });
}
