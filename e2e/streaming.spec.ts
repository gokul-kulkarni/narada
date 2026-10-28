import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

const WORDS = ["Every ", "mile ", "starts ", "with ", "one ", "step."];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
};

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

/** An OpenAI-style chat stream: one word every `gapMs`, or one word then silence. */
function stream(res: ServerResponse, gapMs: number, hang: boolean) {
  res.writeHead(200, { ...CORS, "content-type": "text/event-stream" });
  const words = hang ? WORDS.slice(0, 1) : WORDS;
  words.forEach((word, i) =>
    setTimeout(
      () => {
        res.write(delta(word));
        if (!hang && i === words.length - 1) res.end("data: [DONE]\n\n");
      },
      gapMs * (i + 1),
    ),
  );
}

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "access-control-allow-methods": "POST" });
      res.end();
      return;
    }
    stream(res, 150, req.url === "/hang");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});

async function dispatch(page: import("@playwright/test").Page, url: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New request tab" }).click();
  await page.getByLabel("URL").fill(url);
  await page.getByRole("button", { name: "Dispatch" }).click();
}

test("shows an LLM reply as it streams in", async ({ page }) => {
  await dispatch(page, `${baseUrl}/v1/chat/completions`);

  const pending = page.getByRole("article", { name: "Dispatching" });
  await expect(pending.getByTestId("delivery-progress")).toContainText("Receiving · 200 OK");
  await expect(pending.getByLabel("Streamed text")).toContainText("Every mile");
  await expect(pending.getByLabel("Streamed text")).not.toContainText("step.");

  const latest = page.getByRole("article", { name: "Latest delivery" });
  await expect(latest.getByLabel("Streamed text")).toHaveText("Every mile starts with one step.");
  await expect(latest).toContainText(/First text after \d+ ms · 6 pieces/);
  await latest.getByRole("tab", { name: "Events (7)" }).click();
  await expect(latest.getByRole("list", { name: "Stream events" })).toContainText("[DONE]");
});

test("stops a stream and keeps what arrived", async ({ page }) => {
  await dispatch(page, `${baseUrl}/hang`);
  const pending = page.getByRole("article", { name: "Dispatching" });
  await expect(pending.getByLabel("Streamed text")).toContainText("Every");
  await pending.getByRole("button", { name: "Stop" }).click();

  const latest = page.getByRole("article", { name: "Latest delivery" });
  await expect(latest).toContainText("Stopped before the response finished.");
  await expect(latest.getByLabel("Streamed text")).toHaveText("Every");
});
