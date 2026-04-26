import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env.js";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  return client;
}

export type CompleteArgs = {
  model: string;
  system: string;
  user: string;
  max_tokens?: number;
  temperature?: number;
};

export async function complete(args: CompleteArgs): Promise<string> {
  const res = await anthropic().messages.create({
    model: args.model,
    max_tokens: args.max_tokens ?? 1500,
    temperature: args.temperature,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`Expected text block, got ${block?.type ?? "none"}`);
  }
  return block.text;
}

export function stripCodeFences(text: string): string {
  if (!text.includes("```")) return text.trim();
  const chunks = text.split("```");
  let longest = "";
  for (let i = 1; i < chunks.length; i += 2) {
    const candidate = (chunks[i] ?? "").replace(/^json\s*/i, "").trim();
    if (candidate.length > longest.length) longest = candidate;
  }
  return longest || text.trim();
}

export class JsonParseError extends Error {
  constructor(
    message: string,
    public readonly snippet: string,
  ) {
    super(message);
    this.name = "JsonParseError";
  }
}

export async function completeJson<T>(args: CompleteArgs & { schema?: z.ZodType<T> }): Promise<T> {
  const text = await complete(args);
  const stripped = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new JsonParseError(
      `LLM returned non-JSON: ${(e as Error).message}`,
      stripped.slice(0, 200),
    );
  }
  if (args.schema) {
    const result = args.schema.safeParse(parsed);
    if (!result.success) {
      throw new JsonParseError(
        `LLM JSON failed schema: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        stripped.slice(0, 200),
      );
    }
    return result.data;
  }
  return parsed as T;
}
