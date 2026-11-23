import { create } from "zustand";
import type { CreatePlan } from "@narada/core/mcp-server/create";
import { newId } from "@narada/core/ids";
import { useUiStore } from "./ui-store";

/** A change a connected agent wants to make, waiting for the user. */
export interface PendingApproval {
  readonly id: string;
  /** The agent's name as it introduced itself; null if it didn't. */
  readonly client: string | null;
  readonly plan: CreatePlan;
  /** The tool call it answers, so it can be withdrawn if the agent stops waiting. */
  readonly callId: string | null;
}

export type Decision = "add" | "cancel" | "allow-session";

interface ApprovalState {
  readonly queue: readonly PendingApproval[];
  /** The user chose "Allow for this session": additions go ahead until Narada restarts. */
  readonly allowedForSession: boolean;
  /** Resolves true when the user approves `plan`. */
  request: (client: string | null, plan: CreatePlan, callId?: string | null) => Promise<boolean>;
  decide: (id: string, decision: Decision) => void;
  /** The agent gave up on the call, so a late approval must not add anything. */
  withdraw: (callId: string) => void;
}

/** Resolvers of waiting requests, by id; kept out of the store's plain state. */
const waiting = new Map<string, (approved: boolean) => void>();

export const useMcpApprovalStore = create<ApprovalState>()((set, get) => ({
  queue: [],
  allowedForSession: false,

  request: (client, plan, callId = null) => {
    if (get().allowedForSession) return Promise.resolve(true);
    const id = newId();
    set((s) => ({ queue: [...s.queue, { id, client, plan, callId }] }));
    return new Promise((resolve) => waiting.set(id, resolve));
  },

  decide: (id, decision) => {
    if (!get().queue.some((item) => item.id === id)) return;
    if (decision === "allow-session") {
      // Everything already waiting goes ahead too.
      get().queue.forEach((item) => waiting.get(item.id)?.(true));
      waiting.clear();
      set({ queue: [], allowedForSession: true });
      return;
    }
    waiting.get(id)?.(decision === "add");
    waiting.delete(id);
    set((s) => ({ queue: s.queue.filter((item) => item.id !== id) }));
  },

  withdraw: (callId) => {
    const item = get().queue.find((pending) => pending.callId === callId);
    if (!item) return;
    waiting.get(item.id)?.(false);
    waiting.delete(item.id);
    set((s) => ({ queue: s.queue.filter((pending) => pending.id !== item.id) }));
    useUiStore
      .getState()
      .notify(`${item.client ?? "The agent"} stopped waiting, so nothing was added.`);
  },
}));

/** Back to a fresh state, for tests. */
export function resetMcpApprovals(): void {
  waiting.forEach((resolve) => resolve(false));
  waiting.clear();
  useMcpApprovalStore.setState({ queue: [], allowedForSession: false });
}
