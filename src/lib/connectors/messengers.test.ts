import { afterEach, describe, expect, it, vi } from "vitest";
import { emailMessenger, inAppMessenger, slackMessenger, teamsMessenger } from "./messengers";
import { makePerson, makeProject } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const message = { to: makePerson(), subject: "Question", body: "Is the API frozen?", replyUrl: "https://app.test/reply/abc", project: makeProject() };

describe("messengers", () => {
  it("in-app is always sent", async () => {
    expect(await inAppMessenger.send(message)).toMatchObject({ channel: "in_app", status: "sent" });
  });

  it("is stubbed (not thrown) when unconfigured", async () => {
    vi.stubEnv("TEAMS_WEBHOOK_URL", "");
    vi.stubEnv("SLACK_WEBHOOK_URL", "");
    vi.stubEnv("RESEND_API_KEY", "");
    for (const m of [teamsMessenger, slackMessenger, emailMessenger]) {
      expect(m.isConfigured()).toBe(false);
      const res = await m.send(message);
      expect(res.status).toBe("stubbed");
      expect(res.detail).toMatch(/Set [A-Z_]+/);
    }
  });

  it("sends through the configured webhooks and Resend", async () => {
    vi.stubEnv("TEAMS_WEBHOOK_URL", "https://teams.test/hook");
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://slack.test/hook");
    vi.stubEnv("RESEND_API_KEY", "re_secret");
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => (String(url).includes("resend") ? new Response('{"id":"1"}') : new Response("1")));
    vi.stubGlobal("fetch", fetchMock);
    expect((await teamsMessenger.send(message)).status).toBe("sent");
    expect((await slackMessenger.send(message)).status).toBe("sent");
    expect((await emailMessenger.send(message)).status).toBe("sent");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("https://app.test/reply/abc");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("Answer");
    const [emailUrl, emailInit] = fetchMock.mock.calls[2];
    expect(String(emailUrl)).toBe("https://api.resend.com/emails");
    expect(String(emailInit?.body)).toContain("dana@example.com");
  });

  it("reports failure without leaking the key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 401 })));
    const res = await emailMessenger.send(message);
    expect(res.status).toBe("failed");
    expect(res.detail).not.toContain("re_secret");
  });
});
