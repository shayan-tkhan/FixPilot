import { beforeEach, expect, it } from "vitest";
import { getState, reset, save } from "../lib/db";
import { mutateHub, readHub } from "../lib/incidents/coordination";
import type { User } from "../lib/auth";
process.env.FIXPILOT_DB = ":memory:";
const staff: User = { id: "reviewer@fixpilot.demo", role: "reviewer", name: "Sam" };
const student: User = { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" };
beforeEach(async () => { await reset(); });
it("restricts deletion to staff and removes shared data and stale retries", async () => {
  const created: any = await mutateHub(student, {
    action: "report", summary: "Broken chair",
    detail: "The classroom chair has a broken leg.", location: "Delete test",
    category: "Furniture", requestId: "delete-test-report",
  });
  const state = await getState();
  state.hub!.uploads = [{ id: "proof", reportId: created.report.id, by: student.id,
    name: "chair.jpg", type: "image/jpeg", size: 10, path: "private", at: Date.now() }];
  await save(state);
  await expect(mutateHub(student, { action: "delete", id: created.incident.id })).rejects.toThrow();
  await mutateHub(staff, { action: "delete", id: created.incident.id });
  const current = (await getState()).hub!;
  expect(current.cases.some(c => c.id === created.incident.id)).toBe(false);
  expect(current.reports.some(r => r.id === created.report.id)).toBe(false);
  expect(current.uploads).toEqual([]);
  expect(current.notifications?.some(n => n.caseId === created.incident.id)).toBe(false);
  expect((await readHub(student)).issues.some(r => r.id === created.report.id)).toBe(false);
  await expect(mutateHub(student, {
    action: "report", summary: "Broken chair",
    detail: "The classroom chair has a broken leg.", location: "Delete test",
    category: "Furniture", requestId: "delete-test-report",
  })).rejects.toThrow("deleted");
  await expect(mutateHub(staff, { action: "delete", id: created.incident.id })).resolves.toEqual({ deleted: true });
});
