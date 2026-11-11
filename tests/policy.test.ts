import { describe, it, expect } from "vitest";
import { initial, type Probe } from "../lib/db";
import {
  canLink,
  recovery,
  validateAnalysis,
  blockers,
} from "../lib/incidents/policy";
const now = Date.now();
const probe = (at: number, expected = true, health = 200): Probe => ({
  id: `P-${at}`,
  at,
  health,
  query: expected ? 200 : 503,
  expected,
  service: "AIDA",
});
const analysis = {
  bundleId: "FP-001-r1",
  proposedTicketIds: ["T-1", "T-2", "T-3"],
  excludedTickets: [
    { ticketId: "T-4", reason: "Account-specific failure" },
    { ticketId: "T-5", reason: "LMS" },
  ],
  observations: [{ text: "Reports corroborated", evidenceIds: ["E-1"] }],
  hypotheses: [],
  conflicts: [],
  nextCheck: "RUN_AIDA_USER_PROBE",
  runbookSectionIds: ["RB-AIDA-01#query-check"],
  unknowns: [],
};
describe("incident authority", () => {
  it("links only the three corroborated service reports", () => {
    const s = initial();
    expect(s.tickets.filter((t) => canLink(s, t.id)).map((t) => t.id)).toEqual([
      "T-1",
      "T-2",
      "T-3",
    ]);
  });
  it("rejects stale, unknown citations and unexported bundles", () => {
    const s = initial();
    expect(() => validateAnalysis(analysis, s)).toThrow("unexported");
    s.exportedBundle = analysis.bundleId;
    expect(validateAnalysis(analysis, s)).toEqual(analysis);
    expect(() =>
      validateAnalysis({ ...analysis, bundleId: "FP-001-r0" }, s),
    ).toThrow("Stale");
    expect(() =>
      validateAnalysis(
        {
          ...analysis,
          observations: [{ text: "Invented", evidenceIds: ["E-999"] }],
        },
        s,
      ),
    ).toThrow("Unknown evidence");
    expect(() =>
      validateAnalysis({ ...analysis, runbookSectionIds: ["RB-unknown"] }, s),
    ).toThrow("Unknown runbook");
  });
  it("ignores health 200 when query fails", () =>
    expect(
      recovery(
        [probe(now - 7000), probe(now - 1000, false)],
        now - 100000,
        now,
      ),
    ).toHaveLength(0));
  it("requires 5s separation and 2 minute freshness", () => {
    expect(
      recovery([probe(now - 6000), probe(now - 1000)], now - 100000, now),
    ).toHaveLength(2);
    expect(
      recovery([probe(now - 5000), probe(now - 1000)], now - 100000, now),
    ).toHaveLength(0);
    expect(
      recovery([probe(now - 130000), probe(now - 125000)], now - 200000, now),
    ).toHaveLength(0);
  });
  it("a new failed query invalidates all earlier successful checks", () =>
    expect(
      recovery(
        [probe(now - 9000), probe(now - 4000), probe(now - 1000, false)],
        now - 100000,
        now,
      ),
    ).toHaveLength(0));
  it("blocks recovery evidence from before incident or in the future", () => {
    expect(
      recovery([probe(now - 9000), probe(now - 4000)], now - 2000, now),
    ).toHaveLength(0);
    expect(
      recovery([probe(now + 1000), probe(now + 6000)], now - 2000, now),
    ).toHaveLength(0);
    expect(blockers(initial())).toHaveLength(3);
  });
});
