"use client";

import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "./cn";
import { IconButton } from "./icon-button";
import { useModalDialog } from "./use-modal";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer slot, usually right-aligned buttons. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

/** Accessible modal built on the native `<dialog>` (focus trap, Esc, inert background). Controlled via `open`. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  const { ref, handlers } = useModalDialog(open, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      className={cn("aid-dialog", sizes[size], className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      {...handlers}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-[13px] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
