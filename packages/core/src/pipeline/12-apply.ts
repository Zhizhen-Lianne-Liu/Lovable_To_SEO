import type { Inventory, RunContext } from "../types/index.js";
import type { StrategyResult } from "./11-strategy.js";

export type ApplyResult = {
  changedFiles: string[];
  newFiles: string[];
  diff: string;
};

export async function apply(_args: {
  ctx: RunContext;
  inventory: Inventory;
  strategy: StrategyResult;
}): Promise<ApplyResult> {
  throw new Error("apply() not yet implemented — P4 task (Lovable-aware code mods)");
}
