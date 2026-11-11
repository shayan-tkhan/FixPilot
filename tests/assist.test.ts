import { beforeEach, it, expect, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const state = vi.hoisted(() => ({
  u: {
    id: "reporter@fixpilot.demo",
    role: "reporter",
    name: "Jamie Lee",
  } as any,
}));
const mocks = vi.hoisted(() => ({
  intake: vi.fn(),
  review: vi.fn(),
  draft: vi.fn(),
}));
vi.mock("../lib/auth", () => ({
  user: async () => state.u,
  sameOrigin: (r: Request) => {
    if (r.headers.get("origin") !== new URL(r.url).origin)
      throw Error("Same-origin request required");
  },
}));
vi.mock("../lib/ai/assistant", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ...mocks,
}));
import { POST } from "../app/api/assist/route";
import { reset, getState } from "../lib/db";
import { mutateHub } from "../lib/incidents/coordination";
const suggestion = {
  summary: "Possible leaking tap",
  description: "Water is visible near the tap. Please check for a leak.",
  category: "Water",
  priority: "High",
  location: null,
  observations: ["Water near the tap"],
  reason: "Visible water needs inspection",
  uncertainty: "Medium",
  missingDetails: ["Where is the tap located?"],
};
const call = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [key, value] of Object.entries(fields)) f.set(key, value);
  return POST(
    new Request("http://localhost/api/assist", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: f,
    }),
  );
};
beforeEach(async () => {
  await reset();
  await mutateHub(
    { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie Lee" },
    {
      action: "report",
      summary: "Leaking tap",
      detail: "The tap will not stop leaking",
      location: "Dorm AI",
      category: "Water",
    },
  );
  state.u = {
    id: "reporter@fixpilot.demo",
    role: "reporter",
    name: "Jamie Lee",
  };
  vi.stubEnv("AI_GATEWAY_API_KEY", "mock-key-for-tests");
  mocks.intake.mockReset().mockResolvedValue(suggestion);
  mocks.review.mockReset();
  mocks.draft
    .mockReset()
    .mockResolvedValue({
      text: "The technician replaced the router. Staff will verify the repair.",
    });
});
it("authenticates assistance and leaves reports untouched when the model fails", async () => {
  state.u = null;
  expect(
    (await call({ intent: "intake", text: "Leaking tap in hostel" })).status,
  ).toBe(401);
  state.u = {
    id: "reporter@fixpilot.demo",
    role: "reporter",
    name: "Jamie Lee",
  };
  mocks.intake.mockRejectedValueOnce(Error("Provider unavailable"));
  const before = (await getState()).hub!.reports.length;
  expect(
    (await call({ intent: "intake", text: "Leaking tap in hostel" })).status,
  ).toBe(503);
  expect((await getState()).hub!.reports.length).toBe(before);
});
it("accepts photo-only intake as an editable suggestion and keeps missing location explicit", async () => {
  const reportsBefore = (await getState()).hub!.reports.length;
  const r = await call({
    intent: "intake",
    image: new File([new Uint8Array([137, 80, 78, 71])], "tap.png", {
      type: "image/png",
    }),
  });
  expect(r.status).toBe(200);
  const d = await r.json();
  expect(d.suggestion.location).toBeNull();
  expect(d.suggestion.uncertainty).toBe("Medium");
  expect(mocks.intake.mock.calls[0][0].image.type).toBe("image/png");
  expect((await getState()).hub!.reports).toHaveLength(reportsBefore);
  const s = await getState();
  expect(s.hub!.assistance![0].by).toBe(state.u.id);
});
it("allows the SDK to resolve Vercel runtime OIDC credentials without environment token variables", async () => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("VERCEL", "1");
  const response = await call({ intent: "intake", text: "The tap is leaking in the hostel" });
  expect(response.status).toBe(200);
  expect(mocks.intake).toHaveBeenCalledTimes(1);
  vi.stubEnv("VERCEL", "");
});
it("rejects unsupported analysis files before calling a model", async () => {
  expect(
    (
      await call({
        intent: "intake",
        image: new File(["bad"], "bad.svg", { type: "image/svg+xml" }),
      })
    ).status,
  ).toBe(400);
  expect(mocks.intake).not.toHaveBeenCalled();
});
it("keeps reviewer analysis advisory and filters unsupported duplicate IDs", async () => {
  const c = (await getState()).hub!.cases.find(
    (c) => c.location === "Dorm AI",
  )!;
  state.u = {
    id: "reviewer@fixpilot.demo",
    role: "reviewer",
    name: "Sam Chen",
  };
  mocks.review.mockResolvedValue({
    category: "Water",
    department: "Maintenance",
    priority: "High",
    reason: "A leak needs inspection",
    observations: ["Tap reported leaking"],
    uncertainty: "Medium",
    duplicates: [{ id: "INC-FOREIGN", reason: "Untrusted candidate" }],
  });
  const r = await call({ intent: "review", id: c.id });
  expect(r.status).toBe(200);
  const d = await r.json();
  expect(d.suggestion.duplicates).toHaveLength(0);
  expect((await getState()).hub!.cases.find((x) => x.id === c.id)!.status).toBe(
    c.status,
  );
  state.u = {
    id: "operator@fixpilot.demo",
    role: "operator",
    name: "Alex Morgan",
  };
  expect((await call({ intent: "review", id: c.id })).status).toBe(404);
});
it("does not let an unassigned technician draft updates for someone else’s case", async () => {
  const c = (await getState()).hub!.cases.find(
    (c) => c.location === "Dorm AI",
  )!;
  state.u = {
    id: "operator@fixpilot.demo",
    role: "operator",
    name: "Alex Morgan",
  };
  expect(
    (await call({ intent: "draft", id: c.id, text: "changed the router" }))
      .status,
  ).toBe(404);
  expect(mocks.draft).not.toHaveBeenCalled();
});
