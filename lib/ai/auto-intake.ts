import { createHash, randomUUID } from "node:crypto";
import type { User } from "../auth";
import { getState, save, withMutation } from "../db";
import { intake, intakeSchema, configuredAiModel, aiConfigured } from "./assistant";
import { categories } from "../incidents/coordination";

export async function prepareAutomaticIntake(
  user: User,
  body: Record<string, unknown>,
) {
  if (body.action !== "report") return body;
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (summary.length < 5 || summary.length > 180 ||
      detail.length < 10 || detail.length > 2000 ||
      location.length < 2 || location.length > 80) return body;
  if (body.category !== undefined &&
      !categories.some((category) => category === body.category)) return body;

  const sourceFingerprint = createHash("sha256").update(JSON.stringify({
    summary, detail, location, category: body.category || null,
    existingCase: body.existingCase || null,
    assistanceId: body.assistanceId || null,
  })).digest("hex");
  const submitted = { ...body, sourceFingerprint };
  if (body.assistanceId || body.existingCase) return submitted;

  const requestId = typeof body.requestId === "string" ? body.requestId : randomUUID();
  const id = "auto-" + createHash("sha256")
    .update(user.id + requestId + sourceFingerprint).digest("hex");
  const snapshot = await getState();
  if (snapshot.hub?.reports.some((report) =>
    report.by === user.id && report.requestId === requestId
  )) return submitted;

  const apply = (record: NonNullable<NonNullable<typeof snapshot.hub>["assistance"]>[number]) => ({
    ...submitted,
    summary: record.result.summary,
    detail: record.result.description,
    category: record.result.category,
    location,
    assistanceId: record.id,
  });
  const cached = snapshot.hub?.assistance?.find((record) =>
    record.id === id && record.by === user.id
  );
  if (cached) return apply(cached);
  if (!aiConfigured()) {
    return { ...submitted, aiUnavailable: true };
  }

  const reserved = await withMutation(async () => {
    const state = await getState();
    if (!state.hub) return false;
    const usage = state.hub.aiRequests || (state.hub.aiRequests = []);
    if (usage.some((request) => request.id === id)) return false;
    if (usage.filter((request) =>
      request.by === user.id && request.at >= Date.now() - 86400000
    ).length >= 20) return false;
    usage.push({ id, by: user.id, at: Date.now(), kind: "automatic-intake" });
    await save(state);
    return true;
  });
  if (!reserved) {
    const latest = await getState();
    const completed = latest.hub?.assistance?.find((record) => record.id === id);
    if (completed) return apply(completed);
    const pending = latest.hub?.aiRequests?.find((request) => request.id === id);
    if (pending?.kind === "automatic-intake" && Date.now() - pending.at < 60000) {
      throw Error("Analysis is already running. Please retry shortly.");
    }
    return { ...submitted, aiUnavailable: true };
  }

  try {
    const input = summary + "\n" + detail;
    const result = intakeSchema.parse(await intake({ text: input, location }));
    const record = {
      id, by: user.id, at: Date.now(),
      model: configuredAiModel(),
      input, result,
    };
    await withMutation(async () => {
      const state = await getState();
      if (!state.hub) throw Error("Workspace unavailable");
      const assistance = state.hub.assistance || (state.hub.assistance = []);
      if (!assistance.some((item) => item.id === id)) assistance.push(record);
      await save(state);
    });
    return apply(record);
  } catch {
    await withMutation(async () => {
      const state = await getState();
      const request = state.hub?.aiRequests?.find((item) => item.id === id);
      if (request) {
        request.kind = "automatic-intake-failed";
        await save(state);
      }
    });
    return { ...submitted, aiUnavailable: true };
  }
}
