import { z } from "zod";
import { user, sameOrigin } from "@/lib/auth";
import { getState, save, withMutation } from "@/lib/db";
export async function GET() {
  const u = await user();
  if (!u) return Response.json({ error: "Sign in required" }, { status: 401 });
  return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await user();
    if (!u)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    const b = z
      .object({
        action: z.enum(["subscribe", "unsubscribe"]),
        endpoint: z.string().url().max(2000),
        keys: z
          .object({
            p256dh: z.string().min(20).max(200),
            auth: z.string().min(10).max(100),
          })
          .optional(),
      })
      .parse(await req.json());
    const endpoint = new URL(b.endpoint);
    const allowed = [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ];
    if (
      endpoint.protocol !== "https:" ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      !(
        allowed.includes(endpoint.hostname) ||
        endpoint.hostname.endsWith(".push.services.mozilla.com") ||
        endpoint.hostname.endsWith(".notify.windows.com")
      )
    )
      throw Error("Unsupported push provider");
    await withMutation(async () => {
      const s = await getState();
      if (!s.hub) throw Error("Open your workspace first");
      const h = s.hub;
      h.subscriptions = h.subscriptions || [];
      const existing = h.subscriptions.find((a) => a.endpoint === b.endpoint);
      if (existing && existing.by !== u.id)
        throw Error(
          "This browser is subscribed to another account. Disable its notifications before switching.",
        );
      h.subscriptions = h.subscriptions.filter(
        (a) => !(a.endpoint === b.endpoint && a.by === u.id),
      );
      if (b.action === "subscribe") {
        if (!b.keys) throw Error("Missing subscription keys");
        if (h.subscriptions.filter((a) => a.by === u.id).length >= 5)
          throw Error("Maximum five notification devices");
        h.subscriptions.push({
          id: crypto.randomUUID(),
          by: u.id,
          endpoint: b.endpoint,
          keys: b.keys,
          at: Date.now(),
        });
      }
      await save(s);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Could not update notifications",
      },
      { status: 400 },
    );
  }
}
