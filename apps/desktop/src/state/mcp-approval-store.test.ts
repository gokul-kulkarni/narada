import { beforeEach, describe, expect, it } from "vitest";
import type { CreatePlan } from "@narada/core/mcp-server/create";
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
    const first = useMcpApprovalStore.getState().request("Claude Code", plan);
    const second = useMcpApprovalStore.getState().request("Codex", plan);
    const queue = useMcpApprovalStore.getState().queue;
    expect(queue.map((q) => q.client)).toEqual(["Claude Code", "Codex"]);
    useMcpApprovalStore.getState().decide(queue[0]?.id ?? "", "add");
    expect(await first).toBe(true);
    useMcpApprovalStore.getState().decide(queue[1]?.id ?? "", "cancel");
    expect(await second).toBe(false);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("approves the rest of the session at once when asked", async () => {
    const first = useMcpApprovalStore.getState().request(null, plan);
    const pending = useMcpApprovalStore.getState().request(null, plan);
    const id = useMcpApprovalStore.getState().queue[0]?.id ?? "";
    useMcpApprovalStore.getState().decide(id, "allow-session");
    expect(await first).toBe(true);
    expect(await pending).toBe(true);
    expect(await useMcpApprovalStore.getState().request(null, plan)).toBe(true);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("ignores a decision for something no longer waiting", () => {
    useMcpApprovalStore.getState().decide("gone", "add");
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
  });

  it("withdraws a request the agent stopped waiting for, and says so", async () => {
    const answer = useMcpApprovalStore.getState().request("Claude Code", plan, "call-1");
    useMcpApprovalStore.getState().withdraw("call-1");
    expect(await answer).toBe(false);
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
    expect(useUiStore.getState().notice).toBe("Claude Code stopped waiting, so nothing was added.");
    useMcpApprovalStore.getState().withdraw("unknown");
  });
});
