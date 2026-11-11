import { beforeEach, it, expect, vi } from "vitest";
process.env.FIXPILOT_DB = ":memory:";
const mock = vi.hoisted(() => ({ send: vi.fn(), configure: vi.fn() }));
vi.mock("web-push", () => ({
  sendNotification: mock.send,
  setVapidDetails: mock.configure,
}));
import { getState, save, reset } from "../lib/db";
import { mutateHub } from "../lib/incidents/coordination";
import { flushPush } from "../lib/notifications";
beforeEach(async () => {
  await reset();
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-key");
  mock.send.mockReset().mockResolvedValue({});
  await mutateHub(
    { id: "reporter@fixpilot.demo", name: "Jamie Lee", role: "reporter" },
    {
      action: "report",
      summary: "Leaking tap",
      detail: "The tap will not stop leaking",
      location: "Hostel C",
      category: "Water",
    },
  );
  const s = await getState();
  s.hub!.subscriptions = [
    {
      id: "device-1",
      by: "reporter@fixpilot.demo",
      endpoint: "https://fcm.googleapis.com/test-device",
      keys: { auth: "test", p256dh: "test" },
      at: Date.now() - 10000,
    },
  ];
  await save(s);
});
it("delivers privacy-preserving pushes once per subscription from the outbox", async () => {
  await flushPush();
  expect(mock.send).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(mock.send.mock.calls[0][1]);
  expect(payload.body).not.toContain("Leaking");
  expect(payload.url).toMatch(/^\/operations\?notification=/);
  await flushPush();
  expect(mock.send).toHaveBeenCalledTimes(1);
});
it("removes expired device endpoints", async () => {
  mock.send.mockRejectedValue({ statusCode: 410 });
  await flushPush();
  expect((await getState()).hub!.subscriptions).toHaveLength(0);
});
