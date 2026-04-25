import type { ClaudeClient } from "../claude/client.js";
import type { PrerenderedPage } from "./prerender.js";
import type { RepoMeta } from "./ingest.js";
import { ENHANCER_SYSTEM } from "../prompts/enhancer.js";

export type Site = {
  /** Map of repo-relative path → file contents. */
  files: Record<string, string>;
  /** Where this site is intended to live in the host repo. */
  mountPath: string;
};

const DEFAULT_MOUNT = "seo";

function buildRobotsTxt(canonicalUrl: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${canonicalUrl.replace(/\/$/, "")}/sitemap.xml`,
    "",
  ].join("\n");
}

function buildSitemapXml(canonicalUrl: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${canonicalUrl.replace(/\/$/, "")}/</loc>`,
    `    <lastmod>${today}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * Enhance the prerendered page with Peec-driven SEO+GEO edits. Layered on
 * top of the static-HTML output from the prerender stage — we are NOT
 * redesigning the page, just injecting structure and copy that wins
 * citations.
 */
export async function enhance(
  claude: ClaudeClient,
  prerendered: PrerenderedPage,
  brief: string,
  opts: { repo?: RepoMeta; canonicalUrl: string; mountPath?: string },
): Promise<Site> {
  const html = await claude.complete({
    system: ENHANCER_SYSTEM,
    cachedContext: `# Prerendered HTML (input)\n\n${prerendered.html}`,
    user: `# Peec brief\n\n${brief}\n\nNow output the enhanced HTML. Begin with <!doctype html>.`,
    maxTokens: 8000,
  });

  const cleanHtml = html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return {
    files: {
      "index.html": cleanHtml,
      "robots.txt": buildRobotsTxt(opts.canonicalUrl),
      "sitemap.xml": buildSitemapXml(opts.canonicalUrl),
    },
    mountPath: opts.mountPath ?? DEFAULT_MOUNT,
  };
}
