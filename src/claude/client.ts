import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export type CompleteArgs = {
  /** Cached system prompt (the playbook). Stable across runs — gets prompt-cache hit. */
  system: string;
  /** Per-run context block — also cacheable when re-running on the same project. */
  cachedContext?: string;
  /** The actual ask. */
  user: string;
  maxTokens?: number;
  model?: string;
};

export class ClaudeClient {
  private sdk: Anthropic;
  private model: string;

  constructor(apiKey: string, model = process.env.LTSEO_MODEL || DEFAULT_MODEL) {
    this.sdk = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Single-shot completion with prompt caching applied to the system prompt
   * and (optionally) a cached context block. This makes the strategist + rewriter
   * cheap on repeated runs against the same project.
   */
  async complete(args: CompleteArgs): Promise<string> {
    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: args.system,
        cache_control: { type: "ephemeral" },
      },
    ];

    const userBlocks: Anthropic.TextBlockParam[] = [];
    if (args.cachedContext) {
      userBlocks.push({
        type: "text",
        text: args.cachedContext,
        cache_control: { type: "ephemeral" },
      });
    }
    userBlocks.push({ type: "text", text: args.user });

    const res = await this.sdk.messages.create({
      model: args.model ?? this.model,
      max_tokens: args.maxTokens ?? 4096,
      system,
      messages: [{ role: "user", content: userBlocks }],
    });

    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}
