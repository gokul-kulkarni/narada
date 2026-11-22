// Runs the bundled worker (dist/worker.js, so @narada/core is inside it) over Orca's mock host,
// against a real collections folder on disk and a local HTTP server.
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before } from "node:test";
import { assert, mockHost, mountWorker, test } from "orca/testing";
import type { CreateResult, SendResult, WorkspaceSnapshot } from "./protocol";

const main = (await import(
  new URL("../dist/worker.js", import.meta.url).href
)) as typeof import("./worker");

const COLLECTION = {
  info: {
    _postman_id: "col-1",
    name: "Shop API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  variable: [{ key: "base", value: "http://127.0.0.1:1" }],
  item: [
    {
      id: "fld-orders",
      name: "Orders",
      item: [
        {
          id: "req-list",
          name: "List orders",
          request: {
            method: "GET",
            header: [{ key: "Accept", value: "application/json" }],
            url: { raw: "{{base}}/orders?limit=2" },
          },
        },
        {
          id: "req-create",
          name: "Create order",
          request: {
            method: "POST",
            header: [],
            body: { mode: "raw", raw: '{"sku":"{{sku}}"}', options: { raw: { language: "json" } } },
            url: { raw: "{{base}}/orders" },
          },
        },
      ],
    },
  ],
};

const ENVIRONMENT = {
  id: "env-1",
  name: "Local",
  values: [
    { key: "sku", value: "A-1", enabled: true },
    { key: "token", value: "", enabled: true, type: "secret" },
  ],
};

let folder: string;
let server: http.Server;
let base: string;
const received: { method?: string; url?: string; auth?: string; body: string }[] = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, echo: body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  folder = await fs.mkdtemp(path.join(os.tmpdir(), "narada-orca-"));
  await fs.mkdir(path.join(folder, "Collections"));
  await fs.mkdir(path.join(folder, "Environments"));
  const collection = { ...COLLECTION, variable: [{ key: "base", value: base }] };
  await fs.writeFile(
    path.join(folder, "Collections", "shop.postman_collection.json"),
    JSON.stringify(collection),
  );
  await fs.writeFile(path.join(folder, "Collections", "broken.postman_collection.json"), "{nope");
  await fs.writeFile(path.join(folder, "Collections", "notes.txt"), "not a collection");
  await fs.writeFile(
    path.join(folder, "Environments", "local.postman_environment.json"),
    JSON.stringify(ENVIRONMENT),
  );
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(folder, { recursive: true, force: true });
});

const mount = (secrets: Record<string, string> = {}) =>
  mountWorker(main, { host: mockHost({ settings: { collectionsFolder: folder }, secrets }) });

const firstRequestKey = (snapshot: WorkspaceSnapshot, name: string) => {
  const found = Object.values(snapshot.requests).find((r) => r.name === name);
  assert.ok(found, `missing ${name}`);
  return found;
};

test("lists collections from the folder and reports unreadable files", async () => {
  const worker = await mount();
  const snapshot = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  assert.deepEqual(snapshot.folder, { path: folder, source: "setting", exists: true });
  assert.equal(snapshot.tree[0].label, "Shop API");
  assert.equal(snapshot.tree[0].children?.[0].label, "Orders");
  assert.deepEqual(
    snapshot.errors.map((e) => e.fileName),
    ["broken.postman_collection.json"],
  );
  const list = firstRequestKey(snapshot, "List orders");
  assert.equal(list.location, "Shop API / Orders");
  assert.equal(list.headersText, "Accept: application/json");
  assert.equal(list.authLabel, "Bearer token, from the collection");
  assert.deepEqual(snapshot.environments, [
    { id: "env-1", name: "Local", missingSecrets: ["token"] },
  ]);
  assert.deepEqual(worker.refusals, []);
  await worker.deactivate();
});

test("sends with the panel's edits, the environment and inherited auth", async () => {
  const worker = await mount({ "env:env-1:token": "s3cret" });
  const snapshot = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  assert.deepEqual(snapshot.environments[0].missingSecrets, []);
  const create = firstRequestKey(snapshot, "Create order");
  const result = (await worker.request("request.send", {
    collectionId: create.collectionId,
    requestId: create.requestId,
    environmentId: "env-1",
    draft: {
      method: "PUT",
      url: "{{base}}/orders/7",
      headersText: "X-Trace: 1\n# X-Off: 2",
      bodyText: create.bodyText,
    },
  })) as SendResult;
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.response.status, 201);
  assert.equal(result.response.sentUrl, `${base}/orders/7`);
  assert.equal(result.response.contentType, "application/json");
  assert.match(result.response.preview, /\n {2}"ok": true/);
  const last = received.at(-1);
  assert.deepEqual(last, {
    method: "PUT",
    url: "/orders/7",
    auth: "Bearer s3cret",
    body: '{"sku":"A-1"}',
  });
  await worker.deactivate();
});

