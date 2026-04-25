import type { ClaudeClient } from "../claude/client.js";
import type { ScrapedPage } from "./scrape.js";
import type { RepoMeta } from "./ingest.js";
import { REWRITER_SYSTEM } from "../prompts/rewriter.js";

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
 * Rebuild stage: brief + extracted page → a multi-file static site, ready
 * to drop into the repo under `seo/` (or wherever mountPath says).
 *
 * v0 emits a single index.html (with inline CSS) plus robots.txt and
 * sitemap.xml. Multi-page support comes later.
 */
export async function rebuild(
  claude: ClaudeClient,
  page: ScrapedPage,
  brief: string,
  opts: { repo?: RepoMeta; canonicalUrl?: string; mountPath?: string } = {},
): Promise<Site> {
  const sourceContext = opts.repo
    ? `# Repo stack: ${opts.repo.stack}\n# Entry files: ${opts.repo.entryFiles.join(", ") || "(none detected)"}`
    : "";

  const html = await claude.complete({
    system: REWRITER_SYSTEM,
    cachedContext: [
      sourceContext,
      `# Original rendered HTML\n\n${page.rawHtml}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    user: `# Rewrite brief\n\n${brief}\n\nNow output the new HTML document. Begin with <!doctype html>.`,
    maxTokens: 8000,
  });

  const cleanHtml = html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const canonicalUrl = opts.canonicalUrl ?? page.url;
  const files: Record<string, string> = {
    "index.html": cleanHtml,
    "robots.txt": buildRobotsTxt(canonicalUrl),
    "sitemap.xml": buildSitemapXml(canonicalUrl),
  };

  return {
    files,
    mountPath: opts.mountPath ?? DEFAULT_MOUNT,
  };
}
