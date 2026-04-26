import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type AuditFinding,
  type AuditReport,
  type Inventory,
  type RunContext,
} from "../types/index.js";
import { readSourceFiles } from "./01-ingest.js";

// Heuristic technical-SEO audit. Source-only — runs BEFORE prerender so
// findings drive both prerender (CSR routes need rendering) and APPLY
// (Helmet/JSON-LD/robots/sitemap injection). Not a Lighthouse replacement;
// flags the gaps a Lovable SPA almost always has.
//
// Categories: title, description, og, twitter, canonical, robots, sitemap,
// schema, headings, alt-text, semantic-html, csr-rendering.

const ROUTE_HOME = "/";

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(p: string): Promise<string | null> {
  return (await fileExists(p)) ? readFile(p, "utf8") : null;
}

function find(
  acc: AuditFinding[],
  finding: AuditFinding,
): void {
  acc.push(finding);
}

function auditIndexHtml(html: string, findings: AuditFinding[]): void {
  const lower = html.toLowerCase();

  // <title>
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || !title[1]?.trim()) {
    find(findings, {
      route: ROUTE_HOME,
      category: "title",
      severity: "error",
      message: "Missing <title> tag in index.html shell.",
      recommended: "Inject a unique, keyword-rich title via Helmet or native <head>.",
    });
  } else {
    const t = title[1].trim();
    if (t.length < 15 || t.length > 70) {
      find(findings, {
        route: ROUTE_HOME,
        category: "title",
        severity: "warning",
        message: `Title length ${t.length} outside 15-70 char sweet spot.`,
        current: t,
        recommended: "Aim for 50-60 chars; lead with the primary keyword.",
      });
    }
  }

  // meta description
  const desc = html.match(/<meta\s+(?:[^>]*\s+)?name=["']description["'][^>]*>/i);
  if (!desc) {
    find(findings, {
      route: ROUTE_HOME,
      category: "description",
      severity: "error",
      message: "Missing meta description.",
      recommended: "Inject 140-160 char description framing the value prop.",
    });
  } else {
    const c = desc[0].match(/content=["']([^"']*)["']/i)?.[1] ?? "";
    if (c.length < 50 || c.length > 160) {
      find(findings, {
        route: ROUTE_HOME,
        category: "description",
        severity: "warning",
        message: `Description length ${c.length} outside 50-160 char sweet spot.`,
        current: c.slice(0, 200),
      });
    }
  }

  // OG tags
  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogDesc = /property=["']og:description["']/i.test(html);
  const ogImage = /property=["']og:image["']/i.test(html);
  const ogUrl = /property=["']og:url["']/i.test(html);
  if (!ogTitle || !ogDesc || !ogImage || !ogUrl) {
    const missing = [
      !ogTitle && "og:title",
      !ogDesc && "og:description",
      !ogImage && "og:image",
      !ogUrl && "og:url",
    ].filter(Boolean);
    find(findings, {
      route: ROUTE_HOME,
      category: "og",
      severity: "warning",
      message: `Missing Open Graph tags: ${missing.join(", ")}.`,
      recommended: "Add full og:* set so links unfurl properly on Slack/Twitter/LinkedIn.",
    });
  }

  // Twitter card
  if (!/name=["']twitter:card["']/i.test(html)) {
    find(findings, {
      route: ROUTE_HOME,
      category: "twitter",
      severity: "info",
      message: "Missing twitter:card meta.",
      recommended: 'Add <meta name="twitter:card" content="summary_large_image">.',
    });
  }

  // Canonical
  if (!/<link\s+(?:[^>]*\s+)?rel=["']canonical["'][^>]*>/i.test(html)) {
    find(findings, {
      route: ROUTE_HOME,
      category: "canonical",
      severity: "warning",
      message: "Missing canonical <link>.",
      recommended: 'Add <link rel="canonical" href="<full-url>"> to prevent dup-content issues.',
    });
  }

  // JSON-LD schema
  const ldCount = (html.match(/type=["']application\/ld\+json["']/gi) ?? []).length;
  if (ldCount === 0) {
    find(findings, {
      route: ROUTE_HOME,
      category: "schema",
      severity: "error",
      message: "No JSON-LD structured data in index.html.",
      recommended:
        "Add Organization + WebSite + (Product|Article|FAQ) JSON-LD blocks for AI engines and rich results.",
    });
  }

  // h1 count
  const h1s = (html.match(/<h1[^>]*>/gi) ?? []).length;
  if (h1s === 0) {
    find(findings, {
      route: ROUTE_HOME,
      category: "headings",
      severity: "info",
      message: "No <h1> in index.html shell (likely fine — rendered by React).",
    });
  } else if (h1s > 1) {
    find(findings, {
      route: ROUTE_HOME,
      category: "headings",
      severity: "warning",
      message: `Multiple <h1> tags (${h1s}) in index.html — pick one canonical h1.`,
    });
  }

  // Skip semantic-html / alt-text on shell — those are React-rendered. We
  // sample src/components for those below.
  void lower;
}

function auditSourceFiles(files: Record<string, string>, findings: AuditFinding[]): void {
  let imgTotal = 0;
  let imgMissingAlt = 0;
  let semanticUsage = 0;
  let jsonLdInJsx = 0;
  for (const [path, src] of Object.entries(files)) {
    if (!path.endsWith(".tsx") && !path.endsWith(".jsx") && !path.endsWith(".ts") && !path.endsWith(".js")) continue;
    const imgs = src.match(/<img\s[^>]*>/gi) ?? [];
    for (const tag of imgs) {
      imgTotal++;
      if (!/\salt=/i.test(tag)) imgMissingAlt++;
    }
    if (/<main[\s>]|<nav[\s>]|<header[\s>]|<footer[\s>]|<article[\s>]|<section[\s>]/i.test(src)) {
      semanticUsage++;
    }
    if (/application\/ld\+json/i.test(src) || /JsonLd[\s({]/i.test(src)) {
      jsonLdInJsx++;
    }
  }
  if (imgMissingAlt > 0) {
    find(findings, {
      route: "*",
      category: "alt-text",
      severity: "warning",
      message: `${imgMissingAlt}/${imgTotal} <img> tags missing alt= across components.`,
      recommended: "Every <img> should have descriptive alt text (or alt=\"\" if decorative).",
    });
  }
  if (semanticUsage === 0) {
    find(findings, {
      route: "*",
      category: "semantic-html",
      severity: "info",
      message: "No semantic HTML5 elements (<main>, <nav>, <header>, <footer>, <article>, <section>) detected in components.",
      recommended: "Wrap layout in <main>, <header>, etc. for accessibility + crawler signal.",
    });
  }
  void jsonLdInJsx;
}

export async function audit(args: {
  ctx: RunContext;
  inventory: Inventory;
}): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  const { cloneDir, framework, isLovable } = args.inventory;

  // 1. CSR rendering — Vite+React without SSG = invisible to crawlers.
  if (framework === "vite-react" && isLovable) {
    const hasSsgConfig = await fileExists(join(cloneDir, "vite-ssg.config.ts"));
    const pkgJson = (args.inventory.packageJson as Record<string, unknown>) ?? {};
    const deps = {
      ...(pkgJson.dependencies as Record<string, unknown> | undefined),
      ...(pkgJson.devDependencies as Record<string, unknown> | undefined),
    };
    const hasSsgPlugin = Boolean(deps?.["vite-ssg"] || deps?.["vite-plugin-ssr"]);
    if (!hasSsgConfig && !hasSsgPlugin) {
      find(findings, {
        route: ROUTE_HOME,
        category: "csr-rendering",
        severity: "error",
        message: "Vite + React SPA without SSG plugin — crawlers see an empty <div id=\"root\">.",
        recommended: "Either add vite-ssg, or run our prerender stage to ship static HTML.",
      });
    }
  }

  // 2. index.html shell
  const indexHtml = await readIfExists(join(cloneDir, "index.html"));
  if (indexHtml) {
    auditIndexHtml(indexHtml, findings);
  } else {
    find(findings, {
      route: ROUTE_HOME,
      category: "title",
      severity: "info",
      message: "No top-level index.html (Next-style framework).",
    });
  }

  // 3. robots.txt + sitemap.xml in /public
  const robotsExists = await fileExists(join(cloneDir, "public", "robots.txt"));
  if (!robotsExists) {
    find(findings, {
      route: ROUTE_HOME,
      category: "robots",
      severity: "warning",
      message: "Missing public/robots.txt.",
      recommended: "Generate User-agent: * + Allow: / + Sitemap: <url> for crawler signaling.",
    });
  }
  const sitemapExists = await fileExists(join(cloneDir, "public", "sitemap.xml"));
  if (!sitemapExists) {
    find(findings, {
      route: ROUTE_HOME,
      category: "sitemap",
      severity: "warning",
      message: "Missing public/sitemap.xml.",
      recommended: "Generate sitemap.xml listing every public route with lastmod dates.",
    });
  }

  // 4. Sample src/ for alt-text + semantic-html signals
  const sampled = await readSourceFiles(args.inventory, 4000, 40000);
  auditSourceFiles(sampled, findings);

  const totalRoutes = Math.max(1, args.inventory.routes.length);
  const csrRoutes = findings.some((f) => f.category === "csr-rendering") ? totalRoutes : 0;
  const ldFindings = findings.filter((f) => f.category === "schema" && f.severity === "error");
  const schemaCoverage = ldFindings.length === 0 ? 1 : 0;

  console.log(
    `[audit] ${findings.length} finding(s)  errors=${findings.filter((f) => f.severity === "error").length}  warnings=${findings.filter((f) => f.severity === "warning").length}`,
  );
  for (const f of findings) {
    const sev = f.severity === "error" ? "✗" : f.severity === "warning" ? "!" : "·";
    console.log(`  ${sev} [${f.category.padEnd(15)}] ${f.message}`);
  }

  return {
    findings,
    totalRoutes,
    csrRoutes,
    schemaCoverage,
  };
}
