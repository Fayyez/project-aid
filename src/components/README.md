# Project Aid components

Living demo: run the app and open `/dev/ui-kit` (all components) and `/dev/ui-kit/shell` (app shell).
Import from the barrels, never from individual files:

```ts
import { Card, CardHeader, CardBody, Badge, Table } from "@/components/ui";
import { Sparkline, BarChart } from "@/components/charts";
import { HealthBadge, Markdown } from "@/components/domain";
import { AppShell, ProjectTabs } from "@/components/shell";
```

Everything is a server component unless marked **client**. Client components can be rendered from server
components; they just cannot receive functions (except server actions). All components forward `className`
(joined with `clsx`; there is no tailwind-merge, so do not rely on overriding a conflicting utility).

## Tokens and Tailwind classes

Light/dark are CSS variables on `:root` (follows `prefers-color-scheme`; `data-theme="light|dark"` on `<html>` overrides).
Never hard-code colours or use `dark:`; use these classes, they adapt automatically.

| Purpose | Classes |
| --- | --- |
| Page / surfaces | `bg-bg` (page), `bg-surface` (cards), `bg-surface-2` (subtle fills, table heads), `bg-surface-3` (tracks, pressed) |
| Text | `text-fg` (primary), `text-muted` (secondary), `text-subtle` (hints, placeholders; not for essential text) |
| Lines | `border-line` (hairline), `border-line-strong` (inputs, hover) |
| Accent (indigo) | `bg-accent text-accent-fg`, `hover:bg-accent-hover`, `text-accent`, `bg-accent-soft`, `border-accent-line`, `ring-ring` |
| Success | `text-success`, `bg-success-soft`, `border-success-line`, `bg-success` |
| Warning | `text-warning`, `bg-warning-soft`, `border-warning-line`, `bg-warning` |
| Danger | `text-danger`, `bg-danger-soft`, `border-danger-line`, `bg-danger` (`text-danger-fg` on solid) |
| Info | `text-info`, `bg-info-soft`, `border-info-line`, `bg-info` |
| Shadows | `shadow-card`, `shadow-pop` (menus, dialogs) |
| Fonts | `font-sans` (system, default), `font-mono` (ids, shas, keys, code), `tabular-nums` for metrics |
| Overlay | `bg-overlay` |

Semantic colours are reserved for status. Use `accent` for brand, links, selection and primary actions.
Markdown/HTML you render yourself can use the `.prose-aid` class.

## Layout conventions

- The shell supplies page padding (`px-4 sm:px-6 lg:px-8 py-6`) and max width 1400px. Pages start with `<PageHeader>`, never add their own outer padding.
- Vertical rhythm: `space-y-6` between page sections (`space-y-8` for long dashboards). Grids: `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4` (always include `grid-cols-1` so wide content cannot blow out a mobile grid; add `min-w-0` to flex/grid children that hold long text).
- Boxed content = `Card` with `CardHeader` (title, optional description/actions) + `CardBody` (`p-4`). Use `Section` for an unboxed titled block. KPI blocks: a `Card` > `CardBody` > `Stat`.
- Lists of records = `Table` (compact, scrolls inside its own container). Put badges in cells, ids and keys in `<Td mono>`, numbers in `<Td numeric>`/`<Th numeric>`, times via `RelativeTime`.
- Text sizes: body 14px; dense UI 13px (`text-[13px]`); captions `text-xs`. Titles are `text-sm font-semibold` inside cards; only `PageHeader` renders an `h1`.
- Colour is never the only status signal: the domain badges already pair colour with an icon and label.
- Badge tones: `success` healthy/done/succeeded, `warning` at risk/degraded/needs attention, `danger` failing/blocked/critical, `info` in progress/informational, `accent` brand-ish states (in review, awaiting approval, feature, LLM), `neutral` unknown/inactive/metadata. Prefer the domain badges below over raw `Badge` for domain values.
- Buttons: one `primary` per view; `secondary` for most actions; `ghost` for toolbar/low emphasis; `subtle` for tinted secondary; `danger` for destructive confirmations. Icon-only buttons must use `IconButton` (requires `label`).

## `@/components/ui`

