import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "../config/env.js";

// ---------------------------------------------------------------------------
// Clients (lazy singletons)
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function anthropic(): Anthropic {
  if (!anthropicClient)
    anthropicClient = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  return anthropicClient;
}

function gemini(): GoogleGenerativeAI {
  if (!geminiClient)
    geminiClient = new GoogleGenerativeAI(env().GEMINI_API_KEY ?? "");
  return geminiClient;
}

// ---------------------------------------------------------------------------
// Model routing — Opus-class tasks fall back to Gemini Pro, others to Flash
// ---------------------------------------------------------------------------

const OPUS_MODELS = new Set(["claude-opus-4-7", "claude-opus-4-5", "claude-opus-3-5"]);

function geminiEquivalent(claudeModel: string): string {
  return OPUS_MODELS.has(claudeModel) ? "gemini-2.0-pro" : "gemini-2.0-flash";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompleteArgs = {
  model: string;
  system: string;
  user: string;
  max_tokens?: number;
  temperature?: number;
};

// ---------------------------------------------------------------------------
// Gemini completion
// ---------------------------------------------------------------------------

async function completeGemini(args: CompleteArgs): Promise<string> {
  const modelName = geminiEquivalent(args.model);
  const model = gemini().getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    systemInstruction: args.system,
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    generationConfig: {
      maxOutputTokens: args.max_tokens ?? 1500,
      temperature: args.temperature,
    },
  });
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function completeGeminiJson(args: CompleteArgs): Promise<string> {
  const modelName = geminiEquivalent(args.model);
  const model = gemini().getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    systemInstruction: args.system,
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    generationConfig: {
      maxOutputTokens: args.max_tokens ?? 1500,
      temperature: args.temperature,
      responseMimeType: "application/json",
    },
  });
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty JSON response");
  return text;
}

// ---------------------------------------------------------------------------
// Fallback chain
// ---------------------------------------------------------------------------

async function withFallback(
  anthropicFn: () => Promise<string>,
  geminiFn: () => Promise<string>,
): Promise<string> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return geminiFn();
  try {
    return await anthropicFn();
  } catch (err) {
    console.warn(`[llm] Anthropic failed (${(err as Error).message}), falling back to Gemini`);
    return geminiFn();
  }
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

export async function complete(args: CompleteArgs): Promise<string> {
  return withFallback(
    async () => {
      const res = await anthropic().messages.create({
        model: args.model,
        max_tokens: args.max_tokens ?? 1500,
        temperature: args.temperature,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      });
      const block = res.content[0];
      if (!block || block.type !== "text")
        throw new Error(`Expected text block, got ${block?.type ?? "none"}`);
      return block.text;
    },
    () => completeGemini(args),
  );
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
  const text = await withFallback(
    async () => {
      const res = await anthropic().messages.create({
        model: args.model,
        max_tokens: args.max_tokens ?? 1500,
        temperature: args.temperature,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      });
      const block = res.content[0];
      if (!block || block.type !== "text")
        throw new Error(`Expected text block, got ${block?.type ?? "none"}`);
      return block.text;
    },
    () => completeGeminiJson(args),
  );

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
