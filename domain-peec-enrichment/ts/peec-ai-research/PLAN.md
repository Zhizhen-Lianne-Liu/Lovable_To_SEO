# Lovable → Peec AI → Rebuild: Master Plan

## Status snapshot

| # | Stage | Status |
|---|---|---|
| 1 | **Import** (URL → workdir) | Done. See `/Users/anton/Hackathon/src/`. |
| 2 | **Prompt generation** (workdir → prompts) | Strategy drafted. See `strategy.md`. Build next. |
| 3 | **Peec submission** (prompts → registered Peec prompts) | Researched. See `peec-api.md`. |
| 4 | **Result polling + analysis** (Peec chats → visibility report) | Researched. Async constraint flagged below. |
| 5 | **Rebuild + redeploy** | Other team members. Out of scope here. |

## The pipeline

```
[Lovable URL]                    user input
     |
     v
[STAGE 1: import]                       <-- DONE
     |  ImportResult { workdir, repoMeta, isLovable, ... }
     v
[STAGE 2: prompt generation]            <-- BUILDING NEXT
     |  PromptSet { brand, prompts: [GeneratedPrompt × 30-60] }
     v
[STAGE 3: peec submission]              <-- AFTER STAGE 2
     |  RegisteredPromptSet { peec_project_id, peec_prompt_ids[] }
     v
[STAGE 4: result polling + analysis]    <-- BLOCKED BY 24H PEEC CADENCE
     |  VisibilityReport { per-prompt: visibility/position/sentiment + sources }
     v
[STAGE 5: rebuild + redeploy]           <-- not our scope
```

Each stage is its own module with a typed contract. Modules compose end-to-end; modules are also independently runnable for testing.

## CRITICAL constraint — read first

**Peec AI is schedule-driven, not request/response.** `POST /prompts` only *registers* a prompt; Peec runs it on a **~24h cadence**. There is no on-demand "run this prompt now" endpoint. This breaks the naïve "import → score in 30 seconds" demo flow.

Three options for handling this:
- **A. Two-phase demo.** Run today: import + generate + register. Resume tomorrow: poll + analyze. Honest, real, but boring on a hackathon stage.
- **B. Pre-seed.** Pick a few demo brands ahead of time (e.g. tomorrow morning), let Peec run them overnight, then on demo day use the *cached* chat data so the live flow appears synchronous.
- **C. Skip Peec for the live demo.** Stage 2 produces prompts; we *show* Peec submission as the integration point but keep the analysis offline.

**Recommendation: B**, with A as fallback. Decision needed from Anton.

## Stage 2 — Prompt generation (next build)

Detailed in `strategy.md`. Summary:

- **Inputs**: `ImportResult.workdir` from stage 1
- **Skills used**: `38-icp-research`, `33-competitor-teardown`, `35-e2e-seo-assistant` from `irinabuht12-oss/marketing-skills`
- **Pipeline**: extract website context → run 3 skills via Claude API → synthesize into prompt taxonomy (B1–B5) → emit PromptSet JSON
- **Output**: `PromptSet { jobId, websiteWorkdir, brand, generatedAt, prompts: GeneratedPrompt[] }`
- **Module shape**: mirrors stage 1. `generatePromptsFromWorkdir(workdir, opts?)` function + `POST /api/generate-prompts` HTTP + minimal frontend showing the prompt list.
- **External deps**: Claude API key (for skill execution). Add `ANTHROPIC_API_KEY` to `.env`.
- **Hackathon-acceptable shortcuts**: cache skill outputs per-website to avoid re-running on every iteration.

## Stage 3 — Peec submission (after stage 2)

- **Inputs**: `PromptSet` from stage 2 + a `peec_project_id` (existing or newly created)
- **API calls**:
  1. Resolve project: `GET /projects?external_id=<workdir-hash>` → if missing, create via Peec UI for now (no public POST /projects in v1 docs we found)
  2. For each prompt: `POST /prompts { text, country_code, topic_id?, tag_ids? }` → store returned `id`
- **Auth**: `X-API-Key` header (NOT Bearer)
- **Rate limit**: 200 req/min/project. Batch with small concurrency (e.g. 5).
- **Failure modes**: 402 (out of credits) → halt and surface, 409 (duplicate prompt) → skip and link to existing, 429 → backoff.
- **Output**: `RegisteredPromptSet { peec_project_id, peec_prompt_ids: string[], skipped_duplicates, registered_at }`

## Stage 4 — Result polling + analysis (blocked on Peec daily run)

- **Polling**: `GET /chats?prompt_id=<id>&start_date=<registered_at>` until at least one chat exists per prompt
- **Reading**: for each chat, `GET /chats/{chat_id}/content` to get sources, brands_mentioned, fanout
- **Aggregation**: `POST /reports/brands` and `POST /reports/urls` for project-level visibility / citation rates
- **Output**: `VisibilityReport` keyed by prompt + bucket, with per-bucket aggregates

## Decisions needed from Anton

1. **Async demo strategy**: A, B, or C above?
2. **Stage 2 skill execution**: real Claude API calls (better quality, costs money), or stub LLM calls and hand-craft persona/competitor JSON for the demo (cheaper, less impressive)?
3. **Project provisioning in Peec**: do we create a Peec project per imported website (expensive if there's a per-project credit cost), or use a single fixed project and tag prompts by site? **Currently leaning: one Peec project per imported site, one Peec tag per bucket (B1–B5).**
4. **Frontend scope for stage 2**: bare prompt list, or a UI where Anton can curate (delete / edit) prompts before submission? Curate adds ~2h, but is the kind of thing that wins demos.

## Module/folder layout going forward

```
/Users/anton/Hackathon/
├── src/                                <-- stage 1 (import)
├── peec-ai-research/                   <-- this folder
│   ├── PLAN.md
│   ├── strategy.md
│   ├── peec-api.md
│   └── marketing-skills.md
├── src-prompts/                        <-- stage 2 (proposed)
│   ├── index.ts                        generatePromptsFromWorkdir(...)
│   ├── extractor.ts                    workdir -> website context
│   ├── skills.ts                       skill loader + runner
│   ├── synthesizer.ts                  buckets B1-B5
│   └── types.ts                        PromptSet, GeneratedPrompt
├── src-peec/                           <-- stage 3 (proposed)
│   ├── index.ts                        registerPromptSet(...)
│   ├── client.ts                       Peec REST client
│   └── types.ts
└── api/server.ts                       <-- mounts all three modules
```

Each `src-*` folder follows the same shape as `src/` so the team contract is uniform.

## Open research items (low priority — not blocking)

- The Peec MCP server at `docs.peec.ai/mcp` may offer a higher-level "ask about a brand" interface that bypasses the project/prompt/chat orchestration. Worth a 10-min look before stage 3 implementation.
- `gh repo view irinabuht12-oss/marketing-skills` may have updates daily; pin a commit SHA in our skill loader to keep behavior stable.
