import {
  applyCreatePlan,
  createResult,
  planCreateCollection,
  planCreateFolder,
  planCreateRequests,
  type CreatePlan,
  type PlanResult,
} from "@narada/core/mcp-server/create";
import {
  getRequest,
  listCollections,
  listEnvironments,
  listHistory,
  type ToolResult,
  type ToolWorkspace,
} from "@narada/core/mcp-server/tools";
import { hostOf, parseSendArgs, type SendArgsResult } from "@narada/core/mcp-server/send";
import { applyUpdate, planUpdate, type UpdateResult } from "@narada/core/mcp-server/update";
import { resolveTemplate } from "@narada/core/variables";
import { dispatchTab } from "../../protocols/registry";
import { useHistoryStore } from "../../state/history-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { contextForTab } from "../assist/agent-context";
import { pipelineInputFor } from "../workspace/context";

function workspace(): ToolWorkspace {
  const { collections, environments, globals, activeEnvironmentId } = useWorkspaceStore.getState();
  return {
    collections,
    environments,
    globals,
    activeEnvironmentId,
    history: useHistoryStore.getState().entries,
  };
}

function lastDelivery(): ToolResult {
  const tab = selectActiveTab(useTabsStore.getState());
  if (!tab) return { error: "No request is open in Narada." };
  const context = contextForTab(tab, useWorkspaceStore.getState());
  return context
    ? { result: context }
    : { error: "The open request hasn't been sent yet. Ask the user to dispatch it in Narada." };
}

function summary(plan: CreatePlan): string {
  const where = [plan.collection.name, ...plan.folderPath].join(" / ");
  if (plan.kind === "collection") return `Added the collection "${plan.collection.name}".`;
  if (plan.kind === "folder") return `Added the folder ${where}.`;
  const count = plan.requests.length;
  return `Added ${count} request${count === 1 ? "" : "s"} to ${where}.`;
}

/** Asks the user to approve the plan, then adds it to the workspace as it is by then. */
async function create(
  planned: PlanResult,
  client: string | null,
  callId: string | null,
): Promise<ToolResult> {
  if ("error" in planned) return planned;
  const { plan } = planned;
  const approved = await useMcpApprovalStore
    .getState()
    .request(client, { kind: "create", plan }, callId);
  if (!approved) return { error: "The user declined, so nothing was added." };

  const store = useWorkspaceStore.getState();
  const applied = applyCreatePlan(store.collections, plan);
  if (applied.isNew) await store.addCollection(applied.collection);
  else await store.updateCollection(applied.collection.id, () => applied.collection);

  const ui = useUiStore.getState();
  ui.reveal([applied.collection.id]);
  ui.notify(summary(plan));
  const [first] = plan.requests;
  if (first) {
    useTabsStore.getState().openRequest(first.request, {
      collectionId: applied.collection.id,
      requestId: first.request.id,
    });
  }
  return { result: createResult(plan, applied) };
}

/** Asks the user to approve the diff, then saves the request and refreshes a clean tab of it. */
async function update(
  planned: UpdateResult,
  client: string | null,
  callId: string | null,
): Promise<ToolResult> {
  if ("error" in planned) return planned;
  const { plan } = planned;
  const approved = await useMcpApprovalStore
    .getState()
    .request(client, { kind: "update", plan }, callId);
  if (!approved) return { error: "The user declined, so nothing changed." };

  await useWorkspaceStore
    .getState()
    .updateCollection(plan.collectionId, (c) => applyUpdate(c, plan));
  const tabs = useTabsStore.getState();
  tabs.tabs
    .filter((tab) => tab.source?.requestId === plan.requestId && !tab.dirty)
    .forEach((tab) => tabs.patchTab(tab.id, { request: plan.after }));
  useUiStore.getState().notify(`Updated "${plan.requestName}" in ${plan.collectionName}.`);
  return getRequest(workspace(), { requestId: plan.requestId });
}

/** Asks the user, then sends the request like Dispatch in a tab of its own and reports back. */
async function send(
  parsed: SendArgsResult,
  client: string | null,
  callId: string | null,
): Promise<ToolResult> {
  if ("error" in parsed) return parsed;
  const { target } = parsed;
  const source =
    target.kind === "saved"
      ? { collectionId: target.collectionId, requestId: target.request.id }
      : null;
  const open =
    source && useTabsStore.getState().tabs.find((t) => t.source?.requestId === source.requestId);
  if (open?.dirty) {
    return {
      error:
        "The user has unsaved changes to this request in Narada. Ask them to save or discard them first.",
    };
  }
  const { scopes } = pipelineInputFor(source?.collectionId ?? null, source?.requestId ?? null);
  const environment = selectActiveEnvironment(useWorkspaceStore.getState())?.name ?? null;
  const subject = {
    kind: "send" as const,
    request: target.request,
    host: hostOf(resolveTemplate(target.request.url, scopes)),
    environment,
    saved: target.kind === "saved",
  };
  const approved = await useMcpApprovalStore.getState().request(client, subject, callId);
  if (!approved) return { error: "The user declined, so nothing was sent." };

  const tabId = useTabsStore.getState().openRequest(target.request, source);
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return { error: "Narada could not open the request." };
  await dispatchTab(tab);
  const sent = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  const context = sent && contextForTab(sent, useWorkspaceStore.getState());
  return context ? { result: context } : { error: "The request was not sent." };
}

/** Answers one tool call from a connected agent with what the app holds, secrets removed. */
export async function answerToolCall(
  tool: string,
  args: unknown,
  client: string | null = null,
  callId: string | null = null,
): Promise<ToolResult> {
  switch (tool) {
    case "list_collections":
      return { result: listCollections(workspace()) };
    case "get_request":
      return getRequest(workspace(), args);
    case "list_environments":
      return { result: listEnvironments(workspace()) };
    case "get_last_delivery":
      return lastDelivery();
    case "list_history":
      return listHistory(workspace(), args);
    case "create_request":
      return create(planCreateRequests(workspace(), args), client, callId);
    case "create_folder":
      return create(planCreateFolder(workspace(), args), client, callId);
    case "create_collection":
      return create(planCreateCollection(workspace(), args), client, callId);
    case "update_request":
      return update(planUpdate(workspace(), args), client, callId);
    case "send_request":
      return send(parseSendArgs(workspace(), args), client, callId);
    default:
      return { error: `Narada has no tool "${tool}".` };
  }
}
