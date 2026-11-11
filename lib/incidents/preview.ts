import { initial } from "../db";
import { evidence, runbook, blockers } from "./policy";
export function previewData() {
  const s = initial();
  s.linked = ["T-1", "T-2", "T-3"];
  s.excluded = ["T-4", "T-5"];
  s.scenario = "false-clear";
  s.status = "Verifying";
  s.analysisSource = "Fixture";
  s.analysis = {
    bundleId: "FP-001-r1",
    proposedTicketIds: s.linked,
    excludedTickets: [
      { ticketId: "T-4", reason: "Account-specific sign-in failure" },
      { ticketId: "T-5", reason: "Different affected service" },
    ],
    observations: [
      {
        text: "Three reports describe unanswered AIDA queries in the same window, corroborated by the query-error alert.",
        evidenceIds: ["E-1", "E-T-1", "E-T-2", "E-T-3"],
      },
    ],
    hypotheses: [
      {
        text: "The AIDA query path may be failing. The underlying cause remains unconfirmed.",
        evidenceIds: ["E-1"],
      },
    ],
    conflicts: [],
    nextCheck: "RUN_AIDA_USER_PROBE",
    runbookSectionIds: ["RB-AIDA-01#query-check"],
    unknowns: ["Underlying cause remains unconfirmed."],
  };
  s.probes = [
    {
      id: "P-PREVIEW",
      at: s.started + 600000,
      health: 200,
      query: 503,
      expected: false,
      service: "AIDA",
    },
  ];
  return {
    state: s,
    user: { id: "preview", name: "Preview viewer", role: "viewer" },
    events: [],
    evidence: evidence(s),
    runbook,
    blockers: blockers(s),
    readyProbeIds: [],
    mode: "Read-only preview",
    target: "LOCAL-001",
    transition: "local-resolve",
    targetStatus: "local-resolved",
    preview: true,
  };
}
