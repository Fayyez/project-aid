import { D, Y } from "../helpers";
import type { StorySpec } from "./types";

/**
 * Pulse Analytics Dashboard (Kestrel Capital): early stage, started three
 * weeks ago, low activity, on track.
 */
export const PULSE: StorySpec = {
  projectId: "prj_pulse",
  slug: "pulse",
  key: "PULSE",
  sourceId: "src_pulse_sim",
  repo: "ssi/pulse-dashboard",
  repoByArea: { "data-pipeline": "ssi/pulse-pipeline", reporting: "ssi/pulse-pipeline" },
  lead: "tariq",
  team: ["tariq", "kamran", "leila", "farah"],
  owners: {
    "data-pipeline": ["kamran", "tariq"],
    auth: ["tariq"],
    dashboard: ["leila"],
    reporting: ["kamran"],
    requirements: ["farah"],
    infra: ["tariq"],
  },
  startDaysAgo: 21,
  milestoneIds: ["ms_pulse_1", "ms_pulse_2", "ms_pulse_3"],
  buckets: [3, 2, 1],
  histBase: 101,
  histNouns: [],
  histMs: [],
  reviewProb: 0,
  secondCommitProb: 0.1,
  prBase: 12,
  done: [
    { n: 106, t: "Set up cloud environments and the deployment pipeline", a: "infra", who: "tariq", ty: "chore", ms: 1, ct: "infra", why: "Every change can now be deployed to a test environment automatically, so the client can see progress each week." },
    { n: 105, t: "Prototype the sector exposure chart with sample data", a: "dashboard", who: "leila", ty: "feature", p: "P1", ms: 1, ui: true, why: "Kestrel's portfolio managers can react to a working chart in the next review rather than to wireframes." },
    { n: 104, t: "Agree the list of metrics for version one", a: "requirements", who: "farah", ty: "task", p: "P1", ms: 0, ct: "docs", why: "Developers and Kestrel agree what 'done' means for version one, avoiding scope drift." },
    { n: 103, t: "Define the data model for positions and prices", a: "data-pipeline", who: "kamran", ty: "task", p: "P1", est: 5, ms: 0, why: "The shape of the data is settled before any dashboard is built on it." },
    { n: 102, t: "Get read-only access to Kestrel's warehouse export", a: "data-pipeline", who: "tariq", ty: "task", p: "P1", ms: 0, why: "Developers can work with real (read-only) data rather than guesses, and Kestrel's security team signed off on the access." },
    { n: 101, t: "Kickoff: agree scope and success measures", a: "requirements", who: "farah", ty: "task", ms: 0, ct: "docs", why: "Records what Kestrel expects from the first release and how success will be judged." },
  ],
  open: [
    { n: 107, t: "Portfolio exposure chart by sector", a: "dashboard", who: "leila", ty: "feature", p: "P1", s: "in_progress", est: 5, ms: 1, c: 8, ui: true, why: "The main screen of version one: managers see where the portfolio is concentrated." },
    { n: 108, t: "Nightly risk data import from the warehouse export", a: "data-pipeline", who: "kamran", ty: "feature", p: "P1", s: "in_progress", est: 8, ms: 1, c: 10, why: "The dashboard refreshes every morning with the previous day's positions." },
    { n: 109, t: "Single sign-on with Kestrel's identity provider (OIDC)", a: "auth", who: "tariq", ty: "feature", p: "P1", s: "in_progress", est: 5, ms: 1, c: 9, ui: true, why: "Kestrel staff sign in with their company login; required by their security policy." },
    { n: 110, t: "Dashboard layout and navigation shell", a: "dashboard", who: "leila", ty: "feature", p: "P2", s: "in_review", est: 3, ms: 1, c: 12, ui: true, rev: "tariq", why: "The frame every screen sits in, so later features can be added quickly." },
    { n: 111, t: "Roles: analyst and portfolio manager", a: "auth", who: "tariq", ty: "feature", p: "P2", s: "in_review", est: 3, ms: 1, c: 8, rev: "kamran", why: "Analysts see detail, portfolio managers see the summary; sensitive positions stay restricted." },
    { n: 112, t: "Drill down from sector to individual positions", a: "dashboard", who: "leila", ty: "feature", p: "P2", s: "todo", est: 5, ms: 1, c: 6, ui: true, why: "Managers can click a sector and see what drives its exposure." },
    { n: 113, t: "Daily email snapshot of key metrics", a: "reporting", who: "kamran", ty: "feature", p: "P3", s: "todo", est: 3, ms: 2, c: 5, why: "Partners who do not open the dashboard still see the headline numbers each morning." },
    { n: 114, t: "Data quality checks and alerts for failed imports", a: "data-pipeline", who: "kamran", ty: "task", p: "P2", s: "todo", est: 5, ms: 1, c: 5, why: "Someone is told immediately if the morning data is missing or looks wrong." },
    { n: 115, t: "Tablet layout for partner meetings", a: "dashboard", who: "leila", ty: "question", p: "P3", s: "draft", ms: 2, c: 3, why: "Open question: do partners need the dashboard on tablets in version one?" },
  ],
  events: [
    { key: "meet-kickoff", w: D(20.5), kind: "meeting", who: "farah", areas: ["requirements"], tags: ["kickoff", "client"], imp: 4, title: "Kickoff workshop with Kestrel Capital", summary: "Agreed the goal (one screen showing portfolio exposure by sector), the nightly data refresh and a first demo in three weeks. Kestrel will provide read-only warehouse access." },
    { key: "commit-skeleton", w: D(19.5), kind: "commit", who: "tariq", areas: ["infra"], tags: ["setup"], imp: 2, ct: "chore", stats: { additions: 1410, deletions: 0, filesChanged: 42 }, title: "Scaffold the dashboard app and data pipeline repositories", summary: "Creates the two code repositories with the basic project structure, linting and automated tests so the team can start building." },
    { key: "doc-workbook-3", w: D(12), kind: "document", who: "farah", areas: ["requirements"], tags: ["requirements", "metrics"], imp: 3, refs: ["PULSE-104"], title: "Requirements workbook v3: version one metrics list", summary: "Lists the six metrics for version one (sector exposure, top 10 positions, daily change, concentration, currency split, cash) and what is deliberately left for later." },
    { key: "doc-design", w: D(9), kind: "document", who: "leila", areas: ["dashboard"], tags: ["design"], imp: 3, refs: ["PULSE-105"], title: "Design review notes: exposure dashboard wireframes", summary: "Kestrel preferred the horizontal bar view for sectors over the donut chart, and asked for colour-blind-safe palettes. Changes are being built into the prototype." },
    { key: "msg-kestrel", w: D(5), kind: "message", actor: "Daniel Ferreira (Kestrel Capital)", areas: ["data-pipeline"], tags: ["client"], imp: 3, refs: ["PULSE-108"], title: "Kestrel confirms the nightly warehouse export is the data source", summary: "Daniel Ferreira confirmed the dashboard should read the nightly warehouse export rather than a live feed for version one, and that files land by 06:00 each day." },
  ],
  deployments: [
    { n: 1, env: "staging", status: "success", version: "v0.0.1", w: D(19), mins: 4, who: "tariq", noEvent: true, note: "First empty skeleton deployed to staging to prove the pipeline." },
    { n: 2, env: "production", status: "success", version: "v0.0.1", w: D(18), mins: 5, who: "tariq", noEvent: true, note: "Placeholder page and health check live in production." },
    { n: 3, env: "staging", status: "failed", version: "v0.1.0-rc.1", w: D(13), mins: 3, who: "tariq", imp: 2, note: "Staging build failed because a required setting was missing from the new environment. Fixed the same day.", log: "> next build\nError: Missing required environment variable OIDC_ISSUER_URL\n    at validateEnv (src/config/env.ts:18:11)\nBuild failed with 1 error." },
    { n: 4, env: "staging", status: "success", version: "v0.1.0-rc.2", w: D(12), mins: 4, who: "tariq", noEvent: true, note: "Second attempt at the first release candidate succeeded." },
    { n: 5, env: "production", status: "success", version: "v0.1.0", w: D(11), mins: 6, who: "tariq", note: "First real release: sign-in page and an empty dashboard shell live for Kestrel to try." },
    { n: 6, env: "staging", status: "success", version: "v0.2.0-rc.1", w: D(6), mins: 5, who: "tariq", noEvent: true, note: "Prototype exposure chart deployed to staging." },
    { n: 7, env: "staging", status: "success", version: "v0.2.0-rc.2", w: D(3), mins: 5, who: "tariq", noEvent: true, note: "Layout shell deployed to staging." },
    { n: 8, env: "staging", status: "success", version: "v0.2.0-rc.3", w: Y(8), mins: 5, who: "tariq", note: "Release candidate for the first client demo deployed to staging; smoke checks passed." },
  ],
};
