import { beforeEach, afterEach, expect, it, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const actor = vi.hoisted(() => ({
  user: { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" } as any,
}));
const mocks = vi.hoisted(() => ({ compare: vi.fn(), read: vi.fn() }));
vi.mock("../lib/auth", () => ({
  user: async () => actor.user,
  sameOrigin: (request: Request) => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw Error("Same-origin request required");
  },
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<any>()),
  readFile: mocks.read,
}));
vi.mock("../lib/ai/assistant", async (original) => ({
  ...(await original<any>()),
  compareEvidence: mocks.compare,
}));
import { POST } from "../app/api/evidence-review/route";
import { AI_MODEL, configuredAiModel, supportsEvidenceVideo } from "../lib/ai/assistant";
import { evidenceFingerprint, reportAttachments } from "../lib/ai/evidence";
import { addReport, initialHub } from "../lib/incidents/coordination";
import { getState, reset, save } from "../lib/db";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let reportId = "";
const call = (origin = "http://localhost") => POST(new Request("http://localhost/api/evidence-review", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ reportId }),
}));

beforeEach(async () => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("AI_GATEWAY_MODEL", AI_MODEL);
  vi.stubEnv("VERCEL", "");
  await reset();
  actor.user = { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" };
  const state = await getState();
  state.hub = initialHub();
  const { report } = addReport(state.hub, {
    summary: "Broken chair in the classroom",
    detail: "The chair has a broken rear leg",
    location: "Room 1",
  }, actor.user.id);
  reportId = report.id;
  state.hub.uploads = [{
    id: "proof-original", reportId, by: actor.user.id, purpose: "attachment",
    name: "photo.png", type: "image/png", size: png.byteLength,
    path: "evidence/proof-original", at: Date.now(),
  }];
  await save(state);
  mocks.read.mockReset().mockResolvedValue(png);
  mocks.compare.mockReset().mockResolvedValue({
    status: "consistent", observations: ["A broken chair leg is visible."],
    limitations: ["The photo cannot establish when or where it was taken."],
  });
});
afterEach(() => vi.unstubAllEnvs());

it("compares only this reporter's own original evidence and preserves original input", async () => {
  const state = await getState();
  const hub = state.hub!;
  hub.reports.find((report) => report.id === reportId)!.assistanceId = "draft-1";
  hub.assistance = [{ id: "draft-1", by: actor.user.id, input: "Chair leg snapped", at: 1, model: AI_MODEL, result: {} as any }];
  hub.uploads!.push(
    { ...hub.uploads![0], id: "other-report", reportId: "another-report" },
    { ...hub.uploads![0], id: "other-reporter", by: "reporter2@fixpilot.demo" },
    { ...hub.uploads![0], id: "technician-repair", purpose: "after", by: "operator@fixpilot.demo" },
  );
  await save(state);
  const response = await call();
  expect(response.status).toBe(200);
  const { review } = await response.json();
  expect(review.analyzedAttachmentIds).toEqual(["proof-original"]);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.compare.mock.calls[0][0].report.originalText).toBe("Chair leg snapped");
  expect(mocks.compare.mock.calls[0][0].media.map((media: any) => media.id)).toEqual(["proof-original"]);
});

it("authenticates and applies report ownership before fetching private attachments", async () => {
  expect((await call("https://other.invalid")).status).toBe(403);
  actor.user = null;
  expect((await call()).status).toBe(401);
  actor.user = { id: "reporter2@fixpilot.demo", role: "reporter" };
  expect((await call()).status).toBe(404);
  actor.user = { id: "operator@fixpilot.demo", role: "operator" };
  const state = await getState();
  state.hub!.cases.find((task) => task.id === state.hub!.reports.find((report) => report.id === reportId)!.incidentId)!.owner = "Unassigned";
  await save(state);
  expect((await call()).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});

it("caches unchanged evidence without spending another AI request", async () => {
  expect((await call()).status).toBe(200);
  const response = await call();
  expect((await response.json()).cached).toBe(true);
  expect(mocks.compare).toHaveBeenCalledTimes(1);
  expect((await getState()).hub!.aiRequests).toHaveLength(1);
});

it("shares the daily AI budget with intake and staff assistance", async () => {
  const state = await getState();
  state.hub!.aiRequests = Array.from({ length: 20 }, (_, index) => ({
    id: String(index), by: actor.user.id, at: Date.now(), kind: "intake",
  }));
  await save(state);
  expect((await call()).status).toBe(429);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.compare).not.toHaveBeenCalled();
});

