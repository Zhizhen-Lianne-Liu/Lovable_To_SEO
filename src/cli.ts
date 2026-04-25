#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { ClaudeClient } from "./claude/client.js";
import { PeecClient } from "./peec/client.js";
import { scrape } from "./pipeline/scrape.js";
import { diagnose } from "./pipeline/diagnose.js";
import { strategize } from "./pipeline/strategize.js";
import { rebuild } from "./pipeline/rebuild.js";
import { unifiedDiff } from "./pipeline/diff.js";
import { ingestRepo, ingestLocal, readEntryFiles, type RepoMeta } from "./pipeline/ingest.js";
import { ship } from "./pipeline/ship.js";

const program = new Command();

program
  .name("ltseo")
  .description("Lovable_To_SEO — the AI marketer for early-stage Lovable founders")
  .version("0.1.0");

program
  .command("run")
  .description("Run the full pipeline against a Lovable repo and/or live URL")
  .option("--repo <url>", "GitHub repo URL to clone (e.g. https://github.com/me/my-app)")
  .option("--path <dir>", "Local repo path (use instead of --repo when iterating)")
  .option("--url <url>", "Live URL to scrape for rendered content (auto-inferred from repo if omitted)")
  .option("--project-id <id>", "Peec AI project_id", process.env.PEEC_PROJECT_ID)
  .option("--out <dir>", "Output directory", "out")
  .option("--branch <name>", "Branch name for the rebuild commit", "")
  .option("--open-pr", "Push the branch and open a PR via gh", false)
  .action(async (opts: {
    repo?: string;
    path?: string;
    url?: string;
    projectId?: string;
    out: string;
    branch: string;
    openPr: boolean;
  }) => {
    if (!opts.projectId) {
      console.error("error: --project-id <id> (or PEEC_PROJECT_ID env) is required");
      process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("error: ANTHROPIC_API_KEY env is required");
      process.exit(1);
    }
    if (!opts.repo && !opts.path && !opts.url) {
      console.error("error: provide at least one of --repo, --path, or --url");
      process.exit(1);
    }

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = join(opts.out, runId);
    await mkdir(outDir, { recursive: true });
    const log = (msg: string) => console.log(`[ltseo] ${msg}`);
    log(`run ${runId} → ${outDir}`);

    let repoMeta: RepoMeta | undefined;
    if (opts.repo) {
      log(`0/6 cloning ${opts.repo}…`);
      repoMeta = await ingestRepo(opts.repo);
    } else if (opts.path) {
      log(`0/6 reading local repo ${opts.path}…`);
      repoMeta = await ingestLocal(opts.path);
    }
    if (repoMeta) {
      const sources = await readEntryFiles(repoMeta);
      await writeFile(
        join(outDir, "00-repo.json"),
        JSON.stringify({ ...repoMeta, sources }, null, 2),
      );
      log(`     stack=${repoMeta.stack} entries=${repoMeta.entryFiles.length} url=${repoMeta.inferredUrl ?? "(none)"}`);
    }

    const targetUrl = opts.url ?? repoMeta?.inferredUrl;
    if (!targetUrl) {
      console.error("error: could not determine a live URL — pass --url");
      process.exit(1);
    }

    log(`1/6 scraping ${targetUrl}…`);
    const page = await scrape(targetUrl);
    await writeFile(join(outDir, "01-scrape.json"), JSON.stringify(page, null, 2));
    log(`     status=${page.status} h1=${page.h1.length} words=${page.wordCount}`);

    log("2/6 diagnosing via Peec MCP…");
    const peec = new PeecClient({
      mcpUrl: process.env.PEEC_MCP_URL ?? "https://api.peec.ai/mcp",
      oauthToken: process.env.PEEC_OAUTH_TOKEN,
      fixturePath: process.env.PEEC_FIXTURE,
    });
    await peec.connect();
    const bundle = await diagnose(peec, opts.projectId);
    await peec.close();
    await writeFile(join(outDir, "02-diagnose.json"), JSON.stringify(bundle, null, 2));
    log(
      `     brands=${bundle.brand_report.length} queries=${bundle.search_queries.length} urls=${bundle.url_report.length} actions=${bundle.actions.length}`,
    );

    const claude = new ClaudeClient(process.env.ANTHROPIC_API_KEY);

    log("3/6 strategizing…");
    const brief = await strategize(claude, page, bundle);
    await writeFile(join(outDir, "03-brief.md"), brief);

    log("4/6 rebuilding site…");
    const site = await rebuild(claude, page, brief, {
      repo: repoMeta,
      canonicalUrl: targetUrl,
    });
    log(`     site files: ${Object.keys(site.files).join(", ")}`);

    log("5/6 diffing…");
    const patch = unifiedDiff(page.rawHtml, site.files["index.html"], "original.html", "optimized.html");
    await writeFile(join(outDir, "05-diff.patch"), patch);

    log("6/6 shipping…");
    const branch = opts.branch || `lovabletoseo/${runId}`;
    const result = await ship(site, {
      repo: repoMeta,
      outDir,
      branch,
      runId,
      openPr: opts.openPr,
      prBody: brief,
    });
    if (result.prUrl) log(`     PR: ${result.prUrl}`);
    else if (result.commitSha) log(`     committed ${result.commitSha.slice(0, 7)} on ${branch} (not pushed)`);
    else log(`     wrote ${result.written.length} files to ${outDir}/site`);

    const report = [
      `# lovabletoseo run ${runId}`,
      "",
      `- Source: ${targetUrl}`,
      repoMeta?.remote ? `- Repo: ${repoMeta.remote}` : "",
      `- Peec project: ${opts.projectId}`,
      `- Brands tracked: ${bundle.brand_report.length}`,
      `- Buyer queries seen: ${bundle.search_queries.length}`,
      `- Actions surfaced: ${bundle.actions.length}`,
      result.prUrl ? `- PR: ${result.prUrl}` : `- Branch: ${result.branch}`,
      "",
      "## Brief",
      "",
      brief,
    ]
      .filter(Boolean)
      .join("\n");
    await writeFile(join(outDir, "report.md"), report);

    log(`done. open ${join(outDir, "report.md")}`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