| Export | Props (abridged) | Example |
| --- | --- | --- |
| `cn` | clsx | `cn("a", cond && "b")` |
| `Tone` | `"neutral" \| "accent" \| "success" \| "warning" \| "danger" \| "info"`; maps `toneSoft`, `toneText`, `toneDot` | `toneText[tone]` |
| `Button` | `variant: primary\|secondary\|ghost\|danger\|subtle`, `size: sm\|md`, `loading`, `icon`, button attrs | `<Button variant="primary" loading={pending}>Save</Button>` |
| `LinkButton` | same as Button + next/link props (`href`) | `<LinkButton href="/chat">Ask</LinkButton>` |
| `buttonStyles` | `({ variant, size }) => string` | `<a className={buttonStyles({ variant: "ghost" })}>` |
| `IconButton` | `label` (required), `size: sm\|md`, `variant: ghost\|secondary\|subtle` | `<IconButton label="Refresh"><RefreshCw size={16} /></IconButton>` |
| `Card` | `as?: div\|section\|article` | `<Card><CardHeader title="Velocity" /><CardBody>...</CardBody></Card>` |
| `CardHeader` | `title`, `description?`, `actions?`, `as?: h2\|h3\|h4` | `<CardHeader title="Tickets" actions={<Button size="sm">New</Button>} />` |
| `CardBody` | div props | `<CardBody className="space-y-3">` |
| `Badge` | `tone`, `dot?`, `icon?` | `<Badge tone="info" dot>Beta</Badge>` |
| `Tabs` (**client**) | `items: { label, href?, value?, exact?, icon?, count? }[]`, `param?`, `defaultValue?`, `label?` | path mode: `<Tabs items={[{ label: "Open", href: "/inbox", exact: true }]} />`; search-param mode: `<Tabs param="range" items={[{ label: "7d", value: "7d" }]} />` (read `searchParams.range` in the page) |
| `SegmentedControl` (**client**) | `options: { value, label, icon? }[]`, `value?`/`defaultValue?`, `onChange?`, `size?`, `label` | `<SegmentedControl label="View" options={...} onChange={setView} />` |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td` | `Table: density?: compact\|comfortable, stickyHeader?, containerClassName?`; `Tr: hover?`; `Th: numeric?`; `Td: numeric?, mono?, muted?` | `<Table><THead><Tr hover={false}><Th>Key</Th></Tr></THead><TBody><Tr><Td mono>ATLAS-1</Td></Tr></TBody></Table>` |
| `Input`, `Textarea`, `Select` | native attrs + `invalid?` | `<Input name="title" placeholder="Title" />` |
| `Checkbox`, `Switch` | native attrs + `label?`, `description?` (Switch is CSS-only, works in server forms) | `<Switch name="dailySync" label="Daily sync" defaultChecked />` |
| `Label` | `required?` | `<Label htmlFor="x">Name</Label>` |
| `Field` | `label`, `hint?`, `error?`, `required?`, child control gets id/aria wiring | `<Field label="Name" error={err}><Input name="name" /></Field>` |
| `Dialog` (**client**) | `open`, `onClose`, `title`, `description?`, `footer?`, `size?: sm\|md\|lg` | `<Dialog open={o} onClose={() => setO(false)} title="Create ticket" footer={...}>...</Dialog>` |
| `Drawer` (**client**) | `open`, `onClose`, `title`, `description?`, `footer?`, `side?: right\|left`, `width?`, `hideHeader?` | `<Drawer open={o} onClose={close} title="ATLAS-12">...</Drawer>` |
| `DropdownMenu` (**client**), `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator` | `label`, `trigger`, `chevron?`, `align?: start\|end`; item: `href?`, `icon?`, `danger?`, `onSelect?` | `<DropdownMenu label="Actions" trigger="Actions" chevron><DropdownMenuItem href="/x">Open</DropdownMenuItem></DropdownMenu>` |
| `Tooltip` | `content`, `side?: top\|bottom` | `<Tooltip content="Why"><span>?</span></Tooltip>` |
| `Avatar`, `AvatarStack` | `name`, `size?: xs\|sm\|md\|lg`; stack: `people: {name}[]`, `max?` | `<AvatarStack people={team} />` |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` | `<EmptyState icon={<Inbox size={20} />} title="Nothing here" />` |
| `Skeleton`, `Spinner` | `className` sizes it; Spinner: `size?`, `label?` | `<Skeleton className="h-4 w-40" />` |
| `Stat` | `label`, `value`, `delta?: { value, direction: up\|down\|flat, tone?, label? }`, `hint?`, `spark?`, `icon?` | `<Stat label="Velocity" value="8.5" delta={{ value: "+12%", direction: "up" }} />` (set `tone: "success"` when "down" is good) |
| `Callout` | `tone?: info\|success\|warning\|danger`, `title?`, `action?` | `<Callout tone="warning" title="Degraded">...</Callout>` |
| `Kbd`, `Divider` | `Divider orientation?` | `<Kbd>K</Kbd>` |
| `PageHeader` | `title`, `description?`, `breadcrumbs?: { label, href? }[]`, `actions?`, `meta?` | `<PageHeader title="Incidents" actions={<Button>New</Button>} />` |
| `Section` | `title`, `description?`, `actions?` | `<Section title="Recent activity">...</Section>` |
| `Toaster`, `useToast`, `toast` (**client**) | `toast({ title, description?, tone?: info\|success\|warning\|danger, duration? })`. `<Toaster />` is already in the root layout. | `const { toast } = useToast(); toast({ title: "Saved", tone: "success" })` |
| `CopyButton` (**client**) | `value`, `label?`, children | `<CopyButton value={sha} label="Copy sha" />` |
| `RelativeTime` (**client**) | `iso`, `empty?`, `className?` (absolute UTC date on server, relative after mount; title = full timestamp) | `<RelativeTime iso={event.occurredAt} />` |