it("blocks simultaneous analysis and releases the reservation after completion", async () => {
  let markStarted!: () => void;
  let finish!: (value: unknown) => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  mocks.compare.mockImplementationOnce(() => {
    markStarted();
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = call();
  await started;
  expect((await call()).status).toBe(409);
  finish({ status: "consistent", observations: [], limitations: [] });
  expect((await first).status).toBe(200);
  expect((await getState()).hub!.aiRequests![0].kind).toBe("evidence-completed");
  expect((await (await call()).json()).cached).toBe(true);
});

it("rejects stale results if the report changes while the model is running", async () => {
  mocks.compare.mockImplementationOnce(async () => {
    const state = await getState();
    state.hub!.reports.find((report) => report.id === reportId)!.detail = "A different chair is damaged";
    await save(state);
    return { status: "consistent", observations: [], limitations: [] };
  });
  expect((await call()).status).toBe(409);
  expect((await getState()).hub!.reports.find((report) => report.id === reportId)!.evidenceReview).toBeUndefined();
  expect((await getState()).hub!.aiRequests![0].kind).toBe("evidence-completed");
});

it("uses actual video bytes with the verified video model", async () => {
  const state = await getState();
  state.hub!.uploads![0].type = "video/webm";
  state.hub!.uploads![0].size = 4;
  await save(state);
  mocks.read.mockResolvedValueOnce(new Uint8Array([26, 69, 223, 163]));
  const response = await call();
  expect(response.status).toBe(200);
  expect(mocks.compare.mock.calls[0][0].media[0]).toMatchObject({ type: "video/webm", bytes: new Uint8Array([26, 69, 223, 163]) });
});

it("records manual review when video is unsupported or the media signature is wrong", async () => {
  const state = await getState();
  state.hub!.uploads![0].type = "video/webm";
  await save(state);
  vi.stubEnv("AI_GATEWAY_MODEL", "google/gemini-2.5-flash-lite");
  const first = await (await call()).json();
  expect(first.review.status).toBe("unavailable");
  expect(first.review.analyzedAttachmentIds).toEqual([]);
  expect(first.review.limitations.join(" ")).toContain("Staff must watch the video");
  expect((await getState()).hub!.aiRequests![0].kind).toBe("evidence-completed");
  vi.stubEnv("AI_GATEWAY_MODEL", AI_MODEL);
  const second = await (await call()).json();
  expect(second.review.status).toBe("unavailable");
  expect(second.review.limitations.join(" ")).toContain("declared media format");
  expect(mocks.compare).not.toHaveBeenCalled();
});

it("handles provider failure without declaring a match or leaking provider errors", async () => {
  mocks.compare.mockRejectedValueOnce(Error("Card verification needed secret-provider-data"));
  const response = await call();
  const result = await response.json();
  expect(result.review.status).toBe("unavailable");
  expect(result.review.analyzedAttachmentIds).toEqual([]);
  expect(result.review.limitations.join(" ")).toContain("billing verification");
  expect(JSON.stringify(result)).not.toContain("secret-provider-data");
  expect((await getState()).hub!.aiRequests![0].kind).toBe("evidence-completed");
});

it("falls back to the credit-eligible default when a paid model override is configured", () => {
  vi.stubEnv("AI_GATEWAY_MODEL", "google/gemini-3.8-flash");
  expect(configuredAiModel()).toBe("alibaba/qwen3.6-35b-a3b");
  expect(supportsEvidenceVideo(configuredAiModel())).toBe(true);
  vi.stubEnv("AI_GATEWAY_MODEL", "google/gemini-2.5-flash-lite");
  expect(configuredAiModel()).toBe("google/gemini-2.5-flash-lite");
  expect(supportsEvidenceVideo(configuredAiModel())).toBe(false);
});

it("flags a possible mismatch to staff without changing the case resolution status", async () => {
  mocks.compare.mockResolvedValueOnce({ status: "possible_mismatch", observations: ["The photo shows a tap, while the report describes a chair."], limitations: [] });
  const before = await getState();
  const caseId = before.hub!.reports.find((report) => report.id === reportId)!.incidentId;
  const status = before.hub!.cases.find((task) => task.id === caseId)!.status;
  expect((await call()).status).toBe(200);
  const after = await getState();
  expect(after.hub!.cases.find((task) => task.id === caseId)!.status).toBe(status);
  expect(after.hub!.notifications?.some((item) => item.to === "reviewer@fixpilot.demo" && item.text.includes("possible mismatch"))).toBe(true);
});

it("fingerprints text and attachment changes and excludes unrelated uploads", async () => {
  const hub = (await getState()).hub!;
  const report = hub.reports.find((item) => item.id === reportId)!;
  const fingerprint = evidenceFingerprint(report, reportAttachments(report, hub.uploads!));
  expect(evidenceFingerprint({ ...report, detail: "Changed" }, reportAttachments(report, hub.uploads!))).not.toBe(fingerprint);
  expect(evidenceFingerprint(report, reportAttachments(report, [...hub.uploads!, { ...hub.uploads![0], id: "foreign", reportId: "foreign" }]))).toBe(fingerprint);
});
