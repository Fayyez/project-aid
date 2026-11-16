import { z } from "zod";
import { defineAgent } from "@/lib/agents/runtime";
import { wrapUntrusted } from "@/lib/security/redact";
import { tokenize, truncate } from "@/lib/util";

export interface DeduperCandidate {
  key: string;
  title: string;
  description: string;
  status: string;
}

export interface DeduperInput {
  items: { index: number; title: string; description: string; candidates: DeduperCandidate[] }[];
}

export const DeduperSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().describe("The index of the draft this result is for"),
      duplicateOfKey: z.string().nullable().describe("Key of the existing ticket that already covers the same request, otherwise null"),
      reason: z.string().describe("One short sentence"),
    }),
  ),
});

export type DeduperOutput = z.infer<typeof DeduperSchema>;

export function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Similarity of a draft to an existing ticket: the better of title-only and title-plus-description overlap. */
export function similarity(draft: { title: string; description: string }, ticket: { title: string; description: string }): number {
  const titles = jaccard(tokenize(draft.title), tokenize(ticket.title));
  const full = jaccard(tokenize(`${draft.title} ${draft.description}`), tokenize(`${ticket.title} ${ticket.description}`));
  return Math.max(titles, full);
}

export const DUPLICATE_THRESHOLD = 0.5;

export function heuristicDedupe(input: DeduperInput): DeduperOutput {
  return {
    results: input.items.map((item) => {
      let best: { candidate: DeduperCandidate; score: number } | undefined;
      for (const candidate of item.candidates) {
        const score = similarity(item, candidate);
        if (!best || score > best.score) best = { candidate, score };
      }
      if (best && best.score >= DUPLICATE_THRESHOLD) {
        return { index: item.index, duplicateOfKey: best.candidate.key, reason: `Wording overlaps ${Math.round(best.score * 100)}% with ${best.candidate.key} "${truncate(best.candidate.title, 60)}".` };
      }
      return { index: item.index, duplicateOfKey: null, reason: "No existing open ticket covers the same request." };
    }),
  };
}

export const ticketDeduper = defineAgent<DeduperInput, DeduperOutput>({
  name: "ticket-deduper",
  title: "Check drafts against open tickets",
  description: "Decides whether a ticket draft repeats a request that an existing open ticket already covers.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 1500,
  system: `You compare new ticket drafts with existing open tickets of the same project and decide whether a draft is a duplicate.

A draft is a duplicate only when an existing ticket asks for the same outcome. Related but different work is not a duplicate. When unsure, answer null. Only use keys from the candidate list shown for that draft. Return one result per draft index.`,
  schema: DeduperSchema,
  prompt(input) {
    return input.items
      .map((item) => {
        const candidates = item.candidates.map((candidate) => `${candidate.key} [${candidate.status}] ${truncate(candidate.title, 100)} - ${truncate(candidate.description, 200)}`).join("\n");
        return [`Draft ${item.index}:`, wrapUntrusted("draft", `${item.title}\n${truncate(item.description, 400)}`, 700), "Candidates:", wrapUntrusted("existing tickets", candidates || "(none)", 2500)].join("\n");
      })
      .join("\n\n");
  },
  fallback: heuristicDedupe,
});
