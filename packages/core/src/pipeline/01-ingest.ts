import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { type Framework, type Inventory, type RunContext } from "../types/index.js";

const exec = promisify(execFile);

const LOVABLE_SUBDOMAIN = "lovable.app";
const SOURCE_EXTS = new Set([".tsx", ".jsx", ".ts", ".js", ".css", ".html"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  "out",
  "seo",
]);
const MAX_FILES = 60;

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function detectFramework(
  _repoPath: string,
  pkg: Record<string, unknown>,
): Promise<Framework> {
  const deps: Record<string, unknown> = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
  };
  if (deps["@tanstack/start"] || deps["@tanstack/react-start"]) return "tanstack-start";
  if (deps.next) return "next";
  if (deps.astro) return "astro";
  if (deps.vite && deps.react) return "vite-react";
  return "unknown";
}

function detectLovable(pkg: Record<string, unknown>): boolean {
  const deps: Record<string, unknown> = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
  };
  // Strong signal: explicit @lovable.dev/* devDep (TanStack/Vite Lovable presets)
  for (const k of Object.keys(deps)) {
    if (k.startsWith("@lovable.dev/")) return true;
  }
  // Soft signal: vite + react is the typical Lovable starter
  return Boolean(deps.vite && deps.react);
}

async function walkSource(repoPath: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        await recurse(full);
      } else {
        const dot = e.name.lastIndexOf(".");
        const ext = dot === -1 ? "" : e.name.slice(dot);
        if (SOURCE_EXTS.has(ext)) out.push(relative(repoPath, full));
      }
    }
  }
  // Prioritize index.html and src/ — those are what prerender needs.
  if (await fileExists(join(repoPath, "index.html"))) out.push("index.html");
  await recurse(join(repoPath, "src"));
  return out;
}

function inferLovableUrl(remote: string | null): string | null {
  if (!remote) return null;
  const m = remote.match(/[/:]([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  return `https://${m[1]!.toLowerCase()}.${LOVABLE_SUBDOMAIN}`;
}

export async function ingest(args: {
  ctx: RunContext;
  localPath?: string;
}): Promise<Inventory> {
  const repoUrl = args.ctx.repoUrl;
  let cloneDir: string;
  if (args.localPath) {
    cloneDir = args.localPath;
    console.log(`[ingest] using local checkout at ${cloneDir}`);
  } else {
    cloneDir = await mkdtemp(join(tmpdir(), "lts-"));
    console.log(`[ingest] cloning ${repoUrl} → ${cloneDir}`);
    await exec("git", ["clone", "--depth=1", repoUrl, cloneDir]);
  }

  const { stdout: branch } = await exec(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: cloneDir },
  ).catch(() => ({ stdout: "main" }));

  const pkgPath = join(cloneDir, "package.json");
  let pkg: Record<string, unknown> = {};
  if (await fileExists(pkgPath)) {
    pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  }

  const framework = await detectFramework(cloneDir, pkg);
  const isLovable = detectLovable(pkg);
  const inferredUrl = args.localPath ? null : inferLovableUrl(repoUrl);
  const sourceFiles = await walkSource(cloneDir);

  console.log(
    `[ingest] framework=${framework}  isLovable=${isLovable}  files=${sourceFiles.length}  inferredUrl=${inferredUrl ?? "(none)"}`,
  );

  return {
    repoUrl,
    cloneDir,
    defaultBranch: branch.trim(),
    inferredUrl,
    framework,
    isLovable,
    packageJson: pkg,
    sourceFiles,
    routes: [],
  };
}

// Reusable helper for prerender + apply: bounded read of source files.
export async function readSourceFiles(
  inventory: Inventory,
  perFileLimit = 6000,
  totalLimit = 80000,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let used = 0;
  for (const rel of inventory.sourceFiles) {
    if (used >= totalLimit) break;
    const content = await readFile(join(inventory.cloneDir, rel), "utf8");
    const truncated =
      content.length > perFileLimit
        ? `${content.slice(0, perFileLimit)}\n…[truncated]`
        : content;
    out[rel] = truncated;
    used += truncated.length;
  }
  return out;
}
