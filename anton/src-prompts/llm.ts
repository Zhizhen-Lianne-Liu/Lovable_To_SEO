import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { promptError } from './types.js';

export type Provider = 'gemini' | 'anthropic';

export type LLMOpts = {
  provider?: Provider;        // explicit override
  subagentModel?: string;     // model used per chunk
  aggregatorModel?: string;   // model used for the dedup pass
};

export type ResolvedLLM = {
  provider: Provider;
  client: LLMClient;
  subagentModel: string;
  aggregatorModel: string;
};

export interface LLMClient {
  complete(args: { model: string; system: string; userJson: string; maxTokens: number }): Promise<string>;
}

const DEFAULT_GEMINI_FAST = 'gemini-2.5-flash';
const DEFAULT_GEMINI_SMART = 'gemini-2.5-pro';
const DEFAULT_CLAUDE_FAST = 'claude-haiku-4-5-20251001';
const DEFAULT_CLAUDE_SMART = 'claude-sonnet-4-6';

export function resolveLLM(opts: LLMOpts = {}): ResolvedLLM {
  const provider = opts.provider ?? autoProvider();

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw promptError('NO_API_KEY', 'GEMINI_API_KEY must be set in .env to use the gemini provider.');
    }
    return {
      provider,
      client: new GeminiAdapter(process.env.GEMINI_API_KEY),
      subagentModel: opts.subagentModel ?? DEFAULT_GEMINI_FAST,
      aggregatorModel: opts.aggregatorModel ?? DEFAULT_GEMINI_SMART,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw promptError('NO_API_KEY', 'ANTHROPIC_API_KEY must be set in .env to use the anthropic provider.');
  }
  return {
    provider,
    client: new AnthropicAdapter(process.env.ANTHROPIC_API_KEY),
    subagentModel: opts.subagentModel ?? DEFAULT_CLAUDE_FAST,
    aggregatorModel: opts.aggregatorModel ?? DEFAULT_CLAUDE_SMART,
  };
}

function autoProvider(): Provider {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  throw promptError('NO_API_KEY', 'No LLM provider key found. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env.');
}

class AnthropicAdapter implements LLMClient {
  private client: Anthropic;
  constructor(apiKey: string) { this.client = new Anthropic({ apiKey }); }

  async complete({ model, system, userJson, maxTokens }: { model: string; system: string; userJson: string; maxTokens: number }): Promise<string> {
    const res = await this.client.messages.create({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: userJson }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

class GeminiAdapter implements LLMClient {
  private client: GoogleGenAI;
  constructor(apiKey: string) { this.client = new GoogleGenAI({ apiKey }); }

  async complete({ model, system, userJson, maxTokens }: { model: string; system: string; userJson: string; maxTokens: number }): Promise<string> {
    const res = await this.client.models.generateContent({
      model,
      contents: userJson,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    });
    return res.text ?? '';
  }
}
