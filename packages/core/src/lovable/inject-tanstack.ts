// TanStack Start / TanStack Router code mods for Lovable repos.
//
// Strategy ("fix it inside their stack"):
//   1. Generate `src/lovabletoseo/meta.ts` — a colocated, fully-managed
//      module that exports our meta + links + scripts arrays. The founder
//      can find and read it but the line "lovabletoseo:managed" tells them
//      not to edit (it's regenerated on every run).
//   2. Edit `src/routes/__root.tsx` to import that module and spread its
//      arrays into `Route.head()`'s meta / links / scripts arrays. The
//      spread sits between markers so re-runs are idempotent and the
//      founder can still freely add their own entries alongside.
//
// What this preserves:
//   - The framework idiom (TanStack's head() pattern, not a foreign DOM mutation)
//   - The Lovable round-trip (founder reopens in Lovable → normal TS code)
//   - Idempotency (re-running APPLY twice doesn't duplicate or break)
//   - Founder agency (they keep editing __root.tsx; only the imported
//     module is "ours").

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const MARKER_START = "// lovabletoseo:start";
const MARKER_END = "// lovabletoseo:end";
const IMPORT_MARKER_START = "/* lovabletoseo:import-start */";
const IMPORT_MARKER_END = "/* lovabletoseo:import-end */";
const IMPORT_PATH = "@/lovabletoseo/meta";
const META_MODULE_REL = "src/lovabletoseo/meta.ts";
const ROOT_ROUTE_REL = "src/routes/__root.tsx";

export type TanstackInjection = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  jsonLd?: Array<Record<string, unknown>>;
};

