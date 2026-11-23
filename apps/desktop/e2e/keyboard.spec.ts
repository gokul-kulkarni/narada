import { expect, test } from "@playwright/test";

// "ControlOrMeta" is ⌘ on macOS and Ctrl elsewhere, like the app's own "mod".
test("works the request from the keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Narada" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+t");
  await expect(page.getByLabel("URL")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+l");
  await expect(page.getByLabel("URL")).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Shift+P");
  await page.keyboard.type("sidebar");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Workspace" })).toBeHidden();
});
