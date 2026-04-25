# Lovable prompt — V3 (Old-school SEO, content-heavy, dogfooded)

Paste this into a fresh Lovable project. The result should look like a long-form essay-style landing page that itself ranks for the keyword we sell against. The aesthetic IS the credibility — we're proving we can do the thing, on our own page.

---

Build a single-page marketing site for **lovabletoseo** — an AI marketer for early-stage Lovable founders. Crucially, **this page itself must demonstrate the GEO/SEO playbook we sell.** Treat it like a 6-minute long-form article. Nobody has shipped a marketing page like this for an AI-marketing tool. That's the differentiator.

**Design direction.** Old-school content-first. Cream paper background (`#f8f5ee`). Dark slate ink text (`#1a1a1a`). One link color, royal-blue (`#1f4f8a`), with a 1px underline offset 3px below the baseline. Body font is a print serif — Charter, Iowan Old Style, or Georgia at 18px with line-height 1.65. Display headings in bold serif at 42px (h1) and 28px (h2). Single column with `max-width: 680px` so reading lines stay short. Section dividers are thin hairline rules in `#d8d3c4`. Code blocks have a darker cream background (`#efeadc`) with a thick black left border. Tables have alternating row backgrounds and a black bottom border on the header row. **No animations except a small thinking-dots indicator during the scan.** No Tailwind — write hand-rolled CSS that feels considered. Vibe: stripe.press, paulgraham.com, ben thompson's stratechery, sahillavingia personal site.

**Crucial: ship JSON-LD inline.** In the document head, include two `<script type="application/ld+json">` blocks: one for `SoftwareApplication` (name, description, offers $0, url) and one for `FAQPage` (mainEntity array of Question/Answer pairs that match the FAQ section verbatim). The whole point of this design is showing we eat our own dogfood.

**Page structure, top to bottom.**

1. Header: thin bottom hairline. Left: the wordmark `lovabletoseo` in semibold. Right: text-link nav with bullets between, "The problem · Pipeline · vs LovableHTML · FAQ".

2. **Article body** — wrapped in `<article>`, single column, no hero "section" — this is just the start of the essay.

3. The h1 is a long-tail SEO target: **"How to get your Lovable app on Google and in ChatGPT (in 60 seconds)"**. Below it, a small byline in muted text: "A practical guide for non-technical founders. Last updated April 2026. Reading time: 6 minutes."

4. A "lede" paragraph in slightly larger text (21px), slightly muted: "Most Lovable apps are React single-page applications. That means search engines see an empty `<div id="root"></div>` and have nothing to index, while LLMs like ChatGPT have nothing to cite when buyers ask for a recommendation. This page explains why, and how a five-step pipeline fixes both halves of the problem in one pull request." Use a `<dfn>` element around "React single-page applications" the first time it appears.

5. **Domain input as part of the prose.** Before the table of contents, embed a small bordered card with darker cream background and a thin border. Label: "Skip the reading. Enter your domain and we'll diagnose it now." Below it, a single-row form: a monospace input field with placeholder `receiptly.lovable.app` and a black "Scan →" button. Small gray helper text below: "~10 seconds. No signup. We don't store your URL."

6. **Scan flow** (hidden until the form submits).
   - Loading state: a small white card. Title in muted: "Scanning **`<domain>`**". Below, a list of steps in a small monospace font with thinking-dots indicators (three small pulsing black dots) that resolve to "✓" checkmarks. Steps: "Cloning the Lovable repo…", "Detecting tech stack (Vite + React)…", "Reading components and routes…", "Querying Peec for buyer signals…", "Comparing to top-cited competitor pages…". 600ms each.
   - Result state: a white card. Heading: "Diagnosis for `<domain>`". Below, three metric tiles in a 3-column grid. Each tile has a 3px red left border, a big number with a counter animation, an UPPERCASE label, and a one-line detail. Tile 1: "0% — INDEXABLE — Crawlers see an empty root element. Nothing to render." Tile 2: "1% — LLM SHARE-OF-VOICE — vs QuickBooks 51%, Wave 28%". Tile 3: "0/5 — SCHEMA BLOCKS PRESENT — No JSON-LD. No FAQ. No product markup." Below the tiles, a small section with a top hairline divider. Paragraph: "**Connect GitHub to fix it.** We clone your repo, run the pipeline, and push a PR with the rebuilt site under `seo/`. You review every line before it goes live." Followed by a black "Connect GitHub" button.

