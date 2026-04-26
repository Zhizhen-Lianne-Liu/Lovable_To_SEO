import type { RunContext } from "../types/index.js";

// Bag-of-typed-things from the orchestrator. Untyped here on purpose — the
// report is best-effort markdown, not a contract; missing fields render as
// "—" rather than throw.
type RunArtifacts = Record<string, unknown>;

function get<T>(all: RunArtifacts, key: string): T | undefined {
  return all[key] as T | undefined;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function severityCount(findings: Array<{ severity: string }>): {
  errors: number;
  warnings: number;
  info: number;
} {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else if (f.severity === "warning") warnings++;
    else info++;
  }
  return { errors, warnings, info };
}

export async function report(args: {
  ctx: RunContext;
  all: RunArtifacts;
}): Promise<string> {
  const inventory = get<{
    repoUrl: string;
    framework: string;
    isLovable: boolean;
    inferredUrl: string | null;
    sourceFiles: string[];
    routes: unknown[];
  }>(args.all, "inventory");

  const audit = get<{
    findings: Array<{ severity: string; category: string; message: string; route: string }>;
    totalRoutes: number;
    csrRoutes: number;
    schemaCoverage: number;
  }>(args.all, "auditResult");

  const profile = get<{
    name: string;
    domain: string;
    category_for_search: string | null;
    audience: string | null;
    scale_tier: string | null;
    key_differentiators: string[];
  }>(args.all, "profileResult");

  const discover = get<{
    final: Array<{ domain: string; canonical_name?: string; name: string; validated?: boolean | null }>;
  }>(args.all, "discoverResult");

  const keywords = get<{
    consensus: unknown[];
    outliers: unknown[];
    costUsd: number;
    cached: boolean;
  }>(args.all, "keywordResult");

  const promptSet = get<{
    prompts: Array<{ bucket: string }>;
    modelUsed: string;
    warnings: string[];
  }>(args.all, "promptSet");

  const snapshot = get<{
    meta: {
      project_id: string;
      date_range: { start: string; end: string };
      coverage: { actual: number; expected: number; pct: number };
      active_models: string[];
    };
    scorecard: {
      own: { visibility: number | null; share_of_voice: number | null; sentiment: number | null } | null;
      our_rank: number;
      total_brands_ranked: number;
    };
    prompt_breakdown: Array<{ winning_flag: boolean; weakness_flag: boolean }>;
  }>(args.all, "snapshot");

  const strategy = get<{
    perRoute: Array<{ route: string; title: string }>;
    newPages: Array<{ route: string; reason: string }>;
    globalSchema: unknown[];
  }>(args.all, "strategyResult");

  const apply = get<{
    changedFiles: string[];
    newFiles: string[];
  }>(args.all, "applyResult");

  const auditCounts = audit ? severityCount(audit.findings) : { errors: 0, warnings: 0, info: 0 };
  const wins = snapshot?.prompt_breakdown.filter((p) => p.winning_flag).length ?? 0;
  const losses = snapshot?.prompt_breakdown.filter((p) => p.weakness_flag).length ?? 0;
  const promptBucketSummary = (() => {
    if (!promptSet) return "—";
    const counts: Record<string, number> = {};
    for (const p of promptSet.prompts) counts[p.bucket] = (counts[p.bucket] ?? 0) + 1;
    return Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
  })();

  const lines: string[] = [
    `# lovabletoseo run — ${profile?.name ?? "(unknown)"}`,
    "",
    `**Run:** ${args.ctx.startedAt}`,
    `**Repo:** ${inventory?.repoUrl ?? "—"}`,
    `**Domain:** ${profile?.domain ?? "—"}`,
    `**Inferred URL:** ${inventory?.inferredUrl ?? "—"}`,
    "",
    "## Pipeline summary",
    "",
    `1. **Ingest** — framework=${inventory?.framework ?? "?"}, isLovable=${inventory?.isLovable ?? "?"}, source files=${inventory?.sourceFiles.length ?? 0}`,
    `2. **Audit** — ${auditCounts.errors} errors, ${auditCounts.warnings} warnings, ${auditCounts.info} info; CSR routes=${audit?.csrRoutes ?? 0}/${audit?.totalRoutes ?? 0}`,
    `3. **Prerender** — static HTML written to runs/<job>/prerender/`,
    `4. **Profile** — category="${profile?.category_for_search ?? "?"}", audience="${profile?.audience ?? "?"}", scale=${profile?.scale_tier ?? "?"}`,
    `5. **Discover** — ${discover?.final.length ?? 0} validated competitors (${discover?.final.filter((c) => c.validated === true).length ?? 0} LLM-validated)`,
    `6. **Keywords** — DataForSEO ${keywords?.cached ? "(cache hit)" : `($${keywords?.costUsd?.toFixed(4) ?? "0"})`}: consensus=${keywords?.consensus.length ?? 0}, outliers=${keywords?.outliers.length ?? 0}`,
    `7. **Prompts** — ${promptSet?.prompts.length ?? 0} generated (${promptBucketSummary}), via ${promptSet?.modelUsed ?? "?"}`,
    `8. **Peec push** — wipe-and-replace executed (or dry-run)`,
    `9. **Snapshot** — coverage ${snapshot?.meta.coverage.actual ?? 0}/${snapshot?.meta.coverage.expected ?? 0} (${fmtPct(snapshot?.meta.coverage.pct)}), models=${snapshot?.meta.active_models.length ?? 0}`,
    `10. **Strategy** — ${strategy?.perRoute.length ?? 0} per-route directives, ${strategy?.newPages.length ?? 0} new pages proposed, ${strategy?.globalSchema.length ?? 0} global schema blocks`,
    `11. **Apply** — ${apply?.changedFiles.length ?? 0} changed + ${apply?.newFiles.length ?? 0} new files`,
    "",
    "## Scorecard",
    "",
    `- **Own visibility:** ${fmtPct(snapshot?.scorecard.own?.visibility)}`,
    `- **Share of voice:** ${fmtPct(snapshot?.scorecard.own?.share_of_voice)}`,
    `- **Sentiment:** ${snapshot?.scorecard.own?.sentiment ?? "—"}`,
    `- **Rank:** ${snapshot?.scorecard.our_rank ?? "—"} of ${snapshot?.scorecard.total_brands_ranked ?? "—"}`,
    `- **Wins (own ≥ 70%):** ${wins} prompts`,
    `- **Weaknesses (own < 30%):** ${losses} prompts`,
    "",
    "## Differentiators surfaced",
    "",
    profile?.key_differentiators.length
      ? profile.key_differentiators.map((d) => `- ${d}`).join("\n")
      : "_(none extracted from source)_",
    "",
    "## Top changes shipped",
    "",
    apply?.changedFiles.length
      ? apply.changedFiles.slice(0, 12).map((f) => `- modified \`${f}\``).join("\n")
      : "_(none yet — APPLY stage runs after STRATEGY)_",
    apply?.newFiles.length
      ? "\n" + apply.newFiles.slice(0, 8).map((f) => `- created \`${f}\``).join("\n")
      : "",
    "",
    "## Caveats",
    "",
    "- **Peec is async/schedule-driven.** Push registers prompts; chats appear ~24h later. If `coverage` reads low, the snapshot will fill in on the next run.",
    promptSet?.warnings.length
      ? "\n**Pipeline warnings:**\n" + promptSet.warnings.map((w) => `- ${w}`).join("\n")
      : "",
    "",
    "## Read more",
    "",
    `- \`${args.ctx.outDir}/audit.json\``,
    `- \`${args.ctx.outDir}/profile.json\``,
    `- \`${args.ctx.outDir}/discover.json\``,
    `- \`${args.ctx.outDir}/keywords.json\``,
    `- \`${args.ctx.outDir}/prompts.json\``,
    `- \`${args.ctx.outDir}/peec-snapshot.json\``,
    `- \`${args.ctx.outDir}/strategy.json\``,
    `- \`${args.ctx.outDir}/product-marketing-context.md\``,
    "",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}
