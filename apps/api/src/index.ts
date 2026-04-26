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

app.post("/api/scan", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as ScanRequestBody;
  const url = (body.url ?? "").trim();

  if (DEMO_MODE === "baked") {
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
