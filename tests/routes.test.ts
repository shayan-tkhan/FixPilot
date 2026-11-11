import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const identity = vi.hoisted(() => ({
  current: { id: "operator@fixpilot.demo", role: "operator", name: "Alex" } as {
    id: string;
    role: string;
    name: string;
  } | null,
}));
vi.mock("../lib/auth", () => ({
  user: async () => identity.current,
  sameOrigin: (r: Request) => {
    if (r.headers.get("origin") !== new URL(r.url).origin)
      throw Error("Same-origin request required");
  },
  login: () => {},
  token: () => "",
}));
import { POST, GET } from "../app/api/[...path]/route";
import { reset, getState, save, events, initial } from "../lib/db";
const call = (
  path: string,
  body: unknown = {},
  origin = "http://localhost:3000",
) =>
  POST(
    new Request("http://localhost:3000/api/" + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: [path] }) },
  );
async function ready() {
  const s = initial();
  s.linked = ["T-1", "T-2", "T-3"];
  s.analysis = {
    bundleId: "FP-001-r1",
    proposedTicketIds: s.linked,
    excludedTickets: [],
    observations: [],
    hypotheses: [],
    conflicts: [],
    nextCheck: "RUN_AIDA_USER_PROBE",
    runbookSectionIds: ["RB-AIDA-01#query-check"],
    unknowns: [],
  };
  s.probes = [
    {
      id: "P-1",
      at: Date.now() - 7000,
      health: 200,
      query: 200,
      expected: true,
      service: "AIDA",
    },
    {
      id: "P-2",
      at: Date.now() - 1000,
      health: 200,
      query: 200,
      expected: true,
      service: "AIDA",
    },
  ];
  await save(s);
  return s;
}
beforeEach(async () => {
  await reset();
  identity.current = {
    id: "operator@fixpilot.demo",
    role: "operator",
    name: "Alex",
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("authenticated workflow integration", () => {
  it("requires a session and same-origin writes", async () => {
    identity.current = null;
    expect((await call("probe")).status).toBe(401);
    expect((await call("probe", {}, "https://evil.example")).status).toBe(400);
  });
  it("rejects incompatible report linking on the server", async () => {
    expect(
      (await call("links", { ticketId: "T-4", accepted: true })).status,
    ).toBe(400);
    expect(
      (await call("links", { ticketId: "T-1", accepted: true })).status,
    ).toBe(200);
    expect((await getState()).linked).toEqual(["T-1"]);
  });
  it("requires an independent reviewer then executes exactly one recorded action", async () => {
    const s = await ready();
    const approval = {
      revision: s.revision,
      probeIds: ["P-1", "P-2"],
      target: "LOCAL-001",
      transition: "local-resolve",
      targetStatus: "local-resolved",
    };
    expect((await call("approve", approval)).status).toBe(403);
    identity.current = {
      id: "reviewer@fixpilot.demo",
      role: "reviewer",
      name: "Sam",
    };
    expect((await call("approve", approval)).status).toBe(200);
    const key = (await getState()).approval!.key;
    expect((await call("execute", { approvalKey: key })).status).toBe(403);
    identity.current = {
      id: "operator@fixpilot.demo",
      role: "operator",
      name: "Alex",
    };
    expect((await call("execute", { approvalKey: key })).status).toBe(200);
    expect((await call("execute", { approvalKey: key })).status).toBe(200);
    const done = await getState();
    expect(done.status).toBe("Resolved");
    expect(done.action?.label).toBe("Local demo update");
    expect(
      (await events()).filter((e) => e.event === "action.result"),
    ).toHaveLength(1);
  });
  it("rejects stale evidence and superseded approvals", async () => {
    const s = await ready();
    identity.current = {
      id: "reviewer@fixpilot.demo",
      role: "reviewer",
      name: "Sam",
    };
    expect(
      (
        await call("approve", {
          revision: 0,
          probeIds: ["P-1", "P-2"],
          target: "LOCAL-001",
          transition: "local-resolve",
          targetStatus: "local-resolved",
        })
      ).status,
    ).toBe(400);
    await call("approve", {
      revision: s.revision,
      probeIds: ["P-1", "P-2"],
      target: "LOCAL-001",
      transition: "local-resolve",
      targetStatus: "local-resolved",
    });
    const key = (await getState()).approval!.key;
    identity.current = {
      id: "operator@fixpilot.demo",
      role: "operator",
      name: "Alex",
    };
    await call("lab", { scenario: "recovered" });
    expect((await call("execute", { approvalKey: key })).status).toBe(400);
    const old = await ready();
    old.probes.forEach((p) => (p.at -= 130000));
    await save(old);
    identity.current = {
      id: "reviewer@fixpilot.demo",
      role: "reviewer",
      name: "Sam",
    };
    expect(
      (
        await call("approve", {
          revision: old.revision,
          probeIds: ["P-1", "P-2"],
          target: "LOCAL-001",
          transition: "local-resolve",
          targetStatus: "local-resolved",
        })
      ).status,
    ).toBe(400);
  });
  it("rejects a reviewer approving a different target action", async () => {
    const s = await ready();
    identity.current = {
      id: "reviewer@fixpilot.demo",
      role: "reviewer",
      name: "Sam",
    };
    const response = await call("approve", {
      revision: s.revision,
      probeIds: ["P-1", "P-2"],
      target: "OTHER-1",
      transition: "local-resolve",
      targetStatus: "local-resolved",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Target action changed");
    expect((await getState()).approval).toBeNull();
  });
  it("authenticates protected lab calls without forwarding its key to another host", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_ORIGIN", "https://fixpilot.example");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "fixture-only-key");
    const request = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ reply: "FIXPILOT_AIDA_OK" }),
      );
    vi.stubGlobal("fetch", request);
    expect((await call("probe")).status).toBe(200);
    expect(request.mock.calls[0][1].headers["x-vercel-protection-bypass"]).toBe(
      "fixture-only-key",
    );
    vi.stubEnv("LAB_BASE_URL", "https://external-lab.example");
    expect((await call("probe")).status).toBe(200);
    expect(
      request.mock.calls[2][1].headers["x-vercel-protection-bypass"],
    ).toBeUndefined();
  });
  it("exports a revisioned bundle with original excerpts", async () => {
    const r = await GET(new Request("http://localhost:3000/api/bundle"), {
      params: Promise.resolve({ path: ["bundle"] }),
    });
    const b = await r.json();
    expect(b.tickets).toHaveLength(5);
    expect(b.evidence[0].id).toBe("E-1");
    expect((await getState()).exportedBundle).toBe(b.bundleId);
  });
  it("keeps shared campus reports and other users' audit events out of legacy technician state", async () => {
    const state = await getState();
    const { initialHub } = await import("../lib/incidents/coordination");
    state.hub = initialHub();
    await save(state);
    const { audit } = await import("../lib/db");
    await audit("reviewer@fixpilot.demo", "coordination.private", { message: "staff-only" });
    const response = await GET(new Request("http://localhost:3000/api/state"), {
      params: Promise.resolve({ path: ["state"] }),
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.state.hub).toBeUndefined();
    expect(data.events.every((event: any) => event.actor === identity.current!.id)).toBe(true);
  });
});

it("reporters submit into shared incidents but cannot publish staff updates or read staff evidence", async () => {
  await reset();
  identity.current = {
    id: "reporter@fixpilot.demo",
    role: "reporter",
    name: "Jamie",
  };
  const response = await call("coordination", {
    action: "report",
    summary: "WiFi not connecting",
    detail: "No internet connection in Block A",
    location: "Block A",
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  const read = await GET(
    new Request("http://localhost:3000/api/coordination"),
    { params: Promise.resolve({ path: ["coordination"] }) },
  );
  const d = await read.json();
  expect(d.reports).toHaveLength(0);
  expect(d.issues.some((issue: { id: string }) => issue.id === result.report.id)).toBe(true);
  const ownReportIds = (await getState()).hub!.reports
    .filter((report) => report.by === identity.current!.id)
    .map((report) => report.id)
    .sort();
  expect(d.issues.map((issue: { id: string }) => issue.id).sort()).toEqual(ownReportIds);
  expect(d.cases).toHaveLength(0);

  expect(
    (await call("coordination", { action: "update", id: "INC-denied" })).status,
  ).toBe(403);
  expect(
    (
      await GET(new Request("http://localhost:3000/api/state"), {
        params: Promise.resolve({ path: ["state"] }),
      })
    ).status,
  ).toBe(403);
});
