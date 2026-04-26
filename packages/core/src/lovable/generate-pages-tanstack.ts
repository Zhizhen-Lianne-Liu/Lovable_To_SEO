// Generate full TanStack Start route files for the strategy.newPages directives.
//
// Strategy: LLM fills a structured content schema, then a fixed TSX template
// renders it. This keeps LLM output constrained (no risk of broken JSX),
// while leaving the actual page words/comparisons up to the model.
//
// Two page archetypes supported:
//   - comparison ("/compare/<competitor>" or "/vs/<x>"): hero + feature
//     comparison table + FAQ + CTA. JSON-LD: Product + FAQPage + Comparison.
//   - guide ("/guides/<topic>", "/resources/<topic>"): hero + sections
//     (h2 + paragraph + optional bullets) + FAQ + CTA. JSON-LD: Article +
//     FAQPage.
//
// Output goes to `src/routes/<path>.tsx` in the cloned repo. Idempotent:
// the file is only written if content actually differs.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { completeJson } from "../clients/llm.js";
import { env } from "../config/env.js";
import { type Profile } from "../types/index.js";

// ---------------------------------------------------------------------------
// Page content schema — what the LLM produces
// ---------------------------------------------------------------------------

const ComparisonRow = z.object({
  feature: z.string(),
  us: z.string(),
  them: z.string(),
  winner: z.enum(["us", "them", "tie"]),
});

const FaqItem = z.object({
  q: z.string(),
  a: z.string(),
});

const GuideSection = z.object({
  h2: z.string(),
  paragraph: z.string(),
  bullets: z.array(z.string()).optional(),
});

const ComparisonPage = z.object({
  type: z.literal("comparison"),
  title: z.string(),
  description: z.string(),
  hero: z.object({
    tag: z.string(),
    headline: z.string(),
    subhead: z.string(),
  }),
  comparison: z.object({
    competitorName: z.string(),
    rows: z.array(ComparisonRow).min(4).max(10),
  }),
  faq: z.array(FaqItem).min(3).max(8),
  cta: z.object({
    primary: z.string(),
    secondary: z.string(),
  }),
});

const GuidePage = z.object({
  type: z.literal("guide"),
  title: z.string(),
  description: z.string(),
  hero: z.object({
    tag: z.string(),
    headline: z.string(),
    subhead: z.string(),
  }),
  sections: z.array(GuideSection).min(3).max(8),
  faq: z.array(FaqItem).min(3).max(8),
  cta: z.object({
    primary: z.string(),
    secondary: z.string(),
  }),
});

const PageContent = z.union([ComparisonPage, GuidePage]);
type PageContent = z.infer<typeof PageContent>;

// ---------------------------------------------------------------------------
// Route detection
// ---------------------------------------------------------------------------

function detectPageType(route: string): "comparison" | "guide" {
  const r = route.toLowerCase();
  if (r.startsWith("/compare/") || r.startsWith("/vs/")) return "comparison";
  return "guide";
}

function routeToFilePath(route: string): string {
  // /compare/klipfolio → src/routes/compare/klipfolio.tsx
  const trimmed = route.replace(/^\/+/, "").replace(/\/+$/, "");
  return `src/routes/${trimmed}.tsx`;
}

function routeToComponentName(route: string): string {
  const parts = route.split("/").filter(Boolean);
  return (
    parts
      .map((p) =>
        p
          .split(/[-_]/)
          .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : ""))
          .join(""),
      )
      .join("") + "Page"
  );
}

// ---------------------------------------------------------------------------
// LLM call — fill the schema for one page
// ---------------------------------------------------------------------------

