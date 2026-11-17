import type { Store } from "@/lib/store";
import { buildStory } from "./build";
import { buildPeople } from "./people";
import { buildProjects } from "./projects";
import { ATLAS } from "./stories/atlas";
import { HELIX } from "./stories/helix";
import { ORBIT } from "./stories/orbit";
import { PULSE } from "./stories/pulse";
import { buildDigests, buildEvals, buildFeedback, buildIncident, buildLessons, buildNotes, buildThreads, type Stories } from "./workspace";

/** Stable ids that tests, docs and the login page can refer to. */
export const DEMO_IDS = {
  people: { sara: "per_sara", omar: "per_omar", admin: "per_admin" },
  projects: { atlas: "prj_atlas", helix: "prj_helix", orbit: "prj_orbit", pulse: "prj_pulse" },
  threads: { helixClarification: "thr_helix_clarify", atlasEscalation: "thr_atlas_escalation", orbitEscalation: "thr_orbit_escalation", orbitIncident: "thr_orbit_incident" },
  incident: "inc_orbit_001",
  incidentReport: "rpt_orbit_inc1",
} as const;

export const DEMO_ACCOUNTS: { name: string; email: string; role: "pd" | "admin"; note: string }[] = [
  { name: "Sara Khan", email: "sara.khan@ssi.example", role: "pd", note: "Directs Atlas, Helix and Pulse. Start here to see the at-risk Helix project." },
  { name: "Omar Siddiqui", email: "omar.siddiqui@ssi.example", role: "pd", note: "Directs Helix and Orbit. Sees the resolved Orbit incident and its report." },
  { name: "Ayesha Malik", email: "admin@ssi.example", role: "admin", note: "Admin: sees every project, manages people, sources and settings." },
];

/** Writes the complete demo portfolio. All timestamps are relative to now. */
export async function seedDemoData(store: Store): Promise<void> {
  const now = new Date();
  const stories: Stories = {
    atlas: buildStory(ATLAS, now),
    helix: buildStory(HELIX, now),
    orbit: buildStory(ORBIT, now),
    pulse: buildStory(PULSE, now),
  };
  const all = [stories.atlas, stories.helix, stories.orbit, stories.pulse];
  const { incident, report } = buildIncident(now, stories.orbit);
  // The two follow-up tickets were created by the incident.
  for (const n of [138, 139]) {
    const t = stories.orbit.ticket(n);
    t.origin = { kind: "incident", ref: incident.id, text: incident.title };
  }

  await store.putMany("people", buildPeople(now));
  await store.putMany("projects", buildProjects(now));
  await store.putMany("events", all.flatMap((b) => b.events));
  await store.putMany("tickets", all.flatMap((b) => b.tickets));
  await store.putMany("deployments", all.flatMap((b) => b.deployments));
  await store.putMany("incidents", [incident]);
  await store.putMany("reports", [report]);
  await store.putMany("threads", buildThreads(now, stories));
  await store.putMany("notes", buildNotes(now));
  await store.putMany("digests", buildDigests(now, stories));
  await store.putMany("lessons", buildLessons(now));
  await store.putMany("feedback", buildFeedback(now, stories));
  await store.putMany("evals", buildEvals(now, stories));
}
