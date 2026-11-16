# Project Aid

A command center for project directors who run many software projects at once. Project Aid watches each project's repositories, boards, chat and deployments, keeps a grounded record of what happened, and puts a team of AI agents on top of it:

- **Portfolio at a glance**: health, pace, deployments and what needs attention, for every project you direct.
- **Chat with your projects**: answers cite the commits, tickets and messages they rest on, with a grounding verdict and a trace of which agents did what.
- **Daily sync and release note cards**, progress and incident **reports from templates**.
- **Message to ticket**: paste a client message, confirm the drafted tickets.
- **Incident handling**: a failed production deployment is investigated, triaged, given a fix proposal that an independent agent reviews, and escalated to the right person. You approve; nothing is merged or deployed automatically.
- **Clarifying questions**: when a major change is unclear, the system asks the author (only when necessary) so it can answer you later.
- **MCP server**: the whole platform is available as tools to Claude, Copilot Studio, IDEs or any MCP client. Teams and Slack entry points are included.
- **Learning loop**: feedback becomes proposed guidance that you approve; pinned questions act as a regression suite.

Product scope, workflows and integrations: [docs/PRODUCT.md](docs/PRODUCT.md). Architecture, agents, grounding and security: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

Requires Node.js 20.9 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in with a demo account (the sign-in page lists them; the local password is `demo1234`).

No configuration is needed. Without an API key the agents run in **heuristic mode**: every agent uses its deterministic fallback, so all workflows work and the traces show "fallback" instead of a model name. To run the agents live:

```bash
cp .env.example .env.local
```

Set `ANTHROPIC_API_KEY` in `.env.local`, restart, then confirm the live model calls work:

```bash
npm run check:llm
```

Other commands:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

## Deploy to Vercel

1. Import this repository in Vercel (framework preset: Next.js; no build settings to change).
2. Add environment variables (Project Settings, Environment Variables):

   | Variable | Needed | Purpose |
   |---|---|---|
   | `AUTH_SECRET` | Yes | Signs session cookies. Use a long random value. Without it nobody can sign in. |
   | `DEMO_PASSWORD` | Yes, for the demo | Password of the seeded demo accounts. |
   | `ANTHROPIC_API_KEY` | Recommended | Runs the agents on Claude. Without it the app runs in heuristic mode. |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Recommended | Durable storage. Add "Upstash for Redis" from the Vercel Marketplace; it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which are also accepted. |
   | `CRON_SECRET` | Optional | Enables the daily scheduled sync defined in `vercel.json`. |

3. Deploy, open the site, sign in as a demo director.
4. Settings, Setup status shows what is configured and what is missing.

**Storage on Vercel.** Without Redis, data lives in the memory of each serverless instance: it is re-seeded on a cold start and two instances do not share it. That is acceptable for a quick look but not for a live demo, so connect Redis before presenting.

All variables are described in [.env.example](.env.example).

## A five-minute demo

Sign in as **Sara Khan** (directs Atlas, Helix and Pulse).

1. **Portfolio.** Helix is amber with its reasons listed: throughput is falling, two tickets are blocked on the client, a milestone is about to slip. Atlas and Pulse are green.
2. **Ask.** In the search box type "Which projects need my attention this week?". Watch the agents work (router, one researcher per project in parallel, writer, verifier). Open "Sources" and "How this was answered".
3. **Project chat.** Open Helix, Chat, ask "What is blocking the lab results milestone and who owns it?".
4. **Incident.** Open Atlas, Overview, Demo controls, run **Failed production deploy**. A SEV2 incident appears: suspected cause with confidence, a fix proposal, the internal review, and the escalation to the author of the suspect change. Approve the fix, then run **Recovery deploy** and resolve the incident to get the incident report.
5. **Message to ticket.** Run **Client message** on Atlas, then Tickets, open Activity and click "Turn into tickets" on the client's message (or paste any message on the Tickets tab), then confirm the drafts.
6. **Unclear change.** Run **Unclear large change**. A clarifying question goes to the author; open it in the Inbox, copy the reply link into a private window and answer as the developer. The answer appears in the inbox and the change is no longer marked unclear.
7. **Safety.** Run **Secret leak** and **Prompt injection**; the activity feed shows the redaction and injection tags and project health does not move. Settings, Audit log records both.
8. **Daily sync and reports.** Helix, Daily sync, generate. Reports, generate a progress report.
9. **MCP.** Settings, Access and MCP: create a token and connect an MCP client, then ask it "use Project Aid to tell me which projects are at risk".
10. **Learning.** Give an answer a thumbs down with a comment, open Learning, "Learn from feedback", approve the proposed lesson, run the regression questions.

Sign in as **Omar Siddiqui** to see a different portfolio (Helix and Orbit) and Orbit's resolved incident with its report. **Ayesha Malik** is the administrator.

## Connect your own project

