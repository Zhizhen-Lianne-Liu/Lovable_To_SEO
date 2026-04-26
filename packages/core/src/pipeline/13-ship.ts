import type { Inventory, RunContext } from "../types/index.js";
import type { ApplyResult } from "./12-apply.js";

export type ShipResult = {
  branch: string;
  commitSha: string;
  prUrl?: string;
};

export async function ship(_args: {
  ctx: RunContext;
  inventory: Inventory;
  apply: ApplyResult;
}): Promise<ShipResult> {
  throw new Error("ship() not yet implemented — P4 task (GitHub App: branch + commit + PR)");
}
