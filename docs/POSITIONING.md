# Positioning — vs LovableHTML and the SEO-tool field

## The closest competitor: LovableHTML

[LovableHTML](https://lovablehtml.com) is the obvious comparable. Smart founders, real product, growing user base. It's also what we are **deliberately not**.

|  | LovableHTML | lovabletoseo |
|---|---|---|
| What it does | Transparent prerender proxy via DNS | Source-aware rebuild as a PR |
| Touches your content? | No — renders what's there | Yes — rewrites for buyer queries |
| Driven by buyer intent data? | No (rules-based audit) | Yes (Peec MCP) |
| Output | Same site, just prerendered | New static site in `seo/` of your repo |
| If your page is content-thin | Indexable but still empty | Rebuilt with Peec-targeted copy |
| Setup | DNS swap (~5 min) | `pnpm dev run --repo <url>` |
| User control | None — black box | Full diff + PR review |

LovableHTML's wedge is "make the SPA crawlable". It's a real problem. But for a Lovable founder with three sentences of hero copy fighting QuickBooks for citations, prerendering an empty page just gets you indexed *as* an empty page. **Rank vs. cited is the gap we close.**

## The broader field

Most "AI SEO" tools live in two camps:

1. **Keyword guessers** (Ahrefs/Semrush + LLM-flavor) — they tell you what *might* rank.
2. **Content generators** (Jasper et al.) — they write more pages without knowing if anyone will read them.

We sit between them: **Peec gives ground truth on what LLMs actually serve, Claude turns that into the rebuild, the PR mechanic gives the founder full control.** No black box, no farm of generated articles, no DNS proxy you can't audit.

## Why now

Three things converge:

1. Lovable + Bolt + v0 + Base44 made it cheap to ship landing pages. Nobody told the founders the pages don't rank.
2. Search distribution is migrating from Google to LLMs. By 2027 GEO will be table-stakes — most of these tools haven't shipped yet.
3. Peec is the first ground-truth dataset on LLM citation behavior we've seen. With access, we can do something most "GEO platforms" can't: ground every recommendation in a real buyer query.

## What we don't claim

- We're not a magic traffic spigot. We make the page citable; you still need distribution to bootstrap the queries.
- We don't replace Lovable. Lovable is the editor, lovabletoseo is the marketer. Different jobs.
- GEO is young. The playbook in `GEO_PRINCIPLES.md` is our best read as of April 2026 and gets versioned in git for that reason.

## The 12-month wedge

Land in tiny Lovable apps (1–3 pages, founder-owned, fighting incumbents). Win because we ship a *better page* — not a faster index of a worse one. Expand later to:

- v0 / Bolt / Base44 / Replit projects (same input shape: GitHub repo + live URL)
- Multi-page Lovable sites (per-route rebuild)
- Continuous mode (cron-driven re-measure + iterate)
- Agency tier (manage 50+ founder portfolios from one dashboard)
