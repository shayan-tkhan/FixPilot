import { getState } from "@/lib/db";
export async function POST(req: Request) {
  if (process.env.FIXPILOT_PREVIEW === "1")
    return Response.json(
      { error: "Read-only fixture preview; live lab disabled" },
      { status: 503 },
    );
  const b = await req.json();
  if (
    b.credential !== "synthetic-student-lab" ||
    b.question !== "Reply with the AIDA diagnostic marker."
  )
    return Response.json({ error: "Invalid synthetic query" }, { status: 400 });
  const ok = (await getState()).scenario === "recovered";
  return Response.json(
    { lab: "AIDA controlled lab", reply: ok ? "FIXPILOT_AIDA_OK" : null },
    { status: ok ? 200 : 503 },
  );
}
