"use client";

import { X } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { IconButton } from "./icon-button";
import { useModalDialog } from "./use-modal";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Edge the panel slides from. Defaults to "right". */
  side?: "right" | "left";
  /** CSS width, e.g. "32rem". Capped at 100vw. */
  width?: string;
  /** Hide the title bar (used for the mobile navigation drawer). The title stays as the accessible name. */
  hideHeader?: boolean;
  className?: string;
}

/** Slide-over panel on the native `<dialog>`: `<Drawer open={open} onClose={close} title="Ticket ATLAS-12">...</Drawer>` */
export function Drawer({ open, onClose, title, description, children, footer, side = "right", width, hideHeader, className }: DrawerProps) {
  const { ref, handlers } = useModalDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      data-side={side}
      className={cn("aid-drawer", className)}
      style={width ? ({ "--drawer-w": width } as CSSProperties) : undefined}
      aria-labelledby={titleId}
      {...handlers}
    >
      <div className="flex h-full flex-col">
        <div className={cn("flex items-start justify-between gap-3 border-b border-line px-5 py-4", hideHeader && "sr-only")}>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          </div>
          <IconButton label="Close panel" size="sm" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