test("answers send failures as data", async () => {
  const worker = await mount();
  const snapshot = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  const list = firstRequestKey(snapshot, "List orders");
  const send = (draft: { method: string; url: string }) =>
    worker.request("request.send", {
      collectionId: list.collectionId,
      requestId: list.requestId,
      environmentId: null,
      draft: { ...draft, headersText: "", bodyText: "" },
    }) as Promise<SendResult>;

  const refused = await send({ method: "GET", url: "http://127.0.0.1:1/nothing" });
  assert.equal(refused.ok, false);
  assert.match(!refused.ok ? refused.error : "", /fetch failed/);

  const badMethod = await send({ method: "BREW", url: base });
  assert.deepEqual(badMethod, { ok: false, error: "Unsupported method: BREW" });

  const gone = (await worker.request("request.send", {
    collectionId: list.collectionId,
    requestId: "missing",
    environmentId: null,
    draft: { method: "GET", url: base, headersText: "", bodyText: "" },
  })) as SendResult;
  assert.equal(gone.ok, false);
  await worker.deactivate();
});

test("adds a request from a cURL command to the chosen folder", async () => {
  const worker = await mount();
  const before = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  assert.deepEqual(before.collections, [
    { id: "col-1", name: "Shop API", folders: [{ id: "fld-orders", label: "Orders" }] },
  ]);
  const file = path.join(folder, "Collections", "shop.postman_collection.json");
  const original = await fs.readFile(file, "utf8");

  const created = (await worker.request("request.create", {
    collectionId: "col-1",
    folderId: "fld-orders",
    name: "",
    curl: `curl -X PATCH '{{base}}/orders/7?notify=1' -H 'Content-Type: application/json' -d '{"qty":2}'`,
  })) as CreateResult;
  assert.ok(created.ok, JSON.stringify(created));

  const after = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  const added = after.requests[created.key];
  assert.equal(added.name, "PATCH /orders/7");
  assert.equal(added.location, "Shop API / Orders");
  assert.equal(added.url, "{{base}}/orders/7?notify=1");
  assert.equal(added.headersText, "Content-Type: application/json");
  assert.equal(added.bodyText, '{"qty":2}');
  // Written to the file it came from, still Postman v2.1, with the other requests kept.
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.match(saved.info.schema, /v2\.1\.0/);
  assert.deepEqual(
    saved.item[0].item.map((i: { name: string }) => i.name),
    ["List orders", "Create order", "PATCH /orders/7"],
  );
  assert.deepEqual(await fs.readdir(path.join(folder, "Collections")), [
    "broken.postman_collection.json",
    "notes.txt",
    "shop.postman_collection.json",
  ]);
  await fs.writeFile(file, original);
  await worker.deactivate();
});

test("refuses a bad cURL command or a collection that is gone", async () => {
  const worker = await mount();
  const create = (input: { collectionId: string; folderId: string | null; curl: string }) =>
    worker.request("request.create", { name: "x", ...input }) as Promise<CreateResult>;
  assert.deepEqual(await create({ collectionId: "col-1", folderId: null, curl: "wget x" }), {
    ok: false,
    error: "Not a curl command (it should start with `curl`).",
  });
  const gone = await create({ collectionId: "nope", folderId: null, curl: "curl http://a" });
  assert.equal(gone.ok, false);
  assert.match(!gone.ok ? gone.error : "", /no longer in/);
  const noFolder = await create({ collectionId: "col-1", folderId: "nope", curl: "curl http://a" });
  assert.match(!noFolder.ok ? noFolder.error : "", /folder/);
  await worker.deactivate();
});

test("keeps secret values in the plugin's secrets", async () => {
  const host = mockHost({ settings: { collectionsFolder: folder } });
  const worker = await mountWorker(main, { host });
  await worker.request("secret.set", { environmentId: "env-1", key: "token", value: "abc" });
  assert.deepEqual(host.data().secrets, { "env:env-1:token": "abc" });
  await worker.deactivate();
});

test("reports a missing folder instead of failing", async () => {
  const host = mockHost({ settings: { collectionsFolder: path.join(folder, "nope") } });
  const worker = await mountWorker(main, { host });
  const snapshot = (await worker.request("workspace.load")) as WorkspaceSnapshot;
  assert.equal(snapshot.folder.exists, false);
  assert.deepEqual(snapshot.tree, []);
  await worker.deactivate();
});
