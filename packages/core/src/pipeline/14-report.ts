import type { RunContext } from "../types/index.js";

export async function report(_args: { ctx: RunContext; all: Record<string, unknown> }): Promise<string> {
  throw new Error("report() not yet implemented — P3 task (markdown brief w/ before/after Peec metrics)");
}
