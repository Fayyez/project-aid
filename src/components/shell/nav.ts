import { Activity, GraduationCap, Inbox, LayoutDashboard, MessageSquare, Settings, Siren, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which entry of `counts` feeds the badge. */
  count?: "inbox" | "incidents";
  exact?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Portfolio", href: "/", icon: LayoutDashboard, exact: true },
  { label: "Assistant", href: "/chat", icon: MessageSquare },
  { label: "Inbox", href: "/inbox", icon: Inbox, count: "inbox" },
  { label: "Incidents", href: "/incidents", icon: Siren, count: "incidents" },
  { label: "Agent runs", href: "/runs", icon: Activity },
  { label: "Learning", href: "/learning", icon: GraduationCap },
  { label: "Settings", href: "/settings", icon: Settings },
];
