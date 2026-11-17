/**
 * Checks that the configured models answer in the shapes the agents rely on:
 * structured output, streamed text and a tool loop, on both tiers.
 *
 *   npm run check:llm
 *
 * Reads credentials from the environment (.env.local is loaded if present).
 * Costs a few cents. Exits non-zero when any check fails.
 */
import fs from "node:fs";
import { z } from "zod";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { pickProvider, llmStatus } = await import("../src/lib/llm");
  const status = llmStatus();
  console.log(`Mode: ${status.label}. ${status.detail}\n`);
  if (status.mode === "heuristic") {
    console.log("No model is configured, so there is nothing to check. Set ANTHROPIC_API_KEY, or LITELLM_BASE_URL for a LiteLLM gateway, and run again.");
    return;
  }
  let failures = 0;
  const check = async (label: string, fn: () => Promise<string>) => {
    const started = Date.now();
    try {
      const detail = await fn();
      console.log(`ok    ${label} (${Date.now() - started}ms) -> ${detail}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const system = "You are a test harness. Follow the instruction exactly and briefly.";
  for (const tier of ["cheap", "smart"] as const) {
    const provider = pickProvider(tier);
    if (!provider) {
      console.log(`skip  ${tier} tier: no provider`);
      continue;
    }
    const name = `${tier} (${provider.name}: ${provider.model(tier)})`;
    await check(`${name} structured output`, async () => {
      const result = await provider.json({ tier, system, prompt: "Classify the sentence 'The deployment failed at 3am' and give a confidence.", effort: "low", maxTokens: 1000, schema: z.object({ category: z.enum(["incident", "feature", "other"]), confidence: z.number() }) });
      return `${JSON.stringify(result.data)} on ${result.model}, ${result.usage.inputTokens}+${result.usage.outputTokens} tokens`;
    });
    await check(`${name} streamed text`, async () => {
      let chunks = 0;
      const result = await provider.text({ tier, system, prompt: "Reply with exactly: ready", effort: "low", maxTokens: 1000, onDelta: () => void (chunks += 1) });
      return `"${result.text.slice(0, 40)}" in ${chunks} chunk(s)`;
    });
    if (provider.toolLoop) {
      const loop = provider.toolLoop.bind(provider);
      await check(`${name} tool loop`, async () => {
        let calls = 0;
        const result = await loop({
          tier,
          system,
          prompt: "Use the lookup tool to get the status of project ATLAS, then state it in one sentence.",
          effort: "low",
          maxTokens: 1500,
          maxIterations: 3,
          tools: [{ name: "lookup", description: "Returns the status of a project by key.", inputSchema: z.object({ key: z.string() }), run: async () => "ATLAS is green and on track." }],
          onToolCall: () => void (calls += 1),
        });
        if (calls === 0) throw new Error("the model answered without calling the tool");
        return `"${result.text.slice(0, 60)}" after ${calls} tool call(s)`;
      });
    }
  }
  if (failures) {
    console.log(`\n${failures} check(s) failed. Agents fall back to deterministic rules for any call that fails; see the error above for the cause.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. The agents will run live.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
