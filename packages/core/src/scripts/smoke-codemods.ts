#!/usr/bin/env node
/**
 * Smoke-test the non-LLM stages of the pipeline (INGEST + AUDIT + APPLY).
 *
 *   npm run smoke:codemods -- <local-path-to-vite-react-repo>
 *
 * Runs:
 *   1. ingest({ localPath })  → Inventory
 *   2. audit({ inventory })   → AuditReport
 *   3. apply({ ... }) with a synthetic StrategyResult that fills every
 *      field APPLY consumes, so we can see the diff.
 *
 * Skips PROFILE/DISCOVER/KEYWORDS/PROMPTS/STRATEGY/SHIP because those
 * either need LLM credentials or push to live services. Use this script
 * to verify the code-mod path on a real Lovable repo without spending a
 * cent on LLM calls.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ingest } from "../pipeline/01-ingest.js";
import { audit } from "../pipeline/02-audit.js";
import { apply } from "../pipeline/12-apply.js";
import type { RunContext } from "../types/index.js";
import type { StrategyResult } from "../pipeline/11-strategy.js";

function syntheticStrategy(): StrategyResult {
  return {
    perRoute: [
      {
        route: "/",
        title: "Forgent AI · Win public-sector tenders with AI agents",
        description:
          "Domain-specific AI agents that find, draft, and submit winning proposals for public-sector contracts. Built for bid managers — automate 80% of busywork, lift bid capacity 5x.",
        copy: {
          hero: "Forgent AI builds domain-specific AI agents for public-sector procurement.",
          sections: {
            "value-prop": "Automate 80% of bid manager busywork.",
            "outcome": "Lift bid capacity 5x using existing resources.",
          },
          cta: "Book a demo",
        },
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Forgent AI",
            url: "https://forgent.ai/",
          },
        ],
      },
    ],
    newPages: [
      {
        route: "/vs/tendium",
        reason: "Peec gap: Tendium ranks for 38% SOV vs ours at 5% across the same prompts",
        copy: "Forgent AI vs Tendium — comparison page draft.",
      },
    ],
    globalSchema: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Forgent AI",
        url: "https://forgent.ai",
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Forgent AI",
        url: "https://forgent.ai",
      },
    ],
  };
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: smoke-codemods <local-path-to-repo>");
    process.exit(1);
  }

  const ctx: RunContext = {
    jobId: `codemod-smoke-${Date.now()}`,
    outDir: resolve(process.cwd(), "runs", `codemod-${Date.now()}`),
    repoUrl: `file://${path}`,
    startedAt: new Date().toISOString(),
  };
  await mkdir(ctx.outDir, { recursive: true });
  console.log(`[smoke] target=${path}\n[smoke] outDir=${ctx.outDir}\n`);

  console.log("=".repeat(72));
  console.log("STAGE 1/3 — INGEST");
  console.log("=".repeat(72));
  const inventory = await ingest({ ctx, localPath: path });
  await writeFile(resolve(ctx.outDir, "inventory.json"), JSON.stringify(inventory, null, 2), "utf8");

  console.log("\n" + "=".repeat(72));
  console.log("STAGE 2/3 — AUDIT");
  console.log("=".repeat(72));
  const auditResult = await audit({ ctx, inventory });
  await writeFile(resolve(ctx.outDir, "audit.json"), JSON.stringify(auditResult, null, 2), "utf8");

  console.log("\n" + "=".repeat(72));
  console.log("STAGE 3/3 — APPLY (synthetic StrategyResult)");
  console.log("=".repeat(72));
  const applyResult = await apply({ ctx, inventory, strategy: syntheticStrategy() });
  await writeFile(resolve(ctx.outDir, "apply.json"), JSON.stringify(applyResult, null, 2), "utf8");

  if (applyResult.diff) {
    await writeFile(resolve(ctx.outDir, "apply.diff"), applyResult.diff, "utf8");
    console.log(`\n[smoke] diff (${applyResult.diff.length} bytes) saved → ${ctx.outDir}/apply.diff`);
    console.log("\n--- DIFF PREVIEW (first 80 lines) ---");
    console.log(applyResult.diff.split("\n").slice(0, 80).join("\n"));
  }

  console.log(`\n[smoke] done → ${ctx.outDir}`);
}

main().catch((e) => {
  console.error(`\n[smoke] FAILED: ${(e as Error).message}`);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
