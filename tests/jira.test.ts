import { afterEach, describe, it, expect, vi } from "vitest";
import { execute } from "../lib/jira";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function config() {
  for (const [k, v] of Object.entries({
    JIRA_MODE: "sandbox",
    JIRA_BASE_URL: "https://fixture.atlassian.net",
    JIRA_PARENT_KEY: "LAB-1",
    JIRA_ALLOWED_KEYS: "LAB-1",
    JIRA_PROJECT_KEY: "LAB",
    JIRA_TRANSITION_ID: "31",
    JIRA_TARGET_STATUS_ID: "10001",
  }))
    vi.stubEnv(k, v);
}
const issue = (id = "1") => ({
  fields: {
    project: { key: "LAB" },
    status: { id, name: id === "1" ? "Open" : "Done" },
  },
});
describe("Jira sandbox adapter", () => {
  it("verifies status after transition before confirming", async () => {
    config();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(issue()))
      .mockResolvedValueOnce(
        Response.json({ transitions: [{ id: "31", to: { id: "10001" } }] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(issue("10001")));
    vi.stubGlobal("fetch", fetcher);
    expect((await execute()).confirmed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[2][1].method).toBe("POST");
  });
  it("does not write again while reconciling a timeout", async () => {
    config();
    const f = vi.fn().mockResolvedValue(Response.json(issue()));
    vi.stubGlobal("fetch", f);
    expect((await execute(true)).confirmed).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("keeps permission errors unconfirmed", async () => {
    config();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    await expect(execute()).rejects.toThrow("Jira HTTP 403");
  });
  it("records already resolved external status separately", async () => {
    config();
    const f = vi.fn().mockResolvedValue(Response.json(issue("10001")));
    vi.stubGlobal("fetch", f);
    const result = await execute();
    expect(result.already).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects transitions to an unexpected status", async () => {
    config();
    const f = vi
      .fn()
      .mockResolvedValueOnce(Response.json(issue()))
      .mockResolvedValueOnce(
        Response.json({ transitions: [{ id: "31", to: { id: "wrong" } }] }),
      );
    vi.stubGlobal("fetch", f);
    await expect(execute()).rejects.toThrow("destination");
    expect(f).toHaveBeenCalledTimes(2);
  });
});
