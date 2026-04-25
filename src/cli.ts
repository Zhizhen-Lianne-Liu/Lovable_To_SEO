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
import { rewrite } from "./pipeline/rewrite.js";
import { unifiedDiff } from "./pipeline/diff.js";

const program = new Command();

program
  .name("ltseo")
  .description("Lovable_To_SEO — the AI marketer for early-stage founders")
  .version("0.1.0");

program
  .command("run")
  .description("Run the full pipeline against a single URL")
  .argument("<url>", "URL to optimize (e.g. https://your-app.lovable.app)")
  .option("--project-id <id>", "Peec AI project_id", process.env.PEEC_PROJECT_ID)
  .option("--out <dir>", "Output directory", "out")
  .action(async (url: string, opts: { projectId?: string; out: string }) => {
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

    log("1/5 scraping page…");
    const page = await scrape(url);
    await writeFile(join(outDir, "01-scrape.json"), JSON.stringify(page, null, 2));
    log(`     status=${page.status} h1=${page.h1.length} words=${page.wordCount}`);

    log("2/5 diagnosing via Peec MCP…");
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

    log("3/5 strategizing…");
    const brief = await strategize(claude, page, bundle);
    await writeFile(join(outDir, "03-brief.md"), brief);

    log("4/5 rewriting page…");
    const optimized = await rewrite(claude, page, brief);
    await writeFile(join(outDir, "04-optimized.html"), optimized);

    log("5/5 diffing…");
    const patch = unifiedDiff(page.rawHtml, optimized, "original.html", "optimized.html");
    await writeFile(join(outDir, "05-diff.patch"), patch);

    const report = [
      `# lovabletoseo run ${runId}`,
      "",
      `- Source: ${url}`,
      `- Peec project: ${opts.projectId}`,
      `- Brands tracked: ${bundle.brand_report.length}`,
      `- Buyer queries seen: ${bundle.search_queries.length}`,
      `- Actions surfaced: ${bundle.actions.length}`,
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
