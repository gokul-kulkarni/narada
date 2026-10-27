import { expect, test } from "@playwright/test";

test("create a collection, save a request into it, and find it after reload", async ({ page }) => {
  await page.goto("/");
  const collections = page.getByRole("region", { name: "Collections" });
  await collections.getByRole("button", { name: "+ New" }).click();
  await page.getByRole("button", { name: "Actions for New Collection" }).click();
  await page.getByRole("menuitem", { name: "Add request" }).click();
  await page.getByLabel("Request name", { exact: true }).fill("Home page");
  await page.getByLabel("URL").fill("http://localhost:1420/");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByLabel("unsaved")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /^▸\s*New Collection$/ }).click();
  await page.getByRole("button", { name: /^GET\s*Home page$/ }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("response-status")).toHaveText("200 OK");
});
