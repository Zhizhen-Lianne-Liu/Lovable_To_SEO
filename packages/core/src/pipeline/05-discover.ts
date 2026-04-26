import type { DiscoverResult, Profile, RunContext } from "../types/index.js";

export async function discover(_args: {
  ctx: RunContext;
  domain: string;
  profile: Profile;
}): Promise<DiscoverResult> {
  throw new Error("discover() not yet implemented — P2 task (port from domain-peec-enrichment/py/research/discover.py)");
}
