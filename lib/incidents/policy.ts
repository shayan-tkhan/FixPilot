import { z } from "zod";
import type { State, Probe } from "../db";
export const analysisSchema = z
  .object({
    bundleId: z.string(),
    proposedTicketIds: z.array(z.string()),
    excludedTickets: z.array(
      z.object({ ticketId: z.string(), reason: z.string().min(1) }),
    ),
    observations: z.array(
      z.object({ text: z.string(), evidenceIds: z.array(z.string()).min(1) }),
    ),
    hypotheses: z.array(
      z.object({ text: z.string(), evidenceIds: z.array(z.string()).min(1) }),
    ),
    conflicts: z.array(
      z.object({ text: z.string(), evidenceIds: z.array(z.string()) }),
    ),
    nextCheck: z.literal("RUN_AIDA_USER_PROBE"),
    runbookSectionIds: z.array(z.string()).min(1),
    unknowns: z.array(z.string()),
  })
  .strict();
export const runbook = [
  {
    id: "RB-AIDA-01#query-check",
    version: 1,
    text: "Run health and a synthetic student query. Health alone does not establish recovery. Require the FIXPILOT_AIDA_OK reply marker.",
  },
  {
    id: "RB-AIDA-01#closure",
    version: 1,
    text: "Require two successful user queries at least five seconds apart within two minutes, after the most recent failure. A separate reviewer must approve closure.",
  },
];
export function evidence(s: State) {
  return [
    {
      id: "E-1",
      source: "Sandbox monitoring",
      at: s.started + 30_000,
      text: "AIDA query error rate exceeded 90% in the incident window.",
    },
    ...s.tickets.map((t) => ({
      id: `E-${t.id}`,
      source: t.sourceId,
      at: t.at,
      text: t.description,
    })),
    ...s.probes.map((p) => ({
      id: p.id,
      source: "AIDA lab HTTP probe",
      at: p.at,
      text: `Health ${p.health}; query ${p.query}; expected reply ${p.expected}`,
    })),
  ];
}
export function bundle(s: State) {
  return {
    bundleId: `FP-001-r${s.revision}`,
    incident: {
      id: "FP-001",
      revision: s.revision,
      service: "AIDA",
      started: s.started,
      windowEnd: s.started + 30 * 60_000,
    },
    tickets: s.tickets,
    evidence: evidence(s),
    runbook,
  };
}
export function validateAnalysis(input: unknown, s: State) {
  const a = analysisSchema.parse(input);
  if (a.bundleId !== `FP-001-r${s.revision}` || s.exportedBundle !== a.bundleId)
    throw Error(
      "Stale or unexported bundle. Export the current revision first.",
    );
  const ids = new Set(evidence(s).map((e) => e.id));
  const tickets = new Set(s.tickets.map((t) => t.id));
  for (const id of [
    ...a.proposedTicketIds,
    ...a.excludedTickets.map((t) => t.ticketId),
  ])
    if (!tickets.has(id)) throw Error(`Unknown ticket: ${id}`);
  if (
    new Set([
      ...a.proposedTicketIds,
      ...a.excludedTickets.map((t) => t.ticketId),
    ]).size !==
    a.proposedTicketIds.length + a.excludedTickets.length
  )
    throw Error("Duplicate ticket classification");
  for (const o of [...a.observations, ...a.hypotheses, ...a.conflicts])
    for (const id of o.evidenceIds)
      if (!ids.has(id)) throw Error(`Unknown evidence: ${id}`);
  for (const id of a.runbookSectionIds)
    if (!runbook.some((r) => r.id === id))
      throw Error(`Unknown runbook section: ${id}`);
  return a;
}
export function canLink(s: State, id: string) {
  const t = s.tickets.find((t) => t.id === id);
  return (
    !!t &&
    t.service === "AIDA" &&
    t.signature === "unanswered-query" &&
    t.at >= s.started &&
    t.at <= s.started + 30 * 60_000
  );
}
export function recovery(probes: Probe[], started: number, now = Date.now()) {
  const sorted = [...probes]
    .filter((p) => p.service === "AIDA")
    .sort((a, b) => a.at - b.at);
  const lastFail = Math.max(
    started,
    ...sorted.filter((p) => p.query !== 200 || !p.expected).map((p) => p.at),
  );
  const pass = sorted.filter(
    (p) =>
      p.query === 200 &&
      p.expected &&
      p.at > lastFail &&
      p.at <= now &&
      now - p.at <= 120_000,
  );
  const latest = pass.at(-1);
  const earlier = latest && pass.find((p) => latest.at - p.at >= 5000);
  return earlier && latest ? [earlier, latest] : [];
}
export function blockers(s: State, now = Date.now()) {
  const b: string[] = [];
  if (s.linked.length < 3)
    b.push("Accept the three corroborated outage reports.");
  if (!s.analysis) b.push("Review an investigation analysis.");
  if (s.analysis?.conflicts.length)
    b.push("Conflicting analysis requires review.");
  if (recovery(s.probes, s.started, now).length !== 2)
    b.push(
      "Two fresh successful user queries, at least 5 seconds apart, are required.",
    );
  return b;
}
export function invalidate(s: State) {
  s.revision++;
  s.approval = null;
  s.exportedBundle = null;
  s.status = "Investigating";
}
