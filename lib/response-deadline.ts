export function responseDeadline(issue: { status: string; assignedAt?: number; respondedAt?: number }, now = Date.now()) {
  if (issue.status !== "Assigned" || !issue.assignedAt || issue.respondedAt) return null;
  const due = issue.assignedAt + 24 * 3600000;
  const remaining = due - now;
  const minutes = Math.ceil(Math.abs(remaining) / 60000);
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return { due, escalation: issue.assignedAt + 48 * 3600000,
    overdue: remaining <= 0, soon: remaining > 0 && remaining <= 3600000,
    label: remaining <= 0 ? `Response overdue by ${duration}` : `Respond within ${duration}` };
}
