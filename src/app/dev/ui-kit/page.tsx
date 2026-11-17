import type { Metadata } from "next";
import { Inbox, Plus, RefreshCw, Rocket, Siren, Users } from "lucide-react";
import {
  Avatar, AvatarStack, Badge, Button, Callout, Card, CardBody, CardHeader, Checkbox, CopyButton, Divider, EmptyState, Field, IconButton, Input,
  Kbd, LinkButton, PageHeader, RelativeTime, Section, Select, Skeleton, Spinner, Stat, Switch, Table, TBody, Td, Textarea, Th, THead, Tabs, Tooltip, Tr,
  type Tone,
} from "@/components/ui";
import { ActivityHeat, BarChart, Donut, ProgressBar, Sparkline } from "@/components/charts";
import {
  ChangeTypeBadge, CitationChip, CitationList, DeployBadge, EventKindIcon, FeatureModeBadge, GroundingBadge, HealthBadge, HealthDot, IncidentStatusBadge,
  Markdown, PaceBadge, PersonChip, PriorityBadge, SeverityBadge, SourceIcon, TicketStatusBadge, TierBadge,
} from "@/components/domain";
import type { Citation, ChangeType, DeploymentStatus, EventKind, GroundingResult, Health, IncidentStatus, PaceStatus, Priority, Severity, SourceKind, TicketStatus } from "@/lib/types";
import { InteractiveDemo } from "./interactive-demo";

export const metadata: Metadata = { title: "UI kit" };

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

const citations: Citation[] = [
  { ref: "E1", type: "event", id: "evt_1", title: "Merged PR #482: retry payment webhooks with backoff", occurredAt: ago(190), url: "https://example.com/pr/482" },
  { ref: "E4", type: "event", id: "evt_4", title: "Deployed v2.14.0 to production", occurredAt: ago(75) },
  { ref: "T3", type: "ticket", id: "tkt_3", title: "ATLAS-128 Flaky payment webhook retries" },
  { ref: "D2", type: "digest", id: "dig_2", title: "Daily sync, 12 Nov" },
];

const markdown = `## Weekly progress: Atlas Commerce

The team closed **9 tickets** this week, up from 6 [E1]. Payment webhook retries now back off exponentially and the fix reached production on Tuesday [E4][T3].

### Risks
- Staging is *degraded* after the latest migration [E1, E4]
- The loyalty import is still blocked on client data [T3]
- Unknown reference [Z9] renders without a title

> Next week we focus on checkout performance and the loyalty import.

| Area | Done | Open |
| --- | ---: | ---: |
| Payments | 14 | 3 |
| Checkout | 9 | 6 |
| Loyalty | 2 | 8 |

\`\`\`ts
const delay = Math.min(2 ** attempt * 250, 30_000);
\`\`\`

Raw HTML is escaped: <script>alert(1)</script> and <b>bold</b>. [A link](https://example.com) opens in a new tab.
`;

const grounded: GroundingResult = { score: 0.92, citedRefs: ["E1", "E4", "T3"], invalidRefs: [], unsupported: [], verdict: "grounded" };
const partial: GroundingResult = { score: 0.58, citedRefs: ["E1"], invalidRefs: ["Z9"], unsupported: ["Velocity improved 40%"], verdict: "partially_grounded" };
const ungrounded: GroundingResult = { score: 0.1, citedRefs: [], invalidRefs: ["Q1"], unsupported: ["a", "b"], verdict: "ungrounded" };
const noEvidence: GroundingResult = { score: 0, citedRefs: [], invalidRefs: [], unsupported: [], verdict: "no_evidence" };

