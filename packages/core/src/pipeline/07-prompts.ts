import type { KeywordResult, Profile, PromptSet, RunContext } from "../types/index.js";

export async function prompts(_args: {
  ctx: RunContext;
  keywords: KeywordResult;
  profile: Profile;
}): Promise<PromptSet> {
  throw new Error("prompts() not yet implemented — P2 task (port curator/sub-agents/aggregator from domain-peec-enrichment/ts/src-prompts/)");
}
