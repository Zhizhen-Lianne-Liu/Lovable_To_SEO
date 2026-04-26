import { complete } from "../clients/llm.js";

async function main() {
  try {
    const r = await complete({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system: "Reply with exactly: OK",
      user: "ping",
    });
    console.log("✓ ANTHROPIC OK —", r.trim());
  } catch (e) {
    console.error("✗ ANTHROPIC FAIL:", (e as Error).message);
    process.exit(1);
  }
}
main();
