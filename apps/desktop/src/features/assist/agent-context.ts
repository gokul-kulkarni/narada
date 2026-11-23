import { buildAgentContext, type AgentResultInput } from "@narada/core/assist/context";
import { renderPrompt } from "@narada/core/assist/prompt";
import { isSensitiveName } from "@narada/core/assist/scrub";
import type { AgentContext, SecretValue } from "@narada/core/assist/types";
import type { Collection, Environment, KeyValue } from "@narada/core/model";
import type { RequestTab } from "../../state/tabs-store";

/** The parts of the workspace a prompt needs: variables in scope and which are secret. */
export interface WorkspaceSnapshot {
  readonly collections: readonly Collection[];
  readonly environments: readonly Environment[];
  readonly globals: readonly KeyValue[];
  readonly activeEnvironmentId: string | null;
}

/** The delivery on screen went wrong: never arrived, 4xx/5xx, a tool error or a failed test. */
export function isFailing(tab: RequestTab): boolean {
  if (tab.error !== null) return true;
  if (tab.tests.some((test) => !test.passed)) return true;
  const { delivery } = tab;
  if (!delivery) return false;
  return delivery.protocol === "http" ? delivery.response.status >= 400 : delivery.isError;
}

const enabled = <T extends KeyValue>(rows: readonly T[]): T[] =>
  rows.filter((row) => row.enabled && row.key.trim() !== "");

/** Secret environment variables, plus any variable whose name says it holds a credential. */
export function secretsForTab(tab: RequestTab, workspace: WorkspaceSnapshot): SecretValue[] {
  const collection = workspace.collections.find((c) => c.id === tab.source?.collectionId);
  const environment = workspace.environments.find((e) => e.id === workspace.activeEnvironmentId);
  return secretsIn(workspace.globals, collection, environment);
}

function secretsIn(
  globals: readonly KeyValue[],
  collection: Collection | undefined,
  environment: Environment | undefined,
): SecretValue[] {
  const marked = enabled(environment?.variables ?? []).filter((v) => v.secret);
  const named = [...globals, ...(collection?.variables ?? []), ...(environment?.variables ?? [])];
  return [...marked, ...enabled(named).filter((row) => isSensitiveName(row.key))]
    .filter((row) => row.value !== "")
    .map((row) => ({ name: row.key, value: row.value }));
}

function resultOf(tab: RequestTab): AgentResultInput | null {
  if (tab.delivery) return { delivery: tab.delivery };
  return tab.error !== null ? { error: tab.error } : null;
}

/** What an agent is told about the tab's latest delivery, redacted; null if nothing was sent. */
export function contextForTab(
  tab: RequestTab,
  workspace: WorkspaceSnapshot,
  question: string | null = null,
): AgentContext | null {
  const result = resultOf(tab);
  if (!result) return null;
  const collection = workspace.collections.find((c) => c.id === tab.source?.collectionId);
  const environment = workspace.environments.find((e) => e.id === workspace.activeEnvironmentId);
  const scopes = [workspace.globals, collection?.variables ?? [], environment?.variables ?? []];
  return buildAgentContext({
    request: tab.request,
    result,
    tests: tab.tests,
    environment: environment?.name ?? null,
    variableNames: scopes.flatMap((rows) => enabled(rows).map((row) => row.key)),
    secrets: secretsForTab(tab, workspace),
    question,
  });
}

/** The redacted prompt about the tab's latest delivery, or null if nothing was sent yet. */
export function promptForTab(
  tab: RequestTab,
  workspace: WorkspaceSnapshot,
  question: string | null = null,
): string | null {
  const context = contextForTab(tab, workspace, question);
  return context ? renderPrompt(context) : null;
}
