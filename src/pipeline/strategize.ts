import type { ClaudeClient } from "../claude/client.js";
import type { DiagnoseBundle } from "../peec/client.js";
import type { PrerenderedPage } from "./prerender.js";
import { STRATEGIST_SYSTEM } from "../prompts/strategist.js";

const PAGE_LIMIT = 6000;

function summarizePage(p: PrerenderedPage): string {
  const html = p.html.length > PAGE_LIMIT
    ? `${p.html.slice(0, PAGE_LIMIT)}\n…[truncated]`
    : p.html;
  return [
    `Sources rendered: ${p.sources.join(", ")}`,
    "",
    "Prerendered HTML:",
    html,
  ].join("\n");
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
  return out.join("\n");
}

/**
 * Strategist stage: reads the prerendered page + Peec bundle, returns a
 * markdown brief the enhancer will execute. Peec context is cached so
 * iterating against the same project is cheap.
 */
export async function strategize(
  claude: ClaudeClient,
  page: PrerenderedPage,
  bundle: DiagnoseBundle,
): Promise<string> {
  return claude.complete({
    system: STRATEGIST_SYSTEM,
    cachedContext: `# Peec signal\n\n${summarizeDiagnose(bundle)}`,
    user: `# Prerendered page\n\n${summarizePage(page)}\n\nWrite the rewrite brief now.`,
    maxTokens: 2000,
  });
}
