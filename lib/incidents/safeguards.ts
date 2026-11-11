import { nameOf, reviewerIds } from "../accounts";
import type { Hub, Case } from "./coordination";
import { selectTechnician } from "./automation";
export const HOUR = 3600000;
export function notify(
  h: Hub,
  to: readonly string[],
  c: Case,
  text: string,
  at = Date.now(),
) {
  const notifications = h.notifications || (h.notifications = []);
  for (const user of new Set(to))
    notifications.push({
      id: crypto.randomUUID(),
      to: user,
      caseId: c.id,
      title: c.title,
      text,
      at,
    });
}
export function watchers(h: Hub, c: Case) {
  return [
    ...reviewerIds,
    ...h.reports.filter((r) => r.incidentId === c.id).map((r) => r.by),
    ...(c.owner === "Unassigned" ? [] : [c.owner]),
  ];
}
export function suggestPriority(text: string) {
  if (
    /power outage|exposed wir|electric shock|sparking|smoke|fire\b|flooding/i.test(
      text,
    )
  )
    return {
      level: "Critical",
      reason: "Potential safety risk or power outage",
    };
  if (
    /campus.?wide|whole building|entire block|many users|no water|network outage/i.test(
      text,
    )
  )
    return {
      level: "High",
      reason: "Possible building or service-wide impact",
    };
  if (/chair|cosmetic|scratch|loose handle/i.test(text))
    return { level: "Low", reason: "Likely limited impact" };
  return { level: "Medium", reason: "Needs department review" };
}
const locationKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter(
        (w) =>
          w.length > 2 &&
          ![
            "the",
            "and",
            "not",
            "room",
            "block",
            "with",
            "working",
            "issue",
            "cannot",
          ].includes(w),
      ) || [],
  );
export function duplicateCandidates(
  h: Hub,
  input: { summary: string; detail: string; location: string },
  service: string,
  now = Date.now(),
) {
  const tokens = words(input.summary + " " + input.detail);
  return h.cases
    .filter(
      (c) =>
        !["Resolved", "Closed"].includes(c.status) &&
        c.service === service &&
        locationKey(c.location) === locationKey(input.location) &&
        now - c.started <= 7 * 86400000,
    )
    .map((c) => {
      const other = words(
        c.title +
          " " +
          h.reports
            .filter((r) => r.incidentId === c.id)
            .map((r) => r.detail)
            .join(" "),
      );
      const overlap = [...tokens].filter((w) => other.has(w)).length;
      return { c, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.c.updated - a.c.updated)
    .slice(0, 3)
    .map(({ c }) => ({
      id: c.id,
      service: c.service,
      location: c.location,
      status: c.status,
      team: c.team,
      started: c.started,
      reason: "Same service and location, with similar wording · within 7 days",
    }));
}
export function assignmentOverdue(c: Case, now = Date.now()) {
  return (
    c.status === "Assigned" &&
    !c.respondedAt &&
    !!c.assignedAt &&
    now - c.assignedAt >= 24 * HOUR
  );
}
// Called by a durable timer; assignment tokens make old timers harmless after transfer/reassignment.
export function checkAssignment(
  h: Hub,
  id: string,
  token: string,
  now = Date.now(),
) {
  const c = h.cases.find((c) => c.id === id);
  if (!c || c.status !== "Assigned" || c.respondedAt || !c.assignedAt)
    return null;
  if (c.assignmentId !== token)
    return c.previousAssignmentId === token
      ? { id: c.id, token: c.assignmentId!, at: c.assignedAt }
      : null;
  const age = now - c.assignedAt;
  const add = (text: string) => {
    c.updated = now;
    c.updates.push({
      id: crypto.randomUUID(),
      at: now,
      actor: "Assignment reminder",
      text,
    });
    notify(h, watchers(h, c), c, text, now);
  };
  if (age >= 48 * HOUR) {
    const previous = c.owner;
    const next =
      (c.assignmentAttempt || 0) < 1
        ? selectTechnician(h, c.team, [previous])?.id
        : undefined;
    c.owner = next || "Unassigned";
    c.status = next ? "Assigned" : "Needs triage";
    c.assignmentAttempt = (c.assignmentAttempt || 0) + 1;
    c.assignedAt = next ? now : undefined;
    c.previousAssignmentId = token;
    c.assignmentId = crypto.randomUUID();
    delete c.remindedAt;
    delete c.respondedAt;
    const reason = next
      ? `No response for 48 hours. Reassigned from ${nameOf(previous)} to ${nameOf(next)}.`
      : `No eligible backup technician in ${c.team}, or the backup has not responded. Returned to the department queue for staff attention.`;
    c.automation = {
      source: "Routing rules",
      state: next ? "assigned" : "pending-review",
      reason,
      at: now,
    };
    add(reason);
    notify(
      h,
      [previous],
      c,
      "This overdue assignment has been reassigned to keep the repair moving.",
      now,
    );
    return next ? { id: c.id, token: c.assignmentId, at: now } : null;
  }
  if (age >= 24 * HOUR && !c.remindedAt) {
    c.remindedAt = now;
    add(
      `No response for 24 hours. Reminder sent to ${nameOf(c.owner)} and department staff.`,
    );
  }
  return { id: c.id, token: c.assignmentId, at: c.assignedAt };
}
