import { beforeEach, afterEach, it, expect, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
import { getState, save, reset } from "../lib/db";
import { mutateHub, readHub, classify } from "../lib/incidents/coordination";
import {
  checkAssignment,
  assignmentOverdue,
  HOUR,
  suggestPriority,
} from "../lib/incidents/safeguards";
import type { User } from "../lib/auth";
const student: User = {
  id: "reporter@fixpilot.demo",
  role: "reporter",
  name: "Jamie Lee",
};
const other: User = {
  id: "another@example.invalid",
  role: "reporter",
  name: "Other",
};
const staff: User = {
  id: "reviewer@fixpilot.demo",
  role: "reviewer",
  name: "Sam Chen",
};
const backup: User = {
  id: "reviewer2@fixpilot.demo",
  role: "reviewer",
  name: "Priya Nair",
};
const tech: User = {
  id: "operator@fixpilot.demo",
  role: "operator",
  name: "Alex Morgan",
};
const input = {
  action: "report",
  summary: "Internet slow in dorm room",
  detail: "Campus Wi-Fi is very slow in the hostel room.",
  location: "Dorm A",
  category: "Wi-Fi",
};
beforeEach(async () => {
  await reset();
});
afterEach(() => {
  vi.useRealTimers();
});
async function create() {
  return (await mutateHub(student, input)) as any;
}
it("allows a reasoned department transfer with original reports and history intact", async () => {
  expect(classify(input.summary + " " + input.detail).service).toBe("WiFi");
  const c: any = await mutateHub(student, {
    ...input,
    category: "Accommodation",
  });
  await expect(
    mutateHub(staff, {
      action: "assign",
      id: c.incident.id,
      team: "Network Operations",
      owner: "Unassigned",
      eta: null,
    }),
  ).rejects.toThrow("reason");
  await mutateHub(staff, {
    action: "assign",
    id: c.incident.id,
    team: "Network Operations",
    owner: "Unassigned",
    eta: null,
    reason: "Network issue rather than accommodation.",
  });
  const d = await readHub(student);
  expect(d.issues[0].team).toBe("Network Operations");
  expect(d.issues[0].id).toBe(c.report.id);
  expect(
    d.issues[0].updates.some((u) =>
      u.text.includes("Transferred from Accommodation"),
    ),
  ).toBe(true);
  expect(
    (await getState()).hub!.cases.find((x) => x.id === c.incident.id)!.service,
  ).toBe("WiFi");
});
it("suggests matches without leaking reporter text and joins only on explicit consent", async () => {
  const c = await create();
  const suggestion: any = await mutateHub(other, {
    ...input,
    action: "suggest",
  });
  expect(suggestion.matches.some((m: any) => m.id === c.incident.id)).toBe(
    true,
  );
  expect(suggestion.matches[0]).not.toHaveProperty("detail");
  expect(suggestion.matches[0]).not.toHaveProperty("title");
  expect(suggestion.matches[0]).not.toHaveProperty("by");
  const joined: any = await mutateHub(other, {
    ...input,
    existingCase: c.incident.id,
  });
  expect(joined.incident.id).toBe(c.incident.id);
  const state = await getState();
  expect(
    state.hub!.reports.filter((r) => r.incidentId === c.incident.id),
  ).toHaveLength(2);
  expect((await readHub(other)).issues).toHaveLength(1);
  expect((await readHub(other)).reports).toHaveLength(0);
  await expect(
    mutateHub(other, {
      ...input,
      location: "Another block",
      existingCase: c.incident.id,
    }),
  ).rejects.toThrow("no longer available");
  await expect(
    mutateHub(student, { ...input, existingCase: c.incident.id }),
  ).rejects.toThrow("already follow");
});
it("atomically limits concurrent submissions to 10 reports per Malaysia calendar day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T15:59:00Z"));
  const results = await Promise.allSettled(
    Array.from({ length: 11 }, () => mutateHub(student, input)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  vi.setSystemTime(new Date("2026-11-10T16:01:00Z"));
  await expect(mutateHub(student, input)).resolves.toHaveProperty("report");
});
it("claims atomically, blocks overlapping reviewer edits and allows a reasoned takeover", async () => {
  const c = await create();
  const claims = await Promise.allSettled([
    mutateHub(staff, { action: "claim", id: c.incident.id }),
    mutateHub(backup, { action: "claim", id: c.incident.id }),
  ]);
  expect(claims.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const current = (await getState()).hub!.cases.find(
    (x) => x.id === c.incident.id,
  )!;
  const next = current.reviewer === staff.id ? backup : staff;
  await expect(
    mutateHub(next, {
      action: "assign",
      id: current.id,
      team: current.team,
      owner: tech.id,
      eta: 15,
    }),
  ).rejects.toThrow("Take over");
  await mutateHub(next, {
    action: "claim",
    id: current.id,
    takeover: true,
    reason: "Covering an unavailable colleague.",
  });
  await mutateHub(next, {
    action: "assign",
    id: current.id,
    team: current.team,
    owner: tech.id,
    eta: 15,
  });
  expect(
    (await getState()).hub!.cases.find((x) => x.id === current.id)!.reviewer,
  ).toBe(next.id);
  const own = await readHub(student);
  expect(
    own.issues[0].updates.some((u) => u.text.includes("unavailable colleague")),
  ).toBe(false);
  expect(
    own.notifications.some((n) => n.text.includes("unavailable colleague")),
  ).toBe(false);
});
it("sends one reminder at 24h and queues overdue work when no departmental backup exists", async () => {
  const created = await create();
  await mutateHub(staff, {
    action: "assign",
    id: created.incident.id,
    team: "Network Operations",
    owner: tech.id,
    eta: null,
  });
  const state = await getState(),
    h = state.hub!,
    c = h.cases.find((x) => x.id === created.incident.id)!;
  const at = c.assignedAt!,
    token = c.assignmentId!;
  expect(checkAssignment(h, c.id, token, at + 23 * HOUR)?.token).toBe(token);
  expect(c.remindedAt).toBeUndefined();
  checkAssignment(h, c.id, token, at + 24 * HOUR);
  const notes = c.updates.length;
  expect(assignmentOverdue(c, at + 24 * HOUR)).toBe(true);
  checkAssignment(h, c.id, token, at + 25 * HOUR);
  expect(c.updates).toHaveLength(notes);
  expect(checkAssignment(h, c.id, token, at + 48 * HOUR)).toBeNull();
  expect(c.assignmentAttempt).toBe(1);
  expect(c.status).toBe("Needs triage");
  expect(c.owner).toBe("Unassigned");
  expect(checkAssignment(h, c.id, token, at + 49 * HOUR)).toBeNull();
});
it("stops old assignment timers after technician response or manual reassignment", async () => {
  const created = await create();
  const id = created.incident.id;
  await mutateHub(staff, {
    action: "assign",
    id,
    team: "Network Operations",
    owner: tech.id,
    eta: 10,
  });
  const first = (await getState()).hub!.cases.find((x) => x.id === id)!;
  await mutateHub(tech, { action: "work", id, step: "start" });
  let state = await getState();
  expect(
    checkAssignment(
      state.hub!,
      id,
      first.assignmentId!,
      Date.now() + 49 * HOUR,
    ),
  ).toBeNull();
  await mutateHub(staff, {
    action: "assign",
    id,
    team: "Network Operations",
    owner: "technician2@fixpilot.demo",
    eta: 15,
  });
  state = await getState();
  expect(
    checkAssignment(
      state.hub!,
      id,
      first.assignmentId!,
      Date.now() + 49 * HOUR,
    ),
  ).toBeNull();
  expect(state.hub!.cases.find((x) => x.id === id)!.owner).toBe(
    "technician2@fixpilot.demo",
  );
});
it("accepts a substantial completion note but still requires staff approval and reporter confirmation", async () => {
  const c = await create(),
    id = c.incident.id;
  await mutateHub(staff, {
    action: "assign",
    id,
    team: "Network Operations",
    owner: tech.id,
    eta: 10,
  });
  await mutateHub(tech, { action: "work", id, step: "start" });
  await expect(
    mutateHub(tech, { action: "work", id, step: "complete", message: "done" }),
  ).rejects.toThrow("completion note");
  await mutateHub(tech, {
    action: "work",
    id,
    step: "complete",
    message:
      "Restarted the access point and verified connectivity with a user.",
  });
  expect((await readHub(student)).issues[0].status).toBe("Verifying");
  await expect(
    mutateHub(student, { action: "confirm", id: c.report.id }),
  ).rejects.toThrow("approve");
  await expect(
    mutateHub(tech, { action: "review", id, approve: true }),
  ).rejects.toThrow("Department staff");
  await mutateHub(staff, { action: "review", id, approve: true });
  expect((await readHub(student)).issues[0].status).toBe("Resolved");
  await mutateHub(student, { action: "confirm", id: c.report.id });
  expect((await readHub(student)).issues[0].status).toBe("Closed");
});
it("supports explainable priorities and manual overrides without restarting work", async () => {
  expect(suggestPriority("Power outage in the block").level).toBe("Critical");
  expect(suggestPriority("Broken chair").level).toBe("Low");
  const c = await create(),
    id = c.incident.id;
  await mutateHub(staff, {
    action: "assign",
    id,
    team: "Network Operations",
    owner: tech.id,
    eta: 10,
  });
  await mutateHub(tech, { action: "work", id, step: "start" });
  await mutateHub(staff, {
    action: "priority",
    id,
    severity: "High",
    message: "Multiple rooms are affected.",
  });
  const after = (await getState()).hub!.cases.find((c) => c.id === id)!;
  expect(after.status).toBe("Investigating");
  expect(after.severity).toBe("High");
});

it("shows trusted reporter name and TP number to staff and ignores spoofed form identity", async () => {
  await mutateHub(student, {
    ...input,
    reporter: { name: "Impersonated name", tpNumber: "TP999999" },
  });
  const d = await readHub(staff);
  const report = d.reports.find((r) => r.by === student.id)!;
  expect(report.reporter).toEqual({ name: "Jamie Lee", tpNumber: "TP000001" });
  const own = await readHub(other);
  expect(own.reports).toHaveLength(0);
  expect(own.issues).toHaveLength(0);
});
