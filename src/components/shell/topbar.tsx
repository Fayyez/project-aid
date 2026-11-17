"use client";

import { LogOut, Menu, Search, Settings, Sparkles, Cog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avatar, Badge, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, IconButton } from "../ui";
import { ThemeToggle } from "./theme-toggle";

export interface TopbarProps {
  user: { name: string; email: string; role: string };
  llm: { mode: "live" | "heuristic"; label: string };
  signOutAction: () => Promise<void>;
  onOpenMenu: () => void;
}

export function Topbar({ user, llm, signOutAction, onOpenMenu }: TopbarProps) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    router.push(`/chat?q=${encodeURIComponent(text)}`);
    setQ("");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
      <IconButton label="Open navigation" onClick={onOpenMenu} className="lg:hidden">
        <Menu size={18} />
      </IconButton>

      <form onSubmit={submit} role="search" className="relative min-w-0 max-w-xl flex-1">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          aria-label="Ask about your projects"
          placeholder="Ask about your projects..."
          className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-subtle hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <span
          title={llm.mode === "live" ? "AI assistant is using a live model" : "No live model: answers come from deterministic heuristics"}
          className="inline-flex"
        >
          <Badge tone={llm.mode === "live" ? "success" : "warning"} icon={llm.mode === "live" ? <Sparkles aria-hidden /> : <Cog aria-hidden />} className="h-6">
            <span className="sr-only sm:not-sr-only">{llm.label}</span>
          </Badge>
        </span>
        <ThemeToggle />
        <DropdownMenu label="User menu" align="end" chevron trigger={<Avatar name={user.name} size="sm" />} triggerClassName="gap-1 px-1.5">
          <DropdownMenuLabel>
            <span className="block text-[13px] font-medium text-fg">{user.name}</span>
            <span className="block break-all">{user.email}</span>
            <span className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted">{user.role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem href="/settings" icon={<Settings />}>
            Settings
          </DropdownMenuItem>
          <form action={signOutAction}>
            <DropdownMenuItem type="submit" icon={<LogOut />}>
              Sign out
            </DropdownMenuItem>
          </form>
        </DropdownMenu>
      </div>
    </header>
  );
}

