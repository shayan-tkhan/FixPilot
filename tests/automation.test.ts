import { beforeEach, expect, it, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
vi.mock("../lib/accounts", async (load) => {
  const actual = await load<typeof import("../lib/accounts")>();
  return {
    ...actual,
    technicianIds: [...actual.technicianIds, "zz-network@fixpilot.demo"],
    accounts: [
      ...actual.accounts,
      {
        id: "zz-network@fixpilot.demo",
        role: "operator",
        name: "Network backup",
        teams: ["Network Operations"],
      },
    ],
  };
});
import { getState, reset, save, withMutation } from "../lib/db";
import { mutateHub, readHub, type Hub } from "../lib/incidents/coordination";
import { assignAutomatically } from "../lib/incidents/automation";
import { checkAssignment, HOUR } from "../lib/incidents/safeguards";
import type { User } from "../lib/auth";

const student: User = { id: "reporter@fixpilot.demo", role: "reporter", name: "Jamie" };
const other: User = { id: "reporter2@fixpilot.demo", role: "reporter", name: "Noor" };
const staff: User = { id: "reviewer@fixpilot.demo", role: "reviewer", name: "Sam" };
const input = {
  action: "report",
  summary: "Campus Wi-Fi not connecting",
  detail: "Cannot connect to the campus Wi-Fi network.",
  location: "Block A",
  category: "Wi-Fi",
};

beforeEach(async () => {
  await reset();
  const state = await getState();
  state.hub = { reports: [], cases: [] };
  await save(state);
});

async function assistance(uncertainty = "Low") {
  await withMutation(async () => {
    const state = await getState();
    state.hub!.assistance = [{
      id: "analysis",
      by: student.id,
      at: Date.now(),
      model: "test",
      input: "Campus Wi-Fi not connecting. Cannot connect to the campus Wi-Fi network.",
      result: {
        summary: input.summary,
        description: input.detail,
        category: input.category,
        priority: "High",
        location: input.location,
        observations: [],
        reason: "Campus network report.",
        uncertainty,
        missingDetails: [],
      },
    }];
    await save(state);
  });
}

it("assigns concurrent new reports by departmental membership and current workload", async () => {
  const results: any[] = await Promise.all([
    mutateHub(student, { ...input, requestId: "first-report" }),
    mutateHub(other, { ...input, requestId: "second-report" }),
  ]);
  expect(new Set(results.map((result) => result.incident.owner))).toEqual(
    new Set(["operator@fixpilot.demo", "zz-network@fixpilot.demo"]),
  );
  expect(results.every((result) => result.incident.status === "Assigned")).toBe(true);
  expect(results[0].incident.automation.source).toBe("Routing rules");
  expect((await readHub(student)).issues[0].automation?.state).toBe("assigned");
});

it("retries a stable submission without adding reports, notifications or assignments", async () => {
  const first: any = await mutateHub(student, { ...input, requestId: "retry-report" });
  const before = (await getState()).hub!;
  const second: any = await mutateHub(student, { ...input, requestId: "retry-report" });
  const after = (await getState()).hub!;
  expect(second.report.id).toBe(first.report.id);
  expect(after.reports).toHaveLength(1);
  expect(after.notifications).toHaveLength(before.notifications!.length);
  expect(second.incident.assignmentId).toBe(first.incident.assignmentId);
  await expect(mutateHub(student, {
    ...input, summary: "Different network fault", requestId: "retry-report",
  })).rejects.toThrow("different report");
});

it("uses accepted low-uncertainty AI while holding changed or uncertain analysis for review", async () => {
  await assistance();
  const first: any = await mutateHub(student, { ...input, assistanceId: "analysis" });
  expect(first.incident.owner).not.toBe("Unassigned");
  expect(first.incident.severity).toBe("High");
  expect(first.incident.automation.source).toBe("AI-assisted");
  const changed: any = await mutateHub(student, {
    ...input, detail: "Different detail that has changed after analysis.", assistanceId: "analysis",
  });
  expect(changed.incident.status).toBe("Needs triage");
  expect(changed.incident.severity).toBe("Medium");
  expect(changed.incident.automation.reason).toContain("changed");
  await assistance("High");
  const uncertain: any = await mutateHub(student, { ...input, assistanceId: "analysis" });
  expect(uncertain.incident.status).toBe("Needs triage");
});

it("queues unavailable AI and conflicting routing instead of dispatching", async () => {
  const unavailable: any = await mutateHub(student, { ...input, aiUnavailable: true });
  expect(unavailable.incident.owner).toBe("Unassigned");
  expect(unavailable.incident.automation.reason).toContain("unavailable");
  const mismatch: any = await mutateHub(student, { ...input, category: "Accommodation" });
  expect(mismatch.incident.status).toBe("Needs triage");
});

it("shows the detected service and rejects an unrelated technician's investigation", async () => {
  const result: any = await mutateHub(student, { ...input, category: "Other" });
  expect((await readHub(student)).issues.find(issue => issue.id === result.report.id)?.category).toBe("WiFi");
  await expect(mutateHub({
    id: "maintenance@fixpilot.demo", role: "operator", name: "Daniel",
  }, {
    action: "analysis", id: result.incident.id, source: "Fixture",
    bundleId: result.incident.id + "-" + result.incident.updated,
    observations: [], hypotheses: [], nextCheck: "Inspect the problem", runReference: "",
  })).rejects.toThrow("Only assigned technicians");
});

it("never replaces a staff assignment or the owner of an explicitly joined issue", async () => {
  const first: any = await mutateHub(student, input);
  await mutateHub(staff, {
    action: "assign", id: first.incident.id, team: "Network Operations",
    owner: "zz-network@fixpilot.demo", eta: 15,
  });
  const joined: any = await mutateHub(other, { ...input, existingCase: first.incident.id });
  expect(joined.incident.owner).toBe("zz-network@fixpilot.demo");
  expect(joined.incident.automation.source).toBe("Staff");
  const h = (await getState()).hub!;
  const issue = h.cases.find((issue) => issue.id === first.incident.id)!;
  const token = issue.assignmentId;
  assignAutomatically(h, issue, { source: "Routing rules", reason: "Retry", ready: true });
  expect(issue.assignmentId).toBe(token);
  expect(issue.owner).toBe("zz-network@fixpilot.demo");
});

it("queues empty rosters and uses only eligible departmental backups for overdue work", async () => {
  const first: any = await mutateHub(student, input);
  const h = (await getState()).hub!;
  const issue = h.cases.find((issue) => issue.id === first.incident.id)!;
  const token = issue.assignmentId!;
  const next = checkAssignment(h, issue.id, token, issue.assignedAt! + 48 * HOUR)!;
  expect(issue.owner).toBe("zz-network@fixpilot.demo");
  expect(checkAssignment(h, issue.id, token, next.at + HOUR)?.token).toBe(next.token);
  expect(checkAssignment(h, issue.id, next.token, next.at + 48 * HOUR)).toBeNull();
  expect(issue.status).toBe("Needs triage");
  const noRoster: Hub = { reports: [], cases: [issue] };
  issue.team = "Unstaffed department";
  delete issue.automation;
  delete issue.assignmentId;
  assignAutomatically(noRoster, issue, { source: "Routing rules", reason: "Match", ready: true });
  expect(issue.owner).toBe("Unassigned");
  expect(issue).toMatchObject({ automation: { state: "pending-review" } });
});
