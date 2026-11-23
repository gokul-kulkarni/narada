import { beforeEach, describe, expect, it, vi } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "@narada/core/factories";
import { useHistoryStore } from "../../state/history-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
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

  it("answers the read-only tools from the workspace, without secrets", async () => {
    seed();
    const collections = await answerToolCall("list_collections", {});
    expect(collections).toMatchObject({ result: [{ id: "c1", name: "Shop" }] });
    expect(await answerToolCall("get_request", { requestId: "r1" })).toMatchObject({
      result: { collection: "Shop", request: { name: "Orders" } },
    });
    expect(await answerToolCall("list_environments", {})).toMatchObject({
      result: [{ name: "dev", active: true, variables: [{ name: "token", secret: true }] }],
    });
    const history = await answerToolCall("list_history", { limit: 5 });
    expect(JSON.stringify(history)).not.toContain(SECRET);
    expect(history).toMatchObject({
      result: [{ status: 401, url: "https://shop.dev/orders?key=[secret:token]" }],
    });
  });

  it("describes the active tab's latest delivery", async () => {
    const request = seed();
    const tabId = useTabsStore
      .getState()
      .openRequest(request, { collectionId: "c1", requestId: "r1" });
    expect(await answerToolCall("get_last_delivery", {})).toEqual({
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
    const delivery = await answerToolCall("get_last_delivery", {});
    expect(delivery).toMatchObject({
      result: { outcome: { kind: "http", response: { status: 401 } }, environment: "dev" },
    });
    expect(JSON.stringify(delivery)).not.toContain(SECRET);
  });

  it("says when no request is open", async () => {
    seed();
    expect(await answerToolCall("get_last_delivery", {})).toEqual({
      error: "No request is open in Narada.",
    });
  });

  it("refuses tools it does not know", async () => {
    expect(await answerToolCall("delete_everything", {})).toEqual({
      error: 'Narada has no tool "delete_everything".',
    });
  });

  describe("creating", () => {
    const decideNext = async (decision: "add" | "cancel") => {
      await vi.waitFor(() => expect(useMcpApprovalStore.getState().queue).toHaveLength(1));
      const [pending] = useMcpApprovalStore.getState().queue;
      useMcpApprovalStore.getState().decide(pending?.id ?? "", decision);
      return pending;
    };

    it("adds requests after the user approves, and opens the first one", async () => {
      seed();
      const answer = answerToolCall(
        "create_request",
        {
          collection: "Shop",
          folder: "orders",
          requests: [{ name: "List orders", url: "{{baseUrl}}/orders" }],
        },
        "Claude Code",
      );
      const pending = await decideNext("add");
      expect(pending?.client).toBe("Claude Code");
      const result = await answer;
      expect(result).toMatchObject({
        result: {
          collection: { id: "c1", created: false },
          folder: "orders",
          foldersCreated: ["orders"],
        },
      });
      const shop = useWorkspaceStore.getState().collections.find((c) => c.id === "c1");
      expect(JSON.stringify(shop)).toContain("List orders");
      expect(selectActiveTab(useTabsStore.getState())?.request.name).toBe("List orders");
      expect(useUiStore.getState().notice).toBe("Added 1 request to Shop / orders.");
    });

    it("changes nothing when the user declines", async () => {
      seed();
      const before = useWorkspaceStore.getState().collections;
      const answer = answerToolCall("create_folder", { collection: "Shop", folder: "admin" }, null);
      await decideNext("cancel");
      expect(await answer).toEqual({ error: "The user declined, so nothing was added." });
      expect(useWorkspaceStore.getState().collections).toBe(before);
    });

    it("creates a new collection", async () => {
      seed();
      const answer = answerToolCall("create_collection", { name: "Billing" }, null);
      await decideNext("add");
      expect(await answer).toMatchObject({
        result: { collection: { name: "Billing", created: true } },
      });
      expect(useWorkspaceStore.getState().collections.map((c) => c.name)).toEqual([
        "Shop",
        "Billing",
      ]);
      expect(useUiStore.getState().notice).toBe('Added the collection "Billing".');
    });

    it("explains bad arguments without asking the user", async () => {
      seed();
      expect(
        await answerToolCall("create_request", { collection: "Shop", requests: [] }),
      ).toMatchObject({
        error: expect.stringMatching(/^requests: /),
      });
      expect(useMcpApprovalStore.getState().queue).toEqual([]);
    });
  });
});
