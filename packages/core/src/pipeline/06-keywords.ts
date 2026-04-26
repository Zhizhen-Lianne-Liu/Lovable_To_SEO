import type { KeywordResult, RunContext } from "../types/index.js";

export async function keywords(_args: { ctx: RunContext; competitors: string[] }): Promise<KeywordResult> {
  throw new Error("keywords() not yet implemented — P2 task (port from domain-peec-enrichment/ts/src-competitors/)");
}
