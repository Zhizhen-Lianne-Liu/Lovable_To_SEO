import type { Inventory, RunContext } from "../types/index.js";

export async function ingest(_args: { ctx: RunContext }): Promise<Inventory> {
  throw new Error("ingest() not yet implemented — P2 task");
}
