# web/ — three landing page directions

Three standalone HTML mockups of the lovabletoseo.com landing page. Each is one self-contained file you can open directly in a browser. Pick one for the team to take into Lovable and iterate.

## How to preview

```bash
# Quickest — just open in a browser
open web/v1-peec/index.html
open web/v2-lovable/index.html
open web/v3-seo-classic/index.html

# Or run a tiny local server so all three can be compared
python3 -m http.server 8000 --directory web
# then visit http://localhost:8000/v1-peec/  etc.
```

## The three directions

### V1 — Peec-style (B&W, agentic, animated pipeline)
- **Vibe:** clean white, deep black, monospace touches, lots of whitespace. Like Peec.ai or Linear.
- **Hero animation:** an "agent" dot traveling along the 5-stage pipeline as you scroll, thinking-dots loaders during the scan.
- **Tone:** technical, founder-to-founder, evidence-first.
- **Best if:** judges and the Peec team are the audience. Most visually aligned with the track sponsor.

### V2 — Lovable-style (warm gradients, friendly)
- **Vibe:** peach / pink / orange gradients, rounded everything, soft shadows. Like Lovable's own product surface.
- **Hero animation:** friendly emoji-character agent doing tasks, soft pulsing on the input.
- **Tone:** friendly, magic-feeling, low-jargon, minimal-emoji.
- **Best if:** we want to feel like a sister product to Lovable so the founder reaches for us as the obvious next step.

### V3 — SEO-classic (old-school, content-heavy, dogfooded)
- **Vibe:** serif body font, cream background, single column. Like Stripe Press, HN top posts, Pieter Levels.
- **Hero:** the H1 is a real long-tail keyword target, the input is embedded in the prose.
- **Animation:** none. The aesthetic is the credibility — "we don't need flashy because the page itself ranks".
- **Tone:** in-depth, technical, evidence-led.
- **Best if:** we want the landing page itself to demonstrate the GEO playbook — eats its own dogfood. Strong narrative for the demo.

## Common flow (all three)

1. Founder lands on page, sees one input: their domain (e.g. `myapp.lovable.app`).
2. They submit. We show a 3-second scan with thinking-state animation.
3. We reveal mocked scan results: SPA detection, missing meta/schema, Peec share-of-voice gap vs competitors.
4. CTA: **Connect GitHub** to fix it. (In the mock this just shows the next-step modal; in production it's a GitHub OAuth handshake that hands the repo to the pipeline.)

The "domain first, GitHub later" sequence is intentional — the founder gets the value-revealing diagnosis before being asked to authorize anything.

## Picking one

Decision criteria, in order:
1. **Which one a Lovable founder shows their cofounder unprompted?** Word-of-mouth is the only real distribution we have at hackathon scale.
2. **Which one Peec sponsors are most likely to repost?** That's an extra distribution channel.
3. **Which one is fastest to ship into Lovable?** All three are HTML/Tailwind-shaped; V1 and V2 should drop in cleanly. V3 uses vanilla CSS by design.

My take: **V1 is the safest demo bet** (visually aligned with the sponsor, pipeline animation literally explains what we do). **V3 is the most differentiated** (we're the only "AI marketer" tool whose own landing page would actually rank). **V2 is the strongest acquisition surface** (looks like the obvious next step for someone who just shipped on Lovable).

## File structure

```
web/
├── README.md                 ← this file
├── v1-peec/
│   └── index.html            ← single-file demo, Tailwind via CDN, vanilla JS
├── v2-lovable/
│   └── index.html            ← single-file demo, Tailwind via CDN, vanilla JS
└── v3-seo-classic/
    └── index.html            ← single-file demo, vanilla CSS, semantic HTML
```

Each file is fully self-contained. No build step, no install.
