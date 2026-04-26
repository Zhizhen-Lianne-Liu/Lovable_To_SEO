// Cross-link the generated /vs/* and /guides/* pages from a discreet nav
// strip injected at the bottom of TanStack's RootShell, so visitors (and
// AI crawlers traversing the site) discover all the new pages from any
// page they land on.
//
// Strategy:
//   1. Generate `src/lovabletoseo/nav.tsx` — exports a <LovabletoseoNav />
//      component with TanStack <Link> elements to every generated page,
//      grouped by archetype (compare vs guide).
//   2. Edit `src/routes/__root.tsx` to:
//      - import LovabletoseoNav (with marker block)
//      - render <LovabletoseoNav /> right before <Scripts /> in RootShell
//        (with marker block)
//
// Idempotent: re-runs replace the nav module + the JSX block. Founder's
// custom Header in the homepage layout stays untouched — this is a
// low-prominence sub-footer that doesn't conflict.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const NAV_MODULE_REL = "src/lovabletoseo/nav.tsx";
const ROOT_ROUTE_REL = "src/routes/__root.tsx";
const NAV_IMPORT_START = "/* lovabletoseo:nav-import-start */";
const NAV_IMPORT_END = "/* lovabletoseo:nav-import-end */";
const NAV_RENDER_START = "{/* lovabletoseo:nav-start */}";
const NAV_RENDER_END = "{/* lovabletoseo:nav-end */}";

export type NavLink = {
  route: string;
  label: string;
  group: "compare" | "guide";
};

export type InjectNavArgs = {
  cloneDir: string;
  brand: string;
  links: NavLink[];
};

export type InjectNavResult = {
  newFiles: string[];
  changedFiles: string[];
  warnings: string[];
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeJsxText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

// ---------------------------------------------------------------------------
// 1. Generate src/lovabletoseo/nav.tsx
// ---------------------------------------------------------------------------

function buildNavModule(args: { brand: string; links: NavLink[] }): string {
  const compareLinks = args.links.filter((l) => l.group === "compare");
  const guideLinks = args.links.filter((l) => l.group === "guide");

  const renderLinkArray = (links: NavLink[]): string =>
    links
      .map(
        (l) =>
          `  { to: "${escapeAttr(l.route)}", label: "${escapeAttr(l.label)}" }`,
      )
      .join(",\n");

  const compareSection =
    compareLinks.length > 0
      ? `        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground/70">Compare</span>
          {compareLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>`
      : "";

  const guideSection =
    guideLinks.length > 0
      ? `        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground/70">Guides</span>
          {guideLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>`
      : "";

  return `// lovabletoseo:managed — AUTO-GENERATED. Edit the strategy + re-run rather than editing this file directly.
import { Link } from "@tanstack/react-router";

export const compareLinks = [
${renderLinkArray(compareLinks)}
];

export const guideLinks = [
${renderLinkArray(guideLinks)}
];

export function LovabletoseoNav() {
  if (compareLinks.length === 0 && guideLinks.length === 0) return null;
  return (
    <aside
      aria-label="${escapeAttr(args.brand)} — more pages"
      className="border-t bg-card/50"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-8">
${compareSection}
${guideSection}
      </div>
    </aside>
  );
}
`;
}

// ---------------------------------------------------------------------------
// 2. Edit __root.tsx — add import + render block
// ---------------------------------------------------------------------------

const NAV_IMPORT_BLOCK = [
  NAV_IMPORT_START,
  `import { LovabletoseoNav } from "@/lovabletoseo/nav";`,
  NAV_IMPORT_END,
].join("\n");

const NAV_RENDER_BLOCK = [
  `        ${NAV_RENDER_START}`,
  `        <LovabletoseoNav />`,
  `        ${NAV_RENDER_END}`,
].join("\n");

function ensureNavImport(src: string): string {
  if (src.includes(NAV_IMPORT_START)) {
    // Replace existing block (idempotent).
    const re = new RegExp(
      `${NAV_IMPORT_START.replace(/[/*]/g, "\\$&")}[\\s\\S]*?${NAV_IMPORT_END.replace(/[/*]/g, "\\$&")}`,
    );
    return src.replace(re, NAV_IMPORT_BLOCK);
  }
  // Insert right after the last import statement.
  const importRe = /^import\s[\s\S]+?from\s+["'][^"']+["'];?\s*$/gm;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd === -1) {
    return NAV_IMPORT_BLOCK + "\n" + src;
  }
  return src.slice(0, lastEnd) + "\n" + NAV_IMPORT_BLOCK + src.slice(lastEnd);
}

