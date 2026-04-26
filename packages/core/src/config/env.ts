import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) loadDotenv({ path, override: false });
}

const Schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY required"),
  TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY required"),
  PEEC_API_KEY: z.string().min(1, "PEEC_API_KEY required"),
  PEEC_API_URL: z.string().url().default("https://api.peec.ai/customer/v1"),
  PEEC_PROJECT_ID: z.string().min(1, "PEEC_PROJECT_ID required"),
  DATAFORSEO_LOGIN: z.string().min(1, "DATAFORSEO_LOGIN required"),
  DATAFORSEO_PASSWORD: z.string().min(1, "DATAFORSEO_PASSWORD required"),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),

  PEEC_FIXTURE: z.string().optional(),
  DEMO_MODE: z.enum(["baked"]).optional(),

  PROFILE_MODEL: z.string().default("claude-sonnet-4-6"),
  CURATOR_MODEL: z.string().default("claude-opus-4-7"),
  SUBAGENT_MODEL: z.string().default("claude-sonnet-4-6"),
  AGGREGATOR_MODEL: z.string().default("claude-opus-4-7"),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Environment misconfigured. Fix these and retry:\n${issues}\n` +
        `See .env.example for the full schema.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function envOptional(): Partial<Env> {
  const parsed = Schema.partial().safeParse(process.env);
  return parsed.success ? parsed.data : {};
}
