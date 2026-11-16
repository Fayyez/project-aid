import { DEFAULT_FEATURES, DEFAULT_PRIVACY, type Milestone, type PrivacySettings, type Project, type SourceConfig, type TeamAssignment, type FeatureFlags } from "@/lib/types";
import { DAY_MS, HOUR_MS } from "./helpers";
import { personId } from "./people";

interface ProjectDef {
  id: string;
  slug: string;
  key: string;
  name: string;
  client: string;
  description: string;
  pdKeys: string[];
  startDaysAgo: number;
  targetInDays: number;
  team: [string, string, string[], number][];
  milestones: { name: string; description: string; due: number; status: Milestone["status"] }[];
  sim: string;
  github: { owner: string; repo: string };
  ado: { organization: string; project: string; repository: string };
  jira: { projectKey: string };
  teams: { teamId: string; channelId: string };
  prod: string;
  stage: string;
  features?: Partial<FeatureFlags>;
  privacy?: Partial<PrivacySettings>;
  status?: Project["status"];
}

const DEFS: ProjectDef[] = [
  {
    id: "prj_atlas", slug: "atlas", key: "ATLAS", name: "Atlas Commerce Platform", client: "Northwind Retail",
    description: "New headless e-commerce platform for Northwind Retail: storefront, checkout and payments, order management and returns, replacing their ageing in-house shop before the autumn sale.",
    pdKeys: ["sara"], startDaysAgo: 98, targetInDays: 42,
    team: [["bilal", "Tech Lead", ["architecture", "payments"], 80], ["nadia", "Backend Engineer", ["payments", "orders", "catalog"], 100], ["hira", "Frontend Engineer", ["storefront", "checkout", "catalog"], 60], ["zain", "DevOps Engineer", ["infra"], 40], ["maryam", "QA Lead", ["quality"], 50], ["farah", "Business Analyst", ["requirements"], 30]],
    milestones: [
      { name: "Storefront foundation", description: "Catalogue, search, basket and account pages.", due: -35, status: "done" },
      { name: "Checkout and payments", description: "Card, wallet and gift card payments, VAT, stock reservation.", due: 12, status: "in_progress" },
      { name: "Orders, returns and fulfilment", description: "Order tracking, returns portal, exports for finance.", due: 28, status: "planned" },
      { name: "Launch and hypercare", description: "Cutover, SEO, cookie consent and two weeks of support.", due: 42, status: "planned" },
    ],
    sim: "GitHub: ssi/atlas-web (simulated)", github: { owner: "ssi", repo: "atlas-web" }, ado: { organization: "ssi-software", project: "Atlas", repository: "atlas-api" }, jira: { projectKey: "ATLAS" },
    teams: { teamId: "4b1f6a0c-1e52-4c0e-9a42-0a7d1f2c9e11", channelId: "19:atlas-dev@thread.tacv2" },
    prod: "https://shop.northwind-retail.example", stage: "https://staging.atlas.ssi.example",
  },
  {
    id: "prj_helix", slug: "helix", key: "HELIX", name: "Helix Patient Portal", client: "Meridian Health",
    description: "Secure patient portal for Meridian Health: appointment booking, lab results, clinician messaging and billing. A pilot clinic is live; results and messaging are the next milestone.",
    pdKeys: ["sara", "omar"], startDaysAgo: 91, targetInDays: 35,
    team: [["usman", "Tech Lead", ["auth", "integrations"], 100], ["sana", "Backend Engineer", ["scheduling", "records", "messaging"], 60], ["hira", "Frontend Engineer", ["portal-ui", "messaging"], 40], ["maryam", "QA Lead", ["quality"], 50], ["farah", "Business Analyst", ["requirements"], 40], ["tariq", "Security Engineer", ["auth", "compliance"], 30]],
    milestones: [
      { name: "Patient identity and sign-in", description: "Registration, verification, two-factor sign-in.", due: -56, status: "done" },
      { name: "Appointment booking", description: "Booking, rescheduling and confirmations for the pilot clinic.", due: -21, status: "done" },
      { name: "Lab results and clinician messaging", description: "Results feed from Meridian's lab system, release rules, secure messaging inbox, clinician SSO.", due: 6, status: "at_risk" },
      { name: "Billing and go-live readiness", description: "Online payments, penetration test fixes, load test, runbook and training.", due: 35, status: "planned" },
    ],
    sim: "GitHub: ssi/helix-portal (simulated)", github: { owner: "ssi", repo: "helix-portal" }, ado: { organization: "ssi-software", project: "Helix", repository: "helix-api" }, jira: { projectKey: "HELIX" },
    teams: { teamId: "7c2d9e30-5a18-4b77-8f03-1b9e6d4a2f22", channelId: "19:helix-dev@thread.tacv2" },
    prod: "https://pilot.portal.meridian-health.example", stage: "https://staging.helix.ssi.example",
    privacy: { codeSummaryMode: "local" },
  },
  {
    id: "prj_orbit", slug: "orbit", key: "ORBIT", name: "Orbit Logistics Tracker", client: "Blue Harbor Freight",
    description: "Live shipment tracking for Blue Harbor Freight: a dispatcher web console, a driver mobile app, carrier integrations and customer alerts. A production incident five days ago was resolved the same day.",
    pdKeys: ["omar"], startDaysAgo: 84, targetInDays: 28,
    team: [["kamran", "Tech Lead", ["tracking", "reporting"], 70], ["daniyal", "Mobile Engineer", ["mobile"], 100], ["zain", "DevOps Engineer", ["infra"], 60], ["sana", "Backend Engineer", ["notifications", "carrier-integrations"], 40], ["leila", "UX Designer", ["mobile", "reporting"], 50]],
    milestones: [
      { name: "Live tracking MVP", description: "Live map, shipment timeline, position ingestion.", due: -42, status: "done" },
      { name: "Driver app beta", description: "Driver login, routes, offline queue, proof of delivery.", due: -14, status: "done" },
      { name: "Carrier integrations and alerts", description: "Second carrier, delay alerts, SMS updates, customer tracking link.", due: 10, status: "in_progress" },
      { name: "Reports, training and go-live", description: "On-time reports, weekly emails, driver training mode, EDI import.", due: 28, status: "planned" },
    ],
    sim: "Azure DevOps: ssi-software/Orbit (simulated)", github: { owner: "ssi", repo: "orbit-tracker" }, ado: { organization: "ssi-software", project: "Orbit", repository: "orbit-tracker" }, jira: { projectKey: "ORBIT" },
    teams: { teamId: "a93b1d57-2c40-4e6a-b8d5-3f7a0c1e5d33", channelId: "19:orbit-dev@thread.tacv2" },
    prod: "https://track.blueharbor-freight.example", stage: "https://staging.orbit.ssi.example",
  },
  {
    id: "prj_pulse", slug: "pulse", key: "PULSE", name: "Pulse Analytics Dashboard", client: "Kestrel Capital",
    description: "Portfolio exposure dashboard for Kestrel Capital's partners, fed by a nightly warehouse export. Early stage: started three weeks ago, first client demo is next week.",
    pdKeys: ["sara"], startDaysAgo: 21, targetInDays: 42,
    team: [["tariq", "Tech Lead", ["data-pipeline", "auth", "infra"], 70], ["kamran", "Data Engineer", ["reporting", "data-pipeline"], 30], ["leila", "UX Designer", ["dashboard"], 50], ["farah", "Business Analyst", ["requirements"], 30]],
    milestones: [
      { name: "Discovery and data access", description: "Scope, metrics list, data model, warehouse access.", due: -5, status: "done" },
      { name: "Dashboard MVP", description: "Exposure chart, nightly import, sign-in and roles.", due: 21, status: "in_progress" },
      { name: "UAT and launch", description: "Client acceptance testing, daily email snapshot, launch.", due: 42, status: "planned" },
    ],
    sim: "GitHub: ssi/pulse-dashboard (simulated)", github: { owner: "ssi", repo: "pulse-dashboard" }, ado: { organization: "ssi-software", project: "Pulse", repository: "pulse-pipeline" }, jira: { projectKey: "PULSE" },
    teams: { teamId: "d15e8c42-9b73-4f1a-a620-6e2b4c8f7a44", channelId: "19:pulse-dev@thread.tacv2" },
    prod: "https://pulse.kestrel-capital.example", stage: "https://staging.pulse.ssi.example",
    features: { autoFixProposals: false, contributionInsights: false },
    privacy: { codeSummaryMode: "metadata-only" },
  },
];

