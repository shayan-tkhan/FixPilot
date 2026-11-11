import { beforeEach, afterEach, expect, it, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const identity = vi.hoisted(() => ({ actor: { id: "maintenance@fixpilot.demo", role: "operator", name: "Daniel" } as any }));
const mocks = vi.hoisted(() => ({ compare: vi.fn(), read: vi.fn() }));
vi.mock("../lib/auth", () => ({
  user: async () => identity.actor,
  sameOrigin: (request: Request) => { if (request.headers.get("origin") !== "http://localhost") throw Error("Origin"); },
}));
vi.mock("../lib/ai/assistant", async original => ({ ...(await original<any>()), compareEvidence: mocks.compare }));
vi.mock("node:fs/promises", async original => ({ ...(await original<any>()), readFile: mocks.read }));
import { POST } from "../app/api/repair-review/route";
import { reset, getState, save } from "../lib/db";
import { initialHub, addReport } from "../lib/incidents/coordination";
let id = "";
const call = (origin = "http://localhost") => POST(new Request("http://localhost/api/repair-review", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ caseId: id }),
}));
beforeEach(async () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("AI_GATEWAY_MODEL", "");
  await reset();
  const state = await getState();
  state.hub = initialHub();
  const created = addReport(state.hub, { summary: "Leaking tap", detail: "Water leaks from the bathroom tap", location: "APU Campus", category: "Water" }, "reporter@fixpilot.demo");
  id = created.incident.id;
  Object.assign(created.incident, { owner: "maintenance@fixpilot.demo", status: "Verifying", completionNote: "Replaced seal and checked the tap." });
  state.hub.uploads = ["before", "after"].map(purpose => ({
    id: purpose + "-test", purpose: purpose as "before" | "after", reportId: created.report.id,
    by: "maintenance@fixpilot.demo", name: purpose + ".png", type: "image/png", size: 8, path: purpose, at: Date.now(),
  }));
  await save(state);
  identity.actor = { id: "maintenance@fixpilot.demo", role: "operator", name: "Daniel" };
  mocks.read.mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  mocks.compare.mockReset().mockResolvedValue({ status: "consistent", observations: ["Visible repair supports note."], limitations: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("compares labelled before and after evidence without resolving the issue", async () => {
  expect((await call()).status).toBe(200);
  const issue = (await getState()).hub!.cases.find(item => item.id === id)!;
  expect(issue.status).toBe("Verifying");
  expect(issue.repairReview?.status).toBe("consistent");
  expect(mocks.compare.mock.calls[0][0].purpose).toBe("repair");
  expect(mocks.compare.mock.calls[0][0].media.map((item: any) => item.id)).toEqual(["after:after-test", "before:before-test"]);
  await call();
  expect(mocks.compare).toHaveBeenCalledTimes(1);
});
it("requires staff or the assigned technician and same-origin writes", async () => {
  identity.actor = { id: "reporter@fixpilot.demo", role: "reporter" };
  expect((await call()).status).toBe(404);
  expect((await call("https://other.example")).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not spend an AI request when the before/after pair is incomplete", async () => {
  const state = await getState();
  state.hub!.uploads = state.hub!.uploads!.filter(item => item.purpose === "after");
  await save(state);
  const result = await (await call()).json();
  expect(result.review.status).toBe("unclear");
  expect((await getState()).hub!.aiRequests || []).toHaveLength(0);
  expect(mocks.compare).not.toHaveBeenCalled();
});
it("rejects a comparison that became stale during generation", async () => {
  mocks.compare.mockImplementationOnce(async () => {
    const state = await getState();
    state.hub!.cases.find(item => item.id === id)!.completionNote = "Changed note after request started.";
    await save(state);
    return { status: "consistent", observations: [], limitations: [] };
  });
  expect((await call()).status).toBe(409);
  expect((await getState()).hub!.cases.find(item => item.id === id)!.repairReview).toBeUndefined();
});
