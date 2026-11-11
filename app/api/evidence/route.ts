import { user, sameOrigin } from "@/lib/auth";
import { getState, save, withMutation, audit } from "@/lib/db";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { after } from "next/server";
import { analyzeReportEvidence } from "@/lib/ai/evidence-review";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await user();
    if (!u)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    if (Number(req.headers.get("content-length") || 0) > 3500000)
      return Response.json({ error: "Maximum 3 MB per file" }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file"),
      reportId = String(form.get("reportId"));
    if (
      !(file instanceof File) ||
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "video/mp4",
        "video/webm",
        "application/pdf",
      ].includes(file.type) ||
      file.size > 3 * 1024 * 1024 ||
      !file.size
    )
      return Response.json(
        { error: "Choose a image, video or PDF under 3 MB" },
        { status: 400 },
      );
    let reviewReportId: string | undefined;
    const response = await withMutation(async () => {
      const s = await getState();
      const report = s.hub?.reports.find((r) => r.id === reportId);
      if (!report || (u.role === "reporter" && report.by !== u.id))
        return Response.json({ error: "Not found" }, { status: 404 });
      const task = s.hub!.cases.find((c) => c.id === report.incidentId);
      const purpose = String(form.get("purpose") || "attachment");
      if (!["attachment", "before", "after"].includes(purpose))
        return Response.json(
          { error: "Choose an attachment type" },
          { status: 400 },
        );
      if (
        u.role === "operator" &&
        (!task ||
          task.owner !== u.id ||
          !["Assigned", "Investigating", "Waiting Parts"].includes(task.status))
      )
        return Response.json(
          { error: "Task not available for uploads" },
          { status: 403 },
        );
      if (
        purpose !== "attachment" &&
        (u.role !== "operator" ||
          !(
            file.type.startsWith("image/") ||
            (purpose === "after" && file.type.startsWith("video/"))
          ))
      )
        return Response.json(
          { error: "Repair proof must be a technician photo or video" },
          { status: 403 },
        );
      const uploads = s.hub!.uploads || (s.hub!.uploads = []);
      if (
        uploads.filter((a) => a.reportId === reportId && a.by === u.id)
          .length >= 9
      )
        return Response.json(
          { error: "Maximum nine attachments per person per issue" },
          { status: 400 },
        );
      const id = crypto.randomUUID();
      const bytes = Buffer.from(await file.arrayBuffer());
      let path = id;
      if (process.env.VERCEL) {
        const blob = await put("evidence/" + id, bytes, {
          access: "private",
          contentType: file.type,
        });
        path = blob.pathname;
      } else {
        await mkdir(".data/uploads", { recursive: true });
        await writeFile(".data/uploads/" + id, bytes);
      }
      uploads.push({
        id,
        purpose: purpose as "attachment" | "before" | "after",
        reportId,
        by: u.id,
        name: file.name.slice(0, 160),
        type: file.type,
        size: file.size,
        path,
        at: Date.now(),
      });
      await save(s);
      await audit(u.id, "evidence.uploaded", { id, reportId });
      if (purpose === "attachment" && report.by === u.id &&
          (file.type.startsWith("image/") || file.type.startsWith("video/")))
        reviewReportId = report.id;
      return Response.json({ id, evidenceReviewPending: Boolean(process.env.VERCEL && reviewReportId) });
    });
    if (process.env.VERCEL && response.ok && reviewReportId) {
      const savedReportId = reviewReportId;
      after(async () => {
        try {
          await analyzeReportEvidence(u, savedReportId);
        } catch {
          // Uploads remain saved when concurrent changes or AI limits prevent analysis.
        }
      });
    }
    return response;
  } catch {
    return Response.json(
      {
        error:
          "Upload failed. Your issue was saved; try attaching a smaller file.",
      },
      { status: 400 },
    );
  }
}
