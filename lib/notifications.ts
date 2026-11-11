import * as webpush from "web-push";
import { getState, save, withMutation } from "./db";
// Leased outbox: concurrent requests cannot send the same batch at once; partial delivery retries per device.
export async function flushPush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    "https://fixpilot-ai-kappa.vercel.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const batch = await withMutation(async () => {
    const s = await getState();
    const h = s.hub;
    if (!h) return [];
    const now = Date.now();
    const jobs = (h.notifications || [])
      .filter(
        (n) =>
          !n.pushAt &&
          (n.pushLeaseUntil || 0) < now &&
          (n.pushAttempts || 0) < 5,
      )
      .slice(0, 20);
    for (const n of jobs) {
      n.pushLeaseUntil = now + 60000;
      n.pushAttempts = (n.pushAttempts || 0) + 1;
    }
    await save(s);
    return jobs.map((n) => ({
      notification: n,
      subscriptions: (h.subscriptions || []).filter(
        (a) => a.by === n.to && a.at <= n.at && !n.deliveredTo?.includes(a.id),
      ),
    }));
  });
  for (const job of batch) {
    const delivered: string[] = [],
      expired: string[] = [];
    let failed = false;
    for (const sub of job.subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({
            title: "FixPilot update",
            body: "There is a new update on an issue you follow.",
            url: "/operations?notification=" + job.notification.id,
            tag: job.notification.id,
          }),
          { TTL: 3600 },
        );
        delivered.push(sub.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(sub.id);
        else failed = true;
      }
    }
    await withMutation(async () => {
      const s = await getState();
      const h = s.hub;
      if (!h) return;
      const n = h.notifications?.find((n) => n.id === job.notification.id);
      if (!n) return;
      n.deliveredTo = [...new Set([...(n.deliveredTo || []), ...delivered])];
      n.pushLeaseUntil = failed
        ? Date.now() + Math.min(3600000, 60000 * 2 ** (n.pushAttempts || 1))
        : undefined;
      if (!failed) n.pushAt = Date.now();
      h.subscriptions = h.subscriptions?.filter((s) => !expired.includes(s.id));
      await save(s);
    });
  }
}
