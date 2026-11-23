import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "../factories";
import type { Collection, CollectionItem } from "../model";
import {
  applyCreatePlan,
  createResult,
  planCreateCollection,
  planCreateFolder,
  planCreateRequests,
  type CreatePlan,
} from "./create";
import type { ToolWorkspace } from "./tools";

const shop: Collection = {
  ...newCollection("Shop"),
  id: "c1",
  variables: [newKeyValue("baseUrl", "https://shop.dev")],
  items: [
    {
      kind: "folder",
      id: "f1",
      name: "orders",
      auth: { type: "inherit" },
      items: [{ kind: "request", request: newRequest({ id: "r1", name: "Create order" }) }],
    },
  ],
};

const workspace = (overrides: Partial<ToolWorkspace> = {}): ToolWorkspace => ({
  collections: [shop],
  environments: [
    {
      ...newEnvironment("dev"),
      variables: [{ ...newKeyValue("token", "sk-live-777777"), secret: true }],
    },
  ],
  globals: [],
  activeEnvironmentId: null,
  history: [],
  ...overrides,
});

function planOf(result: ReturnType<typeof planCreateRequests>): CreatePlan {
  if ("error" in result) throw new Error(result.error);
  return result.plan;
}

const names = (items: readonly CollectionItem[]): unknown =>
  items.map((item) =>
    item.kind === "folder" ? { [item.name]: names(item.items) } : item.request.name,
  );

describe("planCreateRequests", () => {
  it("adds to an existing folder, renaming a name that is already taken", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "shop",
        folder: "orders",
        requests: [
          { name: "Create order", method: "POST", url: "{{baseUrl}}/orders" },
          { name: "Create order", method: "POST", url: "{{baseUrl}}/orders/bulk" },
          { name: "List orders", url: "{{baseUrl}}/orders" },
        ],
      }),
    );
    expect(plan.collection).toEqual({ id: "c1", name: "Shop" });
    expect(plan.folderPath).toEqual(["orders"]);
    expect(plan.newFolders).toEqual([]);
    expect(plan.requests.map((r) => [r.request.name, r.renamedFrom, r.request.method])).toEqual([
      ["Create order (2)", "Create order", "POST"],
      ["Create order (3)", "Create order", "POST"],
      ["List orders", null, "GET"],
    ]);
  });

  it("creates missing folders, and a missing collection, by name", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "Billing",
        folder: " invoices / admin /",
        requests: [{ name: "Void", method: "DELETE", url: "https://billing.dev/x" }],
      }),
    );
    expect(plan.collection).toEqual({ id: null, name: "Billing" });
    expect(plan.folderPath).toEqual(["invoices", "admin"]);
    expect(plan.newFolders).toEqual(["invoices", "admin"]);
  });

  it("turns literal secrets into variables and says which", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "c1",
        requests: [
          {
            name: "Me",
            url: "https://shop.dev/me?api_key=abc123def&page=2",
            headers: [
              { key: "Authorization", value: "Bearer sk-live-777777" },
              { key: "X-Api-Key", value: "literal-key-123" },
              { key: "Accept", value: "application/json" },
            ],
            body: { mode: "raw", language: "json", raw: '{"password":"hunter22","user":"ann"}' },
          },
        ],
      }),
    );
    const [planned] = plan.requests;
    if (!planned || planned.request.body.mode !== "raw") throw new Error();
    expect(planned.request.url).toBe("https://shop.dev/me?api_key={{apiKey}}&page=2");
    expect(planned.request.headers.map((h) => [h.key, h.value])).toEqual([
      ["Authorization", "Bearer {{token}}"],
      ["X-Api-Key", "{{xApiKey}}"],
      ["Accept", "application/json"],
    ]);
    expect(JSON.parse(planned.request.body.raw)).toEqual({ password: "{{password}}", user: "ann" });
    expect(plan.replacedSecrets).toEqual(["apiKey", "password", "token", "xApiKey"]);
    expect(planned.request.auth).toEqual({ type: "inherit" });
  });

  it("lists variables that no scope defines", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "Shop",
        requests: [
          {
            name: "A",
            url: "{{baseUrl}}/a/{{orderId}}",
            headers: [{ key: "X-Tenant", value: "{{tenant}}" }],
          },
        ],
      }),
    );
    expect(plan.missingVariables).toEqual(["orderId", "tenant"]);
  });

  it("explains arguments it cannot use", () => {
    expect(planCreateRequests(workspace(), { collection: "Shop", requests: [] })).toEqual({
      error: expect.stringMatching(/^requests: /),
    });
    expect(
      planCreateRequests(workspace(), {
        collection: "Shop",
        requests: [{ name: "x", url: "u", method: "FETCH" }],
      }),
    ).toEqual({ error: expect.stringMatching(/method/) });
    const twins = workspace({ collections: [shop, { ...shop, id: "c2" }] });
    expect(
      planCreateRequests(twins, { collection: "Shop", requests: [{ name: "x", url: "u" }] }),
    ).toEqual({
      error:
        'Several collections are named "Shop". Give the collection\'s id instead (see list_collections).',
    });
  });
});

