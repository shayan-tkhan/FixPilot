import { accounts } from "./accounts";
import { campusSites } from "./campus";

// Presentation data lives only in the viewer's memory.
export function presentationData(live: any) {
  const operators = accounts.filter(account => account.role === "operator");
  const cases = Array.from({ length: 150 }, (_, index) => {
    const technician = operators[index % operators.length];
    const location = campusSites[index % campusSites.length].name;
    const at = new Date();
    at.setUTCMonth(at.getUTCMonth() - index % 6, 1 + index % 24);
    at.setUTCHours(4, 0, 0, 0);
    if (at.getTime() > Date.now()) at.setUTCDate(1);
    if (index < 3) at.setTime(Date.now() - 2 * 3600000);
    const status = index < 92 ? "Resolved" : index < 110 ? "Closed" :
      ["Assigned", "Investigating", "Verifying", "Needs triage"][index % 4];
    const scenarios: Record<string, [string, string]> = {
      "Network Operations": ["Intermittent Wi-Fi", "Network"],
      Facilities: ["Damaged classroom chair", "Furniture"],
      Housekeeping: ["Study room needs cleaning", "Cleaning"],
      Accommodation: ["Residence room access problem", "Accommodation"],
      Maintenance: ["Leaking tap", "Plumbing"],
      "Identity & Access": ["Student account sign-in fails", "Account access"],
      "Learning Systems": ["Course page not loading", "Learning systems"],
      "AI Services": ["Campus assistant unavailable", "AI services"],
      "Device Support": ["Lab computer will not start", "Device support"],
      Applications: ["Student portal form error", "Applications"],
      Messaging: ["Campus email delivery delayed", "Messaging"],
      "Service Desk": ["Help with campus service request", "General support"],
    };
    const [title, category] = scenarios[technician.teams[0]] || ["Campus service issue", "General support"];
    return {
      id: "DEMO-INC-" + index, title, location,
      service: category, team: technician.teams[0],
      owner: status === "Needs triage" ? "Unassigned" : technician.id,
      severity: index >= 110 && index < 118 ? "Critical" : index % 3 ? "Medium" : "High",
      status, started: at.getTime(), updated: at.getTime() + 3600000,
      resolvedAt: ["Resolved", "Closed"].includes(status) ? index < 3 ? Date.now() - (index + 1) * 600000 : at.getTime() + 7200000 : undefined,
      completedAt: ["Resolved", "Closed", "Verifying"].includes(status) ? at.getTime() + 5400000 : undefined,
      eta: 30, confirmations: [], reportCount: 1, affectedUsers: 1,
      updates: [{ id: "demo-update-" + index, at: at.getTime(), actor: "Demo technician", text: "Fictional presentation record." }],
      triage: { category, priority: index >= 110 && index < 118 ? "Critical" : index % 3 ? "Medium" : "High",
        uncertainty: "Demo example", observations: ["Example classification for a fictional report."],
        missingDetails: [], reason: "Fictional triage preview. Live AI results require an active provider connection.",
        previousIncidents: 0, averageResolutionMinutes: null },
    };
  });
  const reports = cases.map((item, index) => ({
    id: "DEMO-R-" + index, incidentId: item.id, by: index % 2 ? "reporter@fixpilot.demo" : "reporter2@fixpilot.demo",
    summary: item.title, detail: "Fictional issue for a presentation. Open the profile and review the workflow.",
    location: item.location, category: item.service, at: item.started, attachments: [],
    reporter: { name: index % 2 ? "Jamie Lee" : "Noor Aziz", tpNumber: index % 2 ? "TP000001" : "TP000002" },
  }));
  const visible = live.user.role === "operator" ? cases.filter(item => item.owner === live.user.id) : cases;
  return {
    ...live, demo: true, cases: live.user.role === "reporter" ? [] : visible,
    reports: live.user.role === "reporter" ? [] : reports.filter(report => visible.some(item => item.id === report.incidentId)),
    issues: reports.filter(report => report.by === live.user.id).map(report => {
      const item = cases.find(item => item.id === report.incidentId)!;
      return { ...report, status: item.status, team: item.team, technician: accounts.find(a => a.id === item.owner)?.name,
        priority: item.severity, eta: item.eta, updated: item.updated, updates: item.updates,
        resolvedAt: item.resolvedAt, confirmed: item.status === "Closed" };
    }),
    notifications: [], metrics: { reports: 150, incidents: 150, affectedUsers: 150, resolved: 92, reduction: 0, averageResolutionMinutes: 120 },
  };
}
