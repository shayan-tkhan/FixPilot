import { sleep } from "workflow";
import { checkAssignment, HOUR } from "../lib/incidents/safeguards";
import { getState, save, withMutation } from "../lib/db";
import { flushPush } from "../lib/notifications";
async function check(id: string, token: string) {
  "use step";
  console.log("Checking assignment deadline", id);
  const next = await withMutation(async () => {
    const s = await getState();
    if (!s.hub) return null;
    const result = checkAssignment(s.hub, id, token);
    await save(s);
    return result;
  });
  await flushPush();
  return next;
}
export async function assignmentWatch(
  id: string,
  token: string,
  assignedAt: number,
) {
  "use workflow";
  console.log("Assignment timer started", id);
  let current: { id: string; token: string; at: number } | null = {
    id,
    token,
    at: assignedAt,
  };
  while (current) {
    await sleep(new Date(current.at + 24 * HOUR));
    const reminded = await check(current.id, current.token);
    if (!reminded) return;
    if (reminded.token !== current.token) {
      current = reminded;
      continue;
    }
    await sleep(new Date(current.at + 48 * HOUR));
    const next = await check(current.id, current.token);
    if (!next || next.token === current.token) return;
    current = next;
  }
}
