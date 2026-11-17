"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

interface RunOptions {
  /** Toast shown on success. */
  success?: string;
  /** Refresh server data after success. Default true. */
  refresh?: boolean;
}

/** Runs a server action with a pending flag, an error toast, an optional success toast and a refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, options: RunOptions = {}): Promise<ActionResult<T>> => {
      setPending(true);
      try {
        const result = await fn();
        if (!result.ok) {
          toast({ tone: "danger", title: result.error });
        } else {
          if (options.success) toast({ tone: "success", title: options.success });
          if (options.refresh !== false) router.refresh();
        }
        return result;
      } catch {
        const error = "Something went wrong. Please try again.";
        toast({ tone: "danger", title: error });
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { run, pending, router };
}
