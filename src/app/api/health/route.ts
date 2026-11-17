import { config } from "@/lib/config";
import { llmStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Liveness and mode. Reports no configuration values. */
export async function GET() {
  const llm = llmStatus();
  return Response.json({ ok: true, ai: llm.mode, store: config.storeKind, time: new Date().toISOString() });
}
