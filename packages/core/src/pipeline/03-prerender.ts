import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { complete } from "../clients/llm.js";
import { env } from "../config/env.js";
import { type Inventory, type RunContext } from "../types/index.js";
import { readSourceFiles } from "./01-ingest.js";

const PRERENDERER_SYSTEM = `You are the static prerenderer for lovabletoseo.

Your job: convert a Lovable React SPA into a single, valid, deployable
static HTML document. The founder didn't realize their Lovable app is
secretly a Vite + React SPA — meaning Google and ChatGPT see an empty
<div id="root"> and never index the content. You fix that by rendering
the page server-side, into pure HTML, before anything else happens.

# Rules

1. Output ONE complete static HTML document, valid HTML5, starting with
   <!doctype html>. No code fences, no preamble.
2. Use the original index.html as the document skeleton (head, meta tags,
   font links, etc.). Replace the empty <div id="root"></div> with the
   fully-rendered page content.
3. Render every component referenced from App.tsx into static HTML —
   Hero, Features, Pricing, FAQ, CTA, whatever exists. Inline the actual
   text, not placeholders.
4. Preserve the visual style. If the source uses Tailwind utility classes,
   keep them on the rendered elements verbatim — the same CSS bundle from
   the original build will style them.
5. Do NOT improve copy, change wording, add SEO content, or invent
   features. This stage is pure conversion: client-side render → static
   render. Enhancement is the next stage; do not preempt it.
6. Convert React-router routes to anchor links (<a href="/path">). For a
   single-page Lovable app this is just internal section anchors.
7. If the source has interactive widgets (carousels, modals, tabs), pick
   the visible default state and render that. Static.
8. Keep <script type="module" src="..."> tags so the SPA still hydrates
   client-side — we want both: instant indexable HTML AND working
   interactivity. (This is "isomorphic by hand".)

# Output

Return ONLY the HTML document. No commentary, no fences.`;

export type PrerenderResult = {
  pages: Array<{
    route: string;
    htmlPath: string;
    bytes: number;
    sourceFiles: string[];
  }>;
};

function packSources(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `\n=== ${path} ===\n${content}`)
    .join("\n");
}

function stripHtmlFences(html: string): string {
  return html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function prerender(args: {
  ctx: RunContext;
  inventory: Inventory;
}): Promise<PrerenderResult> {
  const { ctx, inventory } = args;
  console.log(`[prerender] reading ${inventory.sourceFiles.length} source files…`);
  const files = await readSourceFiles(inventory);
  const packed = packSources(files);

  const prerenderDir = resolve(ctx.outDir, "prerender");
  await mkdir(prerenderDir, { recursive: true });

  console.log(`[prerender] rendering with ${env().PROFILE_MODEL}…`);
  const raw = await complete({
    model: env().PROFILE_MODEL,
    max_tokens: 8000,
    system: PRERENDERER_SYSTEM,
    user: `# Repo stack: ${inventory.framework}\n# Source files\n${packed}\n\nRender this Lovable app as a single static HTML document. Begin with <!doctype html>.`,
  });
  const html = stripHtmlFences(raw);

  const htmlPath = resolve(prerenderDir, "index.html");
  await writeFile(htmlPath, html, "utf8");
  console.log(`[prerender] wrote ${html.length} bytes → ${htmlPath}`);

  return {
    pages: [
      {
        route: "/",
        htmlPath,
        bytes: html.length,
        sourceFiles: Object.keys(files),
      },
    ],
  };
}
