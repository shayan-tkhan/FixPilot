import { beforeEach, it, expect, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const actor = vi.hoisted(() => ({
  u: { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" } as any,
}));
vi.mock("../lib/auth", () => ({
  user: async () => actor.u,
  sameOrigin: () => {},
}));
import { POST } from "../app/api/evidence/route";
import { GET } from "../app/api/evidence/[id]/route";
import { getState, save, reset } from "../lib/db";
import { initialHub, addReport } from "../lib/incidents/coordination";
let reportId = "";
beforeEach(async () => {
  await reset();
  actor.u = { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" };
  const s = await getState();
  s.hub = initialHub();
  reportId = addReport(
    s.hub,
    {
      summary: "Printer unavailable",
      detail: "Printer will not print documents",
      location: "Room 1",
    },
    actor.u.id,
  ).report.id;
  await save(s);
});
const upload = (type = "image/png", id = reportId) => {
  const form = new FormData();
  form.set("reportId", id);
  form.set(
    "file",
    new File([new Uint8Array([137, 80, 78, 71])], "proof.png", { type }),
  );
  return POST(
    new Request("http://localhost/api/evidence", {
      method: "POST",
      body: form,
    }),
  );
};
it("keeps evidence private to its reporter and staff", async () => {
  const response = await upload();
  expect(response.status).toBe(200);
  const { id } = await response.json();
  const read = () =>
    GET(new Request("http://localhost/api/evidence/" + id), {
      params: Promise.resolve({ id }),
    });
  expect((await read()).status).toBe(200);
  actor.u = { id: "other@example.invalid", role: "reporter" };
  expect((await read()).status).toBe(404);
  actor.u = { id: "operator@fixpilot.demo", role: "operator" };
  expect((await read()).status).toBe(404);
  const state = await getState();
  state.hub!.cases.find(
    (c) =>
      c.id === state.hub!.reports.find((r) => r.id === reportId)!.incidentId,
  )!.owner = actor.u.id;
  await save(state);
  expect((await read()).status).toBe(200);
  actor.u = { id: "reviewer@fixpilot.demo", role: "reviewer" };
  expect((await read()).status).toBe(200);
  actor.u = null;
  expect((await read()).status).toBe(401);
});
it("rejects unsupported files and uploads to another report", async () => {
  expect((await upload("image/svg+xml")).status).toBe(400);
  expect((await upload("image/png", "unknown")).status).toBe(404);
});
