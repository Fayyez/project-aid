import { config } from "@/lib/config";
import type { PrivacySettings, Tier } from "@/lib/types";
import { AnthropicProvider } from "./anthropic";
import { LocalProvider } from "./local";
import type { LlmProvider } from "./types";

export * from "./types";

const anthropic = new AnthropicProvider();
const local = new LocalProvider();

export interface RoutingOptions {
  /** True when the prompt contains source code or diffs. */
  handlesCode?: boolean;
  privacy?: PrivacySettings;
}

/**
 * Chooses the model provider for a step, or null when the step must run on the
 * deterministic heuristic path.
 *
 * Privacy rules are enforced here, in one place:
 *  - "metadata-only" projects: no model ever sees code.
 *  - "local" projects: code goes to the local model only. If none is configured
 *    the step falls back to heuristics; it is never sent to a cloud model.
 */
export function pickProvider(tier: Tier, options: RoutingOptions = {}): LlmProvider | null {
  if (config.llmMode === "off") return null;
  const localAvailable = Boolean(config.localLlmBaseUrl);
  if (options.handlesCode) {
    const mode = options.privacy?.codeSummaryMode ?? "cloud";
    if (mode === "metadata-only") return null;
    if (mode === "local") return localAvailable ? local : null;
  }
  if (tier === "cheap" && localAvailable && process.env.CHEAP_PROVIDER === "local") return local;
  if (config.anthropicConfigured) return anthropic;
  // No cloud credential: the cheap tier can still run on a local model.
  if (tier === "cheap" && localAvailable) return local;
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
  const localModel = config.localLlmBaseUrl ? config.localLlmModel : null;
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
          : "No model credential is configured. Agents use deterministic rules. Set ANTHROPIC_API_KEY to enable live reasoning.",
    };
  }
  return {
    mode: "live",
    label: smart ? "Live AI" : "Local AI",
    smartModel: smart ? smart.model("smart") : null,
    cheapModel: cheap ? `${cheap.name === "local" ? "local: " : ""}${cheap.model("cheap")}` : null,
    localModel,
    detail: smart
      ? `Reasoning on ${smart.model("smart")}; summarisation on ${cheap ? cheap.model("cheap") : "heuristics"}${localModel ? `; private code on local ${localModel}` : ""}.`
      : `Summarisation on local ${localModel}; reasoning steps use deterministic rules.`,
  };
}
