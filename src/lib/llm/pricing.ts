import type { Usage } from "@/lib/types";

/**
 * USD per million tokens (input, output), used only for the cost estimate
 * shown in run traces. Matched by prefix after stripping a gateway's provider
 * prefix ("anthropic/claude-opus-5-5" -> "claude-opus-5-5").
 */
const PRICES: [prefix: string, input: number, output: number][] = [
  ["claude-fable-5-2", 8, 40],
  ["claude-opus-5-5", 4, 20],
  ["claude-opus-5", 5, 25],
  ["claude-sonnet-5", 2, 10],
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4-5", 1, 5],
];

export function priceOf(model: string): { input: number; output: number } | null {
  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  const match = PRICES.find(([prefix]) => bare.startsWith(prefix));
  return match ? { input: match[1], output: match[2] } : null;
}

/** Builds a Usage record. `knownCostUsd` (for example reported by a gateway) wins over the price table. */
export function usageFor(model: string, inputTokens: number, outputTokens: number, knownCostUsd?: number): Usage {
  const price = priceOf(model);
  const estimated = price ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000 : 0;
  const costUsd = knownCostUsd !== undefined && Number.isFinite(knownCostUsd) ? knownCostUsd : estimated;
  return { inputTokens, outputTokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
