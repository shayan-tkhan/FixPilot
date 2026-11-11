import { expect, it } from "vitest";
import { responseDeadline } from "../lib/response-deadline";
const assignedAt = Date.parse("2026-11-11T00:00:00Z");
it("matches the durable 24h response and 48h escalation windows", () => {
  const result = responseDeadline({ status: "Assigned", assignedAt }, assignedAt + 23.5 * 3600000)!;
  expect(result).toMatchObject({ due: assignedAt + 24 * 3600000, escalation: assignedAt + 48 * 3600000, soon: true, overdue: false });
  expect(result.label).toContain("30m");
});
it("marks the deadline overdue exactly at the reminder boundary", () => {
  expect(responseDeadline({ status: "Assigned", assignedAt }, assignedAt + 24 * 3600000)?.overdue).toBe(true);
});
it("stops response countdowns after acknowledgement and on inactive assignments", () => {
  expect(responseDeadline({ status: "Assigned", assignedAt, respondedAt: assignedAt + 1 })).toBeNull();
  expect(responseDeadline({ status: "Investigating", assignedAt })).toBeNull();
  expect(responseDeadline({ status: "Assigned" })).toBeNull();
});
