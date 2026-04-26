import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { completeJson } from "../clients/llm.js";
import { env } from "../config/env.js";
import {
  type AuditReport,
  type Inventory,
  type RunContext,
} from "../types/index.js";

// Skills we compose into the STRATEGY system prompt. Order matters — the LLM
// reads them in this sequence and applies them top-down. Foundation (context
// document) is provided to STRATEGY via the user message, not loaded here.
const COMPOSED_SKILLS = [
  "site-architecture",
  "copywriting",
  "ai-seo",
  "schema-markup",
] as const;

const StrategyResultZ = z.object({
  perRoute: z.array(
    z.object({
      route: z.string(),
      title: z.string(),
      description: z.string(),
      schema: z.array(z.record(z.unknown())),
      copy: z.object({
        hero: z.string().optional(),
        sections: z.record(z.string()).optional(),
        cta: z.string().optional(),
      }),
    }),
  ),
  newPages: z.array(
    z.object({
      route: z.string(),
      reason: z.string(),
      copy: z.string(),
    }),
  ),
  globalSchema: z.array(z.record(z.unknown())),
});

export type StrategyResult = z.infer<typeof StrategyResultZ>;

// Locate `skills/<name>/SKILL.md` relative to repo root. We prefer cwd since
// the CLI is normally invoked from there; fall back to walking up from
// import.meta.url when a binary install is run from elsewhere.
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { stat } from "node:fs/promises";

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findSkillsDir(): Promise<string> {
  const cwdCandidate = resolve(process.cwd(), "skills");
  if (await fileExists(cwdCandidate)) return cwdCandidate;
  // Walk up from this module's location.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "skills");
    if (await fileExists(c)) return c;
    dir = dirname(dir);
  }
  throw new Error(
    `Could not locate skills/ directory. Run from the repo root, or set the cwd accordingly.`,
  );
}

async function loadSkill(skillsDir: string, name: string): Promise<string> {
  const path = resolve(skillsDir, name, "SKILL.md");
  return readFile(path, "utf8");
}

const STRATEGY_PREAMBLE = `You are operating inside a NON-INTERACTIVE pipeline. The marketing skills below describe what excellent output looks like for site architecture, copywriting, AI-SEO (GEO/LLMO), and schema markup — read them as guidance, not as workflows.

CRITICAL pipeline adaptations:
- Skip any interactive "ask the user" steps. The user has already provided the foundation context (\`.agents/product-marketing-context.md\`) below — use it directly.
- Skip any "save to file" steps. Return JSON; the pipeline writes the files.
- Generate output for EVERY route in the page inventory. If a route is missing meta/copy/schema in source, fill it in.
- Propose new pages only when supported by Peec gap evidence (e.g. competitor pages we should counter, fanout queries we don't rank for).
- Quality bar: no marketing-speak, no AI clichés ("revolutionize", "unleash"). Buyer-language, grounded in the context document.

The output MUST be valid JSON conforming to this schema. No prose, no fences:

{
  "perRoute": [
    {
      "route": "/",
      "title": "<55-65 char SEO title — primary keyword first>",
      "description": "<140-160 char meta description framing the value prop, includes primary keyword>",
      "schema": [
        { "@context": "https://schema.org", "@type": "WebPage", "...": "..." }
      ],
      "copy": {
        "hero": "<short hero — value prop in one sentence>",
        "sections": { "<section-slug>": "<2-4 sentence copy>" },
        "cta": "<primary CTA verb phrase>"
      }
    }
  ],
  "newPages": [
    { "route": "/vs/<competitor>", "reason": "<why we're proposing it — Peec gap data>", "copy": "<draft copy>" }
  ],
  "globalSchema": [
    { "@context": "https://schema.org", "@type": "Organization", "...": "..." },
    { "@context": "https://schema.org", "@type": "WebSite", "...": "..." }
  ]
}

`;

function compactAuditFindings(audit: AuditReport): string {
  return audit.findings
    .map((f) => `- [${f.severity.toUpperCase()}] ${f.route} ${f.category}: ${f.message}${f.recommended ? `  → ${f.recommended}` : ""}`)
    .join("\n");
}

function compactInventory(inventory: Inventory): string {
  const routes = inventory.routes.length
    ? inventory.routes.map((r) => `- ${r.path} (${r.framework}, CSR=${r.isCSR}) [${r.filePath}]`).join("\n")
    : "- / (single-page Lovable app — only homepage is in scope)";
  return [
    `Framework: ${inventory.framework}`,
    `Lovable: ${inventory.isLovable}`,
    `Inferred URL: ${inventory.inferredUrl ?? "(none)"}`,
    "Routes:",
    routes,
    `Source files: ${inventory.sourceFiles.length}`,
  ].join("\n");
}

export async function strategy(args: {
  ctx: RunContext;
  inventory: Inventory;
  audit: AuditReport;
  contextMd: string;
}): Promise<StrategyResult> {
  const skillsDir = await findSkillsDir();
  console.log(`[strategy] composing system prompt from ${COMPOSED_SKILLS.length} skills…`);
  const skillBodies: string[] = [];
  for (const name of COMPOSED_SKILLS) {
    skillBodies.push(`# Skill: ${name}\n\n${await loadSkill(skillsDir, name)}`);
  }
  const system = `${STRATEGY_PREAMBLE}\n\n${skillBodies.join("\n\n---\n\n")}`;

  const userMsg = [
    "# Foundation context (.agents/product-marketing-context.md)",
    "",
    args.contextMd,
    "",
    "# Audit findings (technical SEO scan)",
    "",
    compactAuditFindings(args.audit),
    "",
    "# Page inventory",
    "",
    compactInventory(args.inventory),
    "",
    "# Task",
    "",
    "Produce the per-route strategy now. Cover every route in the inventory. Propose `newPages` only with Peec gap evidence cited in `reason`. Output ONLY the JSON.",
  ].join("\n");

  console.log(`[strategy] calling ${env().AGGREGATOR_MODEL} (${system.length} char system, ${userMsg.length} char user)…`);
  const result = await completeJson<StrategyResult>({
    model: env().AGGREGATOR_MODEL,
    max_tokens: 8000,
    system,
    user: userMsg,
    schema: StrategyResultZ,
  });
  console.log(
    `[strategy] → ${result.perRoute.length} per-route directives, ${result.newPages.length} proposed new pages, ${result.globalSchema.length} global schema blocks`,
  );
  return result;
}
