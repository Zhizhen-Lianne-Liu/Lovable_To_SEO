import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.LOVABLETOSEO_API_PORT ?? 3001);

const HERE = dirname(fileURLToPath(import.meta.url));
// dev script runs from apps/api/; src/index.ts → ../../../ to repo root.
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const BAKED_PATH = resolve(REPO_ROOT, "examples", "founder-mvp", "baked-scan.json");
const CLI_PATH = resolve(REPO_ROOT, "packages", "core", "src", "cli.ts");

const app = new Hono();

app.use("/*", cors({ origin: ["http://localhost:5173", "http://localhost:8788"] }));

app.get("/api/health", (c) =>
  c.json({ ok: true, mode: "baked-for-flowmetrics + live-pipeline-for-other" }),
);

type ScanRequestBody = { url?: string };

// flowmetricsorg.lovable.app + its bare GitHub-derived sibling get the
// pre-baked findings (instant + free). Anything else triggers a real pipeline
// run via the `lts scan-domain` subcommand.
const BAKED_URLS = ["flowmetricsorg.lovable.app", "flowmetrics-landing-page.lovable.app"];

function normalizeForMatch(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function isBaked(url: string): boolean {
  const norm = normalizeForMatch(url);
  return BAKED_URLS.some((u) => norm === u || norm.startsWith(u + "/"));
}

function isPlausibleDomain(url: string): boolean {
  const norm = normalizeForMatch(url);
  // Reject empty, malformed, IP-only, single-label hostnames.
  if (!norm) return false;
  if (norm.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(norm.split("/")[0] ?? "")) return false;
  const host = norm.split("/")[0]!;
  if (!host.includes(".")) return false;
  return true;
}

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function runScanDomain(domain: string): Promise<SpawnResult> {
  return new Promise((resolveFn, rejectFn) => {
    // Use the user's npx so PATH resolution works regardless of how the API
    // was started. tsx is in the workspace devDeps so it's hoisted.
    const child = spawn(
      "npx",
      ["tsx", CLI_PATH, "scan-domain", "--domain", domain, "--limit"],
      {
        cwd: REPO_ROOT,
        env: process.env,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Mirror to api stdout so operators can watch progress.
      process.stdout.write(`[scan-domain] ${text}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[scan-domain:err] ${text}`);
    });
    child.on("error", (e) => rejectFn(e));
    child.on("close", (code) =>
      resolveFn({ exitCode: code ?? 1, stdout, stderr }),
    );
  });
}

app.post("/api/scan", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ScanRequestBody;
  const url = (body.url ?? "").trim();

  // Path 1 — flowmetrics: serve the pre-baked findings instantly.
  if (isBaked(url)) {
    let baked: unknown;
    try {
      baked = JSON.parse(await readFile(BAKED_PATH, "utf8"));
    } catch (e) {
      return c.json(
        {
          error: "BAKED_NOT_FOUND",
          message: `Could not read ${BAKED_PATH}. Run the pipeline once to populate it.`,
          detail: (e as Error).message,
        },
        500,
      );
    }
    return c.json({
      ...(baked as Record<string, unknown>),
      _input: { url, demo: true, source: "baked" },
    });
  }

  // Path 2 — anything else: real pipeline run via subprocess.
  if (!isPlausibleDomain(url)) {
    return c.json(
      {
        error: "INVALID_URL",
        message: "Paste a domain like example.com or https://example.com.",
      },
      400,
    );
  }

  const domain = normalizeForMatch(url).split("/")[0]!;
  console.log(`[api] live scan starting for ${domain}…`);
  const t0 = Date.now();

  let result: SpawnResult;
  try {
    result = await runScanDomain(domain);
  } catch (e) {
    return c.json(
      {
        error: "PIPELINE_SPAWN_FAILED",
        message: `Couldn't start the pipeline subprocess: ${(e as Error).message}`,
      },
      500,
    );
  }
  const elapsedSec = Math.round((Date.now() - t0) / 1000);

  if (result.exitCode !== 0) {
    return c.json(
      {
        error: "PIPELINE_FAILED",
        message:
          `Pipeline exited with code ${result.exitCode} after ${elapsedSec}s. ` +
          (result.stderr.slice(-400) || result.stdout.slice(-400) || "(no output)"),
      },
      500,
    );
  }

  // Last line of stdout is `SCAN_RESULT_PATH=<absolute path>`.
  const match = result.stdout.match(/SCAN_RESULT_PATH=(.+)$/m);
  if (!match || !match[1]) {
    return c.json(
      {
        error: "PIPELINE_NO_RESULT",
        message: `Pipeline finished in ${elapsedSec}s but didn't emit a result path.`,
      },
      500,
    );
  }
  const resultPath = match[1].trim();
  const scan = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
  console.log(`[api] live scan ok (${elapsedSec}s) → ${resultPath}`);
  return c.json({
    ...scan,
    _input: { url, demo: false, source: "live", elapsedSec },
  });
});

console.log(`[api] listening on http://localhost:${PORT}`);
console.log(`[api] flowmetrics URLs → baked. Other URLs → live pipeline (${CLI_PATH}).`);
serve({ fetch: app.fetch, port: PORT });
