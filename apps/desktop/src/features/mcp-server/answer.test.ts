import { beforeEach, describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "@narada/core/factories";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { answerToolCall } from "./answer";

const SECRET = "sk-live-abcdef123";

function seed() {
  const request = newRequest({
    id: "r1",
    name: "Orders",
    url: "{{baseUrl}}/orders",
    method: "POST",
  });
  const collection = {
    ...newCollection("Shop"),
    id: "c1",
    items: [{ kind: "request" as const, request }],
  };
  const environment = {
    ...newEnvironment("dev"),
    id: "e1",
    variables: [{ ...newKeyValue("token", SECRET), secret: true }],
  };
  useWorkspaceStore.setState({
    collections: [collection],
    environments: [environment],
    activeEnvironmentId: "e1",
  });
  useHistoryStore.setState({
    entries: [
      {
        id: "h1",
        sentAt: "2026-11-23T10:00:00.000Z",
        request: { ...request, url: `https://shop.dev/orders?key=${SECRET}` },
        status: 401,
        timeMs: 5,
        environment: "dev",
      },
    ],
  });
  return request;
}

describe("answerToolCall", () => {
  beforeEach(() => {
    resetStores();
  });

  it("answers the read-only tools from the workspace, without secrets", () => {
    seed();
    const collections = answerToolCall("list_collections", {});
    expect(collections).toMatchObject({ result: [{ id: "c1", name: "Shop" }] });
    expect(answerToolCall("get_request", { requestId: "r1" })).toMatchObject({
      result: { collection: "Shop", request: { name: "Orders" } },
    });
    expect(answerToolCall("list_environments", {})).toMatchObject({
      result: [{ name: "dev", active: true, variables: [{ name: "token", secret: true }] }],
    });
    const history = answerToolCall("list_history", { limit: 5 });
    expect(JSON.stringify(history)).not.toContain(SECRET);
    expect(history).toMatchObject({
      result: [{ status: 401, url: "https://shop.dev/orders?key=[secret:token]" }],
    });
  });

  it("describes the active tab's latest delivery", () => {
    const request = seed();
    const tabId = useTabsStore
      .getState()
      .openRequest(request, { collectionId: "c1", requestId: "r1" });
    expect(answerToolCall("get_last_delivery", {})).toEqual({
      error: "The open request hasn't been sent yet. Ask the user to dispatch it in Narada.",
    });
    useTabsStore.getState().patchTab(tabId, {
      delivery: {
        protocol: "http",
        response: {
          status: 401,
          statusText: "Unauthorized",
          headers: [],
          body: `{"error":"bad token ${SECRET}"}`,
          isBinary: false,
          sizeBytes: 20,
          timeMs: 9,
        },
      },
    });
    const delivery = answerToolCall("get_last_delivery", {});
    expect(delivery).toMatchObject({
      result: { outcome: { kind: "http", response: { status: 401 } }, environment: "dev" },
    });
    expect(JSON.stringify(delivery)).not.toContain(SECRET);
  });

  it("says when no request is open", () => {
    seed();
    expect(answerToolCall("get_last_delivery", {})).toEqual({
      error: "No request is open in Narada.",
    });
  });

  it("refuses tools it does not know", () => {
    expect(answerToolCall("delete_everything", {})).toEqual({
      error: 'Narada has no tool "delete_everything".',
    });
  });
});
