"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "../ui";

const STORAGE_KEY = "project-aid-theme";
type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  window.addEventListener("project-aid-theme", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("project-aid-theme", cb);
  };
}

function current(): Theme {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Toggles `data-theme` on <html> and persists the choice (the inline script in the root layout restores it before paint). */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event("project-aid-theme"));
  }

  return (
    <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle} className={className} suppressHydrationWarning>
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </IconButton>
  );
}
