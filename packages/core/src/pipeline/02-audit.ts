import type { AuditReport, Inventory, RunContext } from "../types/index.js";

export async function audit(_args: { ctx: RunContext; inventory: Inventory }): Promise<AuditReport> {
  throw new Error("audit() not yet implemented — P3 task");
}
