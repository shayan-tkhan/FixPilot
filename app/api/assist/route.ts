import { user, sameOrigin } from "@/lib/auth";
import { getState, save, withMutation } from "@/lib/db";
import {
  intake,
  review,
  draft,
  configuredAiModel,
  intakeSchema,
  reviewSchema,
  aiConfigured,
} from "@/lib/ai/assistant";
import { routes } from "@/lib/incidents/coordination";
import { get } from "@vercel/blob";
import { readFile } from "node:fs/promises";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await user();
    if (!u)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!aiConfigured())
      return Response.json(
        {
          error:
            "AI is not connected in this environment. You can still enter and submit the report manually.",
        },
        { status: 503 },
      );
    if (Number(req.headers.get("content-length") || 0) > 3500000)
      return Response.json(
        { error: "Use one image under 3 MB" },
        { status: 413 },
      );
    const form = await req.formData(),
      intent = String(form.get("intent") || "intake"),
      id = String(form.get("id") || "");
    if (!["intake", "review", "draft"].includes(intent))
      throw Error("Unknown assistance request");
    const text = String(form.get("text") || "").trim(),
      location = String(form.get("location") || "").trim();
    if (text.length > 2500 || location.length > 80)
      throw Error("Shorten the report before trying again");
    let image: { bytes: Uint8Array; type: string } | undefined;
    const file = form.get("image");
    if (file instanceof File && file.size) {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 3 * 1024 * 1024
      )
        throw Error("Choose a PNG, JPEG or WebP image under 3 MB");
      image = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        type: file.type,
      };
    }
    const snapshot = await getState();
    const c = snapshot.hub?.cases.find((c) => c.id === id);
    if (
      intent !== "intake" &&
      (!c ||
        (intent === "review"
          ? !["reviewer", "admin"].includes(u.role)
          : !["reviewer", "admin"].includes(u.role) &&
            !(u.role === "operator" && c.owner === u.id)))
    )
      return Response.json(
        { error: "Not found or not permitted" },
        { status: 404 },
      );
    if (intent === "intake" && !image && text.length < 5)
      throw Error("Add a photo or describe the problem first");
    if (intent === "draft" && text.length < 5)
      throw Error("Write what you did before requesting an update draft");
    const requestId = crypto.randomUUID();
    await withMutation(async () => {
      const s = await getState();
      if (!s.hub) throw Error("Open your workspace first");
      const usage = s.hub.aiRequests || (s.hub.aiRequests = []);
      if (
        usage.filter((r) => r.by === u.id && r.at >= Date.now() - 86400000)
          .length >= 20
      )
        throw Error(
          "AI limit reached: 20 requests per 24 hours. Manual reporting still works.",
        );
      usage.push({ id: requestId, by: u.id, at: Date.now(), kind: intent });
      await save(s);
    });
    if (intent === "intake") {
      const output = intakeSchema.parse(
        await intake({ text, location, image }),
      );
      await withMutation(async () => {
        const s = await getState();
        s.hub!.assistance = s.hub!.assistance || [];
        s.hub!.assistance.push({
          id: requestId,
          by: u.id,
          at: Date.now(),
          model: configuredAiModel(),
          input: text,
          result: output,
        });
        await save(s);
      });
      return Response.json({
        id: requestId,
        model: configuredAiModel(),
        suggestion: output,
      });
    }
    if (intent === "draft") {
      const output = await draft({
        note: text,
        facts: {
          status: c!.status,
          department: c!.team,
          location: c!.location,
          eta: c!.eta,
        },
      });
      return Response.json({
        ...output,
        model: configuredAiModel(),
      });
    }
    const reports = snapshot.hub!.reports.filter((r) => r.incidentId === c!.id);
    const attachment = snapshot.hub!.uploads?.find(
      (a) =>
        reports.some((r) => r.id === a.reportId) &&
        (!a.purpose || a.purpose === "attachment") &&
        a.type.startsWith("image/"),
    );
    if (attachment) {
      const bytes = process.env.VERCEL
        ? await (async () => {
            const blob = await get(attachment.path, { access: "private" });
            return blob?.statusCode === 200
              ? new Uint8Array(await new Response(blob.stream).arrayBuffer())
              : null;
          })()
        : new Uint8Array(await readFile(".data/uploads/" + attachment.id));
      if (bytes) image = { bytes, type: attachment.type };
    }
    const candidates = snapshot
      .hub!.cases.filter(
        (x) =>
          x.id !== c!.id &&
          !["Resolved", "Closed"].includes(x.status) &&
          Date.now() - x.started <= 7 * 86400000 &&
          x.location.trim().toLowerCase() === c!.location.trim().toLowerCase(),
      )
      .slice(0, 15);
    const teams = [
      ...new Set(
        [
          ...Object.values(routes),
          ...Object.values(snapshot.hub!.settings?.routing || {}),
        ].map((r) => r.team),
      ),
    ];
    const output = reviewSchema.parse(
      await review({
        teams,
        evidence: {
          title: c!.title,
          location: c!.location,
          reports: reports
            .slice(0, 5)
            .map((r) => ({
              id: r.id,
              description: r.detail,
              category: r.category,
              at: r.at,
            })),
        },
        candidates: candidates.map((x) => ({
          id: x.id,
          title: x.title,
          location: x.location,
          service: x.service,
          started: x.started,
        })),
        image,
      }),
    );
    if (!teams.includes(output.department))
      throw Error(
        "The AI returned an unconfigured department. Staff can route this report manually.",
      );
    output.duplicates = output.duplicates.filter((d) =>
      candidates.some((c) => c.id === d.id),
    );
    const result = {
      ...output,
      id: requestId,
      at: Date.now(),
      basedOn: c!.updated,
      model: configuredAiModel(),
    };
    await withMutation(async () => {
      const s = await getState();
      const current = s.hub!.cases.find((x) => x.id === c!.id);
      if (!current || current.updated !== c!.updated)
        throw Error(
          "The issue changed during analysis. Try again with the latest report.",
        );
      current.recommendation = result;
      await save(s);
    });
    return Response.json({ suggestion: result });
  } catch (e) {
    console.error(
      "Assistance request failed",
      e instanceof Error ? e.name : "Unknown",
    );
    const message = e instanceof Error ? e.message : "";
    const own = /limit|before|Choose|Shorten|changed|unconfigured|first/.test(
      message,
    );
    return Response.json(
      {
        error: own
          ? message
          : "AI is unavailable right now. Your report has not been changed; continue manually or try again later.",
      },
      { status: own ? 400 : 503 },
    );
  }
}
