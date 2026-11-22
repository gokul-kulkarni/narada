// Panel state lives in atoms (components panels have no hooks); actions talk to the worker.
import { atom, derived, plugin, read, set, update } from "orca";
import type { RequestDraft, RequestSummary, ResponseSummary, WorkspaceSnapshot } from "../protocol";
import { formatParamLines, urlWithParamLines } from "../shared/params-text";

/** Orca's ceiling for one panel request; the worker's own timeout is shorter. */
const SEND_TIMEOUT_MS = 120_000;

export type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly snapshot: WorkspaceSnapshot }
  | { readonly kind: "failed"; readonly error: string };

export type SendState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "done"; readonly response: ResponseSummary }
  | { readonly kind: "failed"; readonly error: string };

export const workspace = atom<LoadState>({ kind: "loading" });
/** Kept across panel runs so the person returns to the same request and environment. */
export const selectedKey = atom<string | null>("selectedKey", null, { persist: "plugin" });
export const environmentId = atom<string | null>("environmentId", null, { persist: "plugin" });
/** Unsent edits per request key, for this panel run. */
export const drafts = atom<Readonly<Record<string, RequestDraft>>>("drafts", {});
/**
 * What was last typed in the Params tab, with the URL it produced. While the URL still matches,
 * the tab shows the typed text (blank and commented-out lines included) instead of re-deriving it.
 */
export const typedParams = atom<Readonly<Record<string, { text: string; url: string }>>>(
  "typedParams",
  {},
);
/** The last outcome per request key, for this panel run. */
export const outcomes = atom<Readonly<Record<string, SendState>>>("outcomes", {});

export const selectedRequest = derived<RequestSummary | null>(() => {
  const state = read(workspace);
  const key = read(selectedKey);
  return state.kind === "ready" && key ? (state.snapshot.requests[key] ?? null) : null;
});

export const draftFor = (request: RequestSummary): RequestDraft =>
  read(drafts)[request.key] ?? {
    method: request.method,
    url: request.url,
    headersText: request.headersText,
    bodyText: request.bodyText,
  };

export const isEdited = (request: RequestSummary): boolean => request.key in read(drafts);

export function paramsTextFor(request: RequestSummary): string {
  const url = draftFor(request).url;
  const typed = read(typedParams)[request.key];
  return typed && typed.url === url ? typed.text : formatParamLines(url);
}

export const outcomeFor = (key: string): SendState => read(outcomes)[key] ?? { kind: "idle" };

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong talking to the worker.";

export async function loadWorkspace(): Promise<void> {
  set(workspace, { kind: "loading" });
  try {
    set(workspace, { kind: "ready", snapshot: await plugin.request("workspace.load") });
  } catch (error) {
    set(workspace, { kind: "failed", error: message(error) });
  }
}

export function editDraft(request: RequestSummary, change: Partial<RequestDraft>): void {
  const next = { ...draftFor(request), ...change };
  update(drafts, (all) => ({ ...all, [request.key]: next }));
}

/** Rewrites the URL's query from the Params tab's lines. */
export function editParams(request: RequestSummary, text: string): void {
  const url = urlWithParamLines(draftFor(request).url, text);
  editDraft(request, { url });
  update(typedParams, (all) => ({ ...all, [request.key]: { text, url } }));
}

const without = <T>(all: Readonly<Record<string, T>>, key: string) =>
  Object.fromEntries(Object.entries(all).filter(([k]) => k !== key));

export function resetDraft(request: RequestSummary): void {
  update(drafts, (all) => without(all, request.key));
  update(typedParams, (all) => without(all, request.key));
}

const setOutcome = (key: string, outcome: SendState) =>
  update(outcomes, (all) => ({ ...all, [key]: outcome }));

/** One send at a time; Stop aborts it and the worker's fetch with it. */
let inFlight: AbortController | null = null;

export async function send(request: RequestSummary): Promise<void> {
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  setOutcome(request.key, { kind: "sending" });
  try {
    const result = await plugin.request(
      "request.send",
      {
        collectionId: request.collectionId,
        requestId: request.requestId,
        environmentId: read(environmentId),
        draft: draftFor(request),
      },
      { signal: controller.signal, timeoutMs: SEND_TIMEOUT_MS },
    );
    setOutcome(
      request.key,
      result.ok
        ? { kind: "done", response: result.response }
        : { kind: "failed", error: result.error },
    );
  } catch (error) {
    setOutcome(request.key, {
      kind: "failed",
      error: controller.signal.aborted ? "Request cancelled" : message(error),
    });
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

export function stop(): void {
  inFlight?.abort();
}

export async function saveSecret(environment: string, key: string, value: string): Promise<void> {
  if (value === "") return;
  await plugin.request("secret.set", { environmentId: environment, key, value });
  await loadWorkspace();
}
