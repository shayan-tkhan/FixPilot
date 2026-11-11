import { user, sameOrigin } from "@/lib/auth";
import { getState, save, withMutation } from "@/lib/db";
import { compareEvidence, aiConfigured, configuredAiModel, supportsEvidenceVideo } from "@/lib/ai/assistant";
import { attachmentBytes } from "@/lib/ai/evidence-review";
import { repairAttachments, repairFingerprint, mediaTypeMatches, type EvidenceReview } from "@/lib/ai/evidence";
import type { Case } from "@/lib/incidents/coordination";
import type { User } from "@/lib/auth";
export const runtime = "nodejs";
export const maxDuration = 60;
const allowed = (actor: User, issue: Case) =>
  ["reviewer", "admin"].includes(actor.role) || (actor.role === "operator" && issue.owner === actor.id);
export async function POST(request: Request) {
  let lease = "";
  try {
    try { sameOrigin(request); } catch {
      return Response.json({ error: "Same-origin request required" }, { status: 403 });
    }
    const actor = await user();
    if (!actor) return Response.json({ error: "Sign in required" }, { status: 401 });
    const input = await request.json().catch(() => null);
    if (!input || typeof input.caseId !== "string" || input.caseId.length > 100)
      return Response.json({ error: "Choose an issue" }, { status: 400 });
    const model = configuredAiModel();
    const snapshot = await withMutation(async () => {
      const state = await getState(), hub = state.hub;
      const issue = hub?.cases.find(item => item.id === input.caseId);
      if (!hub || !issue || !allowed(actor, issue)) return null;
      const fingerprint = repairFingerprint(hub, issue);
      const cached = issue.repairReview?.fingerprint === fingerprint &&
        issue.repairReview.model === model && issue.repairReview.status !== "unavailable"
        ? issue.repairReview : undefined;
      const attachments = repairAttachments(hub, issue);
      if (!cached && aiConfigured() && ["before", "after"].every(purpose => attachments.some(item => item.purpose === purpose))) {
        const usage = hub.aiRequests || (hub.aiRequests = []);
        const kind = "repair:" + fingerprint + ":" + model;
        if (usage.some(item => item.kind === kind && item.at > Date.now() - 55000))
          throw Error("Analysis is running. Refresh shortly.");
        if (usage.filter(item => item.by === actor.id && item.at > Date.now() - 86400000).length >= 20)
          throw Error("AI daily limit reached. Staff can review manually.");
        lease = crypto.randomUUID();
        usage.push({ id: lease, by: actor.id, at: Date.now(), kind });
        await save(state);
      }
      return { issue, fingerprint, attachments, cached,
        description: hub.reports.filter(report => report.incidentId === issue.id).map(report => report.detail).join("\n").slice(0, 5000) };
    });
    if (!snapshot) return Response.json({ error: "Issue not found" }, { status: 404 });
    if (snapshot.cached) return Response.json({ review: snapshot.cached });
    const result: EvidenceReview = { status: "unavailable", observations: [], limitations: [],
      analyzedAttachmentIds: [], fingerprint: snapshot.fingerprint, model, at: Date.now() };
    const pairReady = ["before", "after"].every(purpose => snapshot.attachments.some(item => item.purpose === purpose));
    if (!pairReady) {
      result.status = "unclear";
      result.limitations.push("Both a before and an after photo or video are needed for comparison.");
    } else if (!aiConfigured()) {
      result.limitations.push("AI is unavailable. Staff must review the repair evidence.");
    } else {
      try {
        const media = [];
        for (const item of snapshot.attachments) {
          if (item.type.startsWith("video/") && !supportsEvidenceVideo(model))
            throw Error("Unsupported video model");
          const bytes = await attachmentBytes(item);
          if (!bytes || bytes.length !== item.size || !mediaTypeMatches(item.type, bytes))
            throw Error("Unreadable evidence");
          media.push({ id: item.purpose + ":" + item.id, type: item.type, bytes });
        }
        const comparison = await compareEvidence({ model, purpose: "repair", media,
          report: { summary: snapshot.issue.title, detail: snapshot.description,
            location: snapshot.issue.location, repairNote: snapshot.issue.completionNote || "No completion note supplied." } });
        Object.assign(result, comparison);
        result.analyzedAttachmentIds = snapshot.attachments.map(item => item.id);
      } catch {
        result.limitations.push("AI could not complete this comparison. Provider access or readable media may be required.");
      }
    }
    result.limitations.push("Visible changes support staff review. Staff approval and user confirmation are still required.");
    await withMutation(async () => {
      const state = await getState(), hub = state.hub;
      const issue = hub?.cases.find(item => item.id === input.caseId);
      if (!hub || !issue || !allowed(actor, issue) || repairFingerprint(hub, issue) !== snapshot.fingerprint)
        throw Error("The repair evidence changed. Refresh and try again.");
      issue.repairReview = result;
      await save(state);
    });
    return Response.json({ review: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: /daily limit|running|changed/.test(message) ? message : "Repair evidence comparison is unavailable." }, { status: /daily limit/.test(message) ? 429 : 409 });
  } finally {
    if (lease) await withMutation(async () => {
      const state = await getState();
      const record = state.hub?.aiRequests?.find(item => item.id === lease);
      if (record) { record.kind = "repair-completed"; await save(state); }
    });
  }
}
