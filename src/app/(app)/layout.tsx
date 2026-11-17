import { logoutAction } from "@/app/actions";
import { AppShell } from "@/components/shell";
import { requireActor } from "@/lib/auth/current";
import { llmStatus } from "@/lib/llm";
import { getShellData } from "@/lib/services/queries";
import { getStore } from "@/lib/store";

// Agent workflows started from these pages can take a while when models are live.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [shell, store] = await Promise.all([getShellData(actor), getStore()]);
  const person = await store.get("people", actor.id);
  const llm = llmStatus();
  return (
    <AppShell
      user={{ name: actor.name, email: person?.email ?? "", role: actor.role === "pd" ? "Project director" : "Administrator" }}
      projects={shell.projects}
      counts={shell.counts}
      llm={{ mode: llm.mode, label: llm.label }}
      signOutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
