#!/usr/bin/env node
/**
 * Smoke-test slices 1+2 of the P2 port.
 *
 *   npm run smoke:enrich -- forgent.ai
 *
 * Runs profile() + discover() against the given domain, prints summaries,
 * and writes the full JSON to runs/smoke-<slug>/. Skips all other stages.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { profile } from "../pipeline/04-profile.js";
import { discover } from "../pipeline/05-discover.js";
import { domainToSlug, normalizeInputDomain } from "../lib/domain.js";
import type { RunContext } from "../types/index.js";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: smoke-enrich <domain>");
    process.exit(1);
  }
  env(); // fail fast on missing keys

  const domain = normalizeInputDomain(arg);
  const outDir = resolve(process.cwd(), "runs", `smoke-${domainToSlug(domain)}-${Date.now()}`);
  await mkdir(outDir, { recursive: true });
  const ctx: RunContext = {
    jobId: `smoke-${Date.now()}`,
    outDir,
    repoUrl: `https://${domain}`,
    startedAt: new Date().toISOString(),
  };
  console.log(`[smoke] domain=${domain}  out=${outDir}\n`);

  const t0 = Date.now();
  console.log("=".repeat(72));
  console.log("STAGE 1/2 — PROFILE");
  console.log("=".repeat(72));
  const p = await profile({ ctx, domain });
  await writeFile(resolve(outDir, "profile.json"), JSON.stringify(p, null, 2), "utf8");
  const profileMs = Date.now() - t0;
  console.log(`\n[smoke] profile done in ${(profileMs / 1000).toFixed(1)}s`);
  console.log(`        category_for_search: ${p.category_for_search}`);
  console.log(`        scale_tier:          ${p.scale_tier}`);
  console.log(`        audience:            ${p.audience}`);
  console.log(`        differentiators:     ${p.key_differentiators.slice(0, 3).join(" / ")}`);

  const t1 = Date.now();
  console.log("\n" + "=".repeat(72));
  console.log("STAGE 2/2 — DISCOVER");
  console.log("=".repeat(72));
  const d = await discover({ ctx, domain, profile: p });
  await writeFile(resolve(outDir, "discover.json"), JSON.stringify(d, null, 2), "utf8");
  const discoverMs = Date.now() - t1;
  console.log(`\n[smoke] discover done in ${(discoverMs / 1000).toFixed(1)}s`);
  console.log(`        approach A: ${d.approaches.A_research.competitors.length} competitors`);
  console.log(`        approach B: ${d.approaches.B_cooccur.competitors.length} candidates`);
  console.log(`        approach C: ${d.approaches.C_answer.competitors.length} competitors`);
  console.log(`        consensus (≥2): ${d.raw_consensus.filter((c) => (c.votes ?? 0) >= 2).length}`);
  console.log(`        final: ${d.final.length}`);

  console.log(`\n[smoke] total: ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
}

main().catch((e) => {
  console.error("\n[smoke] FAILED:", e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