const SYSTEM = `You generate the body content for a single new page on a B2B SaaS site, in a structured JSON shape that a fixed TSX template will render. You DO NOT write TSX/JSX yourself — only fill the schema.

GUARDRAILS — VIOLATIONS BREAK THE PIPELINE:
- Output ONLY valid JSON conforming to the type the caller specifies. No prose, no fences, no comments.
- Buyer language only. NO marketing-speak ("revolutionize", "unleash", "transform"). NO em-dashes used as the AI tell. NO "in the era of AI", "in today's fast-paced", "leverage", "synergy".
- Every claim MUST be supported by the brand context provided. If you don't know, omit the row/section rather than invent.
- For comparison rows: \`us\` and \`them\` are short cell strings (≤60 chars). \`winner\` is "us" | "them" | "tie", picked honestly.
- FAQ answers: 1-3 sentences, plain language. The first FAQ answer MUST directly state what the product is — that's what AIs cite.
- Hero subhead: 1-2 sentences, max ~200 chars total.
- Output language: English.

HOW TO USE THE BRAND CONTEXT:
- The product's actual name + tagline + occupation + key differentiators are provided. Use those words verbatim where natural.
- The Peec snapshot tells you the GEO gaps — the queries the AIs are running and the URLs they cite. The page you're writing should answer those queries directly. If the page is a /compare/<x>, it should counter the competitor's specific strengths from the snapshot.
- The competitor's domain is provided when relevant.`;

const USER_TEMPLATE_COMPARISON = (args: {
  brand: string;
  brandTagline: string | null;
  brandOccupation: string | null;
  differentiators: string[];
  competitor: string;
  competitorDomain: string;
  reason: string;
  draftCopy: string;
}): string =>
  `BRAND: ${args.brand} (tagline: "${args.brandTagline ?? "(none)"}")
WHAT WE DO: ${args.brandOccupation ?? "(unknown)"}
DIFFERENTIATORS:
${args.differentiators.map((d) => `- ${d}`).join("\n") || "(none)"}

COMPETITOR: ${args.competitor} (${args.competitorDomain})

WHY WE'RE BUILDING THIS PAGE: ${args.reason}
DRAFT COPY FROM STRATEGY: ${args.draftCopy}

Produce a JSON object that conforms to this exact TypeScript shape (no extra/missing fields):

{
  "type": "comparison",
  "title": "<55-65 char SEO title; e.g. '${args.brand} vs ${args.competitor} — what's different'>",
  "description": "<140-160 char meta description; lead with the head-to-head, end with primary differentiator>",
  "hero": {
    "tag": "/ COMPARE",
    "headline": "<short ${args.brand} vs ${args.competitor}>",
    "subhead": "<1-2 sentences: what the buyer gets from each, where they differ>"
  },
  "comparison": {
    "competitorName": "${args.competitor}",
    "rows": [
      { "feature": "<dimension>", "us": "<our value>", "them": "<their value>", "winner": "us|them|tie" }
      // 4-10 rows. Pick dimensions that REALLY differ. Be honest — concede ties and losses where they exist.
      // Suggested dimensions: refresh latency, AI/insights, integrations, pricing/free trial, target buyer, white-label, mobile, support.
    ]
  },
  "faq": [
    { "q": "What is ${args.brand}?", "a": "<1-3 sentences naming what we do, who it serves, key differentiator>" },
    // 3-7 more Q&As: "How is X different from ${args.competitor}?", "Which is cheaper?", "Which is faster?", "When should I pick X over Y?", etc.
  ],
  "cta": {
    "primary": "<imperative phrase, ~3-5 words>",
    "secondary": "<below CTA — a one-liner reassurance, e.g. trial length>"
  }
}

Return ONLY the JSON.`;

const USER_TEMPLATE_GUIDE = (args: {
  brand: string;
  brandTagline: string | null;
  brandOccupation: string | null;
  differentiators: string[];
  topic: string;
  reason: string;
  draftCopy: string;
  fanoutQueries: string[];
}): string =>
  `BRAND: ${args.brand} (tagline: "${args.brandTagline ?? "(none)"}")
WHAT WE DO: ${args.brandOccupation ?? "(unknown)"}
DIFFERENTIATORS:
${args.differentiators.map((d) => `- ${d}`).join("\n") || "(none)"}

GUIDE TOPIC: ${args.topic}
WHY WE'RE BUILDING THIS PAGE: ${args.reason}
DRAFT COPY FROM STRATEGY: ${args.draftCopy}

QUERIES THE AIs ARE ACTUALLY RUNNING (this is what to optimize for — directly answer at least 3 of these):
${args.fanoutQueries.map((q) => `- ${q}`).join("\n")}

Produce a JSON object that conforms to this exact TypeScript shape:

{
  "type": "guide",
  "title": "<55-65 char SEO title; topic-led, e.g. 'B2B marketing KPIs: definitions, examples, formulas'>",
  "description": "<140-160 char meta description; promise concrete value, mention ${args.brand} once at the end>",
  "hero": {
    "tag": "/ GUIDE",
    "headline": "<topic-led headline, no brand name>",
    "subhead": "<1-2 sentences: what reader will know after this page>"
  },
  "sections": [
    {
      "h2": "<question-shaped header that an AI would search for, e.g. 'What are marketing KPIs?'>",
      "paragraph": "<2-4 sentences answering it concretely. NO marketing speak.>",
      "bullets": ["<optional: 3-6 bullets with concrete examples>"]
    }
    // 3-8 sections covering the topic. STRUCTURE so AI engines can quote-extract.
  ],
  "faq": [
    { "q": "<a question from the fanout queries above OR a natural follow-up>", "a": "<1-3 sentences>" }
    // 3-7 Q&As. Mention ${args.brand} ONCE in the last FAQ as a soft CTA.
  ],
  "cta": {
    "primary": "<imperative phrase, ~3-5 words, can mention ${args.brand}>",
    "secondary": "<one-liner reassurance>"
  }
}

Return ONLY the JSON.`;