function ensureNavRender(src: string): { updated: string; injected: boolean; warning?: string } {
  // Already-marked block? Idempotent re-insert.
  const startEsc = NAV_RENDER_START.replace(/[/*{}]/g, "\\$&");
  const endEsc = NAV_RENDER_END.replace(/[/*{}]/g, "\\$&");
  const existing = new RegExp(
    `[ \\t]*${startEsc}\\s*[\\s\\S]*?${endEsc}\\s*\\n?`,
  );
  let cleaned = src.replace(existing, "");

  // Look for `<Scripts />` (or `<Scripts/>`) — TanStack's RootShell convention.
  const scriptsRe = /^[ \t]*<Scripts\s*\/?>$/m;
  const m = cleaned.match(scriptsRe);
  if (m && m.index !== undefined) {
    const before = cleaned.slice(0, m.index);
    const after = cleaned.slice(m.index);
    cleaned = before + NAV_RENDER_BLOCK + "\n" + after;
    return { updated: cleaned, injected: true };
  }
  // Fallback: look for `</body>`. Less elegant but covers custom shells.
  const bodyClose = cleaned.indexOf("</body>");
  if (bodyClose !== -1) {
    cleaned = cleaned.slice(0, bodyClose) + NAV_RENDER_BLOCK + "\n      " + cleaned.slice(bodyClose);
    return { updated: cleaned, injected: true };
  }
  return {
    updated: cleaned,
    injected: false,
    warning:
      "Could not locate <Scripts /> or </body> in __root.tsx — nav module written but not auto-rendered. Add <LovabletoseoNav /> manually inside RootShell.",
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function injectTanstackNav(args: InjectNavArgs): Promise<InjectNavResult> {
  const result: InjectNavResult = { newFiles: [], changedFiles: [], warnings: [] };

  if (args.links.length === 0) return result;

  const navPath = resolve(args.cloneDir, NAV_MODULE_REL);
  const rootPath = resolve(args.cloneDir, ROOT_ROUTE_REL);

  // 1. Write nav.tsx (only if content differs).
  const navSrc = buildNavModule({ brand: args.brand, links: args.links });
  const navExisting = existsSync(navPath) ? await readFile(navPath, "utf8") : null;
  if (navExisting === null) {
    await mkdir(dirname(navPath), { recursive: true });
    await writeFile(navPath, navSrc, "utf8");
    result.newFiles.push(NAV_MODULE_REL);
  } else if (navExisting !== navSrc) {
    await writeFile(navPath, navSrc, "utf8");
    result.changedFiles.push(NAV_MODULE_REL);
  }

  // 2. Edit __root.tsx (idempotent).
  if (!existsSync(rootPath)) {
    result.warnings.push(
      `${ROOT_ROUTE_REL} not found — nav module written but not wired up.`,
    );
    return result;
  }
  const rootBefore = await readFile(rootPath, "utf8");
  let rootAfter = ensureNavImport(rootBefore);
  const renderResult = ensureNavRender(rootAfter);
  rootAfter = renderResult.updated;
  if (renderResult.warning) result.warnings.push(renderResult.warning);
  if (rootAfter !== rootBefore) {
    await writeFile(rootPath, rootAfter, "utf8");
    if (!result.changedFiles.includes(ROOT_ROUTE_REL)) {
      result.changedFiles.push(ROOT_ROUTE_REL);
    }
  }
  return result;
}

// Helper: derive a friendly label from a route. "/vs/klipfolio" → "vs Klipfolio".
export function defaultLabelForRoute(route: string): { label: string; group: "compare" | "guide" } {
  const parts = route.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const titled = last
    .split(/[-_]/)
    .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : ""))
    .join(" ");
  if (parts[0] === "vs" || parts[0] === "compare") {
    return { label: `vs ${titled}`, group: "compare" };
  }
  return { label: titled, group: "guide" };
}
