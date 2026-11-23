import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { newId } from "@narada/core/ids";

/** An agent CLI found on this computer (from `assist_detect`). */
export interface DetectedAgent {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly version: string;
}

/** Progress of one agent run, whichever CLI produced it (mirrors the Rust `AssistEvent`). */
export type AssistEvent =
  | { readonly kind: "started"; readonly sessionId: string | null }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "activity"; readonly label: string }
  | { readonly kind: "done"; readonly sessionId: string | null; readonly costUsd: number | null }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "stopped" };

export interface AssistClient {
  detect(): Promise<readonly DetectedAgent[]>;
  /**
   * Resolves when the run has ended; its last event is done, error or stopped. With a
   * `sessionId` the agent continues that conversation (a follow-up question).
   */
  run(
    agentId: string,
    prompt: string,
    onEvent: (event: AssistEvent) => void,
    signal: AbortSignal,
    sessionId?: string | null,
  ): Promise<void>;
}

const tauriAssistClient: AssistClient = {
  detect: () => invoke<DetectedAgent[]>("assist_detect"),
  async run(agentId, prompt, onEvent, signal, sessionId = null) {
    const id = newId();
    const channel = new Channel<AssistEvent>();
    channel.onmessage = onEvent;
    const stop = () => void invoke("assist_cancel", { id });
    signal.addEventListener("abort", stop, { once: true });
    try {
      await invoke("assist_run", { request: { agentId, prompt, sessionId }, id, channel });
    } finally {
      signal.removeEventListener("abort", stop);
    }
  },
};

let override: AssistClient | null | undefined;

/** The agent runner for this build; null in the browser build, which cannot start programs. */
export function getAssistClient(): AssistClient | null {
  if (override !== undefined) return override;
  return isTauri() ? tauriAssistClient : null;
}

/** Tests swap in a fake client (or null for "browser build"); undefined restores the default. */
export function setAssistClient(next: AssistClient | null | undefined): void {
  override = next;
}