const tones: Tone[] = ["neutral", "accent", "success", "warning", "danger", "info"];
const health: Health[] = ["green", "amber", "red"];
const pace: PaceStatus[] = ["ahead", "on_track", "at_risk", "behind", "unknown"];
const deploy: (DeploymentStatus | "unknown")[] = ["success", "failed", "in_progress", "degraded", "rolled_back", "unknown"];
const ticket: TicketStatus[] = ["draft", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const priority: Priority[] = ["P0", "P1", "P2", "P3"];
const severity: Severity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];
const incident: IncidentStatus[] = ["detected", "triaging", "fix_proposed", "awaiting_approval", "escalated", "mitigated", "resolved"];
const change: ChangeType[] = ["feature", "fix", "refactor", "chore", "docs", "test", "infra", "security", "other"];
const sources: SourceKind[] = ["github", "azure-devops", "jira", "teams", "outlook", "slack", "document", "deploy", "manual", "simulated", "system"];
const kinds: EventKind[] = ["commit", "pull_request", "review", "issue", "work_item", "message", "document", "deployment", "incident", "note", "clarification", "ticket", "release", "meeting"];

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="min-w-0">
      <div className={`h-10 rounded-md border border-line ${className}`} />
      <p className="mt-1 truncate font-mono text-[11px] text-muted">{name}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section title={title}>
      <Card>
        <CardBody className="space-y-4">{children}</CardBody>
      </Card>
    </Section>
  );
}

