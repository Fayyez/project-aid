import type { CSSProperties } from "react";
import { cn } from "./cn";

/** Deterministic hue (0-359) from a name. */
export function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" };

export interface AvatarProps {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}

/** Initials avatar with a stable colour per name: `<Avatar name="Priya Nair" />` */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      style={{ "--h": hueFromName(name) } as CSSProperties}
      className={cn("avatar-tint inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none", sizes[size], className)}
    >
      {initials(name)}
    </span>
  );
}

export interface AvatarStackProps {
  people: { name: string }[];
  /** Max avatars before collapsing into "+N". */
  max?: number;
  size?: keyof typeof sizes;
  className?: string;
}

export function AvatarStack({ people, max = 4, size = "sm", className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn("inline-flex items-center -space-x-1.5", className)}>
      {shown.map((p, i) => (
        <Avatar key={p.name + i} name={p.name} size={size} className="ring-2 ring-surface" />
      ))}
      {extra > 0 ? (
        <span
          title={people.slice(max).map((p) => p.name).join(", ")}
          className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-muted ring-2 ring-surface", sizes[size])}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
