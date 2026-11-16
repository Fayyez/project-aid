/**
 * Prop contracts for feature components that are shared between pages.
 * Each component lives next to this file and implements exactly its interface.
 */

/** ticket-drafts.tsx: turns a message into ticket drafts, lets the director edit and confirm them. */
export interface TicketDraftDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Pre-filled message text. When set and `autoDraft` is true the drafts are generated on open. */
  initialText?: string;
  autoDraft?: boolean;
  /** Called after tickets were created, with their keys (e.g. ["ATLAS-170"]). */
  onCreated?: (keys: string[]) => void;
}

/** escalate-dialog.tsx: asks a team member a question; suggests the best owner. */
export interface EscalateDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  defaultQuestion?: string;
  /** Called after the question was sent, with the new thread id. */
  onSent?: (threadId: string) => void;
}

/** run-trace.tsx: the step-by-step view of one agent run (server-renderable). */
export interface RunTraceProps {
  run: import("@/lib/types").AgentRun;
  /** Compact mode hides previews until a step is expanded. */
  compact?: boolean;
}

/** feedback-buttons.tsx: thumbs up/down with an optional comment, wired to feedbackAction. */
export interface FeedbackButtonsProps {
  target: import("@/lib/types").Feedback["target"];
  projectId?: string;
  runId?: string;
  initial?: "up" | "down";
  size?: "sm" | "md";
}
