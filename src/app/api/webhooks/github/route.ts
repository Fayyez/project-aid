import { after } from "next/server";
import { SYSTEM_ACTOR } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { audit } from "@/lib/security/audit";
import { verifyGithubSignature } from "@/lib/security/signatures";
import { getStore } from "@/lib/store";
import { syncProject } from "@/lib/workflows/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RELEVANT = new Set(["push", "pull_request", "deployment_status", "workflow_run", "issues", "release"]);

/**
 * GitHub webhook receiver. The payload is only used to find which project the
 * repository belongs to; the data itself is then pulled through the GitHub
 * connector, so nothing in an unauthenticated-looking payload is trusted.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!verifyGithubSignature(config.githubWebhookSecret, body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = request.headers.get("x-github-event") ?? "";
  if (event === "ping") return Response.json({ ok: true });
  if (!RELEVANT.has(event)) return Response.json({ ok: true, ignored: event });

  let fullName = "";
  try {
    const payload = JSON.parse(body) as { repository?: { full_name?: string } };
    fullName = String(payload.repository?.full_name ?? "").toLowerCase();
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  const store = await getStore();
  const projects = (await store.list("projects")).filter(
    (project) => project.status === "active" && project.sources.some((source) => source.enabled && source.kind === "github" && `${source.config.owner}/${source.config.repo}`.toLowerCase() === fullName),
  );
  // Acknowledge quickly; the sync (and any incident triage it triggers) runs after the response.
  after(async () => {
    for (const project of projects) {
      try {
        await syncProject({ project, actor: SYSTEM_ACTOR, trigger: "webhook" });
      } catch (error) {
        await audit(SYSTEM_ACTOR, "webhook.sync_failed", { projectId: project.id, detail: error instanceof Error ? error.message : "unknown error" });
      }
    }
  });
  return Response.json({ ok: true, projects: projects.length });
}
