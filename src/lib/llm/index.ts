import { config } from "@/lib/config";
import type { PrivacySettings, Tier } from "@/lib/types";
import { AnthropicProvider } from "./anthropic";
import { litellmLocalProvider, litellmProvider } from "./litellm";
import { localProvider } from "./local";
import type { LlmProvider } from "./types";

export * from "./types";

const anthropic = new AnthropicProvider();

export interface RoutingOptions {
  /** True when the prompt contains source code or diffs. */
  handlesCode?: boolean;
  privacy?: PrivacySettings;
}

/**
 * Chooses the model provider for a step, or null when the step must run on the
 * deterministic heuristic path. This is the only place that decides where a
 * model call goes.
 *
 * Gateway: when LiteLLM is configured, every call goes through it; otherwise
 * calls go to Anthropic directly through its SDK.
 *
 * Privacy rules, whatever the gateway:
 *  - "metadata-only" projects: no model ever sees code.
 *  - "local" projects: code goes only to a model on your own hardware (the
 *    LiteLLM local model, or the directly configured local server). If neither
 *    exists the step falls back to heuristics; code is never sent to a cloud model.
 */
export function pickProvider(tier: Tier, options: RoutingOptions = {}): LlmProvider | null {
  if (config.llmMode === "off") return null;
  const gateway = Boolean(config.litellmBaseUrl);
  const localServer = Boolean(config.localLlmBaseUrl);
  if (options.handlesCode) {
    const mode = options.privacy?.codeSummaryMode ?? "cloud";
    if (mode === "metadata-only") return null;
    if (mode === "local") {
      if (gateway && config.litellmLocalModel) return litellmLocalProvider;
      return localServer ? localProvider : null;
    }
  }
  if (gateway) return litellmProvider;
  if (tier === "cheap" && localServer && process.env.CHEAP_PROVIDER === "local") return localProvider;
  if (config.anthropicConfigured) return anthropic;
  // No cloud credential: the cheap tier can still run on a local model.
  if (tier === "cheap" && localServer) return localProvider;
  return null;
}

export interface LlmStatus {
  mode: "live" | "heuristic";
  label: string;
  smartModel: string | null;
  cheapModel: string | null;
  localModel: string | null;
  detail: string;
}

/** What the UI shows about how the agents are currently powered. */
export function llmStatus(): LlmStatus {
  const smart = pickProvider("smart");
  const cheap = pickProvider("cheap");
  const privateCode = pickProvider("cheap", { handlesCode: true, privacy: { codeSummaryMode: "local", storeRawCode: false, redactSecrets: true } });
  const localModel = privateCode ? privateCode.model("cheap") : null;
  if (!smart && !cheap) {
    return {
      mode: "heuristic",
      label: "Heuristic mode",
      smartModel: null,
      cheapModel: null,
      localModel,
      detail:
        config.llmMode === "off"
          ? "Models are switched off (PROJECT_AID_LLM=off). Agents use deterministic rules."
          : "No model credential is configured. Agents use deterministic rules. Set ANTHROPIC_API_KEY, or LITELLM_BASE_URL to use a LiteLLM gateway, to enable live reasoning.",
    };
  }
  const via = smart?.name === "litellm" || cheap?.name === "litellm" ? " through LiteLLM" : "";
  return {
    mode: "live",
    label: smart ? (via ? "Live AI (LiteLLM)" : "Live AI") : "Local AI",
    smartModel: smart ? smart.model("smart") : null,
    cheapModel: cheap ? `${cheap.name === "local" ? "local: " : ""}${cheap.model("cheap")}` : null,
    localModel,
    detail: smart
      ? `Reasoning on ${smart.model("smart")}; summarisation on ${cheap ? cheap.model("cheap") : "heuristics"}${via}${localModel ? `; private code on ${localModel}` : ""}.`
      : `Summarisation on local ${localModel}; reasoning steps use deterministic rules.`,
  };
}
