import { expect, test, type Page } from "@playwright/test";

async function requestWithTestScript(page: Page, script: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New request tab" }).click();
  await page.getByLabel("URL").fill("http://localhost:1420/index.html");
  await page.getByRole("tab", { name: "Scripts" }).click();
  await page.getByLabel("Test script").fill(script);
  await page.getByRole("button", { name: "Dispatch" }).click();
}

test("test scripts run in a Web Worker and report results", async ({ page }) => {
  await requestWithTestScript(
    page,
    `pm.test("status 200", () => pm.response.to.have.status(200));
     pm.test("has html", () => pm.expect(pm.response.text()).to.include("<div id"));
     pm.test("no DOM in the sandbox", () => pm.expect(typeof document).to.equal("undefined"));
     console.log("hello from worker");`,
  );
  await page.getByRole("tab", { name: "Tests (3/3)" }).click();
  await expect(page.getByRole("region", { name: "Console" })).toContainText("hello from worker");
});

test("runaway scripts are stopped by the timeout", async ({ page }) => {
  await requestWithTestScript(page, "while (true) {}");
  await expect(page.getByRole("alert")).toHaveText("Test script error: Script timed out after 5s", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("response-status")).toContainText("200 OK");
});
