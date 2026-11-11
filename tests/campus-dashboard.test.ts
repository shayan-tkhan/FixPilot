import { expect, it } from "vitest";
import { presentationData } from "../lib/demo-data";
import { campusSites, monthKey, periodStats, siteForLocation } from "../lib/campus";
const live = { user: { id: "reviewer@fixpilot.demo", role: "reviewer" }, cases: [], reports: [], issues: [] };
it("keeps a labelled presentation dataset separate and gives consistent totals", () => {
  const demo = presentationData(live);
  expect(live.cases).toHaveLength(0);
  expect(demo.demo).toBe(true);
  expect(periodStats(demo.cases, "all")).toMatchObject({ total: 150, active: 40, resolved: 92, confirmed: 18, critical: 8 });
  expect(new Set(demo.cases.map((issue: any) => monthKey(issue.started))).size).toBe(6);
});
it("keeps technician presentation tasks scoped to their account", () => {
  const demo = presentationData({ ...live, user: { id: "maintenance@fixpilot.demo", role: "operator" } });
  expect(demo.cases.length).toBeGreaterThan(0);
  expect(demo.cases.every((issue: any) => issue.owner === "maintenance@fixpilot.demo")).toBe(true);
  expect(demo.reports.every((report: any) => demo.cases.some((issue: any) => issue.id === report.incidentId))).toBe(true);
});
it("matches published places and leaves vague hostels unlocated", () => {
  expect(campusSites).toHaveLength(10);
  expect(siteForLocation("M Vertica · room 12")?.id).toBe("vertica");
  expect(siteForLocation("APU On-Campus Residence J1")?.id).toBe("on-campus");
  expect(siteForLocation("Library level 3")?.id).toBe("campus");
  expect(siteForLocation("Hostel D")).toBeUndefined();
});
it("uses Malaysian calendar boundaries for monthly stats", () => {
  const at = Date.parse("2026-10-31T16:01:00Z");
  expect(monthKey(at)).toBe("2026-11");
  expect(periodStats([{ at, status: "Assigned", priority: "Critical" }], "2026-11")).toMatchObject({ total: 1, active: 1, critical: 1 });
  expect(periodStats([{ at, status: "Assigned" }], "2026-10").total).toBe(0);
});
