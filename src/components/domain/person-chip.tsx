import { Avatar, cn } from "../ui";

export interface PersonChipProps {
  name: string;
  /** Second line, e.g. a project role. */
  subtitle?: string;
  size?: "sm" | "md";
  className?: string;
}

export function PersonChip({ name, subtitle, size = "md", className }: PersonChipProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar name={name} size={size === "sm" ? "xs" : "sm"} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
        {subtitle ? <span className="block truncate text-xs text-muted">{subtitle}</span> : null}
      </span>
    </span>
  );
}
