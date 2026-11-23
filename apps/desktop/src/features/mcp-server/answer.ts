import {
  getRequest,
  listCollections,
  listEnvironments,
  listHistory,
  type ToolResult,
  type ToolWorkspace,
} from "@narada/core/mcp-server/tools";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
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

/** Answers one tool call from a connected agent with what the app holds, secrets removed. */
export function answerToolCall(tool: string, args: unknown): ToolResult {
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
    default:
      return { error: `Narada has no tool "${tool}".` };
  }
}
