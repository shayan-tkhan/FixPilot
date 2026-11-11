import { accounts, nameOf } from "../accounts";
import type { Case, Hub } from "./coordination";

export function selectTechnician(
  h: Hub,
  team: string,
  excluded: string[] = [],
) {
  const candidates = accounts
    .filter((account) => account.role === "operator")
    .filter(
      (account) =>
        account.teams.some((department) => department === team) &&
        !excluded.includes(account.id),
    )
    .map((account) => ({
      id: account.id,
      workload: h.cases.filter(
        (issue) =>
          issue.owner === account.id &&
          !["Resolved", "Closed"].includes(issue.status),
      ).length,
    }))
    .sort((a, b) => a.workload - b.workload || a.id.localeCompare(b.id));
  return candidates[0];
}

// Call while holding the shared state mutation lock. Repeated calls never
// replace an existing assignment or a staff decision.
export function assignAutomatically(
  h: Hub,
  c: Case,
  decision: { source: "AI-assisted" | "Routing rules"; reason: string; ready: boolean },
  at = Date.now(),
) {
  if (
    c.owner !== "Unassigned" ||
    c.status !== "Needs triage" ||
    c.assignmentId ||
    c.reviewer ||
    c.automation
  )
    return;
  const chosen = decision.ready ? selectTechnician(h, c.team) : undefined;
  const reason = chosen
    ? `${decision.reason} Assigned to ${nameOf(chosen.id)} in ${c.team}, with ${chosen.workload} other open assignments.`
    : decision.ready
      ? `No eligible technician in ${c.team}. Department staff must assign this issue.`
      : decision.reason;
  c.automation = {
    source: decision.source,
    state: chosen ? "assigned" : "pending-review",
    reason,
    at,
  };
  if (chosen) {
    c.owner = chosen.id;
    c.status = "Assigned";
    c.assignedAt = at;
    c.assignmentId = crypto.randomUUID();
    c.assignmentAttempt = 0;
  }
  c.updates.push({
    id: crypto.randomUUID(),
    at,
    actor: "FixPilot automation",
    text: reason,
  });
}