// ---------------------------------------------------------------------------
// TSX template renderer
// ---------------------------------------------------------------------------

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

function jsonLdScript(obj: Record<string, unknown>): string {
  // Wrap in a single-line stringified JSON; safe because we don't allow </script> in content.
  const safe = JSON.stringify(obj).replace(/<\/script>/gi, "<\\/script>");
  return `{ type: "application/ld+json", children: ${JSON.stringify(safe)} }`;
}

function buildFaqSchema(faq: PageContent["faq"]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

function buildArticleSchema(args: {
  title: string;
  description: string;
  url: string;
  brand: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: args.title,
    description: args.description,
    url: args.url,
    publisher: { "@type": "Organization", name: args.brand },
  };
}

function buildComparisonSchema(args: {
  brand: string;
  competitor: string;
  url: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${args.brand} vs ${args.competitor}`,
    url: args.url,
    about: [
      { "@type": "SoftwareApplication", name: args.brand },
      { "@type": "SoftwareApplication", name: args.competitor },
    ],
  };
}

function renderComparisonTsx(args: {
  route: string;
  componentName: string;
  page: Extract<PageContent, { type: "comparison" }>;
  brand: string;
  baseUrl: string;
}): string {
  const fullUrl = `${args.baseUrl.replace(/\/+$/, "")}${args.route}`;
  const faqSchema = buildFaqSchema(args.page.faq);
  const compareSchema = buildComparisonSchema({
    brand: args.brand,
    competitor: args.page.comparison.competitorName,
    url: fullUrl,
  });

  const rowsTsx = args.page.comparison.rows
    .map((r) => {
      const winnerClass =
        r.winner === "us"
          ? "text-green-600 font-semibold"
          : r.winner === "them"
            ? "text-muted-foreground"
            : "text-foreground";
      return `        <tr className="border-t">
          <td className="py-3 pr-4 font-medium">${escapeJsxText(r.feature)}</td>
          <td className="py-3 pr-4 ${r.winner === "us" ? winnerClass : ""}">${escapeJsxText(r.us)}</td>
          <td className="py-3 ${r.winner === "them" ? winnerClass : "text-muted-foreground"}">${escapeJsxText(r.them)}</td>
        </tr>`;
    })
    .join("\n");

  const faqTsx = args.page.faq
    .map(
      (item) => `      <div className="border-t py-6">
        <h3 className="font-semibold text-foreground">${escapeJsxText(item.q)}</h3>
        <p className="mt-2 text-muted-foreground leading-relaxed">${escapeJsxText(item.a)}</p>
      </div>`,
    )
    .join("\n");

  return `// lovabletoseo:managed — AUTO-GENERATED. Edit the strategy + re-run rather than editing this file directly.
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("${args.route}")({
  head: () => ({
    meta: [
      { title: "${escapeAttr(args.page.title)}" },
      { name: "description", content: "${escapeAttr(args.page.description)}" },
      { property: "og:title", content: "${escapeAttr(args.page.title)}" },
      { property: "og:description", content: "${escapeAttr(args.page.description)}" },
      { property: "og:url", content: "${escapeAttr(fullUrl)}" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "${escapeAttr(args.page.title)}" },
      { name: "twitter:description", content: "${escapeAttr(args.page.description)}" },
    ],
    links: [
      { rel: "canonical", href: "${escapeAttr(fullUrl)}" },
    ],
    scripts: [
      ${jsonLdScript(faqSchema)},
      ${jsonLdScript(compareSchema)},
    ],
  }),
  component: ${args.componentName},
});

function ${args.componentName}() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">${escapeJsxText(args.page.hero.tag)}</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl text-foreground">${escapeJsxText(args.page.hero.headline)}</h1>
      <p className="mt-6 max-w-3xl text-lg text-muted-foreground leading-relaxed">${escapeJsxText(args.page.hero.subhead)}</p>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-foreground">Feature comparison</h2>
        <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="py-3 pl-4 pr-4 text-left font-medium text-muted-foreground">Feature</th>
                <th className="py-3 pr-4 text-left font-medium text-foreground">${escapeJsxText(args.brand)}</th>
                <th className="py-3 pr-4 text-left font-medium text-muted-foreground">${escapeJsxText(args.page.comparison.competitorName)}</th>
              </tr>
            </thead>
            <tbody>
${rowsTsx}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-foreground">Frequently asked</h2>
        <div className="mt-6">
${faqTsx}
        </div>
      </section>

      <section className="mt-16 rounded-lg border bg-card p-8 text-center">
        <h2 className="text-2xl font-bold text-foreground">${escapeJsxText(args.page.cta.primary)}</h2>
        <p className="mt-3 text-muted-foreground">${escapeJsxText(args.page.cta.secondary)}</p>
        <Link to="/" className="mt-6 inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
          Back to ${escapeJsxText(args.brand)}
        </Link>
      </section>
    </main>
  );
}
`;
}

function renderGuideTsx(args: {
  route: string;
  componentName: string;
  page: Extract<PageContent, { type: "guide" }>;
  brand: string;
  baseUrl: string;
}): string {
  const fullUrl = `${args.baseUrl.replace(/\/+$/, "")}${args.route}`;
  const faqSchema = buildFaqSchema(args.page.faq);
  const articleSchema = buildArticleSchema({
    title: args.page.title,
    description: args.page.description,
    url: fullUrl,
    brand: args.brand,
  });

  const sectionsTsx = args.page.sections
    .map((s) => {
      const bullets =
        s.bullets && s.bullets.length
          ? `        <ul className="mt-4 list-disc pl-6 space-y-2 text-muted-foreground">
${s.bullets.map((b) => `          <li>${escapeJsxText(b)}</li>`).join("\n")}
        </ul>`
          : "";
      return `      <section className="mt-12">
        <h2 className="text-2xl font-bold text-foreground">${escapeJsxText(s.h2)}</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">${escapeJsxText(s.paragraph)}</p>
${bullets}
      </section>`;
    })
    .join("\n");

  const faqTsx = args.page.faq
    .map(
      (item) => `      <div className="border-t py-6">
        <h3 className="font-semibold text-foreground">${escapeJsxText(item.q)}</h3>
        <p className="mt-2 text-muted-foreground leading-relaxed">${escapeJsxText(item.a)}</p>
      </div>`,
    )
    .join("\n");

  return `// lovabletoseo:managed — AUTO-GENERATED. Edit the strategy + re-run rather than editing this file directly.
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("${args.route}")({
  head: () => ({
    meta: [
      { title: "${escapeAttr(args.page.title)}" },
      { name: "description", content: "${escapeAttr(args.page.description)}" },
      { property: "og:title", content: "${escapeAttr(args.page.title)}" },
      { property: "og:description", content: "${escapeAttr(args.page.description)}" },
      { property: "og:url", content: "${escapeAttr(fullUrl)}" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "${escapeAttr(args.page.title)}" },
      { name: "twitter:description", content: "${escapeAttr(args.page.description)}" },
    ],
    links: [
      { rel: "canonical", href: "${escapeAttr(fullUrl)}" },
    ],
    scripts: [
      ${jsonLdScript(faqSchema)},
      ${jsonLdScript(articleSchema)},
    ],
  }),
  component: ${args.componentName},
});

function ${args.componentName}() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">${escapeJsxText(args.page.hero.tag)}</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl text-foreground">${escapeJsxText(args.page.hero.headline)}</h1>
      <p className="mt-6 text-lg text-muted-foreground leading-relaxed">${escapeJsxText(args.page.hero.subhead)}</p>

${sectionsTsx}

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-foreground">Frequently asked</h2>
        <div className="mt-6">
${faqTsx}
        </div>
      </section>

      <section className="mt-16 rounded-lg border bg-card p-8 text-center">
        <h2 className="text-2xl font-bold text-foreground">${escapeJsxText(args.page.cta.primary)}</h2>
        <p className="mt-3 text-muted-foreground">${escapeJsxText(args.page.cta.secondary)}</p>
        <Link to="/" className="mt-6 inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
          Back to ${escapeJsxText(args.brand)}
        </Link>
      </section>
    </main>
  );
}
`;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export type GeneratedPage = {
  route: string;
  filePath: string; // repo-relative
  componentName: string;
  pageType: "comparison" | "guide";
};

export type GeneratePagesArgs = {
  cloneDir: string;
  baseUrl: string;
  profile: Profile;
  newPages: Array<{ route: string; reason: string; copy: string }>;
  fanoutQueries: string[];
};

export type GeneratePagesResult = {
  newFiles: string[];
  changedFiles: string[];
  skipped: Array<{ file: string; reason: string }>;
  generated: GeneratedPage[];
};

export async function generateTanstackPages(
  args: GeneratePagesArgs,
): Promise<GeneratePagesResult> {
  const result: GeneratePagesResult = {
    newFiles: [],
    changedFiles: [],
    skipped: [],
    generated: [],
  };

  for (const np of args.newPages) {
    const route = np.route.startsWith("/") ? np.route : `/${np.route}`;
    const filePathRel = routeToFilePath(route);
    const componentName = routeToComponentName(route);
    const pageType = detectPageType(route);
    const absolutePath = resolve(args.cloneDir, filePathRel);

    let pageContent: PageContent;
    try {
      if (pageType === "comparison") {
        const competitorName = (route.split("/").pop() ?? "")
          .split(/[-_]/)
          .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : ""))
          .join("");
        const competitorDomain = `${(route.split("/").pop() ?? "").toLowerCase()}.com`;
        pageContent = await completeJson<PageContent>({
          model: env().SUBAGENT_MODEL,
          max_tokens: 2500,
          system: SYSTEM,
          user: USER_TEMPLATE_COMPARISON({
            brand: args.profile.name,
            brandTagline: args.profile.tagline,
            brandOccupation: args.profile.occupation,
            differentiators: args.profile.key_differentiators,
            competitor: competitorName || "competitor",
            competitorDomain,
            reason: np.reason,
            draftCopy: np.copy,
          }),
          schema: PageContent,
        });
      } else {
        const topic = (route.split("/").pop() ?? "topic").replace(/[-_]/g, " ");
        pageContent = await completeJson<PageContent>({
          model: env().SUBAGENT_MODEL,
          max_tokens: 2500,
          system: SYSTEM,
          user: USER_TEMPLATE_GUIDE({
            brand: args.profile.name,
            brandTagline: args.profile.tagline,
            brandOccupation: args.profile.occupation,
            differentiators: args.profile.key_differentiators,
            topic,
            reason: np.reason,
            draftCopy: np.copy,
            fanoutQueries: args.fanoutQueries.slice(0, 12),
          }),
          schema: PageContent,
        });
      }
    } catch (e) {
      result.skipped.push({
        file: filePathRel,
        reason: `LLM/schema error: ${(e as Error).message.slice(0, 200)}`,
      });
      continue;
    }

    let tsx: string;
    if (pageContent.type === "comparison") {
      tsx = renderComparisonTsx({
        route,
        componentName,
        page: pageContent,
        brand: args.profile.name,
        baseUrl: args.baseUrl,
      });
    } else {
      tsx = renderGuideTsx({
        route,
        componentName,
        page: pageContent,
        brand: args.profile.name,
        baseUrl: args.baseUrl,
      });
    }

    const existing = existsSync(absolutePath) ? await readFile(absolutePath, "utf8") : null;
    if (existing === null) {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, tsx, "utf8");
      result.newFiles.push(filePathRel);
    } else if (existing !== tsx) {
      await writeFile(absolutePath, tsx, "utf8");
      result.changedFiles.push(filePathRel);
    }
    result.generated.push({ route, filePath: filePathRel, componentName, pageType });
  }

  return result;
}
