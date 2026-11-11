import { afterEach, beforeEach, expect, it, vi } from "vitest";

process.env.FIXPILOT_DB = ":memory:";
const mocks = vi.hoisted(() => ({ intake: vi.fn() }));
vi.mock("../lib/ai/assistant", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  intake: mocks.intake,
}));

import { prepareAutomaticIntake } from "../lib/ai/auto-intake";
import { getState, reset } from "../lib/db";
import { readHub } from "../lib/incidents/coordination";
import type { User } from "../lib/auth";

const reporter: User = {
  id: "reporter@fixpilot.demo",
  name: "Jamie Lee",
  role: "reporter",
};
const body = () => ({
  action: "report",
  requestId: "automatic-intake-test-request",
  summary: "Internet keeps disconnecting",
  detail: "The campus Wi-Fi drops every few minutes in the study room.",
  location: "Block C",
  category: "Internet",
});
const suggestion = {
  summary: "Intermittent Wi-Fi in the study room",
  description: "The reporter says campus Wi-Fi disconnects every few minutes.",
  category: "Wi-Fi",
  priority: "Medium",
  location: null,
  observations: ["Reporter describes intermittent disconnections."],
  reason: "Connectivity symptoms should be checked by Network Operations.",
  uncertainty: "Low",
  missingDetails: [],
};

beforeEach(async () => {
  await reset();
  await readHub(reporter);
  vi.stubEnv("AI_GATEWAY_API_KEY", "mock-key-for-tests");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  mocks.intake.mockReset().mockResolvedValue(suggestion);
});
afterEach(() => vi.unstubAllEnvs());

it("uses validated automatic intake while preserving the original reporter wording", async () => {
  const submitted = body();
  const original = { ...submitted };
  const result = await prepareAutomaticIntake(reporter, submitted);

  expect(submitted).toEqual(original);
  expect(result).toMatchObject({
    summary: suggestion.summary,
    detail: suggestion.description,
    category: suggestion.category,
    location: original.location,
    sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    assistanceId: expect.stringMatching(/^auto-/),
  });
  expect(result).not.toHaveProperty("aiUnavailable");
  expect(mocks.intake).toHaveBeenCalledWith({
    text: original.summary + "\n" + original.detail,
    location: original.location,
  });
  const record = (await getState()).hub!.assistance![0];
  expect(record.by).toBe(reporter.id);
  expect(record.input).toBe(original.summary + "\n" + original.detail);
  expect(record.result).toEqual(suggestion);
});

it("reuses the same analysis for an exact request retry and rechecks changed fields", async () => {
  const first: Record<string, unknown> = await prepareAutomaticIntake(reporter, body());
  const retried = await prepareAutomaticIntake(reporter, body());
  expect(retried).toEqual(first);
  expect(mocks.intake).toHaveBeenCalledTimes(1);
  expect((await getState()).hub!.assistance).toHaveLength(1);

  const changed: Record<string, unknown> = await prepareAutomaticIntake(reporter, {
    ...body(),
    detail: "Wi-Fi is unavailable across the entire building.",
  });
  expect(changed.assistanceId).not.toBe(first.assistanceId);
  expect(changed.sourceFingerprint).not.toBe(first.sourceFingerprint);
  expect(mocks.intake).toHaveBeenCalledTimes(2);
});

it("returns the original report for model failure without claiming AI success", async () => {
  mocks.intake.mockRejectedValueOnce(Error("Provider unavailable"));
  const submitted = body();
  const count = (await getState()).hub!.reports.length;
  const result = await prepareAutomaticIntake(reporter, submitted);

  expect(result).toMatchObject({ ...submitted, aiUnavailable: true });
  expect(result).not.toHaveProperty("assistanceId");
  expect((await getState()).hub!.assistance || []).toHaveLength(0);
  expect((await getState()).hub!.reports).toHaveLength(count);
});

it("handles missing model credentials without making a model request", async () => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  const submitted = body();
  const result = await prepareAutomaticIntake(reporter, submitted);

  expect(result).toMatchObject({ ...submitted, aiUnavailable: true });
  expect(result).not.toHaveProperty("assistanceId");
  expect(mocks.intake).not.toHaveBeenCalled();
  expect((await getState()).hub!.aiRequests || []).toHaveLength(0);
});

it("leaves invalid report fields for request validation before calling the model", async () => {
  for (const fields of [
    { summary: "bad" },
    { detail: "" },
    { location: "x" },
    { summary: "x".repeat(181) },
    { detail: "x".repeat(2001) },
    { location: "x".repeat(81) },
  ]) {
    const submitted = { ...body(), ...fields };
    expect(await prepareAutomaticIntake(reporter, submitted)).toBe(submitted);
  }
  expect(mocks.intake).not.toHaveBeenCalled();
  expect((await getState()).hub!.aiRequests || []).toHaveLength(0);
});

it("treats invalid model output as unavailable instead of applying partial fields", async () => {
  mocks.intake.mockResolvedValueOnce({ ...suggestion, category: "Unknown team" });
  const submitted = body();
  const result = await prepareAutomaticIntake(reporter, submitted);

  expect(result).toMatchObject({ ...submitted, aiUnavailable: true });
  expect(result).not.toHaveProperty("assistanceId");
  expect((await getState()).hub!.assistance || []).toHaveLength(0);
});