export type TanstackInjectionResult = {
  changedFiles: string[];
  newFiles: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// 1. Generate the meta module
// ---------------------------------------------------------------------------

function buildMetaModule(inj: TanstackInjection): string {
  const ogTitle = inj.ogTitle ?? inj.title;
  const ogDesc = inj.ogDescription ?? inj.description;
  const card = inj.twitterCard ?? "summary_large_image";

  const meta: Array<Record<string, unknown>> = [
    { title: inj.title },
    { name: "description", content: inj.description },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: ogDesc },
    { property: "og:url", content: inj.canonicalUrl },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: card },
    { name: "twitter:title", content: ogTitle },
    { name: "twitter:description", content: ogDesc },
  ];
  if (inj.ogImage) {
    meta.push({ property: "og:image", content: inj.ogImage });
    meta.push({ name: "twitter:image", content: inj.ogImage });
  }

  const links = [{ rel: "canonical", href: inj.canonicalUrl }];

  const scripts = (inj.jsonLd ?? []).map((block) => ({
    type: "application/ld+json",
    children: JSON.stringify(block),
  }));

  return [
    "// lovabletoseo:managed — AUTO-GENERATED. Edit the pipeline strategy",
    "// and re-run `lts run` rather than editing this file directly. It is",
    "// recreated on every run.",
    "",
    "export const lovabletoseoMeta = " + JSON.stringify(meta, null, 2) + ";",
    "",
    "export const lovabletoseoLinks = " + JSON.stringify(links, null, 2) + ";",
    "",
    "export const lovabletoseoScripts = " + JSON.stringify(scripts, null, 2) + ";",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 2. Edit __root.tsx
// ---------------------------------------------------------------------------

// Walk forward from `startIndex` (right after the matching open) until depth
// returns to 0. Skips chars inside string literals to avoid false matches on
// brackets in content strings.
function findMatchingClose(src: string, startIndex: number, open: string, close: string): number {
  let depth = 1;
  let i = startIndex;
  while (i < src.length) {
    const ch = src[i]!;
    // Skip strings — single, double, backtick.
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Skip line + block comments.
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function ensureImport(src: string): string {
  if (src.includes(IMPORT_PATH)) return src;
  // Insert right after the last `import ... from "..."` statement.
  const importRe = /^import\s[\s\S]+?from\s+["'][^"']+["'];?\s*$/gm;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  const importBlock = [
    "",
    IMPORT_MARKER_START,
    `import { lovabletoseoMeta, lovabletoseoLinks, lovabletoseoScripts } from "${IMPORT_PATH}";`,
    IMPORT_MARKER_END,
  ].join("\n");
  if (lastEnd === -1) {
    return importBlock.trimStart() + "\n" + src;
  }
  return src.slice(0, lastEnd) + importBlock + src.slice(lastEnd);
}

function spreadBlock(spreadName: string): string {
  return [
    "      " + MARKER_START,
    `      ...${spreadName},`,
    "      " + MARKER_END,
  ].join("\n");
}

// Replace any prior marker block (idempotent re-runs) so we never duplicate.
//
// IMPORTANT: between the start marker and the `...spreadName` line there must
// be ONLY whitespace, not any character. Earlier we used `[\s\S]*?` which is
// lazy but combined with the `...spreadName` anchor it would happily span
// multiple marker blocks — e.g. when stripping `lovabletoseoLinks` it could
// match from the meta block's START all the way to the links block's END,
// eating the user's content in between. `\s+` keeps the strip surgical.
function stripPriorBlock(src: string, spreadName: string): string {
  const startEsc = MARKER_START.replace(/\//g, "\\/");
  const endEsc = MARKER_END.replace(/\//g, "\\/");
  const re = new RegExp(
    `[ \\t]*${startEsc}\\s+\\.\\.\\.${spreadName},?\\s+${endEsc}\\s*\\n?`,
    "g",
  );
  return src.replace(re, "");
}

// Inject `...spreadName,` (wrapped in markers) at the END of the array
// associated with `key:` inside the head() return object. If the array
// doesn't exist, do nothing — caller decides whether to add it.
function injectIntoArrayKey(
  src: string,
  headStart: number,
  headClose: number,
  key: string,
  spreadName: string,
): { updated: string; ok: boolean } {
  const regionBefore = src.slice(0, headStart);
  const region = src.slice(headStart, headClose);
  const regionAfter = src.slice(headClose);

  // Strip any prior block for this spread within the region first.
  const cleaned = stripPriorBlock(region, spreadName);

  const keyRe = new RegExp(`\\b${key}\\s*:\\s*\\[`, "g");
  const m = keyRe.exec(cleaned);
  if (!m) return { updated: src, ok: false };

  // headStart is the index of `(` after `head`; we offset relative to cleaned region
  const arrayOpen = m.index + m[0].length; // position right after `[`
  // Convert to absolute coordinates within cleaned (region-relative) — but
  // we'll work entirely in the region here, then reassemble.
  const relCloseIdx = findMatchingClose(cleaned, arrayOpen, "[", "]");
  if (relCloseIdx === -1) return { updated: src, ok: false };

  // Insert our spread block right before the closing `]`. Make sure there
  // is a comma after the previous entry.
  const before = cleaned.slice(0, relCloseIdx);
  const after = cleaned.slice(relCloseIdx);
  const trimmed = before.replace(/\s+$/, "");
  const needsComma = trimmed.length > 0 && !trimmed.endsWith(",") && !trimmed.endsWith("[");
  const insertion = (needsComma ? "," : "") + "\n" + spreadBlock(spreadName) + "\n    ";
  const newRegion = trimmed + insertion + after;

  return { updated: regionBefore + newRegion + regionAfter, ok: true };
}

// Add a brand-new key at the end of the head()'s return object:
// e.g. `scripts: [ ... ]` if the founder's head() didn't have a scripts array.
//
// `headStart` is the index of the first char inside the `{` of the return
// object literal. `headClose` is the index of its matching `}`. So the
// content (no braces) is `src.slice(headStart, headClose)`. We append the
// new key at the end of that content — never search for `}` inside it,
// which would hit nested objects (link entries etc.).
function injectNewArrayKey(
  src: string,
  headStart: number,
  headClose: number,
  key: string,
  spreadName: string,
): string {
  const regionBefore = src.slice(0, headStart);
  const region = src.slice(headStart, headClose);
  const regionAfter = src.slice(headClose); // starts with `}` of head's return
  const cleaned = stripPriorBlock(region, spreadName);

  const keyRe = new RegExp(`\\b${key}\\s*:\\s*\\[`);
  if (keyRe.test(cleaned)) return src; // present — caller should have used injectIntoArrayKey

  const trimmed = cleaned.replace(/\s+$/, "");
  const needsComma = trimmed.length > 0 && !trimmed.endsWith(",") && !trimmed.endsWith("{");
  const insertion =
    (needsComma ? "," : "") +
    "\n    " +
    key +
    ": [\n" +
    spreadBlock(spreadName) +
    "\n    ],\n  ";
  return regionBefore + trimmed + insertion + regionAfter;
}

function editRootRoute(src: string): { updated: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = ensureImport(src);

  // Locate the head() function inside createRootRoute({ head: () => ({ ... }) }).
  // We look for `head:` followed by `() => ({`. Be lenient about whitespace.
  const headRe = /\bhead\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g;
  const m = headRe.exec(out);
  if (!m) {
    warnings.push("Could not find a `head: () => ({...})` pattern in __root.tsx — skipping route edits.");
    return { updated: out, warnings };
  }
  // Position right after the `{` of the returned object literal.
  const objOpen = m.index + m[0].length;
  const objClose = findMatchingClose(out, objOpen, "{", "}");
  if (objClose === -1) {
    warnings.push("Could not find the matching `}` for head()'s return object.");
    return { updated: out, warnings };
  }

  // Inject ...lovabletoseoMeta into meta: [ ... ]
  const r1 = injectIntoArrayKey(out, objOpen, objClose, "meta", "lovabletoseoMeta");
  if (r1.ok) out = r1.updated;
  else warnings.push("No `meta: [...]` array found in head() — skipped meta injection.");

  // Re-find the object since out may have shifted.
  const m2 = /\bhead\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g.exec(out);
  if (!m2) return { updated: out, warnings };
  const o2 = m2.index + m2[0].length;
  const c2 = findMatchingClose(out, o2, "{", "}");

  // Inject ...lovabletoseoLinks into links: [ ... ] (links typically already exists for stylesheet).
  const r2 = injectIntoArrayKey(out, o2, c2, "links", "lovabletoseoLinks");
  if (r2.ok) out = r2.updated;
  else {
    // Add a brand-new links: [...] key.
    const m2b = /\bhead\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g.exec(out);
    if (m2b) {
      const o2b = m2b.index + m2b[0].length;
      const c2b = findMatchingClose(out, o2b, "{", "}");
      out = injectNewArrayKey(out, o2b, c2b, "links", "lovabletoseoLinks");
    }
  }

  // Inject ...lovabletoseoScripts into scripts: [ ... ], creating the key if absent.
  const m3 = /\bhead\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g.exec(out);
  if (!m3) return { updated: out, warnings };
  const o3 = m3.index + m3[0].length;
  const c3 = findMatchingClose(out, o3, "{", "}");

  const r3 = injectIntoArrayKey(out, o3, c3, "scripts", "lovabletoseoScripts");
  if (!r3.ok) {
    const m3b = /\bhead\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g.exec(out);
    if (m3b) {
      const o3b = m3b.index + m3b[0].length;
      const c3b = findMatchingClose(out, o3b, "{", "}");
      out = injectNewArrayKey(out, o3b, c3b, "scripts", "lovabletoseoScripts");
    }
  } else {
    out = r3.updated;
  }

  return { updated: out, warnings };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function injectTanstack(args: {
  cloneDir: string;
  injection: TanstackInjection;
}): Promise<TanstackInjectionResult> {
  const result: TanstackInjectionResult = {
    changedFiles: [],
    newFiles: [],
    warnings: [],
  };

  const metaPath = resolve(args.cloneDir, META_MODULE_REL);
  const rootPath = resolve(args.cloneDir, ROOT_ROUTE_REL);

  // 1. Write the managed meta module — only if content actually differs,
  //    so re-runs don't dirty git for no reason.
  const metaSrc = buildMetaModule(args.injection);
  const metaExisting = existsSync(metaPath) ? await readFile(metaPath, "utf8") : null;
  if (metaExisting === null) {
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, metaSrc, "utf8");
    result.newFiles.push(META_MODULE_REL);
  } else if (metaExisting !== metaSrc) {
    await writeFile(metaPath, metaSrc, "utf8");
    result.changedFiles.push(META_MODULE_REL);
  }

  // 2. Edit __root.tsx.
  if (!existsSync(rootPath)) {
    result.warnings.push(
      `${ROOT_ROUTE_REL} not found — generated meta module won't be wired up. ` +
        "If your TanStack route file lives elsewhere, import { lovabletoseoMeta, lovabletoseoLinks, lovabletoseoScripts } from '" +
        IMPORT_PATH +
        "' and spread them into your head() arrays manually.",
    );
    return result;
  }
  const before = await readFile(rootPath, "utf8");
  const { updated, warnings } = editRootRoute(before);
  result.warnings.push(...warnings);
  if (updated !== before) {
    await writeFile(rootPath, updated, "utf8");
    result.changedFiles.push(ROOT_ROUTE_REL);
  }

  return result;
}
