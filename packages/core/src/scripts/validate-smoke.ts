#!/usr/bin/env node
/**
 * Validate a smoke-test JSON file against the corresponding Zod schema.
 *
 *   npm run validate:smoke -- profile <path/to/profile.json>
 *   npm run validate:smoke -- discover <path/to/discover.json>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DiscoverResult, Profile } from "../types/index.js";

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  profile: Profile,
  discover: DiscoverResult,
};

const [, , kindArg, pathArg] = process.argv;
if (!kindArg || !pathArg) {
  console.error("Usage: validate-smoke <profile|discover> <path>");
  process.exit(1);
}
const schema = SCHEMAS[kindArg];
if (!schema) {
  console.error(`Unknown kind: ${kindArg}. Use one of: ${Object.keys(SCHEMAS).join(", ")}`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(resolve(process.cwd(), pathArg), "utf8"));
const r = schema.safeParse(data);
if (r.success) {
  console.log(`✓ ${kindArg} validates`);
  process.exit(0);
}
console.log(`✗ ${kindArg} FAILED:`);
for (const i of r.error.issues) {
  console.log(`  - ${i.path.join(".") || "(root)"}: ${i.message}`);
}
process.exit(1);