## `@/components/charts` (SVG, no dependencies, colours from tokens)

`ChartTone` = `Tone`.

| Export | Props | Example |
| --- | --- | --- |
| `Sparkline` | `data: number[]`, `kind?: line\|bars`, `tone?`, `width?`, `height?`, `title?` | `<Sparkline data={pace.weeklyThroughput} tone="success" title="Throughput" />` |
| `BarChart` | `data: { label, value, tone? }[]`, `tone?`, `height?`, `slot?`, `highlightLast?`, `format?`, `title?` | `<BarChart title="Closed per week" data={weeks} />` |
| `ProgressBar` | `value` (0-100), `marker?` (time elapsed), `markerLabel?`, `tone?: Tone\|"auto"`, `label?`, `showValue?`, `size?: sm\|md` | `<ProgressBar value={pace.progressPct} marker={pace.timeElapsedPct} tone="auto" showValue />` |
| `Donut` | `segments: { label, value, tone }[]`, `size?`, `thickness?`, `centerValue?`, `centerLabel?`, `legend?`, `title?` | `<Donut segments={...} centerLabel="tickets" />` |
| `ActivityHeat` | `data: number[]`, `labels?`, `tone?`, `cell?`, `gap?`, `title?` | `<ActivityHeat data={person.activity} />` |

## `@/components/domain` (pure, props in / markup out)

| Export | Props | Notes |
| --- | --- | --- |
| `HealthBadge`, `HealthDot` | `health: Health` | green Healthy, amber At risk, red Critical. Dot has an aria-label. |
| `PaceBadge` | `status: PaceStatus` | |
| `DeployBadge` | `status: DeploymentStatus \| "unknown"` | accepts `ProjectSnapshot.deploy[].status` directly |
| `TicketStatusBadge` | `status: TicketStatus` | |
| `PriorityBadge` | `priority: Priority` | |
| `SeverityBadge` | `severity: Severity` | |
| `IncidentStatusBadge` | `status: IncidentStatus` | |
| `ChangeTypeBadge` | `type: ChangeType` | |
| `SourceIcon` | `source: SourceKind`, `size?` | `SOURCE_META` exposes labels |
| `EventKindIcon` | `kind: EventKind`, `size?` | `EVENT_KIND_META` exposes labels |
| `FeatureModeBadge` | `mode: RunStep["mode"]` (llm / heuristic / code) | |
| `TierBadge` | `tier: Tier \| "code"` | |
| `GroundingBadge` | `grounding: GroundingResult` | verdict + score, title lists unsupported counts |
| `CitationChip` | `citation: Citation`, `href?`, `id?` | external `url` opens in a new tab |
| `CitationList` | `citations: Citation[]`, `hrefFor?` | each item has `id="cite-<ref>"`, the anchor target for inline markers |
| `PersonChip` | `name`, `subtitle?`, `size?: sm\|md` | |
| `Markdown` | `content`, `citations?`, `className?` | GFM, `.prose-aid`, raw HTML escaped, links open in a new tab, `[E1]` / `[E1][E4]` / `[E1, E4]` become superscript chips linking to `#cite-E1` with the citation title as tooltip. Render `<CitationList>` next to it. |

## `@/components/shell`

```tsx
// src/app/(app)/layout.tsx (server)
<AppShell user={{ name, email, role }} projects={[{ id, name, key, health }]} counts={{ inbox, incidents }}
          llm={{ mode: "live" | "heuristic", label: "Live: claude" }} signOutAction={signOut}>
  {children}
</AppShell>
```

- `AppShell` (**client**): sidebar (drawer on phones), top bar (quick "ask" search that navigates to `/chat?q=`, AI mode pill, theme toggle, user menu with Sign out form). `signOutAction` is a server action `() => Promise<void>`. `main` is `max-w-[1400px]` with padding; it has `id="main"` and a skip link.
- `ProjectTabs({ projectId, className? })`: tab bar for `/projects/[id]` (Overview, Daily sync, Activity, Tickets, Incidents, Reports, Team, Chat, Notes, Settings). Render it in `projects/[id]/layout.tsx` under the project header.
- `ThemeToggle` (**client**) is already inside the top bar. `PRIMARY_NAV` lists the sidebar entries.

## Caveats

- Hydration: never render `new Date().toLocaleString()` or relative times directly; use `RelativeTime` (or `formatDate`/`formatDateTime` from `@/lib/format`, which are UTC and deterministic).
- `Tabs` in search-param mode wraps `useSearchParams` in Suspense internally; the page itself must read `searchParams` (a Promise) to filter data.
- `DropdownMenu` and `Dialog` take handlers, so use them from client components; a menu made only of `href` items (and forms) can be placed from a server component.
- Page-level dialogs: the native `<dialog>` is top-layer, so z-index is not an issue; render it anywhere.
