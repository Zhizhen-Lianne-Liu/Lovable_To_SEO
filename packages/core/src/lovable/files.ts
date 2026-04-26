// Generators for /public/robots.txt and /public/sitemap.xml.
//
// Both are idempotent (overwrite a previous lovabletoseo-managed file but
// leave bespoke ones alone — detected via a marker comment in the first line).

const ROBOTS_MARKER = "# lovabletoseo:managed";
const SITEMAP_MARKER = "<!-- lovabletoseo:managed -->";

export function shouldOverwriteRobots(existing: string | null): boolean {
  if (!existing) return true;
  return existing.startsWith(ROBOTS_MARKER) || existing.trim().length === 0;
}

export function shouldOverwriteSitemap(existing: string | null): boolean {
  if (!existing) return true;
  const head = existing.slice(0, 200);
  return head.includes(SITEMAP_MARKER) || existing.trim().length === 0;
}

export function buildRobotsTxt(args: {
  sitemapUrl: string;
  disallowPaths?: string[];
}): string {
  const lines = [ROBOTS_MARKER, "User-agent: *", "Allow: /"];
  for (const p of args.disallowPaths ?? []) {
    lines.push(`Disallow: ${p}`);
  }
  lines.push("");
  lines.push(`Sitemap: ${args.sitemapUrl}`);
  lines.push("");
  return lines.join("\n");
}

export function buildSitemapXml(args: {
  baseUrl: string;
  routes: Array<{ path: string; lastmod?: string; changefreq?: string; priority?: number }>;
}): string {
  const baseUrl = args.baseUrl.replace(/\/+$/, "");
  const today = new Date().toISOString().slice(0, 10);
  const urls = args.routes
    .map((r) => {
      const loc = `${baseUrl}${r.path.startsWith("/") ? r.path : `/${r.path}`}`;
      const parts = [`    <loc>${loc}</loc>`, `    <lastmod>${r.lastmod ?? today}</lastmod>`];
      if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
      if (r.priority !== undefined) parts.push(`    <priority>${r.priority}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
${SITEMAP_MARKER}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
