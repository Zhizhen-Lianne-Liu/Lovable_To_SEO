#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { ClaudeClient } from "./claude/client.js";
import { PeecClient, defaultPeecApiUrl } from "./peec/client.js";
import { ingestRepo, ingestLocal, type RepoMeta } from "./pipeline/ingest.js";
import { prerender } from "./pipeline/prerender.js";
import { diagnose } from "./pipeline/diagnose.js";
import { strategize } from "./pipeline/strategize.js";
import { enhance } from "./pipeline/enhance.js";
import { unifiedDiff } from "./pipeline/diff.js";
import { ship } from "./pipeline/ship.js";

const program = new Command();

program
  .name("ltseo")
  .description("Lovable_To_SEO — the AI marketer for early-stage Lovable founders")
  .version("0.1.0");

program
  .command("run")
  .description("Run the full pipeline against a Lovable repo")
  .option("--repo <url>", "GitHub repo URL to clone (e.g. https://github.com/me/my-app)")
  .option("--path <dir>", "Local repo path (use instead of --repo when iterating)")
  .option("--project-id <id>", "Peec AI project_id", process.env.PEEC_PROJECT_ID)
  .option("--out <dir>", "Output directory", "out")
  .option("--branch <name>", "Branch name for the enhancement commit", "")
  .option("--open-pr", "Push the branch and open a PR via gh", false)
  .action(async (opts: {
    repo?: string;
    path?: string;
    projectId?: string;
    out: string;
    branch: string;
    openPr: boolean;
  }) => {
    if (!opts.repo && !opts.path) {
      console.error("error: pass --repo <url> or --path <dir>");
      process.exit(1);
    }
    if (!opts.projectId) {
      console.error("error: --project-id <id> (or PEEC_PROJECT_ID env) is required");
      process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("error: ANTHROPIC_API_KEY env is required");
      process.exit(1);
    }

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = join(opts.out, runId);
    await mkdir(outDir, { recursive: true });
    const log = (msg: string) => console.log(`[ltseo] ${msg}`);
    log(`run ${runId} → ${outDir}`);

    let repoMeta: RepoMeta;
    if (opts.repo) {
      log(`1/5 cloning ${opts.repo}…`);
      repoMeta = await ingestRepo(opts.repo);
    } else {
      log(`1/5 reading local repo ${opts.path}…`);
      repoMeta = await ingestLocal(opts.path!);
    }
    await writeFile(join(outDir, "01-repo.json"), JSON.stringify(repoMeta, null, 2));
    log(`     stack=${repoMeta.stack} sources=${repoMeta.sourceFiles.length} url=${repoMeta.inferredUrl ?? "(none inferred)"}`);

    const claude = new ClaudeClient(process.env.ANTHROPIC_API_KEY);

    log("2/5 prerendering React → static HTML…");
    const prerendered = await prerender(claude, repoMeta);
    await writeFile(join(outDir, "02-prerendered.html"), prerendered.html);
    log(`     ${prerendered.html.length} bytes static HTML`);

    log("3/5 diagnosing via Peec API…");
    const peec = new PeecClient({
      apiUrl: defaultPeecApiUrl(),
      apiKey: process.env.PEEC_API_KEY,
      fixturePath: process.env.PEEC_FIXTURE,
    });
    await peec.connect();
    const bundle = await diagnose(peec, opts.projectId);
    await writeFile(join(outDir, "03-diagnose.json"), JSON.stringify(bundle, null, 2));
    log(
      `     brands=${bundle.brand_report.length} queries=${bundle.search_queries.length} urls=${bundle.url_report.length}`,
    );

    log("4/5 strategizing + enhancing…");
    const brief = await strategize(claude, prerendered, bundle);
    await writeFile(join(outDir, "04-brief.md"), brief);
    const canonicalUrl = repoMeta.inferredUrl ?? "https://example.com";
    const site = await enhance(claude, prerendered, brief, {
      repo: repoMeta,
      canonicalUrl,
    });
    log(`     site files: ${Object.keys(site.files).join(", ")}`);

    const patch = unifiedDiff(prerendered.html, site.files["index.html"], "prerendered.html", "enhanced.html");
    await writeFile(join(outDir, "05-diff.patch"), patch);

    log("5/5 shipping…");
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
      `- Repo: ${repoMeta.remote ?? repoMeta.path}`,
      `- Stack: ${repoMeta.stack}`,
      `- Canonical URL: ${canonicalUrl}`,
      `- Peec project: ${opts.projectId}`,
      `- Brands tracked: ${bundle.brand_report.length}`,
      `- Buyer queries seen: ${bundle.search_queries.length}`,
      result.prUrl ? `- PR: ${result.prUrl}` : `- Branch: ${result.branch}`,
      "",
      "## Brief",
      "",
      brief,
    ].join("\n");
    await writeFile(join(outDir, "report.md"), report);

    log(`done. open ${join(outDir, "report.md")}`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
