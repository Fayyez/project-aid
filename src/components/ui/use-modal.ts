"use client";

import { useEffect, useRef } from "react";

/** Syncs a native <dialog> with an `open` prop. Esc and backdrop clicks call `onClose`. */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const handlers = {
    onClose: () => {
      if (open) onCloseRef.current();
    },
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onCloseRef.current();
    },
  };
  return { ref, handlers };
}
