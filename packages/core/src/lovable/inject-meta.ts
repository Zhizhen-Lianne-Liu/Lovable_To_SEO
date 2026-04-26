// Index-shell mutation for Lovable Vite+React apps.
//
// Surgically modifies the homepage <head> to inject:
//   - <title>, <meta name="description">
//   - Open Graph: og:title, og:description, og:image, og:url
//   - Twitter card
//   - Canonical link
//   - JSON-LD blocks (one or more)
//
// Idempotent: looks for an `<!-- lovabletoseo:meta -->` marker block before
// </head>. If present, the entire block is replaced; if absent, we append
// the block right before </head>. This keeps re-runs from duplicating.
//
// Doesn't touch React components — preserves Lovable file structure beyond
// the index.html shell.

const MARKER_OPEN = "<!-- lovabletoseo:meta START -->";
const MARKER_CLOSE = "<!-- lovabletoseo:meta END -->";

export type MetaInjection = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  jsonLd?: Array<Record<string, unknown>>;
};

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildMetaBlock(injection: MetaInjection): string {
  const ogTitle = injection.ogTitle ?? injection.title;
  const ogDesc = injection.ogDescription ?? injection.description;
  const card = injection.twitterCard ?? "summary_large_image";
  const lines: string[] = [
    MARKER_OPEN,
    `    <title>${escText(injection.title)}</title>`,
    `    <meta name="description" content="${escAttr(injection.description)}" />`,
    `    <link rel="canonical" href="${escAttr(injection.canonicalUrl)}" />`,
    `    <meta property="og:title" content="${escAttr(ogTitle)}" />`,
    `    <meta property="og:description" content="${escAttr(ogDesc)}" />`,
    `    <meta property="og:url" content="${escAttr(injection.canonicalUrl)}" />`,
  ];
  if (injection.ogImage) {
    lines.push(`    <meta property="og:image" content="${escAttr(injection.ogImage)}" />`);
  }
  lines.push(`    <meta name="twitter:card" content="${card}" />`);
  lines.push(`    <meta name="twitter:title" content="${escAttr(ogTitle)}" />`);
  lines.push(`    <meta name="twitter:description" content="${escAttr(ogDesc)}" />`);
  if (injection.ogImage) {
    lines.push(`    <meta name="twitter:image" content="${escAttr(injection.ogImage)}" />`);
  }
  if (injection.jsonLd && injection.jsonLd.length) {
    for (const block of injection.jsonLd) {
      lines.push(
        `    <script type="application/ld+json">${JSON.stringify(block)}</script>`,
      );
    }
  }
  lines.push(MARKER_CLOSE);
  return lines.join("\n");
}

// Strip a previously-injected block (between the START/END markers, inclusive).
function stripPrevious(html: string): string {
  const start = html.indexOf(MARKER_OPEN);
  const end = html.indexOf(MARKER_CLOSE);
  if (start === -1 || end === -1 || end < start) return html;
  // Also swallow leading whitespace + trailing newline so the file stays clean.
  const before = html.slice(0, start).replace(/[ \t]*$/m, "");
  const after = html.slice(end + MARKER_CLOSE.length).replace(/^\s*\n/, "\n");
  return before + after;
}

// Strip raw <title>/<meta>/<link rel=canonical>/<script type=application/ld+json>
// tags that exist in the source shell so our injected block is the single
// source of truth. Conservative: only strips the categories we control.
function stripExistingMetaTags(html: string): string {
  let out = html;
  out = out.replace(/<title[^>]*>[\s\S]*?<\/title>\s*/gi, "");
  out = out.replace(/<meta\s+(?:[^>]*\s+)?name=["']description["'][^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+(?:[^>]*\s+)?property=["']og:[^"']+["'][^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+(?:[^>]*\s+)?name=["']twitter:[^"']+["'][^>]*>\s*/gi, "");
  out = out.replace(/<link\s+(?:[^>]*\s+)?rel=["']canonical["'][^>]*>\s*/gi, "");
  out = out.replace(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );
  return out;
}

export function injectMetaIntoIndexHtml(
  html: string,
  injection: MetaInjection,
): string {
  let out = stripPrevious(html);
  out = stripExistingMetaTags(out);

  const block = buildMetaBlock(injection);
  const headCloseIdx = out.search(/<\/head>/i);
  if (headCloseIdx === -1) {
    // No </head>? Append a minimal head to the start as a last resort.
    return `<head>\n${block}\n</head>\n${out}`;
  }
  const before = out.slice(0, headCloseIdx).replace(/\s*$/, "");
  const after = out.slice(headCloseIdx);
  return `${before}\n${block}\n  ${after}`;
}
