import { newId } from "../../lib/ids";
import type { HistoryEntry, HttpRequestDef, HttpResponse } from "../../lib/model";
import type { PreparedRequest } from "../../lib/prepare-request";
import { runPipeline, type PipelineInput } from "../../lib/scripts/pipeline";
import type { ExecuteScript } from "../../lib/scripts/script-runner";
import type { VariableScopes } from "../../lib/variables";
import type { RequestTab } from "../../state/tabs-store";

export interface SendDeps {
  readonly send: (request: PreparedRequest) => Promise<HttpResponse>;
  readonly execute: ExecuteScript;
  /** Everything but the request itself: scopes, auth chain and collection scripts. */
  readonly getInput: (tab: RequestTab) => Omit<PipelineInput, "request">;
  readonly applyScopes: (
    tab: RequestTab,
    before: VariableScopes,
    after: VariableScopes,
  ) => Promise<void>;
  readonly patchTab: (tabId: string, patch: Partial<Omit<RequestTab, "id">>) => void;
  readonly addHistory: (entry: HistoryEntry) => void;
  readonly now?: () => Date;
}

/** Sends `request` (the tab's HTTP request) and records the result on the tab and in history. */
export async function sendTab(
  tab: RequestTab,
  request: HttpRequestDef,
  deps: SendDeps,
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  deps.patchTab(tab.id, { loading: true, partial: null, error: null, tests: [], logs: [] });
  const input = deps.getInput(tab);
  const result = await runPipeline(
    { ...input, request },
    { send: deps.send, execute: deps.execute },
  );
  await deps.applyScopes(tab, input.scopes, result.scopes);
  deps.patchTab(tab.id, {
    loading: false,
    partial: null,
    delivery: result.response && { protocol: "http", response: result.response },
    error: result.error,
    tests: result.tests,
    logs: result.logs,
  });
  deps.addHistory({
    id: newId(),
    sentAt: now().toISOString(),
    request,
    status: result.response?.status ?? null,
    timeMs: result.response?.timeMs ?? null,
  });
}
