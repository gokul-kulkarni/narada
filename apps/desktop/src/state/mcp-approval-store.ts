import { create } from "zustand";
import type { CreatePlan } from "@narada/core/mcp-server/create";
import type { UpdatePlan } from "@narada/core/mcp-server/update";
import type { HttpRequestDef } from "@narada/core/model";
import { newId } from "@narada/core/ids";
import { useUiStore } from "./ui-store";

/** What a connected agent wants to do, shown to the user before anything happens. */
export type ApprovalSubject =
  | { readonly kind: "create"; readonly plan: CreatePlan }
  | { readonly kind: "update"; readonly plan: UpdatePlan }
  | {
      readonly kind: "send";
      readonly request: HttpRequestDef;
      /** Where it goes once variables are filled in; null if that isn't known. */
      readonly host: string | null;
      readonly environment: string | null;
      /** A saved request, rather than a one-off. */
      readonly saved: boolean;
    };

export interface PendingApproval {
  readonly id: string;
  /** The agent's name as it introduced itself; null if it didn't. */
  readonly client: string | null;
  readonly subject: ApprovalSubject;
  /** The tool call it answers, so it can be withdrawn if the agent stops waiting. */
  readonly callId: string | null;
}

/**
 * "allow-session" means: additions go ahead until Narada restarts (create), or requests to
 * this host are sent (send). Changes to saved requests are always asked about.
 */
export type Decision = "approve" | "cancel" | "allow-session";

/** How an approval request ended. */
export type Outcome = "approved" | "declined" | "withdrawn";

interface ApprovalState {
  readonly queue: readonly PendingApproval[];
  readonly allowedForSession: boolean;
  readonly allowedHosts: ReadonlySet<string>;
  request: (
    client: string | null,
    subject: ApprovalSubject,
    callId?: string | null,
  ) => Promise<Outcome>;
  decide: (id: string, decision: Decision) => void;
  /** The agent gave up on the call, so a late approval must not do anything. */
  withdraw: (callId: string) => void;
}

/** Resolvers of waiting requests, by id; kept out of the store's plain state. */
const waiting = new Map<string, (outcome: Outcome) => void>();

function preApproved(subject: ApprovalSubject, state: ApprovalState): boolean {
  if (subject.kind === "create") return state.allowedForSession;
  if (subject.kind === "send") return subject.host !== null && state.allowedHosts.has(subject.host);
  return false;
}

const settle = (id: string, outcome: Outcome) => {
  waiting.get(id)?.(outcome);
  waiting.delete(id);
};

export const useMcpApprovalStore = create<ApprovalState>()((set, get) => ({
  queue: [],
  allowedForSession: false,
  allowedHosts: new Set(),

  request: (client, subject, callId = null) => {
    if (preApproved(subject, get())) return Promise.resolve("approved");
    const id = newId();
    set((s) => ({ queue: [...s.queue, { id, client, subject, callId }] }));
    return new Promise((resolve) => waiting.set(id, resolve));
  },

  decide: (id, decision) => {
    const item = get().queue.find((pending) => pending.id === id);
    if (!item) return;
    const { subject } = item;
    if (decision === "allow-session" && subject.kind === "create") {
      set({ allowedForSession: true });
    }
    if (decision === "allow-session" && subject.kind === "send" && subject.host) {
      const host = subject.host;
      set((s) => ({ allowedHosts: new Set([...s.allowedHosts, host]) }));
    }
    settle(id, decision === "cancel" ? "declined" : "approved");
    // Anything else now allowed for the session goes ahead too.
    const state = get();
    const [ready, still] = [
      state.queue.filter((p) => p.id !== id && preApproved(p.subject, state)),
      state.queue.filter((p) => p.id !== id && !preApproved(p.subject, state)),
    ];
    ready.forEach((p) => settle(p.id, "approved"));
    set({ queue: still });
  },

  withdraw: (callId) => {
    const item = get().queue.find((pending) => pending.callId === callId);
    if (!item) return;
    settle(item.id, "withdrawn");
    set((s) => ({ queue: s.queue.filter((pending) => pending.id !== item.id) }));
    const what =
      item.subject.kind === "send"
        ? "nothing was sent"
        : item.subject.kind === "update"
          ? "nothing changed"
          : "nothing was added";
    useUiStore.getState().notify(`${item.client ?? "The agent"} stopped waiting, so ${what}.`);
  },
}));

/** Back to a fresh state, for tests. */
export function resetMcpApprovals(): void {
  waiting.forEach((resolve) => resolve("withdrawn"));
  waiting.clear();
  useMcpApprovalStore.setState({ queue: [], allowedForSession: false, allowedHosts: new Set() });
}
