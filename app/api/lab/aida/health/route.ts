import { getState } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.FIXPILOT_PREVIEW === "1")
    return Response.json(
      { error: "Read-only fixture preview; live lab disabled" },
      { status: 503 },
    );
  const ok = (await getState()).scenario !== "outage";
  return Response.json(
    { lab: "AIDA controlled lab", healthy: ok },
    { status: ok ? 200 : 503 },
  );
}
