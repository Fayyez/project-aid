import { DemoReset } from "@/components/features/settings/demo-reset";
import { PeopleManager } from "@/components/features/settings/people-manager";
import { SetupStatusPanel } from "@/components/features/settings/setup-status";
import { TokensManager } from "@/components/features/settings/tokens-manager";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, RelativeTime, Table, TBody, Td, Th, THead, Tabs, Tr } from "@/components/ui";
import { requireActor } from "@/lib/auth/current";
import { getSetupStatus, listAudit, listTokens } from "@/lib/services/admin";
import { listPeople } from "@/lib/services/queries";
import { listToolSummaries } from "@/lib/tools/registry";
import { ScrollText } from "lucide-react";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const query = await searchParams;
  const actor = await requireActor();
  const isAdmin = actor.role === "admin";
  const tabs = [
    { value: "setup", label: "Setup status" },
    { value: "people", label: "People" },
    { value: "access", label: "Access and MCP" },
    { value: "audit", label: "Audit log" },
    ...(isAdmin ? [{ value: "demo", label: "Demo data" }] : []),
  ];
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = tabs.find((candidate) => candidate.value === raw)?.value ?? "setup";

  let content: React.ReactNode;
  if (tab === "setup") {
    content = <SetupStatusPanel status={getSetupStatus()} />;
  } else if (tab === "people") {
    const people = await listPeople(actor);
    content = <PeopleManager people={people} isAdmin={isAdmin} />;
  } else if (tab === "access") {
    const [tokens, status] = [await listTokens(actor), getSetupStatus()];
    content = <TokensManager tokens={tokens} baseUrl={status.baseUrl} tools={listToolSummaries()} />;
  } else if (tab === "audit") {
    const entries = await listAudit(actor);
    content = (
      <Card as="section" aria-labelledby="audit-heading">
        <CardHeader title={<span id="audit-heading">Audit log</span>} description={isAdmin ? "The latest 100 changes across all projects." : "The latest 100 changes on your projects and by you."} />
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState icon={<ScrollText size={20} />} title="Nothing recorded yet" description="Changes to projects, people and access are listed here." />
          ) : (
            <Table stickyHeader>
              <THead>
                <Tr hover={false}>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Project</Th>
                  <Th>Target</Th>
                  <Th>Detail</Th>
                </Tr>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap" muted>
                      <RelativeTime iso={entry.at} />
                    </Td>
                    <Td className="whitespace-nowrap">{entry.actorName}</Td>
                    <Td>
                      <Badge tone="neutral">{entry.action}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">{entry.projectName ?? "-"}</Td>
                    <Td mono className="max-w-40 truncate">
                      {entry.target ?? "-"}
                    </Td>
                    <Td className="min-w-48 max-w-md break-words" muted>
                      {entry.detail ?? "-"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    );
  } else {
    content = <DemoReset />;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Check that the platform is set up, manage people and access, and review what changed." />
      <Tabs param="tab" defaultValue="setup" label="Settings sections" items={tabs.map((item) => ({ label: item.label, value: item.value }))} />
      {content}
    </div>
  );
}
