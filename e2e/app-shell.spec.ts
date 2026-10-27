import { expect, test } from "@playwright/test";

test("app shell loads with workspace sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Free Postman" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace" })).toContainText("Collections");
});
