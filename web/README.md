# web/ — three Lovable prompts

Three different design directions, each as a single Lovable-ready prompt you can paste into a fresh project. The team picks one, generates the page in Lovable, and iterates from there.

## How to use

1. Open [lovable.dev](https://lovable.dev) and start a new project.
2. Open one of the three prompt files below.
3. Copy the full markdown body (everything below the first `---` divider) and paste it as your first message in Lovable.
4. Wait for the first generation, then iterate visually inside Lovable.
5. Once the design feels right, point the Lovable repo at lovabletoseo.com.

## The three directions

### V1 — Peec-style (B&W, agentic, animated pipeline)
**File:** [`v1-peec.md`](v1-peec.md)
Pure black on white with a single mint accent. Monospace technical accents (file paths, endpoint names, slash-prefixed labels). Animated 5-stage pipeline with a small "agent" dot that travels through it. Visually agrees with peec.ai / linear.app / vercel.com.

**Best when** the audience is the Peec sponsor team or technical founders. The pipeline animation literally tells the story we sell.

### V2 — Lovable-style (warm gradients, friendly)
**File:** [`v2-lovable.md`](v2-lovable.md)
Cream-peach background with pink/peach/apricot gradients. Rounded everything, soft shadows, friendly emoji-character agent. Feels like a sister product to Lovable — a Lovable founder lands here and instantly feels at home.

**Best when** acquisition is the goal post-hackathon. Lowest friction for a non-technical founder.

### V3 — Old-school SEO (content-heavy, dogfooded)
**File:** [`v3-seo-classic.md`](v3-seo-classic.md)
Cream paper, serif body, single column. Long-form essay format with a real long-tail H1. Inline JSON-LD blocks (`SoftwareApplication` + `FAQPage`). The prompt explicitly tells Lovable to apply our six GEO principles to this very page — it eats its own dogfood.

**Best when** we want the strongest narrative for the demo. "Look — our own landing page already ranks because we follow the playbook we sell."

## Picking one

Decision criteria, in order:

1. **Which one a Lovable founder shows their cofounder unprompted?** Word-of-mouth is the only real distribution we have at hackathon scale.
2. **Which one Peec sponsors are most likely to repost?** That's an extra channel.
3. **Which one is fastest to get demo-ready in Lovable?** All three are designed to be Lovable-natural. V2 is probably fastest because Lovable's defaults already lean this way.

My take:
- **V1** is the safest demo bet — visually aligned with the sponsor, pipeline animation explains the product.
- **V3** is the most differentiated — we're the only "AI marketer" tool whose own landing page would actually rank.
- **V2** is the strongest acquisition surface — looks like the obvious next step for someone who just shipped on Lovable.

If you can't pick: ship V1 for the demo, V3 for the long tail, V2 once acquisition is the bottleneck. They aren't mutually exclusive — they're three branches of the same content.

## After Lovable generates the page

The whole point of this product is fixing what Lovable ships. So: after Lovable generates the chosen direction, point lovabletoseo at its own repo and run the pipeline. Treat the resulting PR as the second artifact for the demo — proof that we use our own tool on our own page.
