import type { ClaudeClient } from "../claude/client.js";
import type { RepoMeta } from "./ingest.js";
import { readSourceFiles } from "./ingest.js";
import { PRERENDERER_SYSTEM } from "../prompts/prerenderer.js";

export type PrerenderedPage = {
  /** The static HTML for the page. */
  html: string;
  /** Repo-relative paths of source files we read. */
  sources: string[];
};

function packSources(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `\n=== ${path} ===\n${content}`)
    .join("\n");
}

/**
 * Stage 1 of the value prop: convert the React SPA into deployable static HTML.
 * No Peec involvement here — this step alone already fixes the "my Lovable
 * app isn't crawlable" problem. The output is shippable as-is.
 */
export async function prerender(
  claude: ClaudeClient,
  repo: RepoMeta,
): Promise<PrerenderedPage> {
  const sources = await readSourceFiles(repo);
  const packed = packSources(sources);

  const html = await claude.complete({
    system: PRERENDERER_SYSTEM,
    cachedContext: `# Repo stack: ${repo.stack}\n# Source files\n${packed}`,
    user: `Render this Lovable app as a single static HTML document. Begin with <!doctype html>.`,
    maxTokens: 8000,
  });

  const cleanHtml = html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return {
    html: cleanHtml,
    sources: Object.keys(sources),
  };
}
