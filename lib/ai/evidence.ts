import { createHash } from "node:crypto";
import type { Attachment, Report, Case, Hub } from "../incidents/coordination";

export type EvidenceReview = {
  status: "consistent" | "possible_mismatch" | "unclear" | "unavailable";
  observations: string[];
  limitations: string[];
  analyzedAttachmentIds: string[];
  at: number;
  fingerprint: string;
  model: string;
};

export function reportAttachments(report: Report, uploads: Attachment[]) {
  return uploads
    .filter(
      (attachment) =>
        attachment.reportId === report.id &&
        attachment.by === report.by &&
        (!attachment.purpose || attachment.purpose === "attachment"),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function evidenceFingerprint(report: Report, attachments: Attachment[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: report.id,
        by: report.by,
        summary: report.summary,
        detail: report.detail,
        location: report.location,
        category: report.category,
        assistanceId: report.assistanceId,
        attachments: attachments.map(({ id, by, type, size, path, at, purpose }) => ({
          id,
          by,
          type,
          size,
          path,
          at,
          purpose,
        })),
      }),
    )
    .digest("hex");
}

export function mediaTypeMatches(type: string, bytes: Uint8Array) {
  const prefix = (...expected: number[]) =>
    expected.every((value, index) => bytes[index] === value);
  if (type === "image/png") return prefix(137, 80, 78, 71, 13, 10, 26, 10);
  if (type === "image/jpeg") return prefix(255, 216, 255);
  if (type === "image/webp")
    return prefix(82, 73, 70, 70) &&
      Buffer.from(bytes.slice(8, 12)).toString("ascii") === "WEBP";
  if (type === "video/mp4")
    return Buffer.from(bytes.slice(4, 8)).toString("ascii") === "ftyp";
  if (type === "video/webm") return prefix(26, 69, 223, 163);
  return false;
}

export function evidenceReviewCurrent(report: Report, uploads: Attachment[]) {
  return report.evidenceReview?.fingerprint ===
    evidenceFingerprint(report, reportAttachments(report, uploads));
}

export function repairAttachments(hub: Hub, issue: Case) {
  const reports = new Set(hub.reports.filter(report => report.incidentId === issue.id).map(report => report.id));
  return (hub.uploads || []).filter(attachment =>
    reports.has(attachment.reportId) && attachment.by === issue.owner &&
    ["before", "after"].includes(attachment.purpose || ""),
  ).sort((a, b) => a.id.localeCompare(b.id));
}
export function repairFingerprint(hub: Hub, issue: Case) {
  return createHash("sha256").update(JSON.stringify({
    id: issue.id, owner: issue.owner, title: issue.title, location: issue.location, note: issue.completionNote,
    descriptions: hub.reports.filter(report => report.incidentId === issue.id).map(report => ({ id: report.id, detail: report.detail })),
    attachments: repairAttachments(hub, issue).map(({ id, type, size, purpose }) => ({ id, type, size, purpose })),
  })).digest("hex");
}
