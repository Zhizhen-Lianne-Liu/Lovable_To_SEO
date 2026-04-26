import {
  COMPETITOR_COLORS,
  OWN_BRAND_COLOR,
  createBrand,
  createPrompt,
  deleteBrand,
  deletePrompt,
  listBrands,
  listPrompts,
  type PeecBrand,
  updateBrand,
} from "../clients/peec.js";
import {
  type Competitor,
  type Profile,
  type PromptSet,
  type RunContext,
} from "../types/index.js";

export type PeecPushResult = {
  ownBrand: { id: string; name: string; domain: string };
  competitorsDeleted: number;
  competitorsCreated: { id: string; name: string; domain: string }[];
  promptsDeleted: number;
  promptsCreated: { id: string; text: string }[];
  finalState: { brands: number; prompts: number };
};

export async function peecPush(args: {
  ctx: RunContext;
  profile: Profile;
  competitors: Competitor[];
  prompts: PromptSet;
  projectId?: string;
  dryRun?: boolean;
  countryCode?: string;
}): Promise<PeecPushResult> {
  const { profile, competitors, prompts, dryRun = false, countryCode = "US" } = args;
  const opts = args.projectId ? { projectId: args.projectId } : undefined;

  console.log(`[peec-push] dryRun=${dryRun}`);

  // ---------------- Brands ----------------
  console.log("  [1/5] reading existing brands…");
  const existing = await listBrands(opts);
  const own = existing.filter((b) => b.is_own);
  const competitorsExisting = existing.filter((b) => !b.is_own);
  console.log(`        own=${own.length}  competitors=${competitorsExisting.length}`);
  if (own.length === 0) {
    throw new Error(
      "Project has no is_own=true brand. Create the project + own brand in the Peec UI first.",
    );
  }
  if (own.length > 1) {
    console.warn(`        WARN: project has ${own.length} is_own brands — using the first`);
  }
  const ownBrand = own[0]!;

  const newName = profile.name;
  const newDomain = profile.domain;
  console.log(
    `  [2/5] patching own brand ${ownBrand.id}: '${ownBrand.name}' → '${newName}', domains ${JSON.stringify(ownBrand.domains)} → ['${newDomain}']`,
  );
  let patchedOwn: PeecBrand = ownBrand;
  if (!dryRun) {
    patchedOwn = await updateBrand(
      ownBrand.id,
      { name: newName, domains: [newDomain], color: OWN_BRAND_COLOR },
      opts,
    );
  }

  console.log(`  [3/5] deleting ${competitorsExisting.length} existing competitor(s)…`);
  for (const b of competitorsExisting) {
    console.log(`        - ${b.name} (${b.id})`);
    if (!dryRun) {
      try {
        await deleteBrand(b.id, opts);
      } catch (e) {
        console.warn(`          FAILED: ${(e as Error).message}`);
      }
    }
  }
  // Peec triggers metric recalc on name/domain changes; rapid follow-up writes
  // can race. 2 seconds is plenty in practice.
  if (!dryRun && competitorsExisting.length > 0) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`  [4/5] creating ${competitors.length} new competitor brand(s)…`);
  const created: { id: string; name: string; domain: string }[] = [];
  for (let i = 0; i < competitors.length; i++) {
    const c = competitors[i]!;
    const name =
      c.canonical_name ||
      c.name ||
      ((c.domain.split(".")[0] ?? c.domain).replace(/^./, (ch) => ch.toUpperCase()));
    const domain = c.domain;
    const color = COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]!;
    console.log(`        + ${name.padEnd(24)} ${domain.padEnd(30)} color=${color}`);
    if (dryRun) {
      created.push({ id: `dry-${i}`, name, domain });
      continue;
    }
    try {
      const res = await createBrand({ name, domains: [domain], color }, opts);
      created.push({ id: res.id, name: res.name, domain: res.domains[0] ?? domain });
    } catch (e) {
      console.warn(`          FAILED: ${(e as Error).message}`);
    }
  }

  // ---------------- Prompts ----------------
  console.log("  [5/5] wiping + replacing prompts…");
  const existingPrompts = await listPrompts(opts);
  console.log(`        existing prompts: ${existingPrompts.length}`);
  if (!dryRun) {
    for (const p of existingPrompts) {
      try {
        await deletePrompt(p.id, opts);
      } catch (e) {
        console.warn(`        FAILED to delete prompt ${p.id}: ${(e as Error).message}`);
      }
    }
  }

  const promptsCreated: { id: string; text: string }[] = [];
  for (const p of prompts.prompts) {
    const text = p.query.trim();
    if (!text) continue;
    if (dryRun) {
      promptsCreated.push({ id: p.id, text });
      continue;
    }
    try {
      const res = await createPrompt({ text, country_code: countryCode }, opts);
      promptsCreated.push({ id: res.id, text: res.text });
    } catch (e) {
      console.warn(`        FAILED to create '${text.slice(0, 60)}': ${(e as Error).message}`);
    }
  }
  console.log(
    `        prompts: deleted=${existingPrompts.length} created=${promptsCreated.length}`,
  );

  // ---------------- Verify ----------------
  let finalBrands = existing.length;
  let finalPrompts = existingPrompts.length;
  if (!dryRun) {
    const [b, p] = await Promise.all([listBrands(opts), listPrompts(opts)]);
    finalBrands = b.length;
    finalPrompts = p.length;
    console.log(
      `  [final] project now has ${finalBrands} brand(s) (${b.filter((x) => x.is_own).length} own) and ${finalPrompts} prompt(s)`,
    );
  }

  return {
    ownBrand: { id: patchedOwn.id, name: newName, domain: newDomain },
    competitorsDeleted: competitorsExisting.length,
    competitorsCreated: created,
    promptsDeleted: existingPrompts.length,
    promptsCreated,
    finalState: { brands: finalBrands, prompts: finalPrompts },
  };
}
