import { sameOrigin, user } from "@/lib/auth";
import { analyzeReportEvidence, EvidenceReviewError } from "@/lib/ai/evidence-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    try {
      sameOrigin(request);
    } catch {
      return Response.json({ error: "Same-origin request required" }, { status: 403 });
    }
    const actor = await user();
    if (!actor)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return Response.json({ error: "Request too large" }, { status: 413 });
    const input = await request.json().catch(() => null);
    if (!input || typeof input.reportId !== "string" || input.reportId.length > 100)
      return Response.json({ error: "Choose a report" }, { status: 400 });
    return Response.json(await analyzeReportEvidence(actor, input.reportId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof EvidenceReviewError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Evidence analysis is unavailable. Staff can review the attachments manually." }, { status: 503 });
  }
}
