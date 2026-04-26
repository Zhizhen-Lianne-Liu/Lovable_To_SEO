import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.LOVABLETOSEO_API_PORT ?? 3001);
const DEMO_MODE = (process.env.DEMO_MODE ?? "baked").toLowerCase();

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve repo root → examples/founder-mvp/baked-scan.json. The dev script
// runs from apps/api/, so we walk up two levels.
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const BAKED_PATH = resolve(REPO_ROOT, "examples", "founder-mvp", "baked-scan.json");

const app = new Hono();

app.use("/*", cors({ origin: ["http://localhost:5173", "http://localhost:8788"] }));

app.get("/api/health", (c) => c.json({ ok: true, demoMode: DEMO_MODE }));

type ScanRequestBody = { url?: string };

// The single URL the baked demo has real findings for. Anything else returns a
// friendly "demo doesn't cover this URL yet" so the UI doesn't pretend to have
// run the pipeline against a domain it didn't.
const SUPPORTED_URLS = ["flowmetricsorg.lovable.app", "flowmetrics-landing-page.lovable.app"];

function normalizeForMatch(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function isSupported(url: string): boolean {
  const norm = normalizeForMatch(url);
  return SUPPORTED_URLS.some((u) => norm === u || norm.startsWith(u + "/"));
}

app.post("/api/scan", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ScanRequestBody;
  const url = (body.url ?? "").trim();

  if (DEMO_MODE === "baked") {
    if (!isSupported(url)) {
      return c.json(
        {
          error: "URL_NOT_IN_DEMO",
          message:
            `The demo currently shows real findings for https://flowmetricsorg.lovable.app — ` +
            `the live run that produced PR #2 on the comodoc/flowmetrics-landing-page repo. ` +
            `Try that URL to see the actual pipeline output. Other domains require running ` +
            `the CLI: \`npx tsx packages/core/src/cli.ts run --repo <url>\`.`,
        },
        404,
      );
    }
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
    // Echo back the user's URL so the landing displays it in the diagnosis.
    return c.json({
      ...(baked as Record<string, unknown>),
      _input: { url, demo: true },
    });
  }

  return c.json(
    {
      error: "DEMO_ONLY",
      message:
        "Live pipeline runs are not exposed by this demo API. Set DEMO_MODE=baked to use the prebuilt example, or run the CLI: `npm run dev -- run --repo <url>`.",
    },
    501,
  );
});

console.log(`[api] listening on http://localhost:${PORT}  (demoMode=${DEMO_MODE})`);
serve({ fetch: app.fetch, port: PORT });
