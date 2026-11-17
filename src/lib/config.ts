/**
 * All configuration comes from environment variables. Nothing secret is ever
 * written to the database or the repository. See .env.example for the list.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const config = {
  get appName() {
    return "Project Aid";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  /** Public base URL, used in reply links sent to team members. */
  get baseUrl(): string {
    const explicit = env("APP_BASE_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },

  // --- auth -----------------------------------------------------------------
  get authSecret(): string {
    const secret = env("AUTH_SECRET");
    if (secret) return secret;
    if (process.env.NODE_ENV === "production") {
      // Fail closed: without a secret nobody can hold a valid session.
      return "";
    }
    return "dev-only-secret-change-me";
  },
  /** Password for the seeded demo accounts. Required in production. */
  get demoPassword(): string | undefined {
    const password = env("DEMO_PASSWORD");
    if (password) return password;
    return process.env.NODE_ENV === "production" ? undefined : "demo1234";
  },
  get cronSecret() {
    return env("CRON_SECRET");
  },

  // --- models ---------------------------------------------------------------
  /** "off" forces the deterministic heuristics even when a key is present. */
  get llmMode(): "auto" | "off" {
    return env("PROJECT_AID_LLM") === "off" ? "off" : "auto";
  },
  get anthropicConfigured(): boolean {
    return Boolean(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"));
  },
  get smartModel() {
    return env("SMART_MODEL") ?? "claude-opus-5-5";
  },
  get cheapModel() {
    return env("CHEAP_MODEL") ?? "claude-haiku-5-5";
  },
  // LiteLLM gateway: when set, every model call goes through it.
  get litellmBaseUrl() {
    return env("LITELLM_BASE_URL")?.replace(/\/$/, "");
  },
  get litellmApiKey() {
    return env("LITELLM_API_KEY");
  },
  /** Model names as defined in the LiteLLM configuration (aliases or "provider/model"). */
  get litellmSmartModel() {
    return env("LITELLM_SMART_MODEL") ?? "anthropic/claude-opus-5-5";
  },
  get litellmCheapModel() {
    return env("LITELLM_CHEAP_MODEL") ?? "anthropic/claude-haiku-5-5";
  },
  /** A model that LiteLLM serves from your own hardware, for projects in "local" privacy mode. */
  get litellmLocalModel() {
    return env("LITELLM_LOCAL_MODEL");
  },
  get litellmMaxTokens(): number {
    const value = Number(env("LITELLM_MAX_TOKENS"));
    return Number.isFinite(value) && value >= 256 ? Math.floor(value) : 8000;
  },
  get litellmSendReasoningEffort(): boolean {
    return env("LITELLM_SEND_REASONING_EFFORT") === "true";
  },
  /** OpenAI-compatible endpoint of a local model server (Ollama, LM Studio, vLLM). */
  get localLlmBaseUrl() {
    return env("LOCAL_LLM_BASE_URL")?.replace(/\/$/, "");
  },
  get localLlmModel() {
    return env("LOCAL_LLM_MODEL") ?? "qwen2.5-coder:7b";
  },
  get localLlmApiKey() {
    return env("LOCAL_LLM_API_KEY");
  },

  // --- storage --------------------------------------------------------------
  get redisUrl() {
    return env("UPSTASH_REDIS_REST_URL") ?? env("KV_REST_API_URL");
  },
  get redisToken() {
    return env("UPSTASH_REDIS_REST_TOKEN") ?? env("KV_REST_API_TOKEN");
  },
  get storeKind(): "memory" | "redis" {
    const forced = env("PROJECT_AID_STORE");
    if (forced === "memory") return "memory";
    return this.redisUrl && this.redisToken ? "redis" : "memory";
  },
  /** Directory for the JSON snapshot of the in-memory store. Empty disables persistence. */
  get dataDir(): string {
    const dir = process.env.PROJECT_AID_DATA_DIR;
    if (dir !== undefined) return dir;
    if (env("VERCEL")) return "/tmp/project-aid";
    return ".data";
  },
  /** Seed the demo portfolio into an empty store. */
  get seedDemo(): boolean {
    return env("PROJECT_AID_SEED") !== "off";
  },

  // --- integrations ---------------------------------------------------------
  get githubWebhookSecret() {
    return env("GITHUB_WEBHOOK_SECRET");
  },
  get teamsWebhookUrl() {
    return env("TEAMS_WEBHOOK_URL");
  },
  get teamsOutgoingWebhookSecret() {
    return env("TEAMS_OUTGOING_WEBHOOK_SECRET");
  },
  get slackWebhookUrl() {
    return env("SLACK_WEBHOOK_URL");
  },
  get slackSigningSecret() {
    return env("SLACK_SIGNING_SECRET");
  },
  get resendApiKey() {
    return env("RESEND_API_KEY");
  },
  get emailFrom() {
    return env("EMAIL_FROM") ?? "Project Aid <onboarding@resend.dev>";
  },
  /** Read any environment variable by name (used for per-source credentials). */
  secret(name?: string): string | undefined {
    return name ? env(name) : undefined;
  },
};

export type AppConfig = typeof config;