function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {label ? <span className="w-24 shrink-0 text-xs font-medium text-muted">{label}</span> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function UiKitPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Project Aid UI kit"
        description="Living reference for every primitive, chart and domain component. Nothing here touches the data layer."
        breadcrumbs={[{ label: "Dev", href: "/dev/ui-kit" }, { label: "UI kit" }]}
        actions={
          <>
            <LinkButton href="/dev/ui-kit/shell" variant="secondary" size="sm">
              App shell preview
            </LinkButton>
            <Button variant="primary" size="sm" icon={<Plus size={14} />}>
              New project
            </Button>
          </>
        }
        meta={
          <>
            <HealthBadge health="green" />
            <Badge tone="neutral">ATLAS</Badge>
          </>
        }
      />

      <div className="space-y-8">
        <Block title="Colour tokens">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Swatch name="bg" className="bg-bg" />
            <Swatch name="surface" className="bg-surface" />
            <Swatch name="surface-2" className="bg-surface-2" />
            <Swatch name="surface-3" className="bg-surface-3" />
            <Swatch name="line" className="bg-line" />
            <Swatch name="fg" className="bg-fg" />
            <Swatch name="muted" className="bg-muted" />
            <Swatch name="subtle" className="bg-subtle" />
            <Swatch name="accent" className="bg-accent" />
            <Swatch name="accent-soft" className="bg-accent-soft" />
            <Swatch name="success" className="bg-success" />
            <Swatch name="success-soft" className="bg-success-soft" />
            <Swatch name="warning" className="bg-warning" />
            <Swatch name="warning-soft" className="bg-warning-soft" />
            <Swatch name="danger" className="bg-danger" />
            <Swatch name="danger-soft" className="bg-danger-soft" />
            <Swatch name="info" className="bg-info" />
            <Swatch name="info-soft" className="bg-info-soft" />
          </div>
          <Divider />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <p className="text-2xl font-semibold tabular-nums">1,284.50 <span className="text-sm font-normal text-muted">tabular</span></p>
            <p className="font-mono text-[13px]">a3f9c21 · ATLAS-128 · v2.14.0</p>
            <p className="text-[13px] text-muted">Muted 13px secondary text, <span className="text-subtle">subtle for hints</span>.</p>
          </div>
        </Block>

        <Block title="Buttons">
          <Row label="Variants">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="danger">Danger</Button>
          </Row>
          <Row label="Small">
            <Button size="sm" variant="primary">Primary</Button>
            <Button size="sm">Secondary</Button>
            <Button size="sm" variant="ghost">Ghost</Button>
            <Button size="sm" variant="subtle">Subtle</Button>
            <Button size="sm" variant="danger">Danger</Button>
          </Row>
          <Row label="States">
            <Button variant="primary" loading>
              Generating
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button variant="primary" icon={<RefreshCw size={14} />}>
              With icon
            </Button>
            <LinkButton href="/chat" variant="secondary">
              LinkButton
            </LinkButton>
            <IconButton label="Refresh" variant="secondary">
              <RefreshCw size={16} />
            </IconButton>
            <IconButton label="Refresh small" size="sm">
              <RefreshCw size={14} />
            </IconButton>
            <CopyButton value="a3f9c21d" label="Copy commit sha">
              a3f9c21
            </CopyButton>
          </Row>
        </Block>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Block title="Badges">
            <Row label="Tones">
              {tones.map((t) => (
                <Badge key={t} tone={t}>
                  {t}
                </Badge>
              ))}
            </Row>
            <Row label="With dot">
              {tones.map((t) => (
                <Badge key={t} tone={t} dot>
                  {t}
                </Badge>
              ))}
            </Row>
            <Row label="Avatars">
              <Avatar name="Priya Nair" size="xs" />
              <Avatar name="Marcus Lee" size="sm" />
              <Avatar name="Sofia Alvarez" />
              <Avatar name="Tom Becker" size="lg" />
              <AvatarStack people={["Priya Nair", "Marcus Lee", "Sofia Alvarez", "Tom Becker", "Aiko Tanaka", "Jon Park"].map((name) => ({ name }))} />
            </Row>
            <Row label="Misc">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Tooltip content="Tooltips show on hover and focus">
                <Button size="sm">Hover me</Button>
              </Tooltip>
              <Spinner />
              <Spinner size={24} className="text-accent" />
            </Row>
          </Block>

          <Block title="Callouts and empty state">
            <Callout tone="info" title="Heads up">The daily sync runs at 07:00 UTC.</Callout>
            <Callout tone="success" title="All deployments healthy">Production and staging are serving traffic.</Callout>
            <Callout tone="warning" title="Staging degraded" action={<Button size="sm">Investigate</Button>}>
              Latency is 3x the baseline since the last migration.
            </Callout>
            <Callout tone="danger" title="Deployment failed">Build exited with code 1 on atlas-api.</Callout>
          </Block>
        </div>

        <Block title="Cards, stats, tabs">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader title="Velocity" description="Tickets closed per week" actions={<Badge tone="success" dot>On track</Badge>} />
              <CardBody>
                <Stat label="Avg last 4 weeks" value="8.5" delta={{ value: "+12%", direction: "up", label: "vs prior 4w" }} spark={<Sparkline data={[4, 6, 5, 8, 7, 9, 10]} tone="success" title="Velocity" width={110} height={36} />} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Open incidents" />
              <CardBody>
                <Stat label="Open" icon={<Siren />} value={2} delta={{ value: "+1", direction: "up", tone: "danger", label: "since yesterday" }} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Blocked tickets" />
              <CardBody>
                <Stat label="Blocked" icon={<Users />} value={4} delta={{ value: "-2", direction: "down", tone: "success", label: "vs last week" }} spark={<Sparkline kind="bars" data={[3, 5, 6, 4, 4]} tone="warning" title="Blocked" />} />
              </CardBody>
            </Card>
          </div>
          <Tabs label="Demo tabs" items={[{ label: "Overview", href: "/dev/ui-kit", exact: true }, { label: "Shell", href: "/dev/ui-kit/shell" }, { label: "Tickets", href: "/dev/ui-kit/tickets", count: 12 }]} />
          <Tabs label="Range" param="range" defaultValue="7d" items={[{ label: "7 days", value: "7d" }, { label: "30 days", value: "30d" }, { label: "90 days", value: "90d" }]} />
        </Block>

        <Block title="Charts">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Weekly throughput</p>
              <BarChart title="Tickets closed per week" data={[{ label: "W41", value: 6 }, { label: "W42", value: 9 }, { label: "W43", value: 7 }, { label: "W44", value: 11 }, { label: "W45", value: 8 }, { label: "W46", value: 12 }]} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Tickets by status</p>
              <Donut
                title="Tickets by status"
                centerLabel="tickets"
                segments={[
                  { label: "Done", value: 42, tone: "success" },
                  { label: "In progress", value: 11, tone: "info" },
                  { label: "Blocked", value: 4, tone: "danger" },
                  { label: "To do", value: 19, tone: "neutral" },
                ]}
              />
            </div>
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted">Progress vs time elapsed</p>
              <ProgressBar value={64} marker={48} tone="auto" label="Scope complete" showValue />
              <ProgressBar value={35} marker={60} tone="auto" label="Scope complete" showValue />
              <ProgressBar value={52} marker={60} tone="auto" label="Scope complete" showValue size="sm" />
              <ProgressBar value={80} showValue label="Plain" />
            </div>
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted">Activity (30 days)</p>
              <ActivityHeat title="Priya Nair activity" data={[0, 2, 5, 3, 0, 0, 1, 4, 6, 8, 3, 0, 0, 2, 5, 7, 9, 4, 0, 0, 1, 3, 4, 6, 2, 0, 0, 5, 8, 10]} />
              <p className="text-xs font-medium text-muted">Sparklines</p>
              <div className="flex items-center gap-4">
                <Sparkline data={[2, 4, 3, 7, 6, 9]} />
                <Sparkline data={[2, 4, 3, 7, 6, 9]} kind="bars" tone="info" />
                <Sparkline data={[9, 7, 8, 4, 3, 2]} tone="danger" />
              </div>
            </div>
          </div>
        </Block>

        <Block title="Table">
          <Table stickyHeader containerClassName="max-h-72">
            <THead>
              <Tr hover={false}>
                <Th>Key</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Assignee</Th>
                <Th numeric>Estimate</Th>
                <Th>Updated</Th>
              </Tr>
            </THead>
            <TBody>
              {(
                [
                  ["ATLAS-128", "Fix flaky payment webhook retries", "in_progress", "P1", "Priya Nair", 5, 12],
                  ["ATLAS-131", "Loyalty points import for legacy accounts", "blocked", "P0", "Marcus Lee", 8, 95],
                  ["ATLAS-133", "Checkout totals wrong with stacked discount codes", "in_review", "P1", "Sofia Alvarez", 3, 240],
                  ["ATLAS-136", "Upgrade Node runtime to 22 LTS", "todo", "P3", "Tom Becker", 2, 1500],
                  ["ATLAS-140", "Customer export CSV timeouts", "done", "P2", "Aiko Tanaka", 5, 3000],
                  ["ATLAS-141", "Add retry telemetry dashboards", "draft", "P2", "Jon Park", 3, 4300],
                  ["ATLAS-142", "Document rollback runbook", "cancelled", "P3", "Priya Nair", 1, 7200],
                ] as const
              ).map(([key, title, status, prio, who, est, mins]) => (
                <Tr key={key}>
                  <Td mono>{key}</Td>
                  <Td className="min-w-64">{title}</Td>
                  <Td>
                    <TicketStatusBadge status={status} />
                  </Td>
                  <Td>
                    <PriorityBadge priority={prio} />
                  </Td>
                  <Td>
                    <PersonChip name={who} size="sm" />
                  </Td>
                  <Td numeric>{est}</Td>
                  <Td muted>
                    <RelativeTime iso={ago(mins)} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Block>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Block title="Forms">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Project name" required hint="Shown on the portfolio.">
                <Input placeholder="Atlas Commerce" />
              </Field>
              <Field label="Ticket key" error="Key must be 2 to 6 capital letters.">
                <Input defaultValue="atlas-1" />
              </Field>
              <Field label="Status">
                <Select defaultValue="active">
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </Select>
              </Field>
              <Field label="Disabled">
                <Input disabled defaultValue="Read only" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea placeholder="What is this project about?" />
            </Field>
            <Checkbox label="Redact secrets" description="Strip credentials before any model sees content." defaultChecked />
            <Switch label="Daily sync" description="Generate a summary every morning." defaultChecked />
            <Switch label="Incident triage" />
          </Block>

          <Block title="Interactive (client)">
            <InteractiveDemo />
          </Block>
        </div>

        <Block title="Loading and empty states">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-24 w-full" />
            </div>
            <EmptyState icon={<Inbox size={20} />} title="Inbox is clear" description="Answers to your escalations and clarifying questions appear here." action={<LinkButton href="/chat" variant="secondary" size="sm" icon={<Rocket size={14} />}>Ask the assistant</LinkButton>} />
          </div>
        </Block>

        <Block title="Domain badges">
          <Row label="Health">
            {health.map((h) => (
              <span key={h} className="inline-flex items-center gap-2">
                <HealthDot health={h} />
                <HealthBadge health={h} />
              </span>
            ))}
          </Row>
          <Row label="Pace">{pace.map((s) => <PaceBadge key={s} status={s} />)}</Row>
          <Row label="Deploy">{deploy.map((s) => <DeployBadge key={s} status={s} />)}</Row>
          <Row label="Ticket">{ticket.map((s) => <TicketStatusBadge key={s} status={s} />)}</Row>
          <Row label="Priority">{priority.map((p) => <PriorityBadge key={p} priority={p} />)}</Row>
          <Row label="Severity">{severity.map((s) => <SeverityBadge key={s} severity={s} />)}</Row>
          <Row label="Incident">{incident.map((s) => <IncidentStatusBadge key={s} status={s} />)}</Row>
          <Row label="Change type">{change.map((c) => <ChangeTypeBadge key={c} type={c} />)}</Row>
          <Row label="Run mode">
            <FeatureModeBadge mode="llm" />
            <FeatureModeBadge mode="heuristic" />
            <FeatureModeBadge mode="code" />
            <TierBadge tier="smart" />
            <TierBadge tier="cheap" />
            <TierBadge tier="code" />
          </Row>
          <Row label="Grounding">
            <GroundingBadge grounding={grounded} />
            <GroundingBadge grounding={partial} />
            <GroundingBadge grounding={ungrounded} />
            <GroundingBadge grounding={noEvidence} />
          </Row>
          <Row label="Sources">
            {sources.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <SourceIcon source={s} />
                {s}
              </span>
            ))}
          </Row>
          <Row label="Event kinds">
            {kinds.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <EventKindIcon kind={k} />
                {k}
              </span>
            ))}
          </Row>
          <Row label="People">
            <PersonChip name="Priya Nair" subtitle="Tech Lead" />
            <PersonChip name="Marcus Lee" subtitle="Backend" />
            <PersonChip name="Sofia Alvarez" subtitle="QA" />
          </Row>
          <Row label="Time">
            <RelativeTime iso={ago(5)} />
            <RelativeTime iso={ago(180)} />
            <RelativeTime iso={ago(60 * 24 * 3)} />
            <RelativeTime iso={ago(60 * 24 * 90)} />
            <RelativeTime iso={undefined} />
          </Row>
        </Block>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Section title="Markdown with citations" description="Raw HTML is escaped, markers become chips.">
            <Card>
              <CardBody>
                <Markdown content={markdown} citations={citations} />
              </CardBody>
            </Card>
          </Section>
          <Section title="Citations">
            <Card>
              <CardHeader as="h3" title="Sources" description="Each chip is an anchor target for inline markers." />
              <CardBody className="space-y-3">
                <CitationList citations={citations} />
                <Divider />
                <CitationChip citation={citations[0]} />
                <CitationChip citation={citations[2]} href="/projects/atlas/tickets" />
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}
