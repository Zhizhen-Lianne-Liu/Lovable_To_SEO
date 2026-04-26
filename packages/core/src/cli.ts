#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import type { RunContext } from "./types/index.js";

import { ingest } from "./pipeline/01-ingest.js";
import { audit } from "./pipeline/02-audit.js";
import { prerender } from "./pipeline/03-prerender.js";
import { profile } from "./pipeline/04-profile.js";
import { discover } from "./pipeline/05-discover.js";
import { keywords } from "./pipeline/06-keywords.js";
import { prompts } from "./pipeline/07-prompts.js";
import { peecPush } from "./pipeline/08-peec-push.js";
import { peecSnapshot } from "./pipeline/09-peec-snapshot.js";
import { contextFile } from "./pipeline/10-context.js";
import { strategy } from "./pipeline/11-strategy.js";
import { apply } from "./pipeline/12-apply.js";
import { ship } from "./pipeline/13-ship.js";
import { report } from "./pipeline/14-report.js";

const program = new Command();
program
  .name("lts")
  .description("lovabletoseo — fix SEO + GEO of a Lovable repo, PR back to GitHub")
  .version("0.1.0");

program
  .command("run")
  .description("Run the full pipeline on a Lovable GitHub repo")
  .requiredOption("-r, --repo <url>", "GitHub repo URL")
  .option("-d, --domain <domain>", "Live domain (defaults to detection)")
  .option("--dry-run", "Skip Peec push + GitHub PR")
  .action(async (opts: { repo: string; domain?: string; dryRun?: boolean }) => {
    env(); // fail-fast on missing env

    const ctx: RunContext = {
      jobId: randomUUID(),
      outDir: resolve(process.cwd(), "runs", new Date().toISOString().slice(0, 10) + "-" + randomUUID().slice(0, 8)),
      repoUrl: opts.repo,
      startedAt: new Date().toISOString(),
    };
    await mkdir(ctx.outDir, { recursive: true });
    console.log(`[lts] job ${ctx.jobId} → ${ctx.outDir}`);

    const inventory = await ingest({ ctx });
    await write(ctx, "inventory.json", inventory);

    const auditResult = await audit({ ctx, inventory });
    await write(ctx, "audit.json", auditResult);

    const prerendered = await prerender({ ctx, inventory });
    await write(ctx, "prerender.json", prerendered);

    const domain = opts.domain ?? deriveDomain(inventory);
    const profileResult = await profile({ ctx, domain });
    await write(ctx, "profile.json", profileResult);

    const discoverResult = await discover({ ctx, domain, profile: profileResult });
    await write(ctx, "discover.json", discoverResult);

    const keywordResult = await keywords({ ctx, competitors: discoverResult.final.map((c) => c.domain) });
    await write(ctx, "keywords.json", keywordResult);

    const promptSet = await prompts({ ctx, keywords: keywordResult, profile: profileResult });
    await write(ctx, "prompts.json", promptSet);

    if (!opts.dryRun) {
      const peecPushResult = await peecPush({ ctx, profile: profileResult, competitors: discoverResult.final, prompts: promptSet });
      await write(ctx, "peec-push.json", peecPushResult);
    }

    const snapshot = await peecSnapshot({ ctx });
    await write(ctx, "peec-snapshot.json", snapshot);

    const contextMd = await contextFile({ ctx, profile: profileResult, discover: discoverResult, snapshot });
    await writeFile(resolve(ctx.outDir, "product-marketing-context.md"), contextMd, "utf8");

    const strategyResult = await strategy({ ctx, inventory, audit: auditResult, contextMd });
    await write(ctx, "strategy.json", strategyResult);

    const applyResult = await apply({ ctx, inventory, strategy: strategyResult });
    await write(ctx, "apply.json", applyResult);

    // Generate the report BEFORE ship so we can use its content as the PR body.
    // ship's outcome (branch + PR URL) is appended afterwards as a postscript.
    const reportMd = await report({
      ctx,
      all: { inventory, auditResult, profileResult, discoverResult, keywordResult, promptSet, snapshot, strategyResult, applyResult },
    });

    let shipResult: Awaited<ReturnType<typeof ship>> | null = null;
    if (!opts.dryRun) {
      shipResult = await ship({ ctx, inventory, apply: applyResult, reportMd });
      await write(ctx, "ship.json", shipResult);
    }

    const finalReport = shipResult?.prUrl
      ? `${reportMd}\n\n---\n\n**PR opened:** ${shipResult.prUrl} (branch \`${shipResult.branch}\`, commit \`${shipResult.commitSha.slice(0, 7)}\`)\n`
      : shipResult?.skipped
        ? `${reportMd}\n\n---\n\n**Ship skipped:** ${shipResult.skipped}\n`
        : reportMd;
    await writeFile(resolve(ctx.outDir, "report.md"), finalReport, "utf8");

    console.log(`[lts] done → ${ctx.outDir}/report.md`);
  });

async function write(ctx: RunContext, filename: string, data: unknown): Promise<void> {
  await writeFile(resolve(ctx.outDir, filename), JSON.stringify(data, null, 2), "utf8");
}

function deriveDomain(inventory: { repoUrl: string }): string {
  const m = inventory.repoUrl.match(/[\/:]([\w-]+)\/([\w-]+?)(?:\.git)?$/);
  if (!m) throw new Error(`Could not derive domain from ${inventory.repoUrl}`);
  return `${m[2]}.lovable.app`;
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
