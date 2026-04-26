const MULTIPART_TLDS = new Set([
  "co.uk",
  "com.br",
  "co.jp",
  "com.au",
  "co.nz",
  "co.in",
  "ac.uk",
  "gov.uk",
]);

export function rootDomain(input: string): string {
  let host: string;
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    host = u.hostname.toLowerCase();
  } catch {
    host = input.toLowerCase();
  }
  if (!host) host = input.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const parts = host.split(".");
  if (parts.length < 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (parts.length >= 3 && MULTIPART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function normalizeInputDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (s.startsWith("https://")) s = s.slice(8);
  else if (s.startsWith("http://")) s = s.slice(7);
  return s.replace(/\/+$/, "");
}

export function domainToSlug(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|app|de|fr|uk|tech|org|tv|gg))\b/g;

export const JUNK_DOMAINS = new Set([
  "wikipedia.org",
  "youtube.com",
  "reddit.com",
  "medium.com",
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "androidauthority.com",
  "androidcentral.com",
  "phonearena.com",
  "trustedreviews.com",
  "soundguys.com",
  "gizmochina.com",
  "techradar.com",
  "theverge.com",
  "engadget.com",
  "cnet.com",
  "tomshardware.com",
  "businessmodelcanvastemplate.com",
  "g2.com",
  "capterra.com",
  "trustradius.com",
  "softwareadvice.com",
  "github.com",
  "amazon.com",
  "ebay.com",
  "walmart.com",
]);

export const REVIEW_DOMAINS = ["g2.com", "capterra.com", "trustradius.com", "softwareadvice.com"];

export function extractDomainsFromText(text: string, exclude: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lc = text.toLowerCase();
  for (const m of lc.matchAll(DOMAIN_RE)) {
    let d = m[1] ?? "";
    if (d.startsWith("www.")) d = d.slice(4);
    if (!d || seen.has(d) || exclude.has(d)) continue;
    let junk = false;
    for (const j of JUNK_DOMAINS) {
      if (d.includes(j)) {
        junk = true;
        break;
      }
    }
    if (junk) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}
