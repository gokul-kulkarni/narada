import { folderFor } from "../../state/assist-settings";
import { agentFingerprint, useAssistStore } from "../../state/assist-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import type { DetectedAgent } from "../../lib/assist/client";
import { scrubText } from "@narada/core/assist/scrub";
import { promptForTab, secretsForTab } from "./agent-context";

/** The redacted prompt for a tab as it is now, or null if it has nothing to ask about. */
export function currentPrompt(tabId: string): string | null {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  return tab ? promptForTab(tab, useWorkspaceStore.getState()) : null;
}

/** The project folder the agent may read for this tab (null: an empty folder). */
export function currentFolder(tabId: string): string | null {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  return folderFor(useAssistStore.getState().settings, tab?.source?.collectionId ?? null);
}

/** Starts the agent on the tab's delivery: straight away, or after the preview when needed. */
export async function askAgent(tabId: string, agentId?: string): Promise<void> {
  if (currentPrompt(tabId) === null) {
    useUiStore.getState().notify("Send the request first, then ask about its response.");
    return;
  }
  const assist = useAssistStore.getState();
  const agents = await assist.detect();
  const agent: DetectedAgent | undefined = agents.find((a) => a.id === agentId) ?? agents[0];
  if (!agent) {
    useUiStore
      .getState()
      .notify("No coding agent found. Install Claude Code to ask about a response.");
    return;
  }
  const settings = await assist.loadSettings();
  if (!settings.skipPreview || !settings.trusted.includes(agentFingerprint(agent))) {
    useUiStore.getState().openDialog({ kind: "assist-preview", tabId, agentId: agent.id });
    return;
  }
  const prompt = currentPrompt(tabId);
  if (prompt) await assist.start(tabId, agent, prompt, currentFolder(tabId));
}

/** Asks a further question in the tab's conversation, with known secret values removed. */
export async function askFollowUp(tabId: string, question: string): Promise<void> {
  const text = question.trim();
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!text || !tab) return;
  const secrets = secretsForTab(tab, useWorkspaceStore.getState());
  await useAssistStore.getState().followUp(tabId, scrubText(text, secrets));
}
