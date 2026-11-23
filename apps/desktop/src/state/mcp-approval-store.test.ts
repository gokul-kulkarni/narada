import { beforeEach, describe, expect, it } from "vitest";
import type { CreatePlan } from "@narada/core/mcp-server/create";
import { newRequest } from "@narada/core/factories";
import { resetMcpApprovals, useMcpApprovalStore } from "./mcp-approval-store";
import { useUiStore } from "./ui-store";

const plan: CreatePlan = {
  kind: "folder",
  collection: { id: null, name: "Shop" },
  folderPath: ["orders"],
  newFolders: ["orders"],
  requests: [],
  variables: [],
  replacedSecrets: [],
  missingVariables: [],
};

describe("useMcpApprovalStore", () => {
  beforeEach(() => resetMcpApprovals());

  it("waits for the user, one request at a time", async () => {
    const first = useMcpApprovalStore.getState().request("Claude Code", { kind: "create", plan });
    const second = useMcpApprovalStore.getState().request("Codex", { kind: "create", plan });
    const queue = useMcpApprovalStore.getState().queue;
    expect(queue.map((q) => q.client)).toEqual(["Claude Code", "Codex"]);
    useMcpApprovalStore.getState().decide(queue[0]?.id ?? "", "approve");
    expect(await first).toBe(true);
    useMcpApprovalStore.getState().decide(queue[1]?.id ?? "", "cancel");
    expect(await second).toBe(false);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("approves the rest of the session at once when asked", async () => {
    const first = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
    const pending = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
    const id = useMcpApprovalStore.getState().queue[0]?.id ?? "";
    useMcpApprovalStore.getState().decide(id, "allow-session");
    expect(await first).toBe(true);
    expect(await pending).toBe(true);
    expect(await useMcpApprovalStore.getState().request(null, { kind: "create", plan })).toBe(true);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("ignores a decision for something no longer waiting", () => {
    useMcpApprovalStore.getState().decide("gone", "approve");
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("withdraws a request the agent stopped waiting for, and says so", async () => {
    const answer = useMcpApprovalStore
      .getState()
      .request("Claude Code", { kind: "create", plan }, "call-1");
    useMcpApprovalStore.getState().withdraw("call-1");
    expect(await answer).toBe(false);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
    expect(useUiStore.getState().notice).toBe("Claude Code stopped waiting, so nothing was added.");
    useMcpApprovalStore.getState().withdraw("unknown");
  });

  it("allows a host for the session, sending queued requests to it too", async () => {
    const send = (host: string | null) => ({
      kind: "send" as const,
      request: newRequest({ url: "https://shop.dev/x" }),
      host,
      environment: null,
      saved: true,
    });
    const first = useMcpApprovalStore.getState().request(null, send("shop.dev"));
    const sameHost = useMcpApprovalStore.getState().request(null, send("shop.dev"));
    const otherHost = useMcpApprovalStore.getState().request(null, send("evil.dev"));
    const id = useMcpApprovalStore.getState().queue[0]?.id ?? "";
    useMcpApprovalStore.getState().decide(id, "allow-session");
    expect(await first).toBe(true);
    expect(await sameHost).toBe(true);
    expect(
      useMcpApprovalStore.getState().queue.map((p) => p.subject.kind === "send" && p.subject.host),
    ).toEqual(["evil.dev"]);
    expect(await useMcpApprovalStore.getState().request(null, send("shop.dev"))).toBe(true);
    expect(useMcpApprovalStore.getState().allowedForSession).toBe(false);
    useMcpApprovalStore
      .getState()
      .decide(useMcpApprovalStore.getState().queue[0]?.id ?? "", "cancel");
    expect(await otherHost).toBe(false);
  });
});
