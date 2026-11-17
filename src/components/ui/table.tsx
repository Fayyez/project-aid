import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** "compact" is the default for dense operational lists. */
  density?: "compact" | "comfortable";
  /** Sticky header; the table body scrolls inside its own container (max 70vh). */
  stickyHeader?: boolean;
  /** Extra classes for the scroll container (e.g. a max height). */
  containerClassName?: string;
}

/** Scrolls inside its own bordered container so the page never scrolls horizontally. */
export function Table({ density = "compact", stickyHeader, containerClassName, className, ...rest }: TableProps) {
  return (
    <div className={cn("w-full overflow-auto rounded-lg border border-line bg-surface shadow-card", stickyHeader && "max-h-[70vh]", containerClassName)}>
      <table
        data-density={density}
        className={cn(
          "w-full border-collapse text-left text-[13px] tabular-nums",
          stickyHeader && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
          density === "compact" ? "[&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5" : "[&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn(className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...rest} />;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Adds a hover background for clickable / linked rows. */
  hover?: boolean;
}

export function Tr({ hover = true, className, ...rest }: TrProps) {
  return <tr className={cn(hover && "hover:bg-surface-2/70", className)} {...rest} />;
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-align numeric columns. */
  numeric?: boolean;
}

export function Th({ numeric, className, scope = "col", ...rest }: ThProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "whitespace-nowrap border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    />
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Mono font for ids, shas, keys. */
  mono?: boolean;
  /** Muted secondary text. */
  muted?: boolean;
}

export function Td({ numeric, mono, muted, className, ...rest }: TdProps) {
  return (
    <td
      className={cn("border-b border-line align-middle", numeric && "text-right", mono && "font-mono text-xs", muted ? "text-muted" : "text-fg", className)}
      {...rest}
    />
  );
}