1. Create a project (Portfolio, New project), or open an existing one, Settings.
2. **Team**: add people and their GitHub, Azure DevOps and Teams identities so activity is attributed to them.
3. **Sources**: add a source and fill in its settings. Credentials are never typed into the app: set the token as an environment variable on the host and give the source the variable's name.

   | Source | Settings | Default variable |
   |---|---|---|
   | GitHub | owner, repo, branch | `GITHUB_TOKEN` |
   | Azure DevOps / TFS | organization, project, repository, baseUrl | `AZURE_DEVOPS_PAT` |
   | Jira | baseUrl, projectKey, email | `JIRA_API_TOKEN` |
   | Teams | teamId, channelId | `MS_GRAPH_TOKEN` |
   | Outlook | mailbox, subjectContains | `MS_GRAPH_TOKEN` |
   | Slack | channelId | `SLACK_BOT_TOKEN` |

4. **Deployments**: add a target per environment (Vercel project, GitHub deployments or Actions, or an HTTPS health check).
5. **Privacy and code**: choose how code is summarised (cloud model, local model only, or commit metadata only).
6. **Features**: switch individual capabilities on or off for this project.
7. Click **Sync** on the project, or let the daily schedule run. For near real-time updates from GitHub, add a webhook to `/api/webhooks/github` with the secret in `GITHUB_WEBHOOK_SECRET`.

Word, Excel, CSV, Markdown and text files can be uploaded from the project's Activity tab.

## Use it from an AI client (MCP)

Create a personal access token under Settings, Access and MCP, then connect any client that supports MCP over HTTP:

```bash
claude mcp add --transport http project-aid https://YOUR-APP.vercel.app/api/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Tools include `get_portfolio`, `get_project_status`, `ask_assistant`, `search_activity`, `list_tickets`, `get_incident`, `get_daily_sync`, `draft_tickets_from_message`, `create_tickets`, `escalate_question`, `generate_report`, `run_daily_sync`, `sync_project`, `decide_incident_fix` and more. A read-only token cannot call tools that change anything, and every tool sees only the projects of the token's owner.

**Teams.** Create an outgoing webhook in a team pointing at `/api/integrations/teams`, put its security token in `TEAMS_OUTGOING_WEBHOOK_SECRET`, and add each director's Teams name or object id to their profile. Directors can then @mention the assistant in a channel. To send questions to developers in Teams, set `TEAMS_WEBHOOK_URL` to an incoming webhook and choose Teams as the project's notification channel.

**Slack.** Create a slash command pointing at `/api/integrations/slack` and set `SLACK_SIGNING_SECRET`.

## Assumptions and things that need you

These were decided without you. Each is cheap to change.

| Topic | What was assumed or stubbed | To change it |
|---|---|---|
| Deployment | Not deployed: that needs your Vercel account. | Follow "Deploy to Vercel" above. |
| Live model calls | Written against the current Anthropic SDK and type-checked, but never run with a real key (none was available). Every call falls back to rules on failure, and the trace shows the error. | Run `npm run check:llm` with your key first. |
| Models | `claude-opus-5-5` for reasoning, `claude-haiku-5-5` for summarising. | `SMART_MODEL`, `CHEAP_MODEL`. |
| Connectors | GitHub, Azure DevOps / TFS, Jira, Teams, Outlook, Slack, Vercel and health checks are implemented and tested against recorded responses, not against live accounts. | Add credentials and click Sync; the source's status and error detail show in project settings. |
| Teams | Reading channel messages needs a Microsoft Graph token from an Entra app registration, which needs your tenant admin. Delivery to Teams uses an incoming webhook. Directors can @mention the assistant through an outgoing webhook. A full bot with proactive messages is on the roadmap. | See "Use it from an AI client". |
| Email | Questions to the team can be emailed through Resend. Outlook is supported as a read source. | `RESEND_API_KEY`, `EMAIL_FROM`. |
| Applying fixes | An approved fix is recorded and handed to the owner. Opening a pull request is stubbed on purpose: the system has summaries of code, not the code, and writing to a repository deserves an explicit decision. | `openDraftPullRequestStub` in `src/lib/connectors/github.ts`. |
| Storage | A document store with an in-memory adapter and an Upstash Redis adapter, sized for tens of projects. | Implement the `Store` interface in `src/lib/store` for Postgres. |
| Sign-in | Email and password for directors and administrators, with seeded demo accounts. Team members do not sign in; they answer through reply links. | Single sign-on with Entra ID is on the roadmap. |
| Health and pace rules | Thresholds are in `src/lib/services/snapshot.ts` and `src/lib/metrics/pace.ts`. | Edit the rules; they are covered by tests. |
| Contribution insights | Shown as activity signals, explicitly not as a performance rating, and switchable per project. | Features tab. |
| Demo data | Four fictional projects for a fictional software house, re-seeded relative to today. | `PROJECT_AID_SEED=off` starts empty. |
| Retrieval | Keyword search with recency and importance boosts; no embeddings. | `searchEvents` in `src/lib/knowledge/evidence.ts`. |
| Scheduled sync | Once a day at 01:30 UTC (Vercel Hobby allows daily schedules). | `vercel.json`. |

## Tests

`npm test` runs the suite with models switched off. It covers connectors, metrics, redaction, signatures, sessions, grounding, each workflow, the seeded portfolio end to end, and the MCP endpoint over real JSON-RPC requests.

## License

See [LICENSE](LICENSE).
