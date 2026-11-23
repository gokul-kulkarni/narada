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
    const decideNext = async (decision: "approve" | "cancel") => {
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
      const pending = await decideNext("approve");
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
      await decideNext("approve");
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

  describe("changing and sending", () => {
    const decide = async (decision: "approve" | "cancel") => {
      await vi.waitFor(() => expect(useMcpApprovalStore.getState().queue).toHaveLength(1));
      const [pending] = useMcpApprovalStore.getState().queue;
      useMcpApprovalStore.getState().decide(pending?.id ?? "", decision);
      return pending;
    };

    it("saves an approved change and refreshes the request's clean tab", async () => {
      const request = seed();
      const tabId = useTabsStore
        .getState()
        .openRequest(request, { collectionId: "c1", requestId: "r1" });
      const answer = answerToolCall(
        "update_request",
        { requestId: "r1", changes: { method: "PUT" } },
        "Codex",
      );
      const pending = await decide("approve");
      expect(pending?.subject.kind).toBe("update");
      expect(await answer).toMatchObject({ result: { request: { id: "r1", method: "PUT" } } });
      expect(JSON.stringify(useWorkspaceStore.getState().collections)).toContain('"method":"PUT"');
      expect(useTabsStore.getState().tabs.find((t) => t.id === tabId)?.request).toMatchObject({
        method: "PUT",
      });
      expect(useUiStore.getState().notice).toBe('Updated "Orders" in Shop.');
    });

    it("changes nothing when the user declines a change", async () => {
      seed();
      const before = useWorkspaceStore.getState().collections;
      const answer = answerToolCall("update_request", {
        requestId: "r1",
        changes: { method: "PUT" },
      });
      await decide("cancel");
      expect(await answer).toEqual({ error: "The user declined, so nothing changed." });
      expect(useWorkspaceStore.getState().collections).toBe(before);
    });

    it("sends an approved request like Dispatch and returns the redacted response", async () => {
      seed();
      useWorkspaceStore.setState((s) => ({
        environments: s.environments.map((e) => ({
          ...e,
          variables: [
            ...e.variables,
            { id: "b", key: "baseUrl", value: "https://shop.dev", enabled: true, secret: false },
          ],
        })),
      }));
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(`{"error":"bad ${SECRET}"}`, { status: 401 }));
      const answer = answerToolCall("send_request", { requestId: "r1" }, "Claude Code");
      const pending = await decide("approve");
      expect(pending?.subject).toMatchObject({
        kind: "send",
        host: "shop.dev",
        environment: "dev",
        saved: true,
      });
      const result = await answer;
      expect(result).toMatchObject({
        result: { outcome: { kind: "http", response: { status: 401 } } },
      });
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("https://shop.dev/orders");
      expect(selectActiveTab(useTabsStore.getState())?.delivery).not.toBeNull();
      vi.restoreAllMocks();
    });

    it("refuses to send over the user's unsaved edits, and sends nothing when declined", async () => {
      const request = seed();
      const tabId = useTabsStore
        .getState()
        .openRequest(request, { collectionId: "c1", requestId: "r1" });
      useTabsStore.getState().patchTab(tabId, { dirty: true });
      expect(await answerToolCall("send_request", { requestId: "r1" })).toEqual({
        error:
          "The user has unsaved changes to this request in Narada. Ask them to save or discard them first.",
      });
      useTabsStore.getState().patchTab(tabId, { dirty: false });
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const answer = answerToolCall("send_request", {
        request: { name: "Probe", url: "http://localhost:9/x" },
      });
      await decide("cancel");
      expect(await answer).toEqual({ error: "The user declined, so nothing was sent." });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });
});
