import { config } from "@/lib/config";
import type { DeployTarget, MessageChannel, Project, SourceKind } from "@/lib/types";
import type { ConnectorContext, DeployMonitor, Messenger, SourceConnector } from "./types";
import { githubConnector, githubDeployMonitor } from "./github";
import { azureDevOpsConnector } from "./azure-devops";
import { jiraConnector } from "./jira";
import { outlookConnector, slackConnector, teamsConnector } from "./chat";
import { azureDeployMonitor, healthcheckMonitor, vercelDeployMonitor } from "./deploy";
import { emailMessenger, inAppMessenger, slackMessenger, teamsMessenger } from "./messengers";

const connectors = new Map<SourceKind, SourceConnector>();
const monitors = new Map<DeployTarget["provider"], DeployMonitor>();
const messengers = new Map<MessageChannel, Messenger>();

export function registerConnector(connector: SourceConnector): void {
  connectors.set(connector.kind, connector);
}
export function getConnector(kind: SourceKind): SourceConnector | undefined {
  return connectors.get(kind);
}
export function listConnectors(): SourceConnector[] {
  return Array.from(connectors.values());
}

export function registerDeployMonitor(monitor: DeployMonitor): void {
  monitors.set(monitor.provider, monitor);
}
export function getDeployMonitor(provider: DeployTarget["provider"]): DeployMonitor | undefined {
  return monitors.get(provider);
}

export function registerMessenger(messenger: Messenger): void {
  messengers.set(messenger.channel, messenger);
}
/** Falls back to the in-app messenger, which always succeeds. */
export function getMessenger(channel: MessageChannel): Messenger {
  return messengers.get(channel) ?? inAppMessenger;
}
export function listMessengers(): Messenger[] {
  return Array.from(messengers.values());
}

export function makeConnectorContext(project: Project, since: string, now: Date = new Date()): ConnectorContext {
  return { project, since, now, secret: (envName) => config.secret(envName) };
}

for (const c of [githubConnector, azureDevOpsConnector, jiraConnector, teamsConnector, slackConnector, outlookConnector]) registerConnector(c);
for (const m of [githubDeployMonitor, vercelDeployMonitor, healthcheckMonitor, azureDeployMonitor]) registerDeployMonitor(m);
for (const m of [inAppMessenger, teamsMessenger, slackMessenger, emailMessenger]) registerMessenger(m);

export { githubConnector, githubDeployMonitor, createGithubIssue, openDraftPullRequestStub } from "./github";
export { parseDocument } from "./documents";
export type * from "./types";
