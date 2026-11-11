import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  let loginRequests = 0;
  let legacyRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/login")) loginRequests++;
    if (request.url().endsWith("/api/state")) legacyRequests++;
  });
  await page.goto(process.env.BASE_URL || "http://localhost:3000");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("incorrect-demo-password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await password.inputValue(), "incorrect-demo-password");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(loginRequests, 0, "Visibility toggle must not submit the form");
  assert.equal(
    await page.getByRole("alert").filter({ hasText: /\S/ }).count(),
    0,
    "Opening login should not show a session error",
  );
  await page.getByRole("button", { name: "Open workspace" }).click();
  const error = page.getByRole("alert").filter({ hasText: /\S/ });
  await error.waitFor();
  assert.match(await error.innerText(), /Invalid demo credentials/);
  // Regression: the old 5-second unauthenticated poll overwrote this error.
  await new Promise((resolve) => setTimeout(resolve, 5500));
  assert.match(await error.innerText(), /Invalid demo credentials/);
  await password.fill(process.env.DEMO_PASSWORD || "demo123");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  await page.mouse.move(1, 120);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Department Staff" }).click();
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(await password.inputValue(), "");
  await password.fill(process.env.DEMO_PASSWORD || "demo123");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  assert.match(
    await page.getByRole("button", { name: "Sign out" }).innerText(),
    /Sam Chen/,
  );
  await page.mouse.move(1, 120);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .waitFor();
  await page.screenshot({
    path: "work/login-show-password.png",
    fullPage: true,
  });
  assert.equal(legacyRequests, 0, "Normal sign-in must not request the legacy workspace API");
  console.log(
    "Login smoke passed: Show/Hide preserves text without submitting; incorrect-password error persists; operator and reviewer sign in.",
  );
} finally {
  await browser.close();
}
