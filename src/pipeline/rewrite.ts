import type { ClaudeClient } from "../claude/client.js";
import type { ScrapedPage } from "./scrape.js";
import { REWRITER_SYSTEM } from "../prompts/rewriter.js";

/**
 * Rewriter stage: brief + original HTML → fully-optimized HTML document.
 * Returns raw HTML; we strip any accidental code-fence wrapping defensively.
 */
export async function rewrite(
  claude: ClaudeClient,
  page: ScrapedPage,
  brief: string,
): Promise<string> {
  const out = await claude.complete({
    system: REWRITER_SYSTEM,
    cachedContext: `# Original page HTML\n\n${page.rawHtml}`,
    user: `# Rewrite brief\n\n${brief}\n\nNow output the new HTML document. Begin with <!doctype html>.`,
    maxTokens: 8000,
  });

  // Defensive: model sometimes wraps despite instructions.
  return out
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
