"use client";

import { useState, type ReactNode } from "react";
import { Drawer } from "../ui";
import { Sidebar, type ShellProject } from "./sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps {
  user: { name: string; email: string; role: string };
  projects: ShellProject[];
  counts: { inbox: number; incidents: number };
  llm: { mode: "live" | "heuristic"; label: string };
  signOutAction: () => Promise<void>;
  children: ReactNode;
}

/**
 * Authenticated application frame: sidebar (drawer on phones), top bar, content area (max 1400px).
 * Apply it in the route-group layout: `<AppShell user=... projects=... counts=... llm=... signOutAction={signOut}>{children}</AppShell>`
 */
export function AppShell({ user, projects, counts, llm, signOutAction, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <Sidebar projects={projects} counts={counts} />
      </aside>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" width="18rem" title="Navigation" hideHeader className="lg:hidden">
        <Sidebar projects={projects} counts={counts} onNavigate={() => setMenuOpen(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-col">
        <Topbar user={user} llm={llm} signOutAction={signOutAction} onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
