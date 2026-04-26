# Vendored marketing skills

These are the [Claude Code Agent Skills](https://agentskills.io) that the
`pipeline/11-strategy.ts` stage invokes when generating per-page meta,
schema, copy, and information architecture for a Lovable site.

**Source:** [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
**Vendored at commit:** `1bcff9fc79c64fd7886c3c7aa583f4bd63916ff2`
**Vendored on:** 2026-04-26

## What's used

| Skill | When it runs | What it produces |
|---|---|---|
| `product-marketing-context` | foundation (read by all others) | the `.agents/product-marketing-context.md` file the pipeline auto-generates from Profile + Peec snapshot |
| `site-architecture` | strategy stage | URL structure + page set proposal |
| `copywriting` | strategy stage | hero/feature/CTA copy per page |
| `ai-seo` | strategy stage | LLM-extractability + citation rewrites; consumes Peec query data |
| `seo-audit` | strategy stage | crosscheck against our scanner findings |
| `schema-markup` | strategy stage | JSON-LD blocks per page type |
| `copy-editing` | strategy stage | multi-pass polish on copywriting output |
| `competitor-alternatives` | strategy stage | `/vs/<x>` and `/<x>-alternative` pages from Peec competitors |

The other 32 skills in the upstream repo are out of scope for "rewrite a
website" (email/social/ads/CRO-flows/retention/sales). Re-vendor selectively
if you need them.

## Updating

Re-pull from upstream if you want newer skill prompts:

```bash
gh repo clone coreyhaines31/marketingskills /tmp/skills-update
for s in product-marketing-context seo-audit ai-seo schema-markup site-architecture copywriting copy-editing competitor-alternatives; do
  rsync -a --exclude='evals/' "/tmp/skills-update/skills/$s/" "skills/$s/"
done
```
