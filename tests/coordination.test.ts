import { it, expect } from "vitest";
import {
  addReport,
  classify,
  initialHub,
  signals,
} from "../lib/incidents/coordination";
import { initial } from "../lib/db";
import { duplicateCandidates } from "../lib/incidents/safeguards";
it("compresses matching reports while separating location and service", () => {
  const h = initialHub();
  const fixtures = h.reports.filter((report) => report.source === "Fixture");
  expect(fixtures).toHaveLength(8);
  expect(new Set(fixtures.map((report) => report.incidentId)).size).toBe(3);
  expect(
    h.reports.filter(
      (r) =>
        r.incidentId ===
        h.cases.find((c) => c.location === "Block A" && c.service === "WiFi")!
          .id,
    ),
  ).toHaveLength(6);
});
it("detects the service and duplicate candidates when Other leaves categorization automatic", () => {
  const h = { reports: [], cases: [] } as ReturnType<typeof initialHub>;
  const input = {
    summary: "Wi-Fi is unavailable",
    detail: "Campus Wi-Fi cannot connect in the classroom.",
    location: "Block A",
    category: "Other",
  };
  const first = addReport(h, input, "one");
  expect(first.incident.service).toBe("WiFi");
  expect(first.incident.team).toBe("Network Operations");
  expect(duplicateCandidates(h, input, first.incident.service).map((candidate) => candidate.id))
    .toContain(first.incident.id);
  const second = addReport(h, input, "two");
  expect(second.incident.id).not.toBe(first.incident.id);
  expect(h.cases).toHaveLength(2);
});
it("keeps unknown reports and different time windows separate", () => {
  const h = { reports: [], cases: [] } as ReturnType<typeof initialHub>;
  const input = {
    summary: "Internet unavailable",
    detail: "Cannot connect in Block A",
    location: "Block A",
  };
  addReport(h, input, "one", "Fixture", 1000);
  addReport(h, input, "two", "Fixture", 1900000);
  expect(h.cases).toHaveLength(2);
  expect(classify("Something mysterious")).toEqual({
    service: "Other",
    signature: "review-required",
  });
});
it("does not fabricate monitoring evidence and invalidates confirmations on new reports", () => {
  const h = initialHub();
  const c = h.cases.find(
    (c) => c.service === "WiFi" && c.location === "Block A",
  )!;
  c.confirmations = [{ by: "one", at: Date.now() }];
  expect(signals(initial(), h, c).monitoring).toBe(false);
  addReport(
    h,
    {
      summary: "WiFi down",
      detail: "Internet still unavailable",
      location: "Block A",
    },
    "new",
    "Fixture",
  );
  expect(c.confirmations).toHaveLength(0);
  expect(signals(initial(), h, c).noNewComplaints).toBe(false);
});
