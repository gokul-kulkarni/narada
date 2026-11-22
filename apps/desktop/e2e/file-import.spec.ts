import { expect, test } from "@playwright/test";

const collection = {
  info: {
    name: "Exported API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [
    {
      name: "Health",
      item: [{ name: "Ping", request: { method: "GET", url: "http://localhost:1420/" } }],
    },
  ],
};

test("import an exported Postman file from the empty sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import from Postman" }).click();
  await page.getByLabel("Import file").setInputFiles({
    name: "exported.postman_collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(collection)),
  });
  await expect(page.getByRole("list", { name: "Ready to import" })).toContainText(
    "Collection · 1 folder · 1 request",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText('Imported collection "Exported API".');

  await expect(page.getByRole("button", { name: /^▾\s*Exported API$/ })).toBeVisible();
  await page.getByRole("button", { name: /^GET\s*Ping$/ }).click();
  await page.getByRole("button", { name: "Dispatch" }).click();
  await expect(page.getByTestId("response-status")).toContainText("200 OK");
});

test("dropping a file on the window opens the import preview", async ({ page }) => {
  await page.goto("/");
  const dataTransfer = await page.evaluateHandle((json) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([json], "dropped.json", { type: "application/json" }));
    return transfer;
  }, JSON.stringify(collection));
  await page.dispatchEvent("main", "dragover", { dataTransfer });
  await page.dispatchEvent("main", "drop", { dataTransfer });
  await expect(page.getByRole("list", { name: "Ready to import" })).toContainText("Exported API");
});
