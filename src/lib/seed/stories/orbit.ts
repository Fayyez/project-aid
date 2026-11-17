import { D, H, Y } from "../helpers";
import type { StorySpec } from "./types";

/**
 * Orbit Logistics Tracker (Blue Harbor Freight): mostly fine, steady five
 * tickets a week. A production deployment failed exactly five days ago because
 * of a blocking database migration; it was fixed and resolved the same day.
 * All incident-related items are placed with exact hour offsets from "now".
 */
export const ORBIT: StorySpec = {
  projectId: "prj_orbit",
  slug: "orbit",
  key: "ORBIT",
  sourceId: "src_orbit_sim",
  repo: "ssi/orbit-tracker",
  repoByArea: { mobile: "ssi/orbit-driver-app" },
  lead: "kamran",
  team: ["kamran", "daniyal", "zain", "sana", "leila"],
  owners: {
    tracking: ["kamran", "sana"],
    mobile: ["daniyal", "leila"],
    notifications: ["sana"],
    "carrier-integrations": ["sana", "kamran"],
    reporting: ["kamran", "leila"],
    infra: ["zain"],
  },
  startDaysAgo: 84,
  milestoneIds: ["ms_orbit_1", "ms_orbit_2", "ms_orbit_3", "ms_orbit_4"],
  buckets: [4, 5, 5, 5, 5, 5, 5, 5],
  histBase: 101,
  histMs: [2, 2, 2, 1, 1, 0, 0, 0],
  reviewProb: 0.3,
  secondCommitProb: 0.2,
  prBase: 77,
  histNouns: [
    { a: "tracking", noun: "live map marker clustering" },
    { a: "tracking", noun: "shipment status timeline" },
    { a: "tracking", noun: "geofence arrival detection" },
    { a: "tracking", noun: "position update ingestion" },
    { a: "mobile", noun: "driver app login screen" },
    { a: "mobile", noun: "proof of delivery photo upload" },
    { a: "mobile", noun: "offline sync queue" },
    { a: "mobile", noun: "route list screen" },
    { a: "notifications", noun: "delay alert emails" },
    { a: "notifications", noun: "SMS delivery updates" },
    { a: "notifications", noun: "webhook retry logic" },
    { a: "carrier-integrations", noun: "carrier status mapping" },
    { a: "carrier-integrations", noun: "carrier API rate limit handling" },
    { a: "carrier-integrations", noun: "EDI 214 message parser" },
    { a: "reporting", noun: "on-time delivery report" },
    { a: "reporting", noun: "dwell time chart" },
    { a: "reporting", noun: "CSV export of shipments" },
    { a: "infra", noun: "database backup schedule" },
    { a: "infra", noun: "log retention settings" },
    { a: "infra", noun: "staging data refresh" },
  ],
  done: [
    {
      n: 139, t: "Add a lock-time check for database migrations to the CI pipeline", a: "infra", who: "zain", ty: "task", p: "P1", est: 5, ms: 2, ct: "infra", imp: 4, pin: H(58),
      why: "Migrations that would lock a large table for more than a few seconds are now rejected before they can reach production, preventing a repeat of last week's incident.",
    },
    {
      n: 138, t: "Fix frozen vehicle positions after the failed ETA migration", a: "tracking", who: "sana", ty: "bug", p: "P0", est: 3, ms: 2, ui: true, imp: 5, pin: H(116.5), ct: "fix",
      why: "Live positions resumed updating once the migration was split into a safe two-step change; this closed the production incident.",
    },
    {
      n: 137, t: "Show ETA confidence on the live tracking map", a: "tracking", who: "kamran", ty: "feature", p: "P2", est: 5, ms: 2, ui: true, pin: H(121.5), rev: "sana",
      why: "Dispatchers can tell a firm arrival estimate from a guess, so they call customers about the right shipments.",
    },
    { n: 136, t: "Cache carrier status lookups for 60 seconds", a: "carrier-integrations", who: "sana", ty: "task", ms: 2, ct: "refactor", why: "Cuts calls to the carrier's API by about 70%, keeping the integration inside its rate limit." },
    {
      n: 135, t: "Driver app: capture a signature as proof of delivery", a: "mobile", who: "daniyal", ty: "feature", p: "P1", est: 5, ms: 1, ui: true, imp: 4,
      why: "Drivers collect a signature on the phone instead of paper, so proof of delivery reaches Blue Harbor's customers the same day.",
      ac: ["Signature is stored with the delivery and visible in the web console", "Works without a network connection and syncs afterwards"],
    },
    { n: 134, t: "Send delay alerts when a shipment is more than 30 minutes behind", a: "notifications", who: "sana", ty: "feature", p: "P1", ms: 2, ui: true, imp: 4, why: "Dispatchers and customers hear about late shipments before anyone has to phone to ask." },
    { n: 133, t: "Fix duplicate position updates from the first carrier", a: "carrier-integrations", who: "sana", ty: "bug", ms: 2, why: "Trucks no longer appear to jump back and forth on the map when the carrier resends a position." },
    { n: 132, t: "Offline queue for driver status updates", a: "mobile", who: "daniyal", ty: "feature", p: "P1", est: 8, ms: 1, ui: true, why: "Drivers in areas with poor coverage can keep working; updates are sent as soon as the phone reconnects." },
    { n: 131, t: "Dwell time report by warehouse", a: "reporting", who: "kamran", ty: "feature", ms: 2, ui: true, why: "Operations managers see where trucks wait longest, which Blue Harbor wants to use in carrier reviews." },
    { n: 130, t: "Cluster map markers for large fleets", a: "tracking", who: "kamran", ty: "feature", ms: 1, ui: true, why: "The live map stays readable and fast with hundreds of vehicles on screen." },
    { n: 129, t: "Driver app: dark mode for night shifts", a: "mobile", who: "daniyal", ty: "feature", p: "P3", ms: 1, ui: true, why: "Night-shift drivers get a screen that is easier on the eyes and safer in the cab." },
    { n: 128, t: "Handle rate limits from the first carrier's API", a: "carrier-integrations", who: "sana", ty: "task", ms: 2, why: "The integration backs off politely instead of being blocked when the carrier throttles requests." },
    { n: 127, t: "Test nightly database backups automatically", a: "infra", who: "zain", ty: "chore", ms: 1, ct: "infra", why: "Backups are restored into a scratch database every night, so we know they actually work." },
    { n: 126, t: "Alert when a truck reaches the depot geofence", a: "tracking", who: "kamran", ty: "feature", ms: 1, ui: true, why: "Warehouse teams are told to prepare the dock before the truck arrives." },
  ],
  open: [
    {
      n: 140, t: "Second carrier integration: Harbor Lines", a: "carrier-integrations", who: "sana", ty: "feature", p: "P1", s: "in_progress", est: 13, ms: 2, c: 12, ui: true, imp: 4,
      why: "Blue Harbor wants shipments from a second carrier on the same map; this is the main item in the integrations milestone.",
    },
    { n: 141, t: "Write a migration playbook for large tables", a: "infra", who: "kamran", ty: "chore", p: "P2", s: "in_progress", est: 3, ms: 2, c: 3, ct: "docs", why: "A short guide for developers on how to change big tables safely, a follow-up from the production incident." },
    { n: 142, t: "Driver app: route list with navigation handoff", a: "mobile", who: "daniyal", ty: "feature", p: "P2", s: "in_progress", est: 5, ms: 2, c: 9, ui: true, why: "Drivers see the day's stops in order and open turn-by-turn directions with one tap." },
    { n: 143, t: "Customer shipment tracking link without login", a: "tracking", who: "kamran", ty: "feature", p: "P1", s: "in_review", est: 5, ms: 2, c: 10, ui: true, rev: "sana", why: "Blue Harbor's customers can follow their shipment from a link in an email, without an account." },
    { n: 144, t: "SMS delivery updates for consignees", a: "notifications", who: "sana", ty: "feature", p: "P2", s: "in_review", est: 5, ms: 2, c: 8, ui: true, rev: "kamran", why: "Receivers get a text when the truck is 30 minutes away, reducing missed deliveries." },
    { n: 145, t: "On-time delivery report for account managers", a: "reporting", who: "kamran", ty: "feature", p: "P2", s: "todo", est: 5, ms: 3, c: 7, ui: true, why: "Account managers can show customers how often shipments arrive on time." },
    { n: 146, t: "Scheduled weekly report emails", a: "reporting", who: "kamran", ty: "feature", p: "P3", s: "todo", est: 3, ms: 3, c: 7, why: "Reports arrive in managers' inboxes every Monday without anyone running them." },
    { n: 147, t: "Driver app training mode with sample shipments", a: "mobile", who: "daniyal", ty: "feature", p: "P3", s: "todo", est: 3, ms: 3, c: 6, ui: true, why: "New drivers can practise on fake deliveries before their first real route." },
    { n: 148, t: "Import EDI 214 status messages from legacy carriers", a: "carrier-integrations", who: "sana", ty: "feature", p: "P2", s: "todo", est: 8, ms: 3, c: 6, why: "Smaller carriers that only send EDI can appear on the same tracking map." },
    {
      n: 149, t: "Route delay alerts to the right dispatcher", a: "notifications", who: "sana", ty: "feature", p: "P2", s: "todo", est: 3, ms: 2, c: 8, ui: true,
      why: "Each dispatcher is alerted only about their own lanes instead of every delay in the network.",
      msg: { by: "omar", ref: "msg-dispatch", text: "The delay alerts are great but every dispatcher gets every alert. Can each person only be notified about their own lanes? - Marcus Delacroix, Blue Harbor Freight" },
    },
    { n: 150, t: "Driver hours-of-service tracking", a: "tracking", who: "kamran", ty: "question", p: "P3", s: "draft", ms: 3, c: 4, why: "Open question from Blue Harbor: is hours-of-service tracking in scope? No estimate yet." },
  ],
  events: [
    // ---- the incident, in exact hours before now --------------------------
    {
      key: "mig-commit", w: H(126.5), kind: "commit", who: "sana", areas: ["tracking"], tags: ["database", "migration"], imp: 4, ct: "feature", refs: ["ORBIT-137"], stats: { additions: 312, deletions: 28, filesChanged: 9 },
      title: "Add ETA confidence column to shipment events",
      summary: "Adds a column recording how confident the system is in each arrival estimate, so dispatchers can tell firm ETAs from guesses. The change alters the main shipment events table, which holds about four million rows in production.",
    },
    {
      key: "msg-alert", w: H(120.1), kind: "message", who: "zain", areas: ["infra", "tracking"], tags: ["incident"], imp: 5, refs: ["ORBIT-137"],
      title: "Production deploy of v1.14.0 stopped at the migration step",
      summary: "Zain reported that the 1.14.0 deployment stopped during the database migration and that the live map was showing vehicle positions up to 40 minutes old. He started investigating with Sana.",
    },
    {
      key: "inc-open", w: H(120.05), kind: "incident", who: "zain", areas: ["tracking", "infra"], tags: ["incident", "SEV2"], imp: 5, refs: ["ORBIT-INC-1"],
      title: "Incident opened: live vehicle positions stale after failed deployment",
      summary: "The position-freshness check failed minutes after the v1.14.0 deployment. Triage linked it to the database migration in that release and rated it SEV2: customers could not see current truck positions.",
    },
    {
      key: "msg-client-inc", w: H(119.3), kind: "message", actor: "Marcus Delacroix (Blue Harbor Freight)", areas: ["tracking"], tags: ["client", "incident"], imp: 5, refs: ["ORBIT-INC-1"],
      title: "Blue Harbor dispatchers report frozen vehicle positions",
      summary: "Marcus Delacroix reported that dispatchers saw trucks stuck at old positions for about 40 minutes this morning and asked whether the problem was resolved.",
    },
    {
      key: "fix-commit", w: H(118.4), kind: "commit", who: "sana", areas: ["tracking"], tags: ["database", "migration", "fix"], imp: 4, ct: "fix", refs: ["ORBIT-138", "ORBIT-INC-1"], stats: { additions: 148, deletions: 36, filesChanged: 4 },
      title: "Split ETA confidence migration into a nullable column and a batched backfill",
      summary: "Replaces the single blocking migration with two safe steps: add the column without locking the table, then fill it in small batches. This removes the long lock that froze the live map.",
    },
    {
      key: "msg-resolved", w: H(116.2), kind: "message", who: "kamran", areas: ["tracking"], tags: ["incident", "resolved"], imp: 4, refs: ["ORBIT-INC-1"],
      title: "Positions are live again after v1.14.1",
      summary: "Kamran confirmed vehicle positions are updating normally after the fixed release and that Blue Harbor's dispatchers have been told the issue is resolved.",
    },
    {
      key: "rel-1141", w: H(116.6), kind: "release", who: "zain", areas: ["tracking"], tags: ["release", "hotfix"], imp: 4, ui: true, refs: ["ORBIT-137", "ORBIT-138"],
      title: "Release v1.14.1: ETA confidence on the live map with a safe migration",
      summary: "The ETA confidence feature shipped successfully with the corrected two-step database change. Live positions are updating normally.",
    },
    {
      key: "doc-postmortem", w: H(72), kind: "document", who: "kamran", areas: ["tracking", "infra"], tags: ["postmortem", "incident"], imp: 4, refs: ["ORBIT-INC-1", "ORBIT-139", "ORBIT-141"],
      title: "Post-incident review: stale vehicle positions after the v1.14.0 migration",
      summary: "Root cause: a migration locked a four-million-row table for longer than the timeout. Staging only has 40,000 rows, so it passed there. Actions: lock-time check in CI (ORBIT-139, done) and a migration playbook (ORBIT-141, in progress).",
    },
    // ---- other project activity ------------------------------------------
    {
      key: "msg-dispatch", w: D(8), kind: "message", actor: "Marcus Delacroix (Blue Harbor Freight)", areas: ["notifications"], tags: ["client", "request"], imp: 3, refs: ["ORBIT-149"],
      title: "Dispatchers ask for delay alerts only on their own lanes",
      summary: "Marcus Delacroix said every dispatcher receives every delay alert and asked for alerts to be limited to each person's lanes. Logged as ORBIT-149.",
    },
    {
      key: "msg-harbor", w: D(1.5), kind: "message", actor: "Marcus Delacroix (Blue Harbor Freight)", areas: ["carrier-integrations"], tags: ["client", "scope"], imp: 4, refs: ["ORBIT-140"],
      title: "Blue Harbor asks to add a second carrier, Harbor Lines, by month end",
      summary: "Marcus Delacroix asked whether shipments from Harbor Lines can appear on the tracking map by the end of the month. SSI has asked Kamran to estimate the effort before answering.",
    },
    { key: "doc-carrier", w: D(9), kind: "document", who: "kamran", areas: ["carrier-integrations"], tags: ["integration"], imp: 3, refs: ["ORBIT-140"], title: "Carrier integration notes: Harbor Lines API", summary: "Summarises Harbor Lines' tracking API: position updates every five minutes, a sandbox on request, and a daily limit of 20,000 calls. Sana is using it to size the second carrier work." },
    { key: "meet-demo", w: D(7), kind: "meeting", who: "kamran", areas: ["mobile", "tracking"], tags: ["demo", "client"], imp: 3, title: "Weekly demo with Blue Harbor: signature capture and map clustering", summary: "Showed drivers capturing signatures and the clustered live map. Blue Harbor's operations team asked for delay alerts per dispatcher, which became ORBIT-149." },
    {
      key: "unclear-cleanup", w: D(9.5), kind: "commit", who: "kamran", areas: ["carrier-integrations"], tags: ["large-change"], imp: 4, ct: "chore", unclear: true, stats: { additions: 380, deletions: 520, filesChanged: 22 },
      title: "Cleanup",
      summary: "A cleanup commit touching 22 files in the carrier integration code, mostly deletions (520 lines removed). The message is a single word, so it is unclear which carrier code paths were removed.",
    },
    { key: "msg-sms", w: D(2.2), kind: "message", who: "sana", areas: ["notifications"], tags: ["team"], imp: 2, refs: ["ORBIT-144"], title: "SMS provider approved the sender name", summary: "Sana confirmed the SMS provider approved the sender name 'BlueHarbor', so consignee text messages can be tested on staging this week." },
    { key: "commit-readme", w: D(14), kind: "commit", who: "zain", areas: ["infra"], tags: ["docs"], imp: 2, ct: "docs", stats: { additions: 118, deletions: 9, filesChanged: 2 }, title: "Document the deployment checklist and rollback steps", summary: "Writes down how releases are deployed and rolled back so anyone on the team can do it, not only Zain." },
    { key: "rel-113", w: D(9), kind: "release", who: "zain", areas: ["mobile", "carrier-integrations", "reporting"], tags: ["release"], imp: 4, ui: true, refs: ["ORBIT-132", "ORBIT-133", "ORBIT-131"], title: "Release v1.13.0: offline queue, duplicate position fix and dwell time report", summary: "Drivers can keep working offline, trucks no longer jump on the map when a carrier resends a position, and operations managers get a warehouse dwell time report." },
  ],
  deployments: [
    { n: 1, env: "staging", status: "success", version: "v1.12.0-rc.1", w: D(19), mins: 5, who: "zain", note: "Release candidate 1.12.0 deployed to staging." },
    { n: 2, env: "production", status: "success", version: "v1.12.0", w: D(16), mins: 8, who: "zain", note: "Version 1.12.0 released to production with no issues." },
    { n: 3, env: "staging", status: "success", version: "v1.13.0-rc.1", w: D(11), mins: 5, who: "zain", note: "First release candidate for 1.13.0 deployed to staging." },
    { n: 4, env: "staging", status: "success", version: "v1.13.0-rc.2", w: D(10), mins: 5, who: "zain", note: "Second release candidate for 1.13.0 deployed to staging." },
    { n: 5, env: "production", status: "success", version: "v1.13.0", w: D(9), mins: 8, who: "zain", note: "Version 1.13.0 released to production: offline queue, duplicate position fix, dwell time report." },
    { n: 6, env: "staging", status: "success", version: "v1.14.0-rc.1", w: H(150), mins: 6, who: "zain", shaOf: "mig-commit", imp: 3, note: "Release candidate for 1.14.0 deployed to staging. The migration finished in under a second because staging holds only about 40,000 shipment events." },
    {
      n: 7, env: "production", status: "failed", version: "v1.14.0", w: H(120.4), mins: 11, who: "zain", shaOf: "mig-commit", imp: 5,
      note: "The production deployment failed: a database migration timed out waiting for a lock on the four-million-row shipment events table. The release was rolled back, but live vehicle positions were stale for about 40 minutes.",
      log: "> alembic upgrade head\nINFO  Running upgrade 8f31c2a -> c47d9e1, add eta_confidence to shipment_events\nALTER TABLE shipment_events ADD COLUMN eta_confidence NUMERIC(4,3) NOT NULL DEFAULT 0;\nUPDATE shipment_events SET eta_confidence = estimate_confidence(id);\nsqlalchemy.exc.OperationalError: (psycopg2.errors.LockNotAvailable) canceling statement due to lock timeout\nDETAIL: Process 2218 waits for AccessExclusiveLock on relation \"shipment_events\"; blocked by 31 sessions.\nMigration aborted after 120s. Rolling back release v1.14.0 to v1.13.0.",
    },
    { n: 8, env: "production", status: "success", version: "v1.14.1", w: H(117), mins: 9, who: "zain", shaOf: "fix-commit", imp: 4, note: "Fixed release deployed to production: the migration now adds the column without locking and backfills in batches. Live positions recovered." },
    { n: 9, env: "staging", status: "success", version: "v1.15.0-rc.1", w: D(2.5), mins: 6, who: "zain", note: "First release candidate for 1.15.0 (customer tracking link, SMS updates) deployed to staging. The new CI lock-time check passed." },
    { n: 10, env: "staging", status: "success", version: "v1.15.0-rc.2", w: Y(6.5), mins: 6, who: "zain", note: "Second release candidate for 1.15.0 deployed to staging for Blue Harbor's acceptance test." },
  ],
};
