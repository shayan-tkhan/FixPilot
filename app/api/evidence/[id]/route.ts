import { user } from "@/lib/auth";
import { getState } from "@/lib/db";
import { get } from "@vercel/blob";
import { readFile } from "node:fs/promises";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await user();
  if (!u) return new Response(null, { status: 401 });
  const { id } = await params;
  const h = (await getState()).hub;
  const a = h?.uploads?.find((a) => a.id === id);
  const report = h?.reports.find((r) => r.id === a?.reportId);
  const task = h?.cases.find((c) => c.id === report?.incidentId);
  const ownProof =
    a?.purpose === "after" &&
    h?.reports.some((r) => r.incidentId === task?.id && r.by === u.id);
  if (
    !a || !report || !task ||
    (u.role === "reporter" && a.by !== u.id && !ownProof) ||
    (u.role === "operator" && task?.owner !== u.id)
  )
    return new Response(null, { status: 404 });
  const headers = {
    "Content-Type": a.type,
    "Content-Disposition": `inline; filename="${a.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (process.env.VERCEL) {
    const blob = await get(a.path, { access: "private" });
    if (!blob || blob.statusCode !== 200)
      return new Response(null, { status: 404 });
    return new Response(blob.stream, { headers });
  }
  return new Response(await readFile(".data/uploads/" + a.id), { headers });
}
