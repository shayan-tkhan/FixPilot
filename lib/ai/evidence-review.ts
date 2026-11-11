import { readFile } from "node:fs/promises";
import { get } from "@vercel/blob";
import type { User } from "../auth";
import { getState, save, withMutation } from "../db";
import type { Hub, Report, Attachment } from "../incidents/coordination";
import { reviewerIds } from "../accounts";
import { notify } from "../incidents/safeguards";
import { configuredAiModel, aiConfigured, compareEvidence, supportsEvidenceVideo } from "./assistant";
import {
  evidenceFingerprint,
  mediaTypeMatches,
  reportAttachments,
  type EvidenceReview,
} from "./evidence";

export class EvidenceReviewError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function permitted(hub: Hub | undefined, report: Report | undefined, actor: User) {
  if (!hub || !report) return false;
  if (actor.role === "reporter") return report.by === actor.id;
  if (actor.role === "operator")
    return hub.cases.some((task) => task.id === report.incidentId && task.owner === actor.id);
  return ["reviewer", "admin"].includes(actor.role);
}

export async function attachmentBytes(attachment: Attachment) {
  if (!/^[a-zA-Z0-9-]+$/.test(attachment.id) || attachment.size > 3 * 1024 * 1024)
    return null;
  if (!process.env.VERCEL)
    return new Uint8Array(await readFile(".data/uploads/" + attachment.id));
  if (!/^evidence\/[a-zA-Z0-9._-]+$/.test(attachment.path) || attachment.path.includes(".."))
    return null;
  const blob = await get(attachment.path, { access: "private" });
  if (!blob || blob.statusCode !== 200) return null;
  return new Uint8Array(await new Response(blob.stream).arrayBuffer());
}

export async function analyzeReportEvidence(actor: User, reportId: string) {
  const model = configuredAiModel();
  const started = Date.now();
  const snapshot = await withMutation(async () => {
    const state = await getState();
    const report = state.hub?.reports.find((item) => item.id === reportId);
    if (!permitted(state.hub, report, actor))
      throw new EvidenceReviewError("Report not found", 404);
    const hub = state.hub!;
    const current = report!;
    const attachments = reportAttachments(current, hub.uploads || []);
    const fingerprint = evidenceFingerprint(current, attachments);
    const existing = current.evidenceReview;
    if (existing?.fingerprint === fingerprint && existing.model === model &&
        (existing.status !== "unavailable" || started - existing.at < 30000))
      return { report: current, attachments, fingerprint, cached: existing };
    const connected = aiConfigured();
    let requestId: string | undefined;
    if (connected && attachments.length) {
      const usage = hub.aiRequests || (hub.aiRequests = []);
      const kind = `evidence:${reportId}:${fingerprint}:${model}`;
      if (usage.some((item) => item.kind === kind && item.at > started - 55000))
        throw new EvidenceReviewError("Evidence analysis is already running. Refresh shortly.", 409);
      if (usage.filter((item) => item.by === actor.id && item.at >= started - 86400000).length >= 20)
        throw new EvidenceReviewError("AI limit reached. Staff can review the evidence manually.", 429);
      requestId = crypto.randomUUID();
      usage.push({ id: requestId, by: actor.id, at: started, kind });
      await save(state);
    }
    const originalText = hub.assistance?.find(
      (item) => item.id === current.assistanceId && item.by === current.by,
    )?.input;
    return { report: current, attachments, fingerprint, originalText, requestId };
  });
  if (snapshot.cached) return { review: snapshot.cached, cached: true };

  const review: EvidenceReview = {
    status: "unavailable",
    observations: [],
    limitations: [],
    analyzedAttachmentIds: [],
    at: Date.now(),
    fingerprint: snapshot.fingerprint,
    model,
  };
  const connected = aiConfigured();
  const media: { id: string; type: string; bytes: Uint8Array }[] = [];
  if (!connected) {
    review.limitations.push("AI is not connected. Staff must review the report and attachments manually.");
  } else {
    for (const attachment of snapshot.attachments) {
      if (!attachment.type.startsWith("image/") && !attachment.type.startsWith("video/")) {
        review.limitations.push("PDF and other documents require manual evidence review.");
        continue;
      }
      if (attachment.type.startsWith("video/") && !supportsEvidenceVideo(model)) {
        review.limitations.push("Video analysis is unavailable for the selected AI model. Staff must watch the video.");
        continue;
      }
      try {
        const bytes = await attachmentBytes(attachment);
        if (!bytes || bytes.byteLength !== attachment.size || !mediaTypeMatches(attachment.type, bytes)) {
          review.limitations.push("An attachment could not be read as its declared media format. Staff must check it manually.");
          continue;
        }
        media.push({ id: attachment.id, type: attachment.type, bytes });
      } catch {
        review.limitations.push("An attachment could not be retrieved. Staff must check it manually.");
      }
    }
    if (media.length) {
      try {
        const result = await compareEvidence({
          report: {
            summary: snapshot.report.summary,
            detail: snapshot.report.detail,
            location: snapshot.report.location,
            originalText: snapshot.originalText,
          },
          media,
          model,
        });
        review.status = result.status === "consistent" && review.limitations.length
          ? "unclear"
          : result.status;
        review.observations = result.observations;
        review.limitations.push(...result.limitations);
        review.analyzedAttachmentIds = media.map((item) => item.id);
      } catch (error) {
        const providerMessage = error instanceof Error ? error.message : "";
        review.limitations.push(/billing|credit|card|verification/i.test(providerMessage)
          ? "The AI provider account requires billing verification. Staff must review the evidence manually."
          : "The AI provider could not complete evidence analysis. Staff must review the evidence manually.");
      }
    } else if (!review.limitations.length) {
      review.limitations.push("No reporter photos or videos are attached to this report.");
    }
  }
  review.limitations.push("AI comparison cannot establish authenticity, capture time, location, or whether a report is true.");
  review.limitations = [...new Set(review.limitations)];
  review.at = Date.now();

  try {
    await withMutation(async () => {
      const state = await getState();
      const report = state.hub?.reports.find((item) => item.id === reportId);
      if (!permitted(state.hub, report, actor))
        throw new EvidenceReviewError("Report not found", 404);
      const current = report!;
      const attachments = reportAttachments(current, state.hub!.uploads || []);
      if (evidenceFingerprint(current, attachments) !== snapshot.fingerprint)
        throw new EvidenceReviewError("The report or attachments changed during analysis. Try again.", 409);
      current.evidenceReview = review;
      if (review.status === "possible_mismatch") {
        const task = state.hub!.cases.find((item) => item.id === current.incidentId);
        if (task)
          notify(state.hub!, reviewerIds, task,
            `Evidence needs review for "${current.summary}". AI found a possible mismatch. Compare the original report with the analyzed attachments.`);
      }
      await save(state);
    });
  } finally {
    if (snapshot.requestId) {
      await withMutation(async () => {
        const state = await getState();
        const request = state.hub?.aiRequests?.find((item) => item.id === snapshot.requestId);
        if (request) {
          // Retain the daily usage entry while releasing the running-request lease.
          request.kind = "evidence-completed";
          await save(state);
        }
      });
    }
  }
  return { review, cached: false };
}
