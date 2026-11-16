import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/features/chat/chat-view";
import { AccessError, requireProject } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getConversation, listConversations } from "@/lib/services/chat";
import type { Conversation, Project } from "@/lib/types";

export const metadata: Metadata = { title: "Project chat" };

export default async function ProjectChatPage({ params, searchParams }: PageProps<"/projects/[id]/chat">) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const c = typeof sp.c === "string" ? sp.c : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 2000) : undefined;
  let project: Project;
  let conversation: Conversation | undefined;
  try {
    project = await requireProject(actor, id);
    if (c) {
      conversation = await getConversation(actor, c);
      if (conversation.projectId !== id) notFound();
    }
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const conversations = await listConversations(actor, id);
  return <ChatView key={conversation?.id ?? "new"} userName={actor.name} projectId={id} projectName={project.name} conversations={conversations} conversation={conversation} initialQuery={q} basePath={`/projects/${id}/chat`} heightClass="h-[calc(100dvh-17rem)]" />;
}
