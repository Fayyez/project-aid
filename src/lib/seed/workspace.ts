import { sha256 } from "@/lib/util";
import type { Citation, DailyDigest, EvalCase, Feedback, Incident, Lesson, Note, ProjectEvent, ReleaseCard, Report, Thread, ChangeType } from "@/lib/types";
import type { Built } from "./build";
import { HOUR_MS, utcDate } from "./helpers";

export interface Stories {
  atlas: Built;
  helix: Built;
  orbit: Built;
  pulse: Built;
}

const ago = (now: Date, hours: number): string => new Date(now.getTime() - hours * HOUR_MS).toISOString();

function eventCitation(e: ProjectEvent, ref: string): Citation {
  return { ref, type: "event", id: e.id, title: e.title, projectId: e.projectId, occurredAt: e.occurredAt };
}

function token(id: string): string {
  return sha256(`demo-reply-${id}`);
}

// ---------------------------------------------------------------------------
// Orbit incident and report
// ---------------------------------------------------------------------------

export function buildIncident(now: Date, orbit: Built): { incident: Incident; report: Report } {
  const ev = (k: string) => orbit.eventId(k);
  const fail = orbit.deployment(7);
  const ok = orbit.deployment(8);
  const migration = orbit.event("mig-commit");
  const patch = [
    "--- a/migrations/versions/c47d9e1_add_eta_confidence.py",
    "+++ b/migrations/versions/c47d9e1_add_eta_confidence.py",
    "@@ -8,9 +8,22 @@ def upgrade():",
    "-    op.execute(\"ALTER TABLE shipment_events ADD COLUMN eta_confidence NUMERIC(4,3) NOT NULL DEFAULT 0\")",
    "-    op.execute(\"UPDATE shipment_events SET eta_confidence = estimate_confidence(id)\")",
    "+    op.execute(\"SET lock_timeout = '3s'\")",
    "+    # Step 1: nullable column, no table rewrite and no long lock.",
    "+    op.add_column('shipment_events', sa.Column('eta_confidence', sa.Numeric(4, 3), nullable=True))",
    "+",
    "+def backfill():",
    "+    # Step 2: fill in batches of 5,000 rows with a short pause between batches.",
    "+    while True:",
    "+        updated = op.get_bind().execute(BATCH_UPDATE_SQL).rowcount",
    "+        if updated == 0:",
    "+            break",
    "+        time.sleep(0.2)",
  ].join("\n");
  const incident: Incident = {
    id: "inc_orbit_001",
    projectId: "prj_orbit",
    key: "ORBIT-INC-1",
    title: "Live vehicle positions stale after failed v1.14.0 deployment",
    status: "resolved",
    severity: "SEV2",
    detectedAt: ago(now, 120.05),
    resolvedAt: ago(now, 116.4),
    trigger: { kind: "deployment", deploymentId: fail.id, detail: "Production deployment v1.14.0 failed at the database migration step; position freshness check failed minutes later." },
    triage: {
      summary: "The v1.14.0 migration took an exclusive lock on the four-million-row shipment_events table, blocking position ingestion until the migration timed out and the release rolled back.",
      suspectedCause: "Migration c47d9e1 added a NOT NULL column with a default and ran a full-table UPDATE in one transaction. Staging holds about 40,000 rows, so the problem could not show there.",
      confidence: 0.92,
      suspectEventIds: [ev("mig-commit")],
      suspectOwnerId: "per_sana",
      impact: "About 40 minutes of stale vehicle positions on the live map for Blue Harbor dispatchers and customers. No data was lost; one client message reported the symptom.",
      nextSteps: ["Split the migration into a nullable column and a batched backfill", "Redeploy as v1.14.1 and confirm positions update", "Add a lock-time check for migrations to CI", "Write a short playbook for changing large tables"],
      evidence: [
        { ref: "D1", type: "deployment", id: fail.id, title: `Production deployment ${fail.version} failed`, projectId: "prj_orbit", occurredAt: fail.startedAt },
        eventCitation(migration, "E1"),
        eventCitation(orbit.event("msg-alert"), "E2"),
      ],
    },
    fix: {
      kind: "patch",
      summary: "Split the ETA confidence migration into a nullable column added with a short lock timeout and a separate batched backfill.",
      steps: ["Add the column as nullable (no table rewrite)", "Backfill in batches of 5,000 rows with a short pause", "Add the NOT NULL constraint after the backfill in a later release", "Deploy as v1.14.1 and watch position freshness"],
      patch,
      targetRepo: "ssi/orbit-tracker",
      risk: "low",
      rollbackPlan: "Redeploy v1.13.0 and drop the nullable column; no data depends on it yet.",
      testPlan: ["Run the migration against a production-sized copy and record the lock time", "Verify live positions keep updating during the backfill", "Run the shipment events test suite"],
      revision: 2,
      status: "applied",
      decidedById: "per_omar",
      decidedAt: ago(now, 117.6),
    },
    reviews: [
      {
        round: 1, reviewer: "fix-reviewer", verdict: "revise",
        concerns: ["The backfill has no pause between batches and could saturate the database", "The patch does not set a lock timeout, so the first statement could still block ingestion"],
        checks: [
          { name: "Patch applies cleanly", passed: true, detail: "Applies to main without conflicts" },
          { name: "Avoids long table locks", passed: false, detail: "No lock_timeout on the ALTER statement" },
          { name: "Rollback plan present", passed: true, detail: "Redeploy v1.13.0 and drop the column" },
        ],
      },
      {
        round: 2, reviewer: "fix-reviewer", verdict: "approve",
        concerns: ["Consider adding the NOT NULL constraint in a later release once the backfill is verified"],
        checks: [
          { name: "Patch applies cleanly", passed: true, detail: "Applies to main without conflicts" },
          { name: "Avoids long table locks", passed: true, detail: "lock_timeout of 3s and batched updates of 5,000 rows" },
          { name: "Rollback plan present", passed: true, detail: "Redeploy v1.13.0 and drop the column" },
          { name: "Test plan covers production-sized data", passed: true, detail: "Includes a run on a production-sized copy" },
        ],
      },
    ],
    escalation: { personId: "per_kamran", reason: "Tech lead sign-off needed on the revised migration before it goes to production.", threadId: "thr_orbit_incident", at: ago(now, 119.7) },
    reportId: "rpt_orbit_inc1",
    timeline: [
      { at: ago(now, 120.4), actor: "zain", text: "Production deployment v1.14.0 started." },
      { at: ago(now, 120.2), actor: "system", text: "Deployment failed at the migration step: lock timeout on shipment_events. Release rolled back." },
      { at: ago(now, 120.05), actor: "agent:incident-triage", text: "Incident opened (SEV2). Position freshness check failing." },
      { at: ago(now, 119.9), actor: "agent:incident-triage", text: "Triage: migration c47d9e1 by Sana Iqbal is the likely cause (confidence 92%)." },
      { at: ago(now, 119.7), actor: "agent:escalator", text: "Escalated to Kamran Javed for sign-off." },
      { at: ago(now, 118.5), actor: "agent:fix-proposer", text: "Fix proposed: split migration into nullable column and batched backfill." },
      { at: ago(now, 118.1), actor: "agent:fix-reviewer", text: "Review round 1: revise (no lock timeout, no pause between batches)." },
      { at: ago(now, 117.9), actor: "agent:fix-proposer", text: "Revision 2 submitted." },
      { at: ago(now, 117.8), actor: "agent:fix-reviewer", text: "Review round 2: approve." },
      { at: ago(now, 117.6), actor: "omar", text: "Omar Siddiqui approved the fix." },
      { at: ago(now, 117), actor: "zain", text: `Deployed v1.14.1 to production (${ok.id}).` },
      { at: ago(now, 116.4), actor: "kamran", text: "Positions updating normally; incident resolved." },
    ],
  };

  const citations: Citation[] = [
    { ref: "D1", type: "deployment", id: fail.id, title: `Production deployment ${fail.version} failed`, projectId: "prj_orbit", occurredAt: fail.startedAt },
    { ref: "D2", type: "deployment", id: ok.id, title: `Production deployment ${ok.version} succeeded`, projectId: "prj_orbit", occurredAt: ok.startedAt },
    eventCitation(migration, "E1"),
    eventCitation(orbit.event("fix-commit"), "E2"),
    eventCitation(orbit.event("msg-client-inc"), "E3"),
    { ref: "I1", type: "incident", id: incident.id, title: incident.title, projectId: "prj_orbit", occurredAt: incident.detectedAt },
  ];
  const report: Report = {
    id: "rpt_orbit_inc1",
    projectId: "prj_orbit",
    kind: "incident",
    title: "Incident report: stale vehicle positions after v1.14.0 (ORBIT-INC-1)",
    periodStart: incident.detectedAt,
    periodEnd: incident.resolvedAt ?? incident.detectedAt,
    markdown: [
      "# Incident report: stale vehicle positions after v1.14.0",
      "",
      "**Severity:** SEV2. **Status:** resolved. **Duration:** about 3.5 hours from detection to resolution; customers saw stale positions for roughly 40 minutes.",
      "",
      "## What happened",
      `The v1.14.0 production deployment failed at the database migration step [D1]. The migration added an ETA confidence column to the shipment events table, which holds about four million rows in production [E1]. It locked the table for longer than the timeout, so new vehicle positions could not be saved and the live map showed old positions. Blue Harbor's dispatchers noticed and reported it [E3].`,
      "",
      "## Why it was not caught earlier",
      "Staging holds only about 40,000 shipment events, so the same migration finished in under a second there. Nothing in the release checks measured how long a migration holds a lock.",
      "",
      "## Fix",
      `The migration was split into two safe steps: add the column without locking, then fill it in small batches [E2]. The first proposal was sent back for revision because it had no lock timeout and no pause between batches; the second version was approved by Omar Siddiqui. v1.14.1 was deployed and positions recovered [D2].`,
      "",
      "## Follow-up actions",
      "- Lock-time check for migrations in CI (ORBIT-139, done).",
      "- Migration playbook for large tables (ORBIT-141, in progress).",
      "- Test migrations against a production-sized copy before release.",
      "",
      "## Customer impact",
      "No data was lost. Blue Harbor asked whether the problem was resolved and was told the same day.",
    ].join("\n"),
    citations,
    createdById: "agent:reporter",
    createdAt: ago(now, 116),
    relatedIncidentId: incident.id,
  };
  return { incident, report };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export function buildThreads(now: Date, s: Stories): Thread[] {
  const threads: Thread[] = [];
  const unclear = s.helix.event("unclear-sched");
  const helixThread: Thread = {
    id: "thr_helix_clarify",
    projectId: "prj_helix",
    kind: "clarification",
    subject: "Question about the 'Update scheduling module' change (31 files)",
    status: "open",
    createdById: "agent:clarifier",
    assigneeId: "per_sana",
    watcherIds: ["per_sara", "per_omar"],
    relatedEventIds: [unclear.id],
    replyTokenHash: token("thr_helix_clarify"),
    delivery: [
      { channel: "in_app", status: "sent", at: ago(now, 88) },
      { channel: "teams", status: "stubbed", detail: "Teams webhook not configured; shown in the portal only.", at: ago(now, 88) },
    ],
    messages: [
      {
        id: "msg_helix_clarify_1", authorId: "agent:clarifier", authorName: "Clarifier agent", via: "agent", at: ago(now, 88),
        body: "Hi Sana, a commit titled 'Update scheduling module' changed 31 files in the slot allocation code (about 620 lines added, 410 removed) and has no ticket reference. Is this the double-booking fix (HELIX-148) or a wider rework? Does it change how cancelled slots are released? A short answer is enough; the project directors want to know whether the milestone plan is affected.",
      },
    ],
    unreadForWatchers: false,
    createdAt: ago(now, 88),
    updatedAt: ago(now, 88),
  };
  threads.push(helixThread);

  const atlasQ = "Can a customer be charged twice if a payment capture is retried?";
  threads.push({
    id: "thr_atlas_escalation",
    projectId: "prj_atlas",
    kind: "escalation",
    subject: "Double-charge risk on payment capture retries",
    status: "answered",
    createdById: "per_sara",
    assigneeId: "per_nadia",
    watcherIds: ["per_sara"],
    relatedEventIds: [s.atlas.eventId("ATLAS-156:commit")],
    originQuestion: atlasQ,
    replyTokenHash: token("thr_atlas_escalation"),
    delivery: [
      { channel: "in_app", status: "sent", at: ago(now, 55) },
      { channel: "teams", status: "stubbed", detail: "Teams webhook not configured.", at: ago(now, 55) },
    ],
    messages: [
      { id: "msg_atlas_esc_1", authorId: "per_sara", authorName: "Sara Khan", via: "portal", at: ago(now, 55), body: `${atlasQ} Northwind's UAT starts next week and I want to give them a straight answer.` },
      {
        id: "msg_atlas_esc_2", authorId: "per_nadia", authorName: "Nadia Hussain", via: "reply_link", at: ago(now, 52.5),
        body: "Not once ATLAS-156 is merged: every capture request now carries an idempotency key, so a retry returns the original result instead of charging again. It is in review today and will be merged tomorrow. I tested duplicate and timed-out requests against the provider sandbox and saw exactly one charge each time. Until it merges, the risk is limited to the rare case of a double tap during a network timeout.",
      },
    ],
    unreadForWatchers: true,
    createdAt: ago(now, 55),
    updatedAt: ago(now, 52.5),
  });

  threads.push({
    id: "thr_orbit_escalation",
    projectId: "prj_orbit",
    kind: "escalation",
    subject: "Effort and prerequisites for adding Harbor Lines as a second carrier",
    status: "open",
    createdById: "per_omar",
    assigneeId: "per_kamran",
    watcherIds: ["per_omar"],
    relatedEventIds: [s.orbit.eventId("msg-harbor"), s.orbit.eventId("doc-carrier")],
    originQuestion: "Blue Harbor wants Harbor Lines on the map by month end. What is the realistic effort, and what do we need from them?",
    replyTokenHash: token("thr_orbit_escalation"),
    delivery: [
      { channel: "in_app", status: "sent", at: ago(now, 34) },
      { channel: "teams", status: "stubbed", detail: "Teams webhook not configured.", at: ago(now, 34) },
    ],
    messages: [
      {
        id: "msg_orbit_esc_1", authorId: "per_omar", authorName: "Omar Siddiqui", via: "portal", at: ago(now, 34),
        body: "Blue Harbor wants Harbor Lines on the tracking map by the end of the month. Based on your notes and ORBIT-140, what is the realistic effort and what do we need from them (sandbox access, rate limits)? I would like to reply to Marcus by Wednesday.",
      },
    ],
    unreadForWatchers: false,
    createdAt: ago(now, 34),
    updatedAt: ago(now, 34),
  });

  threads.push({
    id: "thr_orbit_incident",
    projectId: "prj_orbit",
    kind: "incident",
    subject: "ORBIT-INC-1: sign-off needed on the revised migration",
    status: "closed",
    createdById: "agent:escalator",
    assigneeId: "per_kamran",
    watcherIds: ["per_omar"],
    relatedEventIds: [s.orbit.eventId("mig-commit"), s.orbit.eventId("fix-commit")],
    relatedIncidentId: "inc_orbit_001",
    replyTokenHash: token("thr_orbit_incident"),
    delivery: [{ channel: "in_app", status: "sent", at: ago(now, 119.7) }],
    messages: [
      { id: "msg_orbit_inc_1", authorId: "agent:escalator", authorName: "Escalation agent", via: "agent", at: ago(now, 119.7), body: "Production deployment v1.14.0 failed because the ETA confidence migration locked shipment_events. Live positions are stale. Sana's revised migration needs your sign-off before it ships. Details are in incident ORBIT-INC-1." },
      { id: "msg_orbit_inc_2", authorId: "per_kamran", authorName: "Kamran Javed", via: "teams", at: ago(now, 118), body: "Reviewed the two-step approach. Fine with it as long as it has a lock timeout and batches with a pause. I will join the deploy call." },
    ],
    unreadForWatchers: false,
    createdAt: ago(now, 119.7),
    updatedAt: ago(now, 116.4),
  });
  return threads;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function buildNotes(now: Date): Note[] {
  const n = (id: string, projectId: string, authorId: string, title: string, body: string, pinned: boolean, share: boolean, hoursAgo: number): Note => ({
    id, projectId, authorId, title, body, pinned, shareWithAssistant: share, createdAt: ago(now, hoursAgo), updatedAt: ago(now, hoursAgo - 1 > 0 ? hoursAgo - 1 : hoursAgo),
  });
  return [
    n("note_sara_helix", "prj_helix", "per_sara", "Helix: what to say to Elena before Thursday", "Offer Meridian a descoped milestone: results viewing first, clinician messaging after. Be explicit that the lab feed depends on their sandbox credentials (HELIX-145) and that we cannot guarantee the date without them. Ask Usman for a written recovery plan by Wednesday. Consider moving Maryam to Helix full time.", true, true, 30),
    n("note_sara_atlas", "prj_atlas", "per_sara", "Atlas: gift cards and SCA are the launch risks", "Capacity looks fine. The two things that could hurt launch are 3-D Secure (ATLAS-159) and gift card redemption (ATLAS-161). Check both at Thursday's sync with Northwind. Subscriptions are phase 2.", false, true, 70),
    n("note_sara_pulse", "prj_pulse", "per_sara", "Pulse: admin to-dos", "Ask Kestrel's legal team to return the data processing addendum. Book the first demo for next Thursday. Remind Daniel about the identity provider details for single sign-on.", false, false, 110),
    n("note_omar_orbit", "prj_orbit", "per_omar", "Orbit post-incident actions", "Follow up on the incident actions: CI lock-time check is done (ORBIT-139); migration playbook (ORBIT-141) still open. Ask Blue Harbor for a quiet window before releasing v1.15.0. Offer Marcus a short written summary of the incident (the incident report is ready).", true, true, 60),
    n("note_omar_orbit2", "prj_orbit", "per_omar", "Second carrier: do not commit to a date yet", "Wait for Kamran's estimate on Harbor Lines (ORBIT-140) before replying to Marcus. Month-end looks tight given SMS and tracking link are still in review.", false, true, 30),
    n("note_omar_helix", "prj_helix", "per_omar", "Helix: shared with Sara", "Need an honest view from Usman on whether the results milestone can be split. The two blocked tickets are both waiting on Meridian IT; consider escalating to their IT director through Elena.", false, false, 45),
  ];
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

interface DigestPlan {
  headline: string;
  summary: string;
  highlights: string[];
  risks: string[];
  nextUp: string[];
  cards: { title: string; summary: string; ct: ChangeType; audience: "client" | "internal"; keys: string[] }[];
  citeKeys: string[];
}

function buildDigest(now: Date, b: Built, plan: DigestPlan): DailyDigest {
  const date = utcDate(now, 1);
  const onDate = (iso: string | undefined) => (iso ?? "").slice(0, 10) === date;
  const events = b.events.filter((e) => onDate(e.occurredAt));
  const cards: ReleaseCard[] = plan.cards.map((c, i) => {
    const evs = c.keys.map((k) => b.event(k));
    return {
      id: `card_${b.spec.slug}_${date}_${i + 1}`,
      title: c.title,
      summary: c.summary,
      changeType: c.ct,
      audience: c.audience,
      eventIds: evs.map((e) => e.id),
      contributorIds: Array.from(new Set(evs.map((e) => e.actorId).filter((x): x is string => Boolean(x)))),
    };
  });
  const citations = plan.citeKeys.map((k, i) => eventCitation(b.event(k), `E${i + 1}`));
  return {
    id: `dig_${b.spec.slug}_${date}`,
    projectId: b.spec.projectId,
    date,
    headline: plan.headline,
    summary: plan.summary,
    highlights: plan.highlights,
    risks: plan.risks,
    nextUp: plan.nextUp,
    cards,
    stats: {
      events: events.length,
      commits: events.filter((e) => e.kind === "commit").length,
      ticketsClosed: b.tickets.filter((t) => onDate(t.closedAt)).length,
      ticketsOpened: b.tickets.filter((t) => onDate(t.createdAt)).length,
      deployments: b.deployments.filter((d) => onDate(d.startedAt)).length,
      contributors: new Set(events.map((e) => e.actorId).filter(Boolean)).size,
    },
    citations,
    createdAt: new Date(new Date(`${utcDate(now, 0)}T01:30:00.000Z`).getTime()).toISOString(),
  };
}

export function buildDigests(now: Date, s: Stories): DailyDigest[] {
  const atlas = buildDigest(now, s.atlas, {
    headline: "Version 2.8.0 is live: payment retries are now safe and the cart shows delivery estimates",
    summary: "Atlas shipped version 2.8.0 to production yesterday. Three tickets closed: idempotent payment capture, delivery estimates on the cart page and guest checkout smoke tests in the release pipeline. Error rates stayed flat after the release.",
    highlights: [
      "Customers can no longer be charged twice when payment capture is retried (ATLAS-156) [E1].",
      "The cart page now shows a delivery date range, as Northwind requested (ATLAS-155) [E2].",
      "Version 2.8.0 went live in production and error rates stayed flat [E4][E5].",
    ],
    risks: ["3-D Secure (ATLAS-159) is still in progress and is required for UK card payments at launch.", "A 38-file pricing engine refactor from earlier this week has no linked ticket and no explanation yet."],
    nextUp: ["Gift card redemption (ATLAS-161) is in review", "Partial refunds from the admin console (ATLAS-157)", "Accessibility fixes for checkout (ATLAS-163)"],
    cards: [
      { title: "Safe payment retries", summary: "Customers who tap Pay twice or lose signal during payment are no longer charged twice.", ct: "fix", audience: "client", keys: ["ATLAS-156:pr"] },
      { title: "Delivery estimates in the cart", summary: "Shoppers see when their order will arrive before they pay.", ct: "feature", audience: "client", keys: ["ATLAS-155:pr"] },
      { title: "Guest checkout tested on every release", summary: "Automated checks now cover the highest-revenue path before every release.", ct: "test", audience: "internal", keys: ["ATLAS-154:pr"] },
    ],
    citeKeys: ["ATLAS-156:pr", "ATLAS-155:pr", "ATLAS-154:pr", "dep:9", "msg-v28-live"],
  });
  const helix = buildDigest(now, s.helix, {
    headline: "Meridian is pressing for a decision on results go-live while two blocked tickets wait on their IT",
    summary: "Yesterday Meridian followed up a second time asking whether the lab results feed is on track and said it will escalate to its executive sponsor if it does not hear back. Appointment rescheduling shipped to staging and staging is healthy, but the results work remains blocked on Meridian's sandbox credentials and SSO approval.",
    highlights: [
      "Patients will be able to reschedule appointments themselves (HELIX-144), now on staging [E2][E3].",
      "Staging smoke tests passed for release candidate v0.13.0-rc.3 [E4].",
    ],
    risks: [
      "Meridian's follow-up asks for a straight answer on the results milestone and has no recorded reply from SSI yet [E1].",
      "HELIX-145 (lab results feed) and HELIX-146 (clinician SSO) are blocked waiting on Meridian IT.",
      "Only two tickets closed last week against a pace of about seven earlier in the project; the milestone due in six days will slip.",
    ],
    nextUp: ["Reply to Meridian before their board meets on Thursday", "Resolve double-booking bug HELIX-148 (P0)", "Clarify the 31-file scheduling change with Sana"],
    cards: [
      { title: "Reschedule appointments online", summary: "Patients can move their own appointment without phoning the clinic.", ct: "feature", audience: "client", keys: ["HELIX-144:pr"] },
    ],
    citeKeys: ["msg-client-3", "HELIX-144:pr", "dep:9", "msg-staging"],
  });
  return [atlas, helix];
}

// ---------------------------------------------------------------------------
// Lessons, feedback, evals
// ---------------------------------------------------------------------------

export function buildLessons(now: Date): Lesson[] {
  return [
    { id: "lesson_global_composer", scope: "global", agent: "composer", text: "Lead with the answer, then the evidence; PDs read on mobile between meetings.", rationale: "Repeated feedback that long answers bury the conclusion.", source: "manual", status: "active", evidenceFeedbackIds: [], createdAt: ago(now, 24 * 18), decidedById: "per_sara" },
    { id: "lesson_global_summarizer", scope: "global", agent: "summarizer", text: "Describe changes by what customers or clients can now do, not by file names or code terms.", rationale: "Directors are not developers; summaries should be understandable without code context.", source: "feedback", status: "active", evidenceFeedbackIds: ["fb_report_up"], createdAt: ago(now, 24 * 12), decidedById: "per_omar" },
    { id: "lesson_helix_composer", scope: "prj_helix", agent: "composer", text: "For Helix, always state the status of blocked tickets and the next milestone date first, in two sentences or fewer.", rationale: "A PD said Helix answers were too long and missed the two blocked tickets and the milestone date.", source: "feedback", status: "proposed", evidenceFeedbackIds: ["fb_helix_long"], createdAt: ago(now, 20) },
  ];
}

export function buildFeedback(now: Date, s: Stories): Feedback[] {
  const atlasDigest = `dig_atlas_${utcDate(now, 1)}`;
  void s;
  return [
    { id: "fb_report_up", userId: "per_omar", projectId: "prj_orbit", target: { type: "report", id: "rpt_orbit_inc1" }, rating: "up", comment: "Clear and I could forward it to Blue Harbor as is.", processed: true, createdAt: ago(now, 100) },
    { id: "fb_helix_long", userId: "per_sara", projectId: "prj_helix", target: { type: "chat_message", id: "msg_seed_helix_1", conversationId: "conv_seed_helix" }, rating: "down", comment: "Too long. I only need the status of the blocked items and the milestone date.", processed: true, createdAt: ago(now, 26) },
    { id: "fb_atlas_chat_up", userId: "per_sara", projectId: "prj_atlas", target: { type: "chat_message", id: "msg_seed_atlas_1", conversationId: "conv_seed_atlas" }, rating: "up", processed: true, createdAt: ago(now, 40) },
    { id: "fb_atlas_digest_down", userId: "per_sara", projectId: "prj_atlas", target: { type: "digest", id: atlasDigest }, rating: "down", comment: "The digest did not mention the pricing engine refactor that has no ticket. I want unexplained large changes called out at the top.", processed: false, createdAt: ago(now, 3) },
  ];
}

export function buildEvals(now: Date, s: Stories): EvalCase[] {
  void s;
  const at = ago(now, 24 * 6);
  return [
    { id: "eval_helix_risk", projectId: "prj_helix", question: "Why is Helix at risk, and which tickets are blocked?", mustMention: ["HELIX-145", "HELIX-146", "Meridian"], createdById: "per_sara", createdAt: at },
    { id: "eval_orbit_incident", projectId: "prj_orbit", question: "What caused the Orbit production incident five days ago and how was it fixed?", mustMention: ["migration", "lock", "v1.14.1"], createdById: "per_omar", createdAt: at },
    { id: "eval_atlas_idempotency", projectId: "prj_atlas", question: "Which Atlas ticket protects customers from being charged twice, and who built it?", mustMention: ["ATLAS-156", "Nadia Hussain"], createdById: "per_sara", createdAt: at },
  ];
}
