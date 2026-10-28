import { expect, test } from "@playwright/test";

const collection = {
  info: {
    name: "Remote API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [{ name: "Ping", request: { method: "GET", url: "http://localhost:1420/" } }],
};

const routes: Record<string, unknown> = {
  "/workspaces": { workspaces: [{ id: "w1", name: "My Workspace" }] },
  "/collections?workspace=w1": { collections: [{ uid: "u-c1", name: "Remote API" }] },
  "/environments?workspace=w1": { environments: [] },
  "/collections/u-c1": { collection },
};

test("import a collection from a Postman account and send a request from it", async ({ page }) => {
  await page.route("https://api.getpostman.com/**", async (route) => {
    const url = new URL(route.request().url());
    const body = routes[url.pathname + url.search];
    await route.fulfill({
      status: body ? 200 : 404,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
      body: JSON.stringify(body ?? {}),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("tab", { name: "Postman account" }).click();
  await page.getByLabel("Postman API key").fill("PMAK-test");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("checkbox", { name: "Remote API" }).check();
  await page.getByRole("button", { name: "Import selected" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 1 item(s) from Postman.");

  await page.getByRole("button", { name: /^▸\s*Remote API$/ }).click();
  await page.getByRole("button", { name: /^GET\s*Ping$/ }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("response-status")).toHaveText("200 OK");
});
