import type { Inventory, RunContext } from "../types/index.js";

export type PrerenderResult = {
  routes: Array<{ path: string; htmlFile: string }>;
};

export async function prerender(_args: { ctx: RunContext; inventory: Inventory }): Promise<PrerenderResult> {
  throw new Error("prerender() not yet implemented — P2 task");
}
