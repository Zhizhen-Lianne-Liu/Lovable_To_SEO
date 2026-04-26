import type { AuditReport, Inventory, RunContext } from "../types/index.js";

export type StrategyResult = {
  perRoute: Array<{
    route: string;
    title: string;
    description: string;
    schema: Record<string, unknown>[];
    copy: { hero?: string; sections?: Record<string, string>; cta?: string };
  }>;
  newPages: Array<{ route: string; reason: string; copy: string }>;
  globalSchema: Record<string, unknown>[];
};

export async function strategy(_args: {
  ctx: RunContext;
  inventory: Inventory;
  audit: AuditReport;
  contextMd: string;
}): Promise<StrategyResult> {
  throw new Error("strategy() not yet implemented — P3 task (invokes site-architecture, copywriting, ai-seo, schema-markup skills)");
}
