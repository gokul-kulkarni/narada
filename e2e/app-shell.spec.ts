import { expect, test } from "@playwright/test";

test("sends a request and shows the response", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Narada" })).toBeVisible();
  await page.getByRole("button", { name: "New request tab" }).click();
  // Same-origin target so the browser build can fetch it without CORS.
  await page.getByLabel("URL").fill("http://localhost:1420/index.html");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("response-status")).toHaveText("200 OK");
  await expect(page.getByLabel("Response body")).toHaveValue(/<div id="root">/);
  await expect(page.getByRole("region", { name: "History" })).toContainText("index.html");
});
