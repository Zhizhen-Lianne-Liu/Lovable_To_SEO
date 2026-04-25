import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);

export type RepoMeta = {
  /** Local path to the working tree (cloned tmp dir, or user-supplied --path). */
  path: string;
  /** Original git remote URL if cloned, otherwise null. */
  remote: string | null;
  /** Default branch name we cloned. */
  defaultBranch: string;
  /** Inferred Lovable preview URL (best-effort, may be null). */
  inferredUrl: string | null;
  /** What we detected the stack to be. */
  stack: "vite-react" | "next" | "astro" | "unknown";
  /** Source files we'll feed to the prerender stage. Repo-relative paths. */
  sourceFiles: string[];
};

const LOVABLE_SUBDOMAIN = "lovable.app";
const SOURCE_EXTS = new Set([".tsx", ".jsx", ".ts", ".js", ".css", ".html"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", "out", "seo"]);
const MAX_FILES = 60;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function detectStack(repoPath: string): Promise<RepoMeta["stack"]> {
  const pkgPath = join(repoPath, "package.json");
  if (!(await exists(pkgPath))) return "unknown";
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vite && deps.react) return "vite-react";
  if (deps.next) return "next";
  if (deps.astro) return "astro";
  return "unknown";
}

async function walkSource(repoPath: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string) {
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
  // Prioritize index.html and src/ — those are what the prerender stage needs.
  if (await exists(join(repoPath, "index.html"))) out.push("index.html");
  await recurse(join(repoPath, "src"));
  return out;
}

function inferLovableUrl(remote: string | null): string | null {
  if (!remote) return null;
  const m = remote.match(/[/:]([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  return `https://${m[1].toLowerCase()}.${LOVABLE_SUBDOMAIN}`;
}

/**
 * Clone a GitHub repo into a tmp dir for the run. Returns metadata used by
 * later stages.
 */
export async function ingestRepo(repoUrl: string): Promise<RepoMeta> {
  const dir = await mkdtemp(join(tmpdir(), "ltseo-"));
  await exec("git", ["clone", "--depth=1", repoUrl, dir]);
  const { stdout: branch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: dir,
  });
  return {
    path: dir,
    remote: repoUrl,
    defaultBranch: branch.trim(),
    inferredUrl: inferLovableUrl(repoUrl),
    stack: await detectStack(dir),
    sourceFiles: await walkSource(dir),
  };
}

/**
 * Use an existing local checkout instead of cloning. Useful when iterating.
 */
export async function ingestLocal(path: string): Promise<RepoMeta> {
  const { stdout: branch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: path,
  }).catch(() => ({ stdout: "main" }));
  return {
    path,
    remote: null,
    defaultBranch: branch.trim(),
    inferredUrl: null,
    stack: await detectStack(path),
    sourceFiles: await walkSource(path),
  };
}

/**
 * Read source-file contents for prerender. Per-file cap keeps prompt size
 * bounded; aggregate cap keeps total tokens reasonable.
 */
export async function readSourceFiles(
  meta: RepoMeta,
  perFileLimit = 6000,
  totalLimit = 80000,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let used = 0;
  for (const rel of meta.sourceFiles) {
    if (used >= totalLimit) break;
    const content = await readFile(join(meta.path, rel), "utf8");
    const truncated = content.length > perFileLimit
      ? `${content.slice(0, perFileLimit)}\n…[truncated]`
      : content;
    out[rel] = truncated;
    used += truncated.length;
  }
  return out;
}