function sources(d: ProjectDef, now: Date): SourceConfig[] {
  return [
    {
      id: `src_${d.slug}_sim`, kind: "simulated", name: d.sim, enabled: true, config: {},
      lastSyncAt: new Date(now.getTime() - 40 * 60_000).toISOString(), lastSyncStatus: "ok", lastSyncDetail: "Simulated source: demo activity",
    },
    { id: `src_${d.slug}_github`, kind: "github", name: `GitHub: ${d.github.owner}/${d.github.repo}`, enabled: false, config: { owner: d.github.owner, repo: d.github.repo, branch: "main" }, secretEnv: "GITHUB_TOKEN", lastSyncStatus: "never" },
    { id: `src_${d.slug}_ado`, kind: "azure-devops", name: `Azure DevOps: ${d.ado.organization}/${d.ado.project}`, enabled: false, config: { organization: d.ado.organization, project: d.ado.project, repository: d.ado.repository }, secretEnv: "AZURE_DEVOPS_PAT", lastSyncStatus: "never" },
    { id: `src_${d.slug}_jira`, kind: "jira", name: `Jira: ${d.jira.projectKey}`, enabled: false, config: { baseUrl: "https://ssi-software.atlassian.net", projectKey: d.jira.projectKey, email: "integrations@ssi.example" }, secretEnv: "JIRA_API_TOKEN", lastSyncStatus: "never" },
    { id: `src_${d.slug}_teams`, kind: "teams", name: `Teams: ${d.client} channel`, enabled: false, config: { teamId: d.teams.teamId, channelId: d.teams.channelId }, secretEnv: "TEAMS_GRAPH_TOKEN", lastSyncStatus: "never" },
  ];
}

