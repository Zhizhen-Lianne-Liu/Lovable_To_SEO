import type { Profile, RunContext } from "../types/index.js";

export async function profile(_args: { ctx: RunContext; domain: string }): Promise<Profile> {
  throw new Error("profile() not yet implemented — P2 task (port from domain-peec-enrichment/py/research/profile.py)");
}
