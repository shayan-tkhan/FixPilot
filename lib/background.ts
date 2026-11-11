import { start } from "workflow/api";
import { HookConflictError } from "workflow/errors";
import { assignmentWatch } from "../workflows/assignment-watch";
import { getState, save, withMutation } from "./db";
import { flushPush } from "./notifications";
export async function runBackground() {
  const pending = await withMutation(async () => {
    const s = await getState();
    if (!s.hub) return [];
    const cases = s.hub.cases
      .filter(
        (c) =>
          c.status === "Assigned" &&
          c.assignmentId &&
          c.assignedAt &&
          !c.timerRunId &&
          (c.timerLeaseUntil || 0) < Date.now(),
      )
      .slice(0, 10);
    for (const c of cases) c.timerLeaseUntil = Date.now() + 60000;
    await save(s);
    return cases.map((c) => ({
      id: c.id,
      token: c.assignmentId!,
      at: c.assignedAt!,
    }));
  });
  for (const c of pending) {
    try {
      let runId: string;
      try {
        const run = await start(assignmentWatch, [c.id, c.token, c.at], {
          experimental_hook: {
            token: "assignment:" + c.token,
            experimental_minRetention: "7 days",
          },
        });
        runId = run.runId;
      } catch (e) {
        if (HookConflictError.is(e) && e.conflictingRunId)
          runId = e.conflictingRunId;
        else throw e;
      }
      await withMutation(async () => {
        const s = await getState();
        const current = s.hub?.cases.find(
          (x) => x.id === c.id && x.assignmentId === c.token,
        );
        if (current) {
          current.timerRunId = runId;
          await save(s);
        }
      });
    } catch (e) {
      console.error(
        "Could not schedule assignment timer",
        c.id,
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }
  await flushPush();
}