7. **Table of contents** in a bordered white card with a small all-caps gray label "CONTENTS" and a numbered list with anchor links: 1) The problem: Lovable apps are React SPAs · 2) Why this matters more in 2026 · 3) The 5-step pipeline · 4) lovabletoseo vs LovableHTML vs DIY · 5) What "GEO" actually means · 6) FAQ.

8. **Section 1 — The problem: Lovable apps are React SPAs.** Three or four paragraphs. Include a code block showing the actual HTML a crawler sees (an empty `<div id="root">` with a script tag). Include one `<aside>` with a left-blue-border and white background as a callout: "**Quick check:** open your Lovable app's live URL, view-source, and search for any of your hero copy. If it's not in the source, your page is invisible to most of the AI-search world." Use `<mark>` element around one or two key phrases — yellow highlight, like a printed book.

9. **Section 2 — Why this matters more in 2026.** Two-paragraph setup, then a numbered list of the two convergent trends: search migrating from Google to LLMs, and AI builders making it cheap to ship invisible-but-pretty pages.

10. **Section 3 — The 5-step pipeline.** Plain prose with `<h3>` for each of: Ingest, Prerender, Diagnose, Strategize and enhance, Ship. In the Diagnose subsection, include a bulleted list of the three Peec REST endpoints (`POST /reports/brands`, `POST /queries/search`, `POST /reports/urls`) with a one-line explanation each.

11. **Section 4 — lovabletoseo vs LovableHTML vs DIY.** A real, honest comparison table with three columns and these rows: "What it does", "Touches your content?", "GEO optimizations included?", "Setup time", "Output you control", "Recurring cost". Be honest. Include a `<mark>`-highlighted sentence after the table summarizing the wedge: "they prerender what's there. We rewrite the content based on what buyers actually ask LLMs."

12. **Section 5 — What "GEO" actually means.** Use a definition list (`<dl>`) with `<dt>` for each of the six GEO principles (Direct-answer-first / Comparison tables / Cited statistics / JSON-LD schema markup / Entity consistency / Extractable lists) and `<dd>` for the explanation. End the section with: "Notice that this very page applies all six. That's deliberate. If a 'GEO tool' can't make its own landing page rank, it has no business selling you the practice."

13. **Section 6 — FAQ.** A `<dl>` with six question/answer pairs. Each `<dt>` has an `id` so it can be linked. Questions: "Why isn't my Lovable app showing up on Google?", "What is GEO?", "Will lovabletoseo break my Lovable app?", "How is this different from LovableHTML?", "Do I have to migrate off Lovable?", "How much does it cost?". Match these answers verbatim in the JSON-LD `FAQPage` block in the head.

14. **Closing line** with a top hairline divider. One short paragraph: "**Ready?** Scan your domain or read the source." Both phrases are anchor links.

15. **Footer** — top hairline. Left: "lovabletoseo.com — MIT licensed". Right: "built for the Peec AI track at the Big Berlin Hack" with "Peec AI" linking to peec.ai.

**Tone notes.** In-depth, technical, like a really well-written technical blog post. Use specifics: actual tag names, file paths, REST endpoint names, framework names. Use first-person plural ("we"). Use `<dfn>` and `<mark>` and `<dl>` and `<aside class="callout">` semantically — they look intentional and they help SEO/GEO. **Do not use marketing language.** No "supercharge", no "unleash", no "revolutionize". Quietly confident.

**Interactions.** Just the scan flow. Everything else is static and that's the point. Page should feel print-quality.

The Connect GitHub button should be a placeholder that opens a small modal saying "GitHub OAuth handshake — coming soon" for now.
