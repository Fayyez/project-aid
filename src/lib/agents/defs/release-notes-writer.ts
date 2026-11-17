import { z } from "zod";
import { defineAgent } from "@/lib/agents/runtime";
import type { AnalysisInput } from "@/lib/agents/defs/activity-analyst";
import { truncate } from "@/lib/util";

const CHANGE_TYPES = ["feature", "fix", "refactor", "chore", "docs", "test", "infra", "security", "other"] as const;

export const ReleaseNotesSchema = z.object({
  cards: z
    .array(
      z.object({
        title: z.string().describe("Short release-note headline, at most 70 characters"),
        summary: z.string().describe("One or two sentences a client could read: what is new or fixed and who benefits. No jargon, no ticket numbers."),
        changeType: z.enum(CHANGE_TYPES),
        audience: z.enum(["client", "internal"]).describe("client when users or the client see the change; internal for notable engineering changes"),
        refs: z.array(z.string()).describe("Event references behind the card, without brackets, e.g. ['E2']"),
      }),
    )
    .describe("Zero to six cards. Empty when nothing user-facing or notable happened."),
});

export type ReleaseNotes = z.infer<typeof ReleaseNotesSchema>;

export function heuristicReleaseNotes(input: AnalysisInput): ReleaseNotes {
  const candidates = input.items
    .filter((i) => i.type === "event" && (i.changeType === "feature" || i.changeType === "fix" || i.changeType === "security") && (i.userFacing || i.importance >= 4))
    .sort((a, b) => Number(b.userFacing) - Number(a.userFacing) || b.importance - a.importance)
    .slice(0, 6);
  return {
    cards: candidates.map((i) => ({
      title: truncate(i.title, 70),
      summary: truncate(i.summary, 220),
      changeType: (CHANGE_TYPES as readonly string[]).includes(i.changeType ?? "") ? (i.changeType as (typeof CHANGE_TYPES)[number]) : "other",
      audience: i.userFacing ? ("client" as const) : ("internal" as const),
      refs: [i.ref],
    })),
  };
}

export const releaseNotesWriter = defineAgent<AnalysisInput, ReleaseNotes>({
  name: "release-notes-writer",
  title: "Write release-note cards",
  description: "Turns user-facing or notable changes into short release-note cards a client could read.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 2500,
  system: `You write short release-note cards from project activity.

Only include changes that users or the client would notice, or that are notable for the team (security, major fixes, significant features). Skip refactors, chores, tests and routine work unless they change behaviour. Write for a client: plain language, what changed and who benefits, no internal jargon, no code. Each card must name the event references it is based on; never write a card without evidence. Return no cards when nothing qualifies.`,
  schema: ReleaseNotesSchema,
  prompt(input) {
    return [`Project: ${input.projectName}`, `Window: ${input.window}`, input.evidence, "Write release-note cards for the notable changes. Use event references (E...) in refs."].join("\n");
  },
  fallback: heuristicReleaseNotes,
});
