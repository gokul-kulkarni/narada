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
import { useHistoryStore } from "../../state/history-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { contextForTab } from "../assist/agent-context";

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
async function create(planned: PlanResult, client: string | null): Promise<ToolResult> {
  if ("error" in planned) return planned;
  const { plan } = planned;
  const approved = await useMcpApprovalStore.getState().request(client, plan);
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

/** Answers one tool call from a connected agent with what the app holds, secrets removed. */
export async function answerToolCall(
  tool: string,
  args: unknown,
  client: string | null = null,
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
      return create(planCreateRequests(workspace(), args), client);
    case "create_folder":
      return create(planCreateFolder(workspace(), args), client);
    case "create_collection":
      return create(planCreateCollection(workspace(), args), client);
    default:
      return { error: `Narada has no tool "${tool}".` };
  }
}
