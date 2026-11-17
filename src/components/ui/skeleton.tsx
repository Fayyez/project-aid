import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Shimmering placeholder block. Size it with classes: `<Skeleton className="h-4 w-40" />` */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("aid-skeleton h-4 rounded-md", className)} {...rest} />;
}
