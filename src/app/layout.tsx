import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Project Aid", template: "%s · Project Aid" },
  description: "Command center for project directors: health, deployments, incidents and daily summaries across client projects.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

/** Applies the persisted theme before first paint to avoid a flash. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("project-aid-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
