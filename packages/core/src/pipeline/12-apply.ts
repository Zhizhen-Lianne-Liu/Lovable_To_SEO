import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildRobotsTxt,
  buildSitemapXml,
  shouldOverwriteRobots,
  shouldOverwriteSitemap,
} from "../lovable/files.js";
import { injectMetaIntoIndexHtml } from "../lovable/inject-meta.js";
import { type Inventory, type RunContext } from "../types/index.js";
import type { StrategyResult } from "./11-strategy.js";

const exec = promisify(execFile);

export type ApplyResult = {
  changedFiles: string[];
  newFiles: string[];
  diff: string;
  skipped: Array<{ file: string; reason: string }>;
};

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

function rel(cloneDir: string, abs: string): string {
  return abs.startsWith(cloneDir) ? abs.slice(cloneDir.length).replace(/^\/+/, "") : abs;
}

function homeRoute(strategy: StrategyResult) {
  return (
    strategy.perRoute.find((r) => r.route === "/") ??
    strategy.perRoute[0] ??
    null
  );
}

function pickOgImage(strategy: StrategyResult, fallback: string | null): string | undefined {
  // Prefer an explicit og:image set in the home route's schema (rarely there)
  // — otherwise leave it to the caller (we'll skip if no image is known).
  void strategy;
  return fallback ?? undefined;
}

export async function apply(args: {
  ctx: RunContext;
  inventory: Inventory;
  strategy: StrategyResult;
}): Promise<ApplyResult> {
  const { inventory, strategy } = args;
  const cloneDir = inventory.cloneDir;
  const changedFiles: string[] = [];
  const newFiles: string[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];

  if (inventory.framework !== "vite-react") {
    skipped.push({
      file: "index.html",
      reason: `framework is "${inventory.framework}", APPLY v1 only handles vite-react. Skipping shell mutation; copy the perRoute output into the framework's <head> or layout component manually.`,
    });
  } else {
    const home = homeRoute(strategy);
    const indexPath = join(cloneDir, "index.html");
    const indexHtml = await readIfExists(indexPath);
    if (!indexHtml) {
      skipped.push({ file: "index.html", reason: "not found in repo" });
    } else if (!home) {
      skipped.push({ file: "index.html", reason: "strategy.perRoute is empty — nothing to inject" });
    } else {
      const canonicalUrl = inventory.inferredUrl ?? `https://${args.inventory.repoUrl}`;
      const updated = injectMetaIntoIndexHtml(indexHtml, {
        title: home.title,
        description: home.description,
        canonicalUrl,
        ogTitle: home.title,
        ogDescription: home.description,
        ogImage: pickOgImage(strategy, null),
        twitterCard: "summary_large_image",
        jsonLd: [...strategy.globalSchema, ...home.schema],
      });
      if (updated !== indexHtml) {
        await writeFile(indexPath, updated, "utf8");
        changedFiles.push(rel(cloneDir, indexPath));
      }
    }
  }

  // robots.txt
  const robotsPath = join(cloneDir, "public", "robots.txt");
  const sitemapBase = inventory.inferredUrl ?? "https://example.com";
  const sitemapUrl = `${sitemapBase.replace(/\/+$/, "")}/sitemap.xml`;
  const existingRobots = await readIfExists(robotsPath);
  if (shouldOverwriteRobots(existingRobots)) {
    await mkdir(resolve(cloneDir, "public"), { recursive: true });
    await writeFile(robotsPath, buildRobotsTxt({ sitemapUrl }), "utf8");
    if (existingRobots == null) newFiles.push(rel(cloneDir, robotsPath));
    else if (existingRobots.trimStart() !== (await readFile(robotsPath, "utf8")).trimStart()) {
      changedFiles.push(rel(cloneDir, robotsPath));
    }
  } else {
    skipped.push({ file: "public/robots.txt", reason: "exists with bespoke content (no marker)" });
  }

  // sitemap.xml
  const sitemapPath = join(cloneDir, "public", "sitemap.xml");
  const existingSitemap = await readIfExists(sitemapPath);
  if (shouldOverwriteSitemap(existingSitemap)) {
    const allRoutes = [
      "/",
      ...strategy.perRoute.filter((r) => r.route !== "/").map((r) => r.route),
      ...strategy.newPages.map((r) => r.route),
    ];
    await mkdir(resolve(cloneDir, "public"), { recursive: true });
    await writeFile(
      sitemapPath,
      buildSitemapXml({
        baseUrl: sitemapBase,
        routes: allRoutes.map((p) => ({ path: p, changefreq: "weekly", priority: p === "/" ? 1.0 : 0.7 })),
      }),
      "utf8",
    );
    if (existingSitemap == null) newFiles.push(rel(cloneDir, sitemapPath));
    else changedFiles.push(rel(cloneDir, sitemapPath));
  } else {
    skipped.push({ file: "public/sitemap.xml", reason: "exists with bespoke content (no marker)" });
  }

  // git diff for visibility (best-effort — the cloned repo always has git)
  let diff = "";
  try {
    const { stdout } = await exec("git", ["diff", "--no-color"], { cwd: cloneDir, maxBuffer: 4 * 1024 * 1024 });
    diff = stdout;
  } catch {
    // ignore — diff is informational
  }

  console.log(
    `[apply] changed=${changedFiles.length} new=${newFiles.length} skipped=${skipped.length}`,
  );
  for (const f of changedFiles) console.log(`        ~ ${f}`);
  for (const f of newFiles) console.log(`        + ${f}`);
  for (const s of skipped) console.log(`        · skipped ${s.file}: ${s.reason}`);

  return { changedFiles, newFiles, diff, skipped };
}
