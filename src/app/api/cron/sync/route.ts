import { SYSTEM_ACTOR } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { audit } from "@/lib/security/audit";
import { verifyBearer } from "@/lib/security/signatures";
import { getStore } from "@/lib/store";
import { isoDate } from "@/lib/util";
import { syncProject } from "@/lib/workflows/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Scheduled job (see vercel.json): syncs every active project and writes the
 * daily sync where it is enabled and missing. Vercel Cron sends
 * "Authorization: Bearer $CRON_SECRET"; without that secret the endpoint is closed.
 */
export async function GET(request: Request): Promise<Response> {
  if (!verifyBearer(config.cronSecret, request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  const projects = (await store.list("projects")).filter((project) => project.status === "active");
  const today = isoDate(new Date());
  const results: { project: string; ingested?: number; incidents?: number; digest?: boolean; error?: string }[] = [];
  for (const project of projects) {
    try {
      const sync = await syncProject({ project, actor: SYSTEM_ACTOR, trigger: "cron" });
      let digest = false;
      if (project.features.dailySync && !(await store.list("digests")).some((d) => d.projectId === project.id && d.date === today)) {
        const { runDailySync } = await import("@/lib/workflows/daily-sync");
        await runDailySync({ project, actor: SYSTEM_ACTOR, trigger: "cron" });
        digest = true;
      }
      results.push({ project: project.key, ingested: sync.ingested, incidents: sync.incidents.length, digest });
    } catch (error) {
      results.push({ project: project.key, error: error instanceof Error ? error.message.slice(0, 200) : "unknown error" });
    }
  }
  await audit(SYSTEM_ACTOR, "cron.sync", { detail: `${results.length} project(s)` });
  return Response.json({ ok: true, results });
}