describe("planCreateFolder and planCreateCollection", () => {
  it("plans a nested folder, and says when it already exists", () => {
    const plan = planOf(
      planCreateFolder(workspace(), { collection: "Shop", folder: "orders/refunds" }),
    );
    expect(plan).toMatchObject({
      kind: "folder",
      folderPath: ["orders", "refunds"],
      newFolders: ["refunds"],
    });
    expect(planCreateFolder(workspace(), { collection: "Shop", folder: "orders" })).toEqual({
      error: 'The folder "orders" already exists in "Shop".',
    });
  });

  it("plans a new collection with non-secret variables, renaming a taken name", () => {
    const plan = planOf(
      planCreateCollection(workspace(), {
        name: "Shop",
        variables: [
          { key: "baseUrl", value: "https://shop.dev" },
          { key: "apiToken", value: "should-not-be-stored" },
        ],
      }),
    );
    expect(plan.collection).toEqual({ id: null, name: "Shop (2)" });
    expect(plan.variables.map((v) => [v.key, v.value])).toEqual([
      ["baseUrl", "https://shop.dev"],
      ["apiToken", ""],
    ]);
    expect(plan.replacedSecrets).toEqual(["apiToken"]);
  });
});

describe("applyCreatePlan", () => {
  it("adds requests into existing and new folders without touching anything else", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "Shop",
        folder: "orders/refunds",
        requests: [{ name: "Refund", method: "POST", url: "{{baseUrl}}/refunds" }],
      }),
    );
    const { collection, isNew } = applyCreatePlan([shop], plan);
    expect(isNew).toBe(false);
    expect(collection.id).toBe("c1");
    expect(names(collection.items)).toEqual([
      { orders: ["Create order", { refunds: ["Refund"] }] },
    ]);
    expect(names(shop.items)).toEqual([{ orders: ["Create order"] }]);
  });

  it("builds a new collection", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "Billing",
        folder: "invoices",
        requests: [{ name: "List", url: "https://billing.dev/invoices" }],
      }),
    );
    const { collection, isNew } = applyCreatePlan([shop], plan);
    expect(isNew).toBe(true);
    expect(collection.name).toBe("Billing");
    expect(names(collection.items)).toEqual([{ invoices: ["List"] }]);
  });
});

describe("createResult", () => {
  it("tells the agent what was created, so it can try the requests next", () => {
    const plan = planOf(
      planCreateRequests(workspace(), {
        collection: "Shop",
        folder: "orders",
        requests: [{ name: "Create order", url: "{{baseUrl}}/orders/{{id}}" }],
      }),
    );
    const applied = applyCreatePlan([shop], plan);
    expect(createResult(plan, applied)).toEqual({
      collection: { id: "c1", name: "Shop", created: false },
      folder: "orders",
      foldersCreated: [],
      requests: [
        { id: plan.requests[0]?.request.id, name: "Create order (2)", renamedFrom: "Create order" },
      ],
      replacedSecrets: [],
      missingVariables: ["id"],
    });
  });
});
