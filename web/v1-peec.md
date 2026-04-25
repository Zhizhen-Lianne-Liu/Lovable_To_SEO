# Lovable prompt — V1 (Peec-style, B&W, agentic pipeline animation)

Paste this into a fresh Lovable project. The result should feel visually aligned with peec.ai / linear.app / vercel.com.

---

Build a single-page marketing site for **lovabletoseo** — an AI marketer for early-stage Lovable founders. The product takes a Lovable app's GitHub repo, converts the React SPA into static HTML, and enhances it with Peec AI buyer-query data, then opens a pull request with the rebuilt site. Target user: a non-technical founder who built a landing page in Lovable and just realized nobody finds it on Google or in ChatGPT.

**Design direction.** Pure black on a pure-white background. No color except one subtle accent (a faint mint green, `#34d399`, used sparingly for "ready" states and small punctuation). Display headings in a tight, modern sans-serif (Inter, font-weight 600, letter-spacing -0.04em, line-height 0.95) at very large sizes (up to 8xl in the hero). Body text in the same sans. Use a monospace font (JetBrains Mono or IBM Plex Mono) for technical accents — section labels prefixed with `/`, code snippets, metric labels. Faint dotted-grid background (32px). One-pixel hairline black borders on cards. Lots of whitespace. Vibe: peec.ai meets linear.app meets a developer terminal.

**Page structure, top to bottom.**

1. Minimal header — left: brand wordmark `lovabletoseo.` (with mint dot). Right: text links "Pipeline / Why / FAQ" + a small bordered "Sign in" button in monospace.

2. **Hero.** Eyebrow in monospace: `/ THE AI MARKETER FOR LOVABLE FOUNDERS`. Headline (line-broken, very large): "Your Lovable app / is invisible / to AI." Sub-line: "It's secretly a React SPA. Google sees an empty `<div id="root">`. ChatGPT has nothing to cite. We fix both, in one PR." Below: a single domain input — a wide bordered row with `https://` prefix in monospace, an input field with placeholder `receiptly.lovable.app`, and a black "Scan →" button. Add a subtle pulsing ring animation around the input. Below the input, in monospace: "~10 seconds. No signup. We don't store your URL."

3. **Scan flow** (hidden until the user submits the form).
   - First state: a card titled `/ SCANNING <domain>` with a list of steps that appear one by one with a thinking-dot animation (three pulsing black dots), then resolve to `✓` checkmarks. Steps: "Cloning the Lovable repo…", "Detecting tech stack (Vite + React)…", "Reading components and routes…", "Querying Peec for buyer signals…", "Comparing to top-cited competitor pages…". 600ms per step.
   - Second state: a "diagnosis complete" card. Eyebrow: `/ DIAGNOSIS COMPLETE`. Headline: "We can see why nobody finds `<domain>`." Below it, three side-by-side metric tiles separated by hairline borders. Each tile has a monospace label, a giant counter that animates from 0 to its final value, and a one-line description. Tile 1: "INDEXABLE — 0% — Crawlers see `<div id="root"></div>`. Empty." Tile 2: "LLM SHARE-OF-VOICE — 1% — vs QuickBooks 51% · Wave 28%". Tile 3: "MISSING SCHEMA — 5/5 — No JSON-LD. No FAQ. No comparison table."
   - Below the metrics, a "next step" card: "Connect GitHub. We open a PR." with one paragraph explaining we need read access to clone the repo, run the pipeline, and push the rebuilt site to a new branch — the founder reviews before anything goes live. Black "Connect GitHub" button with the GitHub mark icon.

4. **Pipeline section.** Eyebrow `/ PIPELINE`. Headline "5 stages. One PR." Body: "An agent walks your repo through five stages. Each one writes an artifact you can inspect — no black box." Below, a horizontal card with five sub-cells separated by hairline borders. Each cell has a monospace step number (01, 02, 03, 04, 05), a title (INGEST, PRERENDER, DIAGNOSE, ENHANCE, SHIP), and a one-line description (e.g. "git clone, detect Vite+React" / "React → static HTML" / "Peec API: brands, queries, urls" / "FAQ, comparison, JSON-LD" / "branch + gh pr create"). **Crucial animation:** a single black dot ("the agent"), with a subtle mint-green glow halo, travels horizontally through the five cells in an 8-second loop. It pauses at each stage for ~400ms, simulating "thinking" with three pulsing dots beside it, then advances to the next. Below the cells, a thin dashed line tracks its path.

5. **"Why this works" section.** Eyebrow `/ WHY THIS WORKS`. Headline "Most 'AI SEO' tools guess. We don't." Below, a 2x2 grid of cards on a hairline-bordered black background (so the 1px gap between them is dark). Each card has a monospace `/ SIGNAL` label, a bold sub-heading, and one explanatory sentence. The four cards: (1) "What buyers actually ask LLMs — Peec's `/queries/search` gives us the real query strings. No Ahrefs guesses." (2) "Which URLs LLMs cite — Peec's `/reports/urls` shows the shape of content that wins citations today." (3) "Where competitors crush you — Peec's `/reports/brands` hands us the share-of-voice gaps to attack first." (4) "Your repo — The cloned source, not a scrape. We see the React components your founder edits in Lovable."

6. **What you get section.** Eyebrow `/ WHAT YOU GET`. Headline "A PR. Diff included. Your call." Below, a styled code-block that looks like a GitHub PR diff, on a black background with light gray text. Show realistic diff hunks: the old `<title>Receiptly</title>` line in red, then the new title, meta-description, canonical link, and JSON-LD scripts in green. Below, a `+ <section id="comparison">` and `+ <section id="faq">` block in green to suggest new structural additions. Above the diff, a header bar in monospace: "seo/index.html · +148 -3" on the left, a small mint-green "ready to merge" chip on the right.

7. **FAQ section.** Eyebrow `/ FAQ`. Headline "Honest answers." Stack of bordered white cards, each with a question in regular weight and the answer below in dimmer text. Questions: "Will this break my Lovable app?", "Do I have to migrate off Lovable?", "How is this different from LovableHTML?", "What does GEO mean?". Keep answers short (2-3 sentences) and concrete.

8. **Final CTA.** Top-bordered section. Centered: a giant headline "Ready when you are." in display style. Below: a black "Scan your domain →" button in monospace that scrolls back to the input.

9. **Footer.** Hairline top border, monospace text in muted gray. Left: "lovabletoseo.com · MIT". Right: "built for the Big Berlin Hack · Peec AI track".

**Tone notes.** Founder-to-founder, evidence-first, slightly nerdy. Use technical specifics (file paths, API endpoint names, the literal `<div id="root">`) liberally — they create credibility. Avoid marketing words like "unleash", "supercharge", "game-changing". Avoid em dashes — use commas or periods.

**Interactions.** The scan flow is the centerpiece. Make sure the thinking-dots animation is smooth, the counters tick up cleanly, and the "agent" dot in the pipeline section keeps looping. Cards in the "why this works" grid should fade-up on scroll. Default to no JavaScript frameworks beyond what Lovable uses — the animations are CSS keyframes plus a couple of `requestAnimationFrame` loops for counters.

The Connect GitHub button should be a placeholder that opens a small modal saying "GitHub OAuth handshake — coming soon" for now.
