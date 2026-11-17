import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/features/chat/chat-view";
import { PageHeader } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getConversation, listConversations } from "@/lib/services/chat";
import type { Conversation } from "@/lib/types";

export const metadata: Metadata = { title: "Ask Project Aid" };

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const c = typeof sp.c === "string" ? sp.c : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 2000) : undefined;
  const conversations = await listConversations(actor);
  let conversation: Conversation | undefined;
  if (c) {
    try {
      conversation = await getConversation(actor, c);
    } catch (error) {
      if (error instanceof AccessError) notFound();
      throw error;
    }
  }
  return (
    <>
      <PageHeader title="Ask Project Aid" description="Ask anything about your projects. Answers cite the work they are based on." />
      <ChatView key={conversation?.id ?? "new"} userName={actor.name} conversations={conversations} conversation={conversation} initialQuery={q} basePath="/chat" />
    </>
  );
}
