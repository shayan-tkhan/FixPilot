import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
process.on("uncaughtException", (error) => {
  console.error(error.name + ": " + error.message.split("\n")[0]);
  process.exit(1);
});
const transportProxy =
  process.env.USE_TRUSTED_NODE_TRANSPORT === "1" && process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY }
    : undefined;
const browser = await chromium.launch({
  proxy: transportProxy,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const base = process.env.BASE_URL || "http://localhost:3000";
let protection = {};
if (process.env.VERCEL_TEST_ACCESS_FILE) {
  const { readFileSync } = await import("node:fs");
  const config = JSON.parse(
    readFileSync(process.env.VERCEL_TEST_ACCESS_FILE, "utf8"),
  );
  const key = Object.keys(config.protectionBypass || {})[0];
  if (!key) throw Error("Missing authorized test access");
  protection = { "x-vercel-protection-bypass": key };
}
const page = await browser.newPage({
  extraHTTPHeaders: protection,
  proxy: transportProxy,
  viewport: { width: 1440, height: 1100 },
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", async (route) => {
  if (new URL(route.request().url()).origin !== new URL(base).origin) {
    const headers = { ...route.request().headers() };
    delete headers["x-vercel-protection-bypass"];
    await route.continue({ headers });
  } else if (process.env.USE_TRUSTED_NODE_TRANSPORT === "1") {
    // The cloud proxy CA is trusted by Node; Chromium uses a separate trust store.
    // Keep upstream TLS verification enabled while exercising the real rendered app.
    const request = route.request();
    const response = await fetch(request.url(), {
      method: request.method(),
      headers: request.headers(),
      body: request.postDataBuffer() || undefined,
      redirect: "manual",
    });
    const headers = Object.fromEntries(response.headers.entries());
    delete headers["content-encoding"];
    delete headers["content-length"];
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers["set-cookie"] = cookies.join("\n");
    await route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  } else await route.continue();
});
await page.goto(base);
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.DEMO_PASSWORD || "demo123");
await page.getByRole("button", { name: "Open workspace" }).click();
await page.waitForURL("**/operations");
await page.goto(base + "/?evidence=1");
await page.getByRole("button", { name: "Open or pin sidebar" }).click();
await page
  .getByRole("heading", { name: "Incident workspace", exact: true })
  .waitFor();
await page.screenshot({ path: "work/dashboard.png", fullPage: true });
const post = async (path, body) => {
  const r = await page.request.post(base + "/api/" + path, {
    headers: { origin: base },
    data: body,
  });
  const d = await r.json();
  if (!r.ok()) throw Error(path + ": " + JSON.stringify(d));
  return d;
};
for (const id of ["T-1", "T-2", "T-3"])
  await post("links", { ticketId: id, accepted: true });
for (const id of ["T-4", "T-5"])
  await post("links", { ticketId: id, accepted: false });
await page.reload();
await page.getByRole("button", { name: "Open or pin sidebar" }).click();
await page
  .getByRole("button", { name: "Use a labeled fixture for the demo" })
  .click();
await page.getByRole("button", { name: "Validate & import analysis" }).click();
await page.getByRole("heading", { name: "Investigation findings" }).waitFor();
await page.getByRole("button", { name: "Demo lab", exact: true }).click();
await page.getByRole("button", { name: /02 False all-clear/ }).click();
await page
  .getByRole("button", { name: "Run recovery check", exact: true })
  .click();
await page.getByText("No expected reply", { exact: true }).waitFor();
let state = await (await page.request.get(base + "/api/state")).json();
if (state.state.status === "Resolved" || state.readyProbeIds.length)
  throw Error("False all clear accepted");
await page.screenshot({ path: "work/false-clear.png", fullPage: true });
await page.getByRole("button", { name: /03 Recovered/ }).click();
await page
  .getByRole("button", { name: "Run recovery check", exact: true })
  .click();
await page.getByText("Expected reply received", { exact: true }).waitFor();
// Wait for the real policy interval; it is the behaviour under test.
await new Promise((r) => setTimeout(r, 5200));
await page
  .getByRole("button", { name: "Run recovery check", exact: true })
  .click();
await page.getByRole("button", { name: "Incidents", exact: false }).click();
await page
  .getByRole("button", { name: "Overview", exact: true })
  .last()
  .click();
await page.getByText("2 of 2 passing checks", { exact: true }).waitFor();
await page.screenshot({ path: "work/recovered.png", fullPage: true });
await page.getByRole("button", { name: "Sign out" }).click();
await page.getByRole("button", { name: "Department Staff" }).click();
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.DEMO_PASSWORD || "demo123");
await page.getByRole("button", { name: "Open workspace" }).click();
await page.waitForURL("**/operations");
await page.goto(base + "/?evidence=1");
await page.getByRole("button", { name: "Open or pin sidebar" }).click();
await page.getByRole("button", { name: /Approve revision/ }).click();
await page.getByText("Reviewer approved", { exact: true }).waitFor();
await page.getByRole("button", { name: "Sign out" }).click();
await page.getByRole("button", { name: "Technician" }).click();
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.DEMO_PASSWORD || "demo123");
await page.getByRole("button", { name: "Open workspace" }).click();
await page.waitForURL("**/operations");
await page.goto(base + "/?evidence=1");
await page.getByRole("button", { name: "Open or pin sidebar" }).click();
await page.getByRole("button", { name: "Apply approved update" }).click();
await page.getByText("Local demo update", { exact: true }).waitFor();
state = await (await page.request.get(base + "/api/state")).json();
if (state.state.status !== "Resolved") throw Error("Did not resolve");
const key = state.state.approval.key;
await post("execute", { approvalKey: key });
const final = await (await page.request.get(base + "/api/state")).json();
if (final.events.filter((e) => e.event === "action.result").length !== 1)
  throw Error("Replay created another action");
await page.reload();
await page.getByRole("button", { name: "Open or pin sidebar" }).click();
await page.getByText("Local demo update", { exact: true }).waitFor();
await page.screenshot({ path: "work/resolved.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "work/mobile.png", fullPage: true });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw Error("Mobile horizontal overflow");
writeFileSync(
  "work/smoke-result.json",
  JSON.stringify(
    {
      passed: true,
      errors,
      incident: final.state.status,
      actions: final.events.filter((e) => e.event === "action.result").length,
      probes: final.state.probes.map((p) => ({
        health: p.health,
        query: p.query,
        expected: p.expected,
      })),
      mobileOverflow: overflow,
    },
    null,
    2,
  ),
);
if (errors.length) throw Error(errors.join("\n"));
await browser.close();
console.log(
  "Browser smoke passed: false clear, two HTTP checks, independent reviewer, closure, replay, persistence and mobile layout.",
);
