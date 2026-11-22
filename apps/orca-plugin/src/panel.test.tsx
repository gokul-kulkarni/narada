import { assert, hostError, mockHost, mount, test, type TestPanel } from "orca/testing";
import { KEYS, RESPONSE, SNAPSHOT } from "./fixtures/snapshot";
import * as panel from "./panel";
import type { SendInput } from "./protocol";

const TREE = { label: "Saved requests" };
/** Everything the panel drew, text and props alike, for "is this shown" checks. */
const drawn = (view: TestPanel) => JSON.stringify(view.tree());

test("lists saved requests and sends the chosen one with edits", async () => {
  const sent: SendInput[] = [];
  const host = mockHost({
    requests: {
      "workspace.load": () => SNAPSHOT,
      "request.send": (input) => {
        sent.push(input as SendInput);
        return { ok: true as const, response: RESPONSE };
      },
    },
  });
  const view = await mount(panel, { host });
  assert.ok(view.find({ text: "Choose a request to send it." }));

  await view.selectItem(TREE, KEYS.list);
  assert.equal(view.valueOf({ label: "URL" }), "{{base}}/orders?limit=20");
  await view.select({ label: "Environment" }, "env-local");
  await view.type({ label: "URL" }, "&page=2");
  await view.press({ text: "Send" });

  assert.deepEqual(sent, [
    {
      collectionId: "col-1",
      requestId: "req-list",
      environmentId: "env-local",
      draft: {
        method: "GET",
        url: "{{base}}/orders?limit=20&page=2",
        headersText: "Accept: application/json",
        bodyText: "",
      },
    },
  ]);
  assert.ok(view.find({ text: "200 OK" }));
  assert.ok(view.find({ text: "142 ms · 182 B" }));
  assert.deepEqual(view.persisted.plugin, { selectedKey: KEYS.list, environmentId: "env-local" });

  await view.press({ text: "Undo edits" });
  assert.equal(view.valueOf({ label: "URL" }), "{{base}}/orders?limit=20");
  assert.deepEqual(view.errors, []);
  assert.deepEqual(view.refusals, []);
  await view.unmount();
});

test("edits query parameters in the Params tab and keeps them in step with the URL", async () => {
  const host = mockHost({ requests: { "workspace.load": () => SNAPSHOT } });
  const view = await mount(panel, { host, persisted: { plugin: { selectedKey: KEYS.list } } });
  const PARAMS = { label: "Query parameters, one key=value per line" };
  assert.equal(view.valueOf(PARAMS), "limit=20");

  await view.type(PARAMS, "limit=5\nq=red shoes\n# page=2\n", { replace: true });
  assert.equal(view.valueOf({ label: "URL" }), "{{base}}/orders?limit=5&q=red%20shoes");
  // The typed text stays as typed, comment and trailing new line included.
  assert.equal(view.valueOf(PARAMS), "limit=5\nq=red shoes\n# page=2\n");

  await view.type({ label: "URL" }, "&sort={{order}}");
  assert.equal(view.valueOf(PARAMS), "limit=5\nq=red shoes\nsort={{order}}");

  await view.press({ text: "Undo edits" });
  assert.equal(view.valueOf(PARAMS), "limit=20");
  assert.deepEqual(view.errors, []);
  await view.unmount();
});

test("saves a request from a pasted cURL command and opens it", async () => {
  const created: unknown[] = [];
  const host = mockHost({
    requests: {
      "workspace.load": () => SNAPSHOT,
      "request.create": (input) => {
        created.push(input);
        if (created.length === 1) return { ok: false as const, error: "No URL found." };
        return { ok: true as const, key: KEYS.create };
      },
    },
  });
  const view = await mount(panel, { host });
  await view.press({ label: "New request from cURL" });
  assert.equal(view.valueOf({ label: "Collection" }), "col-1");

  await view.type({ label: "cURL command" }, "curl -X POST");
  await view.press({ text: "Save request" });
  assert.ok(drawn(view).includes("No URL found."));

  await view.type({ label: "cURL command" }, "curl https://api.example.com/orders", {
    replace: true,
  });
  await view.type({ label: "Name" }, "All orders");
  await view.select({ label: "Folder" }, "orders");
  await view.press({ text: "Save request" });

  assert.deepEqual(created.at(-1), {
    collectionId: "col-1",
    folderId: "orders",
    name: "All orders",
    curl: "curl https://api.example.com/orders",
  });
  assert.equal(view.find({ label: "cURL command" }), null);
  assert.deepEqual(view.persisted.plugin, { selectedKey: KEYS.create });
  assert.deepEqual(view.errors, []);
  await view.unmount();
});

test("shows a failed send and the scripts notice", async () => {
  const host = mockHost({
    requests: {
      "workspace.load": () => SNAPSHOT,
      "request.send": () => ({ ok: false, error: "fetch failed: connect ECONNREFUSED" }),
    },
  });
  const view = await mount(panel, { host, persisted: { plugin: { selectedKey: KEYS.create } } });
  // The folder holding the chosen request starts open, with the collections.
  assert.ok(drawn(view).includes('"defaultExpanded":["c:col-1","f:col-1:orders"]'));
  assert.ok(drawn(view).includes("scripts run only in the Narada app"));
  await view.press({ text: "Send" });
  assert.ok(drawn(view).includes("fetch failed: connect ECONNREFUSED"));
  await view.unmount();
});

test("asks for secret values the plugin does not have", async () => {
  const saved: unknown[] = [];
  const host = mockHost({
    requests: {
      "workspace.load": () => SNAPSHOT,
      "secret.set": (input) => (saved.push(input), { ok: true }),
    },
  });
  const view = await mount(panel, { host, persisted: { plugin: { environmentId: "env-prod" } } });
  await view.toggle({ text: /1 secret variable needs a value/ });
  await view.type({ label: "token" }, "s3cret", { submit: true });
  assert.deepEqual(saved, [{ environmentId: "env-prod", key: "token", value: "s3cret" }]);
  await view.unmount();
});

test("explains a missing folder and a worker failure", async () => {
  const missing = {
    ...SNAPSHOT,
    tree: [],
    requests: {},
    folder: { ...SNAPSHOT.folder, exists: false },
  };
  const empty = await mount(panel, {
    host: mockHost({ requests: { "workspace.load": () => missing } }),
  });
  assert.ok(drawn(empty).includes("No Narada collections found"));
  await empty.unmount();

  const failing = await mount(panel, {
    host: mockHost({
      requests: {
        "workspace.load": () => {
          throw hostError("unavailable", "The worker is not running");
        },
      },
    }),
  });
  assert.ok(drawn(failing).includes("Could not read the collections"));
  await failing.unmount();
});
