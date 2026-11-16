import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { getThreadForReply } from "@/lib/workflows/threads";
import { formatDateTime } from "@/lib/format";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Answer a question", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="min-h-dvh bg-bg px-4 py-10 text-fg">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  );
}

export default async function PublicReplyPage({ params, searchParams }: PageProps<"/reply/[threadId]">) {
  const { threadId } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const found = token ? await getThreadForReply(threadId, token) : null;

  if (!found || !token) {
    return (
      <Shell>
        <div className="rounded-lg border border-line bg-surface p-6 text-center shadow-card">
          <Lock size={22} aria-hidden className="mx-auto text-muted" />
          <h1 className="mt-3 text-lg font-semibold">This link is not valid any more</h1>
          <p className="mt-1 text-sm text-muted">If you still need to answer a question, ask the person who sent it for a new link.</p>
        </div>
      </Shell>
    );
  }

  const { thread, project } = found;
  const asker = thread.createdById.startsWith("agent:") ? "Project Aid" : "a project director";
  const closed = thread.status === "closed";
  return (
    <Shell>
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{project.name}</p>
        <h1 className="mt-1 text-xl font-semibold leading-snug">{asker === "Project Aid" ? "Project Aid has a question for you" : "A project director has a question for you"}</h1>
        <p className="mt-1 text-sm text-muted">
          Asked by {asker} about <span className="text-fg">{project.name}</span>. {closed ? "This conversation has been closed." : "Your answer goes straight back to them."}
        </p>
      </header>
      <section aria-label="The conversation so far" className="space-y-3">
        <h2 className="sr-only">The conversation so far</h2>
        <ol className="space-y-3">
          {thread.messages.map((m) => (
            <li key={m.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                <span className="text-[13px] font-semibold text-fg">{m.authorId.startsWith("agent:") ? "Project Aid" : m.authorName}</span>
                <time dateTime={m.at}>{formatDateTime(m.at)}</time>
              </p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Your answer" className="mt-6">
        {closed ? (
          <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">Thank you. This conversation is closed and no longer takes answers.</p>
        ) : (
          <>
            {thread.status === "answered" ? <p className="mb-3 text-[13px] text-muted">Someone already answered. You can add more below.</p> : null}
            <ReplyForm threadId={thread.id} token={token} />
          </>
        )}
      </section>
    </Shell>
  );
}
