/** The shape every server action returns, so client components can show errors uniformly. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export function errorMessage(error: unknown): string {
  // Errors raised by our own services carry messages written for end users.
  if (error instanceof Error && error.message && error.message.length < 300) return error.message;
  return "Something went wrong. Please try again.";
}
