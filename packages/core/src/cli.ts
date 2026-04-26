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
  .option(
    "--limit",
    "Reduced-cost run that still exercises every stage. Caps competitors to 5, " +
      "keywords/competitor to 10, top-keywords to 5, prompts/keyword to 2.",
  )
  .option("--no-prerender", "Skip the prerender stage (saves ~$0.05 + ~30s; APPLY still runs)")
  .option(
    "--wait-peec <seconds>",
    "Sleep this many seconds after Peec push before snapshot, so the scheduler has time to run the prompts. Default 90. Pass 0 to skip and snapshot whatever's there now.",
    "90",
  )
  .action(async (opts: { repo: string; domain?: string; dryRun?: boolean; limit?: boolean; prerender: boolean; waitPeec?: string }) => {
    env(); // fail-fast on missing env

    const isLimit = !!opts.limit;
    const limits = isLimit
      ? { finalCompetitors: 5, keywordLimit: 10, candidatePool: 20, topKeywords: 5, promptsPerKeyword: 2 }
      : { finalCompetitors: 10, keywordLimit: 30, candidatePool: 60, topKeywords: 18, promptsPerKeyword: 4 };

    const ctx: RunContext = {
      jobId: randomUUID(),
      outDir: resolve(process.cwd(), "runs", new Date().toISOString().slice(0, 10) + "-" + randomUUID().slice(0, 8)),
      repoUrl: opts.repo,
      startedAt: new Date().toISOString(),
    };
    await mkdir(ctx.outDir, { recursive: true });
    console.log(`[lts] job ${ctx.jobId} → ${ctx.outDir}${isLimit ? "  [--limit mode]" : ""}`);

    const inventory = await ingest({ ctx });
    await write(ctx, "inventory.json", inventory);

    const auditResult = await audit({ ctx, inventory });
    await write(ctx, "audit.json", auditResult);

    if (opts.prerender !== false) {
      const prerendered = await prerender({ ctx, inventory });
      await write(ctx, "prerender.json", prerendered);
    } else {
      console.log("[prerender] skipped (--no-prerender)");
    }

    const domain = opts.domain ?? deriveDomain(inventory);
    const profileResult = await profile({ ctx, domain });
    await write(ctx, "profile.json", profileResult);

    const discoverResult = await discover({ ctx, domain, profile: profileResult });
    // Trim competitors before they fan out into Keywords + Peec push.
    discoverResult.final = discoverResult.final.slice(0, limits.finalCompetitors);
    await write(ctx, "discover.json", discoverResult);

    const keywordResult = await keywords({
      ctx,
      competitors: discoverResult.final.map((c) => c.domain),
      opts: { keywordLimit: limits.keywordLimit },
    });
    await write(ctx, "keywords.json", keywordResult);

    const promptSet = await prompts({
      ctx,
      keywords: keywordResult,
      profile: profileResult,
      opts: {
        candidatePool: limits.candidatePool,
        topKeywords: limits.topKeywords,
        promptsPerKeyword: limits.promptsPerKeyword,
      },
    });
    await write(ctx, "prompts.json", promptSet);

    if (!opts.dryRun) {
      const peecPushResult = await peecPush({ ctx, profile: profileResult, competitors: discoverResult.final, prompts: promptSet });
      await write(ctx, "peec-push.json", peecPushResult);
      // Peec is async/schedule-driven — chats start arriving within minutes
      // but full coverage takes ~24h. The default 90s wait captures partial
      // visibility. Use --wait-peec 0 to skip, --wait-peec 600 for more.
      const waitSec = Number(opts.waitPeec ?? 90);
      if (waitSec > 0) {
        console.log(`[peec] waiting ${waitSec}s for Peec scheduler to start running prompts (use --wait-peec 0 to skip; re-run \`lts snapshot\` later for fuller coverage)…`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
    }

    const snapshot = await peecSnapshot({ ctx });
    await write(ctx, "peec-snapshot.json", snapshot);

    const contextMd = await contextFile({ ctx, profile: profileResult, discover: discoverResult, snapshot });
    await writeFile(resolve(ctx.outDir, "product-marketing-context.md"), contextMd, "utf8");

    const strategyResult = await strategy({ ctx, inventory, audit: auditResult, contextMd });
    await write(ctx, "strategy.json", strategyResult);

    const applyResult = await apply({
      ctx,
      inventory,
      strategy: strategyResult,
      profile: profileResult,
      snapshot,
    });
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

program
  .command("scan-domain")
  .description(
    "Analysis-only run: profile + discover + keywords + prompts + Peec push + " +
      "snapshot + strategy. Skips clone/audit/prerender/apply/ship. Use when you " +
      "have a domain but no GitHub repo (or for the landing demo's API).",
  )
  .requiredOption("-d, --domain <domain>", "Live domain to profile (e.g. example.com)")
  .option(
    "--limit",
    "Reduced fan-out (5 final competitors / 10 keywords / 5 topK / 2 ppk). Halves cost + time.",
  )
  .option("--wait-peec <seconds>", "Sleep after Peec push before snapshot", "0")
  .action(async (opts: { domain: string; limit?: boolean; waitPeec?: string }) => {
    env();
    const isLimit = !!opts.limit;
    const limits = isLimit
      ? { finalCompetitors: 5, keywordLimit: 10, candidatePool: 20, topKeywords: 5, promptsPerKeyword: 2 }
      : { finalCompetitors: 10, keywordLimit: 30, candidatePool: 60, topKeywords: 18, promptsPerKeyword: 4 };

    const ctx: RunContext = {
      jobId: randomUUID(),
      outDir: resolve(process.cwd(), "runs", new Date().toISOString().slice(0, 10) + "-scan-" + randomUUID().slice(0, 8)),
      repoUrl: `(domain-only) ${opts.domain}`,
      startedAt: new Date().toISOString(),
    };
    await mkdir(ctx.outDir, { recursive: true });
    console.log(`[lts] scan-domain ${opts.domain} → ${ctx.outDir}${isLimit ? "  [--limit mode]" : ""}`);

    const profileResult = await profile({ ctx, domain: opts.domain });
    await write(ctx, "profile.json", profileResult);

    const discoverResult = await discover({ ctx, domain: opts.domain, profile: profileResult });
    discoverResult.final = discoverResult.final.slice(0, limits.finalCompetitors);
    await write(ctx, "discover.json", discoverResult);

    const keywordResult = await keywords({
      ctx,
      competitors: discoverResult.final.map((c) => c.domain),
      opts: { keywordLimit: limits.keywordLimit },
    });
    await write(ctx, "keywords.json", keywordResult);

    const promptSet = await prompts({
      ctx,
      keywords: keywordResult,
      profile: profileResult,
      opts: {
        candidatePool: limits.candidatePool,
        topKeywords: limits.topKeywords,
        promptsPerKeyword: limits.promptsPerKeyword,
      },
    });
    await write(ctx, "prompts.json", promptSet);

    const peecPushResult = await peecPush({
      ctx,
      profile: profileResult,
      competitors: discoverResult.final,
      prompts: promptSet,
    });
    await write(ctx, "peec-push.json", peecPushResult);

    const waitSec = Number(opts.waitPeec ?? 0);
    if (waitSec > 0) {
      console.log(`[peec] waiting ${waitSec}s for scheduler before snapshot…`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }

    const snapshot = await peecSnapshot({ ctx });
    await write(ctx, "peec-snapshot.json", snapshot);

    const contextMd = await contextFile({
      ctx,
      profile: profileResult,
      discover: discoverResult,
      snapshot,
    });
    await writeFile(resolve(ctx.outDir, "product-marketing-context.md"), contextMd, "utf8");

    // Compose ScanResult shape (matches apps/landing's scan-api.ts).
    const ownSov = snapshot.scorecard.own?.share_of_voice;
    const ownVis = snapshot.scorecard.own?.visibility;
    const competitorsSov = snapshot.scorecard.competitors
      .filter((c) => (c.share_of_voice ?? 0) > 0)
      .slice(0, 5)
      .map((c) => ({ name: c.brand_name, pct: Math.round((c.share_of_voice ?? 0) * 100) }));
    const ownEntry = {
      name: profileResult.name,
      pct: Math.round((ownSov ?? 0) * 100),
    };
    const scanResult = {
      domain: opts.domain,
      framework: undefined,
      isLovable: opts.domain.endsWith(".lovable.app") ? true : undefined,
      diagnosis: {
        indexable_pct: 0,
        llm_share_of_voice_pct: Math.round((ownSov ?? 0) * 100),
        schema_blocks_missing: 5,
        schema_blocks_total: 5,
        audit_errors: 0,
        audit_warnings: 0,
      },
      competitors: discoverResult.final.map((c) => ({
        name: c.canonical_name || c.name,
        domain: c.domain,
      })),
      share_of_voice: [...competitorsSov, ownEntry],
      fanout_queries: snapshot.fanout_queries.slice(0, 10).map((q) => q.query),
      diff: undefined,
      files_changed: undefined,
      pr: undefined,
      _meta: {
        coverage_pct: snapshot.meta.coverage.pct,
        own_visibility: ownVis,
        prompts_pushed: promptSet.prompts.length,
        outDir: ctx.outDir,
      },
    };
    const scanResultPath = resolve(ctx.outDir, "scan-result.json");
    await writeFile(scanResultPath, JSON.stringify(scanResult, null, 2), "utf8");

    console.log(`[lts] scan-domain done`);
    // Last line consumed by api subprocess wrapper:
    console.log(`SCAN_RESULT_PATH=${scanResultPath}`);
  });

program
  .command("snapshot")
  .description(
    "Pull a fresh Peec snapshot for an existing project (no LLM, no GitHub). " +
      "Use this hours/days after `run` to capture coverage as Peec's scheduler fills in.",
  )
  .option("-p, --project-id <id>", "Peec project ID (defaults to PEEC_PROJECT_ID env)")
  .option("-d, --days <n>", "Date-window size in days", "7")
  .action(async (opts: { projectId?: string; days?: string }) => {
    env(); // fail-fast on missing env
    const projectId = opts.projectId ?? process.env.PEEC_PROJECT_ID;
    if (!projectId) {
      console.error("error: --project-id <id> (or PEEC_PROJECT_ID env) is required");
      process.exit(1);
    }
    const days = Math.max(1, Number(opts.days ?? 7));

    const ctx: RunContext = {
      jobId: randomUUID(),
      outDir: resolve(process.cwd(), "runs", new Date().toISOString().slice(0, 10) + "-snapshot-" + randomUUID().slice(0, 8)),
      repoUrl: "(snapshot-only)",
      startedAt: new Date().toISOString(),
    };
    await mkdir(ctx.outDir, { recursive: true });
    console.log(`[lts] snapshot project=${projectId} days=${days} → ${ctx.outDir}`);

    const snap = await peecSnapshot({ ctx, projectId, days });
    await write(ctx, "peec-snapshot.json", snap);

    // Brief, snapshot-shaped report (no inventory/profile/etc).
    const sc = snap.scorecard;
    const wins = snap.prompt_breakdown.filter((p) => p.winning_flag);
    const losses = snap.prompt_breakdown.filter((p) => p.weakness_flag);
    const lines = [
      `# lovabletoseo snapshot — ${snap.meta.own_brand?.name ?? "(unknown)"}`,
      "",
      `**Project:** ${projectId}`,
      `**Window:** ${snap.meta.date_range.start} → ${snap.meta.date_range.end} (${days} days)`,
      `**Coverage:** ${snap.meta.coverage.actual} / ${snap.meta.coverage.expected} chats (${(snap.meta.coverage.pct * 100).toFixed(0)}%)`,
      "",
      "## Scorecard",
      "",
      `- **Own visibility:** ${sc.own?.visibility != null ? `${(sc.own.visibility * 100).toFixed(1)}%` : "—"}`,
      `- **Share of voice:** ${sc.own?.share_of_voice != null ? `${(sc.own.share_of_voice * 100).toFixed(1)}%` : "—"}`,
      `- **Sentiment:** ${sc.own?.sentiment ?? "—"}`,
      `- **Rank:** ${sc.our_rank} of ${sc.total_brands_ranked}`,
      "",
      "## Competitors (by visibility)",
      "",
      sc.competitors.length
        ? sc.competitors.slice(0, 10).map((c) => `- **${c.brand_name}** — vis=${c.visibility != null ? (c.visibility * 100).toFixed(1) + "%" : "—"}, sov=${c.share_of_voice != null ? (c.share_of_voice * 100).toFixed(1) + "%" : "—"}, mentions=${c.mention_count ?? 0}`).join("\n")
        : "_(none ranked yet)_",
      "",
      "## Prompts where we WIN (own ≥ 70%, ≥ top competitor)",
      "",
      wins.length ? wins.slice(0, 8).map((w) => `- **${w.prompt_text || w.prompt_id}** — own=${(w.own_visibility * 100).toFixed(0)}%`).join("\n") : "_(none yet)_",
      "",
      "## Prompts where we LOSE (own < 30%)",
      "",
      losses.length ? losses.slice(0, 12).map((l) => `- **${l.prompt_text || l.prompt_id}** — own=${(l.own_visibility * 100).toFixed(0)}%, top=${(l.top_competitor_visibility * 100).toFixed(0)}% (${l.top_competitor || "—"})`).join("\n") : "_(no clear losses — could mean the snapshot is still warming up)_",
      "",
      "## Top gap URLs the AIs cite (instead of us)",
      "",
      snap.gap_targets.urls.length
        ? snap.gap_targets.urls.slice(0, 10).map((u) => `- ${u.url} — cited ${u.citation_count ?? 0}x by ${u.competitors_cited.slice(0, 3).join(", ") || "—"}`).join("\n")
        : "_(none)_",
      "",
      "## Fanout queries the AIs ran (SEO/GEO targeting gold)",
      "",
      snap.fanout_queries.length
        ? snap.fanout_queries.slice(0, 12).map((q) => `- \`${q.query}\` (used ${q.count}x)`).join("\n")
        : "_(none yet — chats may still be processing)_",
      "",
    ];
    await writeFile(resolve(ctx.outDir, "report.md"), lines.join("\n"), "utf8");
    console.log(`[lts] snapshot done → ${ctx.outDir}/report.md`);
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
