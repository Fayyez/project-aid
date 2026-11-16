import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required accessible name, also used as the native tooltip. */
  label: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "subtle";
  children: ReactNode;
}

const variants = {
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  secondary: "border border-line-strong bg-surface text-fg shadow-card hover:bg-surface-2",
  subtle: "bg-accent-soft text-accent hover:brightness-95",
};

/** Square icon-only button: `<IconButton label="Close"><X size={16} /></IconButton>` */
export function IconButton({ label, size = "md", variant = "ghost", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "size-7" : "size-9",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
