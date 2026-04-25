import { fetch } from "undici";
import * as cheerio from "cheerio";

export type ScrapedPage = {
  url: string;
  fetchedAt: string;
  status: number;
  rawHtml: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  paragraphs: string[];
  links: { href: string; text: string }[];
  images: { src: string; alt: string }[];
  jsonLd: unknown[];
  wordCount: number;
};

/**
 * Pulls a Lovable-published page (or any URL) and extracts the structural
 * content tree. Cheap, no headless browser — Lovable serves enough static HTML
 * for the pipeline to work. We can swap in playwright later for SPA-only sites.
 */
export async function scrape(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: { "User-Agent": "lovabletoseo/0.1 (+https://lovabletoseo.com)" },
  });
  const rawHtml = await res.text();
  const $ = cheerio.load(rawHtml);

  const text = (sel: string) =>
    $(sel)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(JSON.parse($(el).contents().text()));
    } catch {
      // ignore broken json-ld
    }
  });

  const paragraphs = text("p");

  return {
    url,
    fetchedAt: new Date().toISOString(),
    status: res.status,
    rawHtml,
    title: $("title").first().text().trim(),
    metaDescription: $('meta[name="description"]').attr("content")?.trim() ?? "",
    h1: text("h1"),
    h2: text("h2"),
    h3: text("h3"),
    paragraphs,
    links: $("a")
      .map((_, el) => ({
        href: $(el).attr("href") ?? "",
        text: $(el).text().trim(),
      }))
      .get()
      .filter((l) => l.href && l.text),
    images: $("img")
      .map((_, el) => ({
        src: $(el).attr("src") ?? "",
        alt: $(el).attr("alt") ?? "",
      }))
      .get()
      .filter((i) => i.src),
    jsonLd,
    wordCount: paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
  };
}
