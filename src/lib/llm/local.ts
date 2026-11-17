import { config } from "@/lib/config";
import { OpenAICompatibleProvider } from "./openai-compatible";

/**
 * A locally hosted open model (Ollama, LM Studio, vLLM, llama.cpp server),
 * used for the summarising tier when proprietary code must not leave the
 * network. Small local models are not trusted with tool loops.
 */
export const localProvider = new OpenAICompatibleProvider({
  name: "local",
  baseUrl: () => config.localLlmBaseUrl,
  apiKey: () => config.localLlmApiKey,
  model: () => config.localLlmModel,
  temperature: 0.2,
  minTokens: { json: 2000, text: 2000 },
  tools: false,
  timeoutMs: 90_000,
});
