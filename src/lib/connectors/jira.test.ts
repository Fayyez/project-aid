import { afterEach, describe, expect, it, vi } from "vitest";
import { jiraConnector } from "./jira";
import { jsonResponse, makeCtx, makeSource } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const source = makeSource("jira", { baseUrl: "https://acme.atlassian.net/", projectKey: "ATLAS", email: "svc@acme.com" });

describe("jiraConnector", () => {
  it("maps issues to work items", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({
        issues: [
          {
            key: "ATLAS-12",
            fields: {
              summary: "Checkout fails",
              description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Steps to reproduce" }] }] },
              status: { name: "In Progress" },
              issuetype: { name: "Bug" },
              priority: { name: "High" },
              assignee: { displayName: "Dana" },
              reporter: { displayName: "Bob", emailAddress: "bob@acme.com", accountId: "acc1" },
              updated: "2026-03-05T10:00:00.000+0100",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await jiraConnector.fetch(source, makeCtx({ JIRA_API_TOKEN: "tok" }));
    expect(res.status).toBe("ok");
    expect(res.items[0]).toMatchObject({
      kind: "work_item",
      externalId: "ATLAS-12",
      url: "https://acme.atlassian.net/browse/ATLAS-12",
      body: "Steps to reproduce",
      meta: { status: "In Progress", type: "Bug", priority: "High", assignee: "Dana" },
      occurredAt: "2026-03-05T09:00:00.000Z",
    });
    expect(res.cursor).toBe("2026-03-05T09:00:00.000Z");
    const url = decodeURIComponent(fetchMock.mock.calls[0][0].replace(/\+/g, " "));
    expect(url).toContain('project = ATLAS AND updated >= "2026-03-01 00:00"');
  });

  it("is stubbed without a token", async () => {
    const res = await jiraConnector.fetch(source, makeCtx());
    expect(res).toMatchObject({ items: [], status: "stubbed" });
    expect(res.detail).toContain("JIRA_API_TOKEN");
  });
});
