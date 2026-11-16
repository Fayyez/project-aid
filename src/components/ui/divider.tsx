import { cn } from "./cn";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({ orientation = "horizontal", className }: DividerProps) {
  return orientation === "vertical" ? (
    <span role="separator" aria-orientation="vertical" className={cn("inline-block h-4 w-px bg-line", className)} />
  ) : (
    <hr className={cn("border-0 border-t border-line", className)} />
  );
}
