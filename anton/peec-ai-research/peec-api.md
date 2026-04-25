# Peec AI — Developer Brief

Source: https://docs.peec.ai (Mintlify-hosted). API status: **beta, Enterprise-only**.

## Product summary

Peec AI is an AI search analytics platform for marketing teams and agencies. It tracks how brands appear in answers from ChatGPT, Gemini, Perplexity, Copilot, Grok, Google AI Overview / AI Mode, and similar surfaces. Peec runs your prompts daily across these AI surfaces (using **UI scraping**, not the underlying model APIs, to mimic real logged-out users) and reports three core metrics: **Visibility** (share of answers that mention you), **Position** (where you rank when mentioned), and **Sentiment** (how positively you're described). It also tracks the **Sources** (URLs/domains) that AI models cite so you can do GEO / LLM-SEO work — i.e. influence which sites get retrieved. Target users are B2B marketing teams and agencies tracking brand visibility on AI search. The Peec public API exposes the same data shown in the UI (read-mostly, with prompt/brand CRUD). It is **not** a "send a one-off prompt and get a fresh answer" API; it works on top of pre-configured **projects** that Peec runs on a schedule.

## Authentication

**Header (recommended):** `X-API-Key: <key>`. Query-param fallback `?api_key=<key>` is also supported. **`Authorization: Bearer` is NOT supported** (returns HTTP 400).

Keys are scoped at **company** (cross-project) or **project** level. Create keys at https://app.peec.ai (Account → API).

Tested example (verified working, HTTP 200):
```bash
curl -H "X-API-Key: $PEEC_API_KEY" \
  "https://api.peec.ai/customer/v1/projects?limit=5"
```

## Endpoints

Base URL: `https://api.peec.ai/customer/v1`

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | List projects (company-scoped key). Query: `limit`, `offset`, `external_id`. Returns `{data:[{id,name,status,external_id}]}`. |
| GET | `/brands` | List tracked brands/competitors in a project. Returns `{data:[{id,name,is_own,domains[],aliases[],color}], totalCount}`. |
| POST | `/brands` | Create a brand. |
| GET/PATCH/DELETE | `/brands/{id}` | Update / delete brand. |
| GET | `/brand-suggestions` + accept/reject | Peec-suggested brands to track. |
| GET | `/prompts` | List prompts. Filter by `project_id`, `topic_id`, `tag_id`. Returns `{data:[{id,messages[{content}],tags[],topic,user_location:{country},volume}], totalCount}`. |
| POST | `/prompts` | **Create prompt.** Body: `{text:string(1–200), country_code:"US"\|"DE"\|... (~90 ISO codes), tag_ids?:[], topic_id?:string}`. Returns `201 {id, warning?}`. Can return `402` (out of credits) or `409` (duplicate). |
| GET/PATCH/DELETE | `/prompts/{id}` | Update / delete. |
| GET | `/topics`, `/tags` | Plus create/update/delete and topic/tag suggestion accept/reject endpoints. |
| GET | `/chats` | **List chats** (= recorded model responses to your prompts). Filter by `project_id`, `start_date`, `end_date`, `brand_id`, `prompt_id`, `model_channel_id`. Returns `{data:[{id,prompt:{id},model:{id},model_channel:{id},date}], totalCount}`. |
| GET | `/chats/{chat_id}/content` | **Read full chat:** messages, sources (with url/domain/citationCount/citationPosition), brands_mentioned (with position), fanout queries, products. This is the main payload for visibility analysis. |
| GET | `/models` (deprecated), `/model-channels` | Available model surfaces. Use `model_channel_id` (e.g. `openai-1`, `perplexity-1`, `google-2`, `anthropic-1`). |
| POST | `/fanout/search`, `/fanout/shopping` | List fanout sub-queries derived from prompts. |
| POST | `/reports/brands` | **Aggregated brand report.** Body: `{project_id, start_date, end_date, dimensions:["tag_id","model_id",...], filters:[{field,operator,values}], order_by, limit, offset}`. Returns visibility / sentiment / position / share_of_voice with sum+count fields for re-aggregation. |
| POST | `/reports/domains` | Domain-level citation report (`retrieval_rate`, `citation_rate`, `usage_rate`). |
| POST | `/reports/urls` | URL-level report (`retrievals`, `citation_count`, `citation_avg`, `classification`). |
| GET | `/reports/url-content` | Get content for a specific source URL. |

There is **no `/me` or `/account` endpoint** in the public docs. `GET /projects` is the canonical key-validation call (and what I used to confirm the key).

## Async behavior

Asynchronous, **schedule-driven**, no webhooks documented.
- `POST /prompts` only **registers** a prompt; it does not return an answer. Response is `{id, warning?}`.
- Peec runs registered prompts daily across all model channels (UI-scraping their web interfaces).
- You poll `GET /chats?prompt_id=...&start_date=...` to discover new runs, then `GET /chats/{id}/content` for the full response, sources, and brand mentions.
- Expect first results **within ~24h** of creating a prompt (not seconds). For our URL→prompt→visibility flow, this means we either (a) reuse existing prompts and read recent chats, or (b) create a prompt and wait a day before scoring.

## Rate limits

- **200 requests/minute per project.** Exceeding returns `429`.
- Docs promise `X-RateLimit-Limit / Remaining / Reset` headers, but I did not observe them on `GET /projects` in my test. Implement exponential backoff on 429 regardless.
- `POST /prompts` can return **402 Payment Required** when the project is out of credits — separate from rate limiting. Credits, not request count, gate prompt creation.

## Open questions

1. **Pricing / credit cost per prompt.** Public docs only say "Enterprise plans". No per-prompt or per-chat cost is published; we'd need to ask sales or check `app.peec.ai` billing. Affects whether we expose "submit any URL" to end users.
2. **Time-to-first-result SLA.** Docs imply daily runs but don't state how soon a freshly created prompt yields its first chat. Critical for a synchronous URL-scoring UX.
3. **Can we score an arbitrary website without first onboarding it as a brand?** The data model assumes a project with prompts + tracked brands. Auto-creating a project per URL may be expensive and/or against ToS — needs confirmation. There's also an **MCP server** (docs.peec.ai/mcp) that may offer a higher-level "ask about a brand" interface worth investigating as an alternative to the raw API.
