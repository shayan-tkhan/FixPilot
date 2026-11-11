import { z } from "zod";
import { accounts, technicianIds, reviewerIds, nameOf } from "../accounts";
import {
  suggestPriority,
  duplicateCandidates,
  notify,
  watchers,
  assignmentOverdue,
} from "./safeguards";
import { getState, save, audit, withMutation, type State } from "../db";
import { recovery } from "./policy";
import type { User } from "../auth";
import { evidenceReviewCurrent, repairFingerprint, type EvidenceReview } from "../ai/evidence";
import { assignAutomatically, selectTechnician } from "./automation";
export const categories = [
  "Furniture",
  "Cleaning",
  "Accommodation",
  "Classroom",
  "Electrical",
  "Water",
  "Internet",
  "Software",
  "Wi-Fi",
  "Printer",
  "LMS",
  "Lab Computer",
  "Software Access",
  "Network",
  "Email",
  "AIDA",
  "Other",
] as const;
export type Attachment = {
  id: string;
  purpose?: "before" | "after" | "attachment";
  reportId: string;
  by: string;
  name: string;
  type: string;
  size: number;
  path: string;
  at: number;
};
export type Report = {
  requestId?: string;
  sourceFingerprint?: string;
  evidenceReview?: EvidenceReview;
  assistanceId?: string;
  reporter?: { name: string; tpNumber: string | null };
  category?: string;
  id: string;
  by: string;
  summary: string;
  detail: string;
  location: string;
  at: number;
  incidentId: string;
  source: string;
  tags: string[];
};
export type Case = {
  repairReview?: EvidenceReview;
  automation?: {
    source: "AI-assisted" | "Routing rules" | "Staff";
    state: "assigned" | "pending-review" | "manual";
    reason: string;
    at: number;
  };
  recommendation?: {
    id: string;
    at: number;
    basedOn: number;
    model: string;
    category: string;
    department: string;
    priority: string;
    reason: string;
    observations: string[];
    uncertainty: string;
    duplicates: { id: string; reason: string }[];
  };
  reviewer?: string;
  claimedAt?: number;
  assignedAt?: number;
  assignmentId?: string;
  previousAssignmentId?: string;
  timerRunId?: string;
  timerLeaseUntil?: number;
  remindedAt?: number;
  respondedAt?: number;
  assignmentAttempt?: number;
  priorityReason?: string;
  routingHint?: string;
  completionNote?: string;
  completedAt?: number;
  analysis?: {
    source: string;
    bundleId: string;
    observations: { text: string; evidenceIds: string[] }[];
    hypotheses: { text: string; evidenceIds: string[] }[];
    nextCheck: string;
    runReference: string;
  };
  id: string;
  service: string;
  signature: string;
  location: string;
  title: string;
  team: string;
  owner: string;
  started: number;
  updated: number;
  status: string;
  eta: number | null;
  severity: string;
  updates: { id: string; at: number; actor: string; text: string }[];
  confirmations: { by: string; at: number }[];
  resolvedAt?: number;
  workStartedAt?: number;
};
export type Hub = {
  deletedSubmissions?: { by: string; requestId: string }[];
  aiRequests?: { id: string; by: string; at: number; kind: string }[];
  assistance?: {
    id: string;
    by: string;
    at: number;
    model: string;
    input: string;
    result: {
      summary: string;
      description: string;
      category: string;
      priority: string;
      location: string | null;
      observations: string[];
      reason: string;
      uncertainty: string;
      missingDetails: string[];
    };
  }[];
  notifications?: {
    id: string;
    to: string;
    caseId: string;
    title: string;
    text: string;
    at: number;
    pushAt?: number;
    pushLeaseUntil?: number;
    pushAttempts?: number;
    deliveredTo?: string[];
  }[];
  subscriptions?: {
    id: string;
    by: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    at: number;
  }[];
  reports: Report[];
  cases: Case[];
  uploads?: Attachment[];
  settings?: {
    windowMinutes: number;
    autoGroup: boolean;
    routing: Record<string, { team: string; owner: string }>;
  };
};
export const routes: Record<string, { team: string; owner: string }> = {
  Furniture: { team: "Facilities", owner: "Unassigned" },
  Cleaning: { team: "Housekeeping", owner: "Unassigned" },
  Accommodation: { team: "Accommodation", owner: "Unassigned" },
  Classroom: { team: "Facilities", owner: "Unassigned" },
  Electrical: { team: "Maintenance", owner: "Unassigned" },
  Water: { team: "Maintenance", owner: "Unassigned" },
  WiFi: { team: "Network Operations", owner: "operator@fixpilot.demo" },
  Identity: { team: "Identity & Access", owner: "operator@fixpilot.demo" },
  LMS: { team: "Learning Systems", owner: "operator@fixpilot.demo" },
  AIDA: { team: "AI Services", owner: "operator@fixpilot.demo" },
  Printer: { team: "Device Support", owner: "operator@fixpilot.demo" },
  Computer: { team: "Device Support", owner: "operator@fixpilot.demo" },
  Software: { team: "Applications", owner: "operator@fixpilot.demo" },
  Email: { team: "Messaging", owner: "operator@fixpilot.demo" },
  Other: { team: "Service Desk", owner: "Unassigned" },
};
export function classify(text: string) {
  if (/wi.?fi|internet|network|connect/i.test(text))
    return {
      service: "WiFi",
      signature: /slow|latency|intermittent/i.test(text)
        ? "performance"
        : "connectivity",
    };
  if (/chair|furniture|broken desk|broken bed/i.test(text))
    return { service: "Furniture", signature: "furniture-damage" };
  if (/cleaning|rubbish|garbage|trash|cleanliness/i.test(text))
    return { service: "Cleaning", signature: "cleaning" };
  if (/accommodation|dormitory|hostel/i.test(text))
    return { service: "Accommodation", signature: "accommodation" };
  if (/electrical|electricity|broken light|power outage/i.test(text))
    return { service: "Electrical", signature: "electrical" };
  if (/water|plumbing|leak/i.test(text))
    return { service: "Water", signature: "water" };
  if (/classroom|air conditioner/i.test(text))
    return { service: "Classroom", signature: "classroom" };
  if (/printer|printing|paper jam/i.test(text))
    return { service: "Printer", signature: "printing-failure" };
  if (/lab computer|desktop|pc boot|workstation/i.test(text))
    return { service: "Computer", signature: "device-failure" };
  if (/email|mailbox|outlook/i.test(text))
    return { service: "Email", signature: "mail-failure" };
  if (/software|licen[cs]e|application access/i.test(text))
    return { service: "Software", signature: "application-access" };
  if (/sign.?in|log.?in|password|account locked/i.test(text))
    return { service: "Identity", signature: "access-failure" };
  if (/moodle|lms|assignment|upload/i.test(text))
    return { service: "LMS", signature: "learning-platform" };
  if (/aida|assistant|unanswered/i.test(text))
    return { service: "AIDA", signature: "unanswered-query" };
  return { service: "Other", signature: "review-required" };
}
export function addReport(
  h: Hub,
  input: {
    summary: string;
    detail: string;
    location: string;
    category?: string;
    existingCase?: string;
  },
  by: string,
  source = "User report",
  at = Date.now(),
) {
  const selected: Record<string, string> = {
    Furniture: "Furniture",
    Cleaning: "Cleaning",
    Accommodation: "Accommodation",
    Classroom: "Classroom",
    Electrical: "Electrical",
    Water: "Water",
    Internet: "WiFi",
    Software: "Software",
    Other: "Other",
    "Wi-Fi": "WiFi",
    Network: "WiFi",
    Printer: "Printer",
    LMS: "LMS",
    "Lab Computer": "Computer",
    "Software Access": "Software",
    Email: "Email",
    AIDA: "AIDA",
  };
  const tags = classify(input.summary + " " + input.detail);
  if (input.category && input.category !== "Other" && selected[input.category]) {
    tags.service = selected[input.category];
    tags.signature = classify(input.category + " " + input.summary).signature;
  }
  const routing = h.settings?.routing[tags.service] || routes[tags.service];
  const location = input.location.trim().toLowerCase();
  let c = input.existingCase
    ? h.cases.find((c) => c.id === input.existingCase)
    : h.cases.find(
        (c) =>
          source === "Fixture" &&
          h.settings?.autoGroup === true &&
          tags.service !== "Other" &&
          c.service === tags.service &&
          c.signature === tags.signature &&
          c.location.toLowerCase() === location &&
          !["Resolved", "Closed"].includes(c.status) &&
          at - c.started <= (h.settings?.windowMinutes || 30) * 60000,
      );
  if (!c) {
    c = {
      id: "INC-" + crypto.randomUUID().slice(0, 6).toUpperCase(),
      ...tags,
      location: input.location.trim(),
      title: input.summary,
      team: routing.team,
      routingHint:
        routes[classify(input.summary + " " + input.detail).service]?.team,
      owner: "Unassigned",
      started: at,
      updated: at,
      status: "Needs triage",
      eta: null,
      severity: suggestPriority(input.summary + " " + input.detail).level,
      priorityReason: suggestPriority(input.summary + " " + input.detail)
        .reason,
      updates: [
        {
          id: crypto.randomUUID(),
          at,
          actor: "FixPilot routing rules",
          text: `Incident created and forwarded to ${routing.team}. ${tags.service === "Other" ? "Classification needs staff review." : "Categorized by the selected category and routing rules."}`,
        },
      ],
      confirmations: [],
    };
    h.cases.unshift(c);
  }
  if (
    h.reports.filter((r) => r.incidentId === c!.id).length >= 4 &&
    c.severity === "Medium"
  )
    c.severity = "High";
  if (input.existingCase && ["Resolved", "Closed"].includes(c!.status))
    throw Error("This issue was resolved. Submit a separate report.");
  if (input.existingCase && c!.status === "Verifying") {
    c!.status = "Investigating";
    c!.workStartedAt = at;
    delete c!.completedAt;
    delete c!.completionNote;
  }
  const account = accounts.find((a) => a.id === by);
  const identity =
    account?.role === "reporter"
      ? { name: account.name, tpNumber: account.tpNumber }
      : {
          name: source === "Fixture" ? "Demo student" : nameOf(by),
          tpNumber: null,
        };
  const r: Report = {
    reporter: identity,
    id: "R-" + crypto.randomUUID().slice(0, 7),
    by,
    ...input,
    location: input.location.trim(),
    at,
    incidentId: c.id,
    source,
    tags: [tags.service, tags.signature],
  };
  h.reports.unshift(r);
  c.updated = at;
  c.confirmations = [];
  c.updates.push({
    id: crypto.randomUUID(),
    at,
    actor: "FixPilot coordination",
    text: `A related report was linked. ${h.reports.filter((r) => r.incidentId === c!.id).length} reports now share this incident.`,
  });
  return { report: r, incident: c };
}
export function initialHub(): Hub {
  const h: Hub = {
    reports: [],
    cases: [],
    settings: { windowMinutes: 30, autoGroup: true, routing: routes },
  };
  const at = Date.now() - 600000;
  for (let i = 0; i < 6; i++)
    addReport(
      h,
      {
        summary: [
          "Wi-Fi not working",
          "Cannot connect to campus Wi-Fi",
          "Internet unavailable",
        ][i % 3],
        detail: "Campus network cannot connect in Block A.",
        location: "Block A",
      },
      `fictional-${i + 1}@example.invalid`,
      "Fixture",
      at + i * 15000,
    );
  addReport(
    h,
    {
      summary: "Account sign-in fails",
      detail: "Password rejected on my account.",
      location: "Block A",
    },
    "fictional-7@example.invalid",
    "Fixture",
    at + 90000,
  );
  addReport(
    h,
    {
      summary: "Wi-Fi connection failed",
      detail: "No internet in this building.",
      location: "Block B",
    },
    "fictional-8@example.invalid",
    "Fixture",
    at + 100000,
  );
  if (process.env.APP_DB_SCHEMA === "fixpilot_public_demo") {
    const samples = [
      {
        summary: "Slow Wi-Fi in the study room",
        detail: "The campus Wi-Fi keeps disconnecting during online classes.",
        location: "Block C",
        category: "Wi-Fi",
      },
      {
        summary: "Leaking tap near the hostel",
        detail: "Water keeps dripping from the tap even when closed.",
        location: "Hostel D",
        category: "Water",
      },
      {
        summary: "Broken chair in the classroom",
        detail: "One chair has a damaged leg and needs replacement.",
        location: "Block B · Room 2-03",
        category: "Furniture",
      },
    ];
    for (const [i, input] of samples.entries()) {
      const { incident: c } = addReport(
        h,
        input,
        "reporter@fixpilot.demo",
        "Demo",
        Date.now() - (i + 1) * 600000,
      );
      if (i !== 1) {
        c.owner = "operator@fixpilot.demo";
        c.status = i === 0 ? "Investigating" : "Assigned";
        c.assignedAt = Date.now();
        c.assignmentId = crypto.randomUUID();
        c.eta = 30;
        c.reviewer = "reviewer@fixpilot.demo";
        c.claimedAt = Date.now();
        if (i === 0) {
          c.workStartedAt = Date.now();
          c.respondedAt = Date.now();
        }
        c.updates.push({
          id: crypto.randomUUID(),
          at: Date.now(),
          actor: "Sam Chen",
          text:
            i === 0
              ? "Alex Morgan is checking the access point. Estimated repair: 30 minutes."
              : "Alex Morgan has been assigned to replace the damaged chair.",
        });
      }
    }
  }
  return h;
}
export function signals(s: State, h: Hub, c: Case) {
  const reports = h.reports.filter((r) => r.incidentId === c.id);
  const latest = Math.max(c.started, ...reports.map((r) => r.at));
  const query =
    c.service === "AIDA" && recovery(s.probes, c.started).length === 2;
  return {
    monitoring: query,
    userConfirmation: c.confirmations.some((x) => x.at >= latest),
    noNewComplaints: Date.now() - latest >= 300000,
    latestReport: latest,
  };
}
export async function readHub(u: User) {
  return withMutation(async () => {
    const s = await getState();
    if (!s.hub) {
      s.hub = initialHub();
      await save(s);
    }
    const h = s.hub;
    let migrated = false;
    for (const c of h.cases)
      if (
        c.status === "Assigned" &&
        c.owner !== "Unassigned" &&
        !c.assignmentId
      ) {
        c.assignmentId = crypto.randomUUID();
        c.assignedAt = Date.now();
        migrated = true;
      }
    if (migrated) await save(s);
    const visibleCases = h.cases.filter(
      (c) => u.role !== "operator" || c.owner === u.id,
    );
    const staff = u.role !== "reporter";
    const cases = visibleCases.map((c) => {
      const rs = h.reports.filter((r) => r.incidentId === c.id);
      const assisted = h.assistance?.find(item => rs.some(report => report.assistanceId === item.id && report.by === item.by));
      const past = h.cases.filter(item => item.id !== c.id && item.service === c.service && item.signature === c.signature && item.resolvedAt && item.resolvedAt >= item.started);
      return {
        ...c,
        triage: assisted ? {
          category: assisted.result.category,
          suggestedTechnician: nameOf(selectTechnician(h, c.team)?.id || "Unassigned"),
          priority: assisted.result.priority,
          uncertainty: assisted.result.uncertainty,
          missingDetails: assisted.result.missingDetails,
          observations: assisted.result.observations,
          reason: assisted.result.reason,
          model: assisted.model,
          previousIncidents: past.length,
          averageResolutionMinutes: past.length ? Math.round(past.reduce((sum, item) => sum + (item.resolvedAt! - item.started) / 60000, 0) / past.length) : null,
        } : undefined,
        repairReview: c.repairReview?.fingerprint === repairFingerprint(h, c) ? c.repairReview : undefined,
        analysis: staff ? c.analysis : undefined,
        confirmations: staff
          ? c.confirmations
          : c.confirmations.filter((x) => x.by === u.id),
        reportCount: rs.length,
        affectedUsers: new Set(rs.map((r) => r.by)).size,
        signals: signals(s, h, c),
        subscribed: rs.some((r) => r.by === u.id),
        overdue: assignmentOverdue(c),
      };
    });
    const own = h.reports.filter((r) => r.by === u.id);
    const issues = own.map((r) => {
      const c = h.cases.find((c) => c.id === r.incidentId)!;
      return {
        id: r.id,
        summary: r.summary,
        detail: r.detail,
        location: r.location,
        category: r.category && r.category !== "Other" ? r.category : c.service,
        at: r.at,
        status: c.status,
        team: c.team,
        technician: c.owner !== "Unassigned" ? nameOf(c.owner) : null,
        automation: c.automation,
        evidenceReview: evidenceReviewCurrent(r, h.uploads || []) ? r.evidenceReview : undefined,
        priority: c.severity,
        eta: c.eta,
        updated: c.updated,
        confirmed: c.confirmations.some((x) => x.by === u.id),
        updates: c.updates
          .filter(
            (x) =>
              !["FixPilot routing rules", "FixPilot coordination"].includes(
                x.actor,
              ) &&
              ![
                "Reviewed investigation",
                "Claimed for review",
                "Review taken over",
                "Review returned to the department queue",
              ].some((prefix) => x.text.startsWith(prefix)),
          )
          .map((x) => ({ id: x.id, at: x.at, text: x.text })),
        attachments: (h.uploads || [])
          .filter(
            (a) =>
              a.reportId === r.id ||
              (a.purpose === "after" &&
                h.reports.some(
                  (report) =>
                    report.id === a.reportId && report.incidentId === c.id,
                )),
          )
          .map(({ path, by, ...a }) => a),
      };
    });
    return {
      user: u,
      notifications: (h.notifications || [])
        .filter((n) => n.to === u.id)
        .slice(-100)
        .reverse()
        .map(({ id, caseId, title, text, at }) => ({
          id,
          title,
          text,
          at,
          issue:
            u.role === "reporter"
              ? own.find((r) => r.incidentId === caseId)?.id
              : caseId,
        })),
      directory: staff
        ? accounts.filter((a) => a.role === "operator" || a.role === "reviewer")
        : undefined,
      pushAvailable: !!(
        process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ),
      teams: staff
        ? [
            ...new Set(
              [
                ...Object.values(routes),
                ...Object.values(h.settings?.routing || {}),
              ].map((r) => r.team),
            ),
          ]
        : undefined,
      issues,
      settings:
        u.role === "admin"
          ? h.settings || {
              windowMinutes: 30,
              autoGroup: false,
              routing: routes,
            }
          : undefined,
      cases: staff ? cases : [],
      reports: staff
        ? h.reports
            .filter((r) => visibleCases.some((c) => c.id === r.incidentId))
            .map((r) => ({
              ...r,
              evidenceReview: evidenceReviewCurrent(r, h.uploads || []) ? r.evidenceReview : undefined,
              reporter:
                r.reporter ||
                (() => {
                  const a = accounts.find((a) => a.id === r.by);
                  return a?.role === "reporter"
                    ? { name: a.name, tpNumber: a.tpNumber }
                    : {
                        name:
                          r.source === "Fixture"
                            ? "Demo student"
                            : nameOf(r.by),
                        tpNumber: null,
                      };
                })(),
              originalText: r.assistanceId
                ? h.assistance?.find(
                    (a) => a.id === r.assistanceId && a.by === r.by,
                  )?.input
                : undefined,
              attachments: (h.uploads || [])
                .filter((a) => a.reportId === r.id)
                .map(({ path, by, ...a }) => a),
            }))
        : [],
      metrics: staff
        ? {
            reports: h.reports.length,
            incidents: h.cases.length,
            reduction: h.reports.length
              ? Math.round((1 - h.cases.length / h.reports.length) * 1000) / 10
              : 0,
            affectedUsers: new Set(h.reports.map((r) => r.by)).size,
            resolved: h.cases.filter((c) => c.status === "Resolved").length,
            averageResolutionMinutes: cases.some((c) => c.resolvedAt)
              ? Math.round(
                  cases
                    .filter((c) => c.resolvedAt)
                    .reduce(
                      (n, c) => n + (c.resolvedAt! - c.started) / 60000,
                      0,
                    ) / cases.filter((c) => c.resolvedAt).length,
                )
              : null,
          }
        : undefined,
      grouping: "Department staff review and merge duplicate reports",
      updated: Date.now(),
    };
  });
}
export async function mutateHub(u: User, body: unknown) {
  const b = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("report"),
        summary: z.string().trim().min(5).max(180),
        detail: z.string().trim().min(10).max(2000),
        location: z.string().trim().min(2).max(80),
        category: z.enum(categories).optional(),
        existingCase: z.string().optional(),
        assistanceId: z.string().optional(),
        requestId: z.string().trim().min(8).max(128).optional(),
        aiUnavailable: z.boolean().optional(),
        sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      }),
      z.object({
        action: z.literal("suggest"),
        summary: z.string().trim().min(5).max(180),
        detail: z.string().trim().min(10).max(2000),
        location: z.string().trim().min(2).max(80),
        category: z.enum(categories).optional(),
      }),
      z.object({
        action: z.literal("claim"),
        id: z.string(),
        takeover: z.boolean().default(false),
        reason: z.string().trim().max(300).default(""),
      }),
      z.object({ action: z.literal("release"), id: z.string() }),
      z.object({ action: z.literal("delete"), id: z.string().min(1).max(100) }),
      z.object({
        action: z.literal("priority"),
        id: z.string(),
        severity: z.enum(["Critical", "High", "Medium", "Low"]),
        message: z.string().trim().min(5).max(300),
      }),
      z.object({ action: z.enum(["confirm", "reopen"]), id: z.string() }),
      z.object({
        action: z.literal("assign"),
        id: z.string(),
        team: z.string().min(2).max(70),
        owner: z.enum([...technicianIds, "Unassigned"]),
        severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
        reason: z.string().trim().max(300).default(""),
        eta: z.number().int().min(0).max(10080).nullable(),
      }),
      z.object({
        action: z.literal("work"),
        id: z.string(),
        step: z.enum(["start", "update", "help", "waiting", "complete"]),
        message: z.string().trim().max(1200).default(""),
      }),
      z.object({
        action: z.literal("review"),
        id: z.string(),
        approve: z.boolean(),
        message: z.string().trim().max(1200).default(""),
      }),
      z.object({
        action: z.literal("merge"),
        id: z.string(),
        target: z.string(),
      }),
      z.object({
        action: z.literal("settings"),
        windowMinutes: z.number().int().min(5).max(120),
        autoGroup: z.boolean(),
        routing: z.record(
          z.string(),
          z.object({
            team: z.string().min(2).max(70),
            owner: z.enum([
              "operator@fixpilot.demo",
              "reviewer@fixpilot.demo",
              "Unassigned",
            ]),
          }),
        ),
      }),
      z.object({
        action: z.literal("analysis"),
        id: z.string(),
        source: z.enum(["Fixture", "Enterprise manual import"]),
        bundleId: z.string(),
        observations: z.array(
          z.object({
            text: z.string().max(1500),
            evidenceIds: z.array(z.string()).min(1),
          }),
        ),
        hypotheses: z.array(
          z.object({
            text: z.string().max(1500),
            evidenceIds: z.array(z.string()).min(1),
          }),
        ),
        nextCheck: z.string().min(3).max(1000),
        runReference: z.string().max(300).default(""),
      }),
      z.object({
        action: z.literal("update"),
        id: z.string(),
        status: z.enum(["Assigned", "Investigating", "Verifying", "Resolved"]),
        eta: z.number().int().min(0).max(10080).nullable(),
        severity: z.enum(["Low", "Medium", "High", "Critical"]),
        team: z.string().trim().min(2).max(70),
        owner: z.enum([
          "operator@fixpilot.demo",
          "reviewer@fixpilot.demo",
          "Unassigned",
        ]),
        message: z.string().trim().min(5).max(1200),
      }),
    ])
    .parse(body);
  if (
    u.role === "reporter" &&
    !["report", "suggest", "confirm", "reopen"].includes(b.action)
  )
    throw Error("Staff permission required");
  return withMutation(async () => {
    const s = await getState();
    const h = s.hub || (s.hub = initialHub());
    let result;
    if (b.action === "delete") {
      if (!["reviewer", "admin"].includes(u.role))
        throw Error("Department staff permission required");
      const reports = h.reports.filter((report) => report.incidentId === b.id);
      const reportIds = new Set(reports.map((report) => report.id));
      const assistanceIds = new Set(reports.map((report) => report.assistanceId).filter(Boolean));
      const deleted = h.deletedSubmissions || (h.deletedSubmissions = []);
      for (const report of reports)
        if (report.requestId && !deleted.some((item) => item.by === report.by && item.requestId === report.requestId))
          deleted.push({ by: report.by, requestId: report.requestId });
      h.cases = h.cases.filter((issue) => issue.id !== b.id);
      h.reports = h.reports.filter((report) => !reportIds.has(report.id));
      h.uploads = (h.uploads || []).filter((upload) => !reportIds.has(upload.reportId));
      h.notifications = (h.notifications || []).filter((notice) => notice.caseId !== b.id);
      h.assistance = (h.assistance || []).filter((item) => !assistanceIds.has(item.id));
      result = { deleted: true };
    } else if (b.action === "settings") {
      if (u.role !== "admin") throw Error("Admin permission required");
      h.settings = {
        windowMinutes: b.windowMinutes,
        autoGroup: b.autoGroup,
        routing: b.routing,
      };
      result = { ok: true };
    } else if (b.action === "suggest") {
      const preview: Hub = { reports: [], cases: [], settings: h.settings };
      const proposed = addReport(preview, b, u.id).incident;
      return {
        matches: duplicateCandidates(h, b, proposed.service).map((c) => ({
          ...c,
          ownIssue: h.reports.find(
            (r) => r.by === u.id && r.incidentId === c.id,
          )?.id,
        })),
        priority: suggestPriority(b.summary + " " + b.detail),
        department: proposed.team,
        routingHint: classify(b.summary + " " + b.detail).service,
      };
    } else if (b.action === "report") {
      if (b.requestId && h.deletedSubmissions?.some((item) => item.by === u.id && item.requestId === b.requestId))
        throw Error("This issue was deleted by staff. Start a new report if needed.");
      const fingerprint =
        b.sourceFingerprint ||
        JSON.stringify({
          summary: b.summary,
          detail: b.detail,
          location: b.location,
          category: b.category || "",
          existingCase: b.existingCase || "",
        });
      const previous = b.requestId
        ? h.reports.find((report) => report.by === u.id && report.requestId === b.requestId)
        : undefined;
      if (previous) {
        if (previous.sourceFingerprint !== fingerprint)
          throw Error("This submission key was used for a different report. Start a new report.");
        const incident = h.cases.find((issue) => issue.id === previous.incidentId);
        if (!incident) throw Error("The original issue is no longer available.");
        return { report: previous, incident };
      }
      const day = (n: number) =>
        new Date(n + 8 * 3600000).toISOString().slice(0, 10);
      if (
        h.reports.filter(
          (r) =>
            r.by === u.id &&
            r.source === "User report" &&
            day(r.at) === day(Date.now()),
        ).length >= 10
      )
        throw Error(
          "Daily limit reached: 10 reports per day. Track your existing issues instead.",
        );
      if (b.existingCase) {
        const preview: Hub = { reports: [], cases: [] };
        const service = addReport(
          preview,
          b.existingCase ? { ...b, existingCase: undefined } : b,
          u.id,
        ).incident.service;
        if (
          !duplicateCandidates(h, b, service).some(
            (c) => c.id === b.existingCase,
          )
        )
          throw Error(
            "This matching issue is no longer available. Check for matches again.",
          );
        if (
          h.reports.some(
            (r) => r.by === u.id && r.incidentId === b.existingCase,
          )
        )
          throw Error(
            "You already follow this issue. Open it in My Issues instead.",
          );
      }
      const assisted = b.assistanceId
        ? h.assistance?.find(
            (a) =>
              a.id === b.assistanceId &&
              a.by === u.id &&
              Date.now() - a.at < 86400000,
          )
        : undefined;
      if (b.assistanceId && !assisted)
        throw Error(
          "This AI suggestion expired. Submit manually or analyze again.",
        );
      result = addReport(h, b, u.id);
      if (b.requestId) {
        result.report.requestId = b.requestId;
        result.report.sourceFingerprint = fingerprint;
      }
      if (!b.existingCase) {
        const accepted =
          !!assisted &&
          b.summary === assisted.result.summary.trim() &&
          b.detail === assisted.result.description.trim() &&
          b.category === assisted.result.category &&
          (!assisted.result.location ||
            b.location.toLowerCase() === assisted.result.location.trim().toLowerCase());
        const safeSuggestion =
          accepted &&
          assisted!.result.category !== "Other" &&
          assisted!.result.uncertainty === "Low" &&
          (assisted!.result.missingDetails?.length || 0) === 0;
        const priority = suggestPriority(
          b.summary + " " + b.detail + (accepted ? " " + assisted!.input : ""),
        );
        if (safeSuggestion) {
          const levels = ["Low", "Medium", "High", "Critical"];
          result.incident.severity =
            levels.indexOf(priority.level) > levels.indexOf(assisted!.result.priority)
              ? priority.level
              : assisted!.result.priority;
          result.incident.priorityReason =
            "AI-assisted priority with safety routing rules. " + assisted!.result.reason;
        }
        const inferred = classify(b.summary + " " + b.detail);
        const inferredRoute =
          h.settings?.routing[inferred.service] || routes[inferred.service];
        const ruleMatch =
          inferred.service !== "Other" &&
          inferredRoute?.team === result.incident.team;
        const ready =
          !b.aiUnavailable &&
          (assisted ? safeSuggestion : ruleMatch) &&
          result.incident.service !== "Other";
        const reason = b.aiUnavailable
          ? "AI analysis is unavailable. Department staff will review this report."
          : assisted && !accepted
            ? "The report changed after AI analysis. Department staff must review the updated details."
            : assisted && !safeSuggestion
              ? "AI analysis needs more context. Department staff must review this report."
              : !ready
                ? "Routing rules could not confidently match the report to a department. Staff review is required."
                : safeSuggestion
                  ? "AI-assisted categorization was accepted. Department membership and current workload determined the assignment."
                  : "Routing rules matched the report to a department. Department membership and current workload determined the assignment.";
        assignAutomatically(
          h,
          result.incident,
          { source: assisted ? "AI-assisted" : "Routing rules", reason, ready },
          result.report.at,
        );
      }

      notify(
        h,
        watchers(h, result.incident),
        result.incident,
        b.existingCase
          ? "A reporter joined this issue. The shared repair will cover their report too."
          : `New issue received by ${result.incident.team}.`,
      );
    } else {
      const c = h.cases.find(
        (c) =>
          c.id === b.id ||
          (["confirm", "reopen"].includes(b.action) &&
            h.reports.some(
              (r) => r.id === b.id && r.by === u.id && r.incidentId === c.id,
            )),
      );
      if (!c) throw Error("Unknown incident");
      const now = Date.now();
      const note = (text: string) => {
        c.updated = now;
        c.updates.push({
          id: crypto.randomUUID(),
          at: now,
          actor: u.name,
          text,
        });
      };
      const reviewer = (claim = true) => {
        if (!["reviewer", "admin"].includes(u.role))
          throw Error("Department staff permission required");
        if (claim && c.reviewer && c.reviewer !== u.id && u.role !== "admin")
          throw Error(
            `${nameOf(c.reviewer)} is reviewing this issue. Take over with a reason first.`,
          );
        if (claim && !c.reviewer) {
          c.reviewer = u.id;
          c.claimedAt = now;
        }
      };
      if (b.action === "confirm" || b.action === "reopen") {
        if (!h.reports.some((r) => r.by === u.id && r.incidentId === c.id))
          throw Error("Only the reporter can confirm or reopen this issue");
        if (!["Resolved", "Closed"].includes(c.status))
          throw Error("Staff must approve the repair first");
        if (b.action === "reopen") {
          c.status = c.owner === "Unassigned" ? "Needs triage" : "Assigned";
          c.confirmations = [];
          delete c.resolvedAt;
          c.workStartedAt = now;
          c.assignedAt = c.owner === "Unassigned" ? undefined : now;
          c.assignmentId = crypto.randomUUID();
          delete c.timerRunId;
          delete c.previousAssignmentId;
          delete c.respondedAt;
          delete c.remindedAt;
          c.assignmentAttempt = 0;
          note(
            "Issue reopened: the reporter says the problem is still not fixed. Department staff and the assigned technician have been notified.",
          );
        } else {
          c.confirmations = c.confirmations.filter((x) => x.by !== u.id);
          c.confirmations.push({ by: u.id, at: now });
          const reporters = [
            ...new Set(
              h.reports.filter((r) => r.incidentId === c.id).map((r) => r.by),
            ),
          ];
          if (reporters.every((by) => c.confirmations.some((x) => x.by === by)))
            c.status = "Closed";
          note("Reporter confirmed the issue is solved.");
        }
      } else if (b.action === "claim") {
        reviewer(false);
        if (
          c.reviewer &&
          c.reviewer !== u.id &&
          (!b.takeover || b.reason.length < 5)
        )
          throw Error(
            "Another reviewer claimed this issue. Give a reason to take over.",
          );
        const previous = c.reviewer;
        c.reviewer = u.id;
        c.claimedAt = now;
        note(
          previous && previous !== u.id
            ? `Review taken over from ${nameOf(previous)} by ${u.name}. Reason: ${b.reason}`
            : `Claimed for review by ${u.name}.`,
        );
      } else if (b.action === "release") {
        reviewer(false);
        if (c.reviewer && c.reviewer !== u.id && u.role !== "admin")
          throw Error("Only the assigned reviewer can release this review");
        delete c.reviewer;
        delete c.claimedAt;
        note(
          "Review returned to the department queue. Any staff reviewer can claim it.",
        );
      } else if (b.action === "priority") {
        reviewer();
        c.severity = b.severity;
        note(`Priority set to ${b.severity}. ${b.message}`);
      } else if (b.action === "assign") {
        reviewer();
        if (["Resolved", "Closed"].includes(c.status))
          throw Error("Reopen this issue before assigning work");
        if (
          ![
            ...Object.values(routes),
            ...Object.values(h.settings?.routing || {}),
          ].some((r) => r.team === b.team)
        )
          throw Error("Choose a configured department");
        const transferred = c.team !== b.team;
        if (transferred && b.reason.length < 5)
          throw Error("Give a reason for the department transfer");
        const previousTeam = c.team;
        if (transferred) {
          const inferred = classify(
            c.title +
              " " +
              h.reports
                .filter((r) => r.incidentId === c.id)
                .map((r) => r.detail)
                .join(" "),
          );
          if (routes[inferred.service]?.team === b.team) {
            c.service = inferred.service;
            c.signature = inferred.signature;
          }
        }
        if (transferred) {
          delete c.reviewer;
          delete c.claimedAt;
        }
        const reassigned =
          transferred || b.owner !== c.owner || c.status === "Needs triage";
        if (reassigned) {
          c.assignedAt = b.owner === "Unassigned" ? undefined : now;
          c.assignmentId = crypto.randomUUID();
          delete c.timerRunId;
          delete c.previousAssignmentId;
          delete c.remindedAt;
          delete c.respondedAt;
          c.assignmentAttempt = 0;
          delete c.workStartedAt;
          delete c.completedAt;
          delete c.completionNote;
          c.status = b.owner === "Unassigned" ? "Needs triage" : "Assigned";
          c.confirmations = [];
        }
        if (b.severity) c.severity = b.severity;
        c.team = b.team;
        c.owner = b.owner;
        c.eta = b.eta;
        c.automation = {
          source: "Staff",
          state: "manual",
          reason: b.owner === "Unassigned"
            ? `Department staff returned this issue to ${b.team} for review.`
            : `Department staff assigned ${nameOf(b.owner)} in ${b.team}.`,
          at: now,
        };
        if (transferred)
          note(
            `Transferred from ${previousTeam} to ${b.team}. Reason: ${b.reason}`,
          );
        note(
          b.owner === "Unassigned"
            ? `Transferred to ${b.team} for review.`
            : `Assigned to ${nameOf(b.owner)} · ${b.team}.`,
        );
      } else if (b.action === "work") {
        if (u.role !== "operator" || c.owner !== u.id)
          throw Error("Only the assigned technician can update this task");
        if (!["Assigned", "Investigating", "Waiting Parts"].includes(c.status))
          throw Error("Task is not available for work");
        c.respondedAt = now;
        if (b.step === "start") {
          c.status = "Investigating";
          c.workStartedAt = now;
          note(`${u.name} started work.`);
        } else if (b.step === "complete") {
          if (c.status === "Assigned")
            throw Error("Start work before submitting completion");
          const proof = (h.uploads || []).some(
            (a) =>
              a.by === u.id &&
              (a.purpose === "after" || a.type.startsWith("video/")) &&
              a.at >= (c.workStartedAt || c.updated) &&
              h.reports.some(
                (r) => r.id === a.reportId && r.incidentId === c.id,
              ),
          );
          if (!proof && b.message.length < 10)
            throw Error(
              "Add a photo, video, or completion note (at least 10 characters) before submitting completion",
            );
          c.completionNote = b.message;
          c.completedAt = now;
          c.status = "Verifying";
          note(
            "Repair submitted for staff review." +
              (b.message ? " " + b.message : ""),
          );
        } else if (b.step === "waiting") {
          c.status = "Waiting Parts";
          note("Waiting for parts." + (b.message ? " " + b.message : ""));
        } else if (b.step === "help") {
          note(
            "Technician requested help from department staff." +
              (b.message ? " " + b.message : ""),
          );
        } else {
          if (!b.message) throw Error("Enter an update");
          note(b.message);
        }
      } else if (b.action === "review") {
        reviewer();
        if (c.owner === u.id)
          throw Error("A separate department reviewer must approve the repair");
        if (c.status !== "Verifying")
          throw Error("The technician must submit completion first");
        if (b.approve && !c.completedAt)
          throw Error(
            "The technician must submit proof or a completion note before approval",
          );
        const flaggedEvidence = h.reports.some(
          (report) =>
            report.incidentId === c.id &&
            evidenceReviewCurrent(report, h.uploads || []) &&
            report.evidenceReview?.status === "possible_mismatch",
        );
        if (b.approve && flaggedEvidence && b.message.length < 10)
          throw Error("Explain how the flagged evidence was checked before approving this repair (at least 10 characters).");
        c.status = b.approve ? "Resolved" : "Investigating";
        if (b.approve) c.resolvedAt = now;
        else c.workStartedAt = now;
        note(
          (b.approve
            ? "Repair approved by department staff. Please confirm whether your issue is solved."
            : "Repair returned to the technician for further work.") +
            (b.message ? " " + b.message : ""),
        );
      } else if (b.action === "merge") {
        reviewer();
        const target = h.cases.find((x) => x.id === b.target);
        if (
          !target ||
          target.id === c.id ||
          ["Resolved", "Closed"].includes(target.status) ||
          ["Resolved", "Closed", "Verifying"].includes(c.status)
        )
          throw Error("Choose another open issue");
        if (target.reviewer && target.reviewer !== u.id && u.role !== "admin")
          throw Error("The target issue is claimed by another reviewer");
        for (const r of h.reports.filter((r) => r.incidentId === c.id))
          r.incidentId = target.id;
        target.confirmations = [];
        target.updated = now;
        target.updates.push(...c.updates, {
          id: crypto.randomUUID(),
          at: now,
          actor: u.name,
          text: "Department staff merged a duplicate report into this issue.",
        });
        h.cases = h.cases.filter((x) => x.id !== c.id);
        notify(
          h,
          watchers(h, target),
          target,
          "A duplicate issue was merged. Existing reports and repair history were preserved.",
          now,
        );
      } else if (b.action === "analysis") {
        if (!["reviewer", "admin"].includes(u.role) &&
            !(u.role === "operator" && c.owner === u.id))
          throw Error("Only assigned technicians or department staff can add an investigation");
        if (b.bundleId !== c.id + "-" + c.updated)
          throw Error(
            "Stale evidence bundle. Export the current bundle again.",
          );
        const ids = new Set(
          h.reports.filter((r) => r.incidentId === c.id).map((r) => r.id),
        );
        for (const o of [...b.observations, ...b.hypotheses])
          for (const id of o.evidenceIds)
            if (!ids.has(id)) throw Error("Unknown source citation: " + id);
        c.analysis = {
          source: b.source,
          bundleId: b.bundleId,
          observations: b.observations,
          hypotheses: b.hypotheses,
          nextCheck: b.nextCheck,
          runReference: b.runReference,
        };
        c.updates.push({
          id: crypto.randomUUID(),
          at: Date.now(),
          actor: u.name,
          text: "Reviewed investigation imported with validated original-report citations.",
        });
      } else if (b.action === "update") {
        throw Error(
          "Use assignment, priority and repair review actions instead of direct status changes",
        );
      }
      if (b.action !== "merge") {
        const latest = c.updates.at(-1);
        if (latest && latest.at === now)
          notify(
            h,
            ["claim", "release"].includes(b.action)
              ? [...reviewerIds]
              : watchers(h, c),
            c,
            latest.text,
            now,
          );
      }
      result = { incident: c };
    }
    await save(s);
    await audit(u.id, "coordination." + b.action, {
      ...("id" in b ? { id: b.id } : {}),
      result: "Recorded; shared in-app update available to subscribers",
    });
    return result;
  });
}
