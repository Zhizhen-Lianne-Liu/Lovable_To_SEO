import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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
  /** Files we'll later read for content extraction. */
  entryFiles: string[];
};

const LOVABLE_SUBDOMAIN = "lovable.app";

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

async function findEntryFiles(repoPath: string): Promise<string[]> {
  const candidates = [
    "index.html",
    "src/App.tsx",
    "src/App.jsx",
    "src/main.tsx",
    "src/pages/index.tsx",
    "src/pages/Index.tsx",
    "src/pages/Home.tsx",
  ];
  const found: string[] = [];
  for (const c of candidates) {
    if (await exists(join(repoPath, c))) found.push(c);
  }
  return found;
}

function inferLovableUrl(remote: string | null, repoPath: string): string | null {
  // Lovable apps publish to <project-slug>.lovable.app. The slug usually matches
  // the repo name. Best-effort — user can override with --url.
  if (!remote) return null;
  const m = remote.match(/[/:]([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  const repoName = m[1].toLowerCase();
  return `https://${repoName}.${LOVABLE_SUBDOMAIN}`;
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
  const stack = await detectStack(dir);
  const entryFiles = await findEntryFiles(dir);
  return {
    path: dir,
    remote: repoUrl,
    defaultBranch: branch.trim(),
    inferredUrl: inferLovableUrl(repoUrl, dir),
    stack,
    entryFiles,
  };
}

/**
 * Use an existing local checkout instead of cloning. Useful when iterating.
 */
export async function ingestLocal(path: string): Promise<RepoMeta> {
  const { stdout: branch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: path,
  }).catch(() => ({ stdout: "main" }));
  const stack = await detectStack(path);
  const entryFiles = await findEntryFiles(path);
  return {
    path,
    remote: null,
    defaultBranch: branch.trim(),
    inferredUrl: null,
    stack,
    entryFiles,
  };
}

/**
 * Read the content of the entry files so the strategist can see the actual
 * source the founder is editing in Lovable. We cap each file to keep prompt
 * size reasonable.
 */
export async function readEntryFiles(
  meta: RepoMeta,
  perFileLimit = 8000,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of meta.entryFiles) {
    const content = await readFile(join(meta.path, rel), "utf8");
    out[rel] = content.length > perFileLimit ? `${content.slice(0, perFileLimit)}\n…[truncated]` : content;
  }
  return out;
}
