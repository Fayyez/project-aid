import { config } from "@/lib/config";
import type { Tier } from "@/lib/types";
import { OpenAICompatibleProvider } from "./openai-compatible";

/**
 * LiteLLM gateway. When LITELLM_BASE_URL is set, every model call in the
 * platform goes through it: both tiers, tool loops and streaming. Which vendor
 * and model sit behind each name is decided in the LiteLLM configuration, so
 * models can be swapped, budgeted, logged and given fallbacks without touching
 * this application.
 */
export const litellmProvider = new OpenAICompatibleProvider({
  name: "litellm",
  baseUrl: () => config.litellmBaseUrl,
  apiKey: () => config.litellmApiKey,
  model: (tier: Tier) => (tier === "smart" ? config.litellmSmartModel : config.litellmCheapModel),
  // No temperature: several current reasoning models reject sampling parameters.
  minTokens: { json: config.litellmMaxTokens, text: config.litellmMaxTokens * 2 },
  sendReasoningEffort: config.litellmSendReasoningEffort,
  tools: true,
});

/** The model LiteLLM routes private code to, for projects in "local" privacy mode. */
export const litellmLocalProvider = new OpenAICompatibleProvider({
  name: "litellm-local",
  baseUrl: () => config.litellmBaseUrl,
  apiKey: () => config.litellmApiKey,
  model: () => config.litellmLocalModel ?? "",
  temperature: 0.2,
  minTokens: { json: 2000, text: 2000 },
  tools: false,
});