export function buildProjects(now: Date): Project[] {
  return DEFS.map((d) => {
    const team: TeamAssignment[] = d.team.map(([key, role, areas, pct]) => ({ personId: personId(key), projectRole: role, areas, allocationPct: pct }));
    return {
      id: d.id,
      key: d.key,
      name: d.name,
      client: d.client,
      description: d.description,
      status: d.status ?? "active",
      pdIds: d.pdKeys.map(personId),
      team,
      sources: sources(d, now),
      deployTargets: [
        { id: `dt_${d.slug}_prod`, environment: "production", provider: "simulated", config: { url: d.prod } },
        { id: `dt_${d.slug}_stage`, environment: "staging", provider: "simulated", config: { url: d.stage } },
      ],
      features: { ...DEFAULT_FEATURES, ...(d.features ?? {}) },
      privacy: { ...DEFAULT_PRIVACY, ...(d.privacy ?? {}) },
      milestones: d.milestones.map((m, i) => ({
        id: `ms_${d.slug}_${i + 1}`,
        name: m.name,
        description: m.description,
        dueDate: new Date(now.getTime() + m.due * DAY_MS).toISOString().slice(0, 10),
        status: m.status,
      })),
      startDate: new Date(now.getTime() - d.startDaysAgo * DAY_MS).toISOString().slice(0, 10),
      targetDate: new Date(now.getTime() + d.targetInDays * DAY_MS).toISOString().slice(0, 10),
      templates: {},
      notifyChannel: "in_app",
      createdAt: new Date(now.getTime() - d.startDaysAgo * DAY_MS).toISOString(),
      updatedAt: new Date(now.getTime() - 3 * HOUR_MS).toISOString(),
    };
  });
}
