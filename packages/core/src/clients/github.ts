// GitHub auth + push abstraction.
//
// Two backends, picked at runtime in this priority order:
//   1. GitHub App (when GITHUB_APP_* env vars are set) — proper for
//      production / multi-tenant. Not implemented in v1; throws if selected.
//   2. gh CLI subprocess — works immediately when the user has `gh`
//      installed + authenticated locally. This is the v1 default for the
//      hackathon demo.
//
// Adding the App backend later is a mechanical swap: implement push() +
// openPullRequest() to use @octokit/auth-app + @octokit/rest, and the
// pipeline doesn't change.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { envOptional } from "../config/env.js";

const exec = promisify(execFile);

export type Backend = "gh-cli" | "github-app";

export class GitHubError extends Error {
  constructor(
    public readonly code:
      | "AUTH"
      | "NO_GH_CLI"
      | "PUSH_DENIED"
      | "PR_FAILED"
      | "NETWORK"
      | "NOT_IMPLEMENTED",
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export function pickBackend(): Backend {
  const e = envOptional();
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY) return "github-app";
  return "gh-cli";
}

async function ghAuthOk(): Promise<{ ok: boolean; err?: string }> {
  try {
    await exec("gh", ["auth", "status"]);
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT") return { ok: false, err: "`gh` CLI not installed" };
    return { ok: false, err: err.stderr || err.message || "gh auth status failed" };
  }
}

async function git(cwd: string, ...argv: string[]): Promise<string> {
  const { stdout } = await exec("git", argv, { cwd, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

export type PushArgs = {
  cwd: string;
  branch: string;
  commitMessage: string;
  commitBody?: string;
};

export type PushResult = {
  branch: string;
  commitSha: string;
};

export async function pushBranchWithChanges(args: PushArgs): Promise<PushResult> {
  const backend = pickBackend();
  if (backend === "github-app") {
    throw new GitHubError(
      "NOT_IMPLEMENTED",
      "GitHub App backend not implemented in v1. Unset GITHUB_APP_* to fall back to gh CLI.",
    );
  }
  const auth = await ghAuthOk();
  if (!auth.ok) {
    throw new GitHubError(
      auth.err?.includes("not installed") ? "NO_GH_CLI" : "AUTH",
      auth.err ?? "gh auth status failed",
    );
  }

  // Branch + commit + push
  await git(args.cwd, "checkout", "-B", args.branch);
  await git(args.cwd, "add", "-A");
  // If there are no staged changes, git commit will fail. Detect.
  const status = await git(args.cwd, "status", "--porcelain");
  if (!status.trim()) {
    throw new GitHubError("PUSH_DENIED", "Nothing to commit — APPLY produced no changes.");
  }
  const message = args.commitBody
    ? `${args.commitMessage}\n\n${args.commitBody}`
    : args.commitMessage;
  await git(args.cwd, "commit", "-m", message);
  const sha = await git(args.cwd, "rev-parse", "HEAD");

  try {
    await git(args.cwd, "push", "--set-upstream", "origin", args.branch);
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const text = err.stderr || err.message || "";
    const denied = /denied|permission|403|401/i.test(text);
    throw new GitHubError(
      denied ? "PUSH_DENIED" : "NETWORK",
      `git push failed: ${text.slice(0, 300)}\n\nIf this is your repo, run \`gh auth setup-git\` so git uses gh's credentials. If it isn't, see the README for the fork-and-PR flow (v2).`,
    );
  }

  return { branch: args.branch, commitSha: sha };
}

export type OpenPrArgs = {
  cwd: string;
  base: string;
  head: string;
  title: string;
  body: string;
};

export async function openPullRequest(args: OpenPrArgs): Promise<{ url: string }> {
  const backend = pickBackend();
  if (backend === "github-app") {
    throw new GitHubError("NOT_IMPLEMENTED", "GitHub App backend not implemented in v1.");
  }
  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "create", "--base", args.base, "--head", args.head, "--title", args.title, "--body", args.body],
      { cwd: args.cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const url = stdout.trim().split("\n").pop() ?? "";
    return { url };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new GitHubError("PR_FAILED", `gh pr create failed: ${(err.stderr || err.message || "").slice(0, 300)}`);
  }
}
