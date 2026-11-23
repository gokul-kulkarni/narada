import { create } from "zustand";
import { errorMessage } from "@narada/core/format";
import { newId } from "@narada/core/ids";
import { getAssistClient, type AssistEvent, type DetectedAgent } from "../lib/assist/client";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE,
  agentFingerprint,
  parseSettings,
  withFolder,
  type AssistSettings,
} from "./assist-settings";
import { getServices } from "./services";

export { agentFingerprint, parseSettings, type AssistSettings } from "./assist-settings";

export type RunStatus = "running" | "done" | "error" | "stopped";

/** An earlier question and answer in the same conversation. */
export interface AssistExchange {
  /** null for the first question, which is about the response itself. */
  readonly question: string | null;
  readonly answer: string;
}

/** One agent answer about one tab's delivery. */
export interface AssistRun {
  readonly id: string;
  readonly tabId: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly status: RunStatus;
  readonly text: string;
  /** What the agent is doing right now, e.g. "Reading src/orders.ts". */
  readonly activity: string | null;
  /** The agent used a tool since its last text, so new text starts a new paragraph. */
  readonly afterActivity: boolean;
  readonly error: string | null;
  readonly costUsd: number | null;
  /** The agent's session, so a follow-up can continue the conversation. */
  readonly sessionId: string | null;
  /** The question this answer is for; null for the first one, about the response. */
  readonly question: string | null;
  readonly earlier: readonly AssistExchange[];
  /** The project folder the agent may read (null: an empty folder); follow-ups reuse it. */
  readonly cwd: string | null;
}

function appendText(run: AssistRun, text: string): string {
  const needsBreak = run.afterActivity && run.text !== "" && !text.startsWith("\n");
  return `${run.text}${needsBreak ? "\n\n" : ""}${text}`;
}

/** The run after one event; returns a new object. */
export function applyEvent(run: AssistRun, event: AssistEvent): AssistRun {
  switch (event.kind) {
    case "started":
      return event.sessionId ? { ...run, sessionId: event.sessionId } : run;
    case "text":
      return { ...run, text: appendText(run, event.text), activity: null, afterActivity: false };
    case "activity":
      return { ...run, activity: event.label, afterActivity: true };
    case "done":
      return {
        ...run,
        status: "done",
        activity: null,
        costUsd: event.costUsd,
        sessionId: event.sessionId ?? run.sessionId,
      };
    case "error":
      return { ...run, status: "error", activity: null, error: event.message };
    case "stopped":
      return { ...run, status: "stopped", activity: null };
  }
}

interface AssistState {
  readonly agentsStatus: "idle" | "detecting" | "ready";
  readonly agents: readonly DetectedAgent[];
  readonly settings: AssistSettings;
  readonly settingsLoaded: boolean;
  /** The answer shown beside each tab's delivery, by tab id. */
  readonly runs: Readonly<Record<string, AssistRun>>;
  detect: () => Promise<readonly DetectedAgent[]>;
  /** Looks for agents again, e.g. after the user installed one. */
  redetect: () => Promise<readonly DetectedAgent[]>;
  loadSettings: () => Promise<AssistSettings>;
  /** The user confirmed running `agent`; optionally skip the preview from now on. */
  confirm: (agent: DetectedAgent, skipPreview: boolean) => Promise<void>;
  setSkipPreview: (skipPreview: boolean) => Promise<void>;
  /** Sets or clears (null) a collection's project folder, or the default with a null id. */
  setFolder: (collectionId: string | null, folder: string | null) => Promise<void>;
  start: (
    tabId: string,
    agent: DetectedAgent,
    prompt: string,
    cwd?: string | null,
  ) => Promise<void>;
  /** Asks a further question in the tab's finished conversation. */
  followUp: (tabId: string, question: string) => Promise<void>;
  stop: (tabId: string) => void;
  dismiss: (tabId: string) => void;
}

/** Abort controllers of runs in flight, by tab id; kept out of the store's plain state. */
const controllers = new Map<string, AbortController>();

let detecting: Promise<readonly DetectedAgent[]> | null = null;

export const useAssistStore = create<AssistState>()((set, get) => {
  /** Updates a tab's run, unless it has since been replaced by a newer run. */
  const updateRun = (tabId: string, runId: string, update: (run: AssistRun) => AssistRun) =>
    set((state) => {
      const current = state.runs[tabId];
      if (current?.id !== runId) return state;
      return { runs: { ...state.runs, [tabId]: update(current) } };
    });

  /** Shows `run` for the tab and streams the agent's reply to `prompt` into it. */
  const execute = async (
    tabId: string,
    run: AssistRun,
    prompt: string,
    sessionId: string | null = null,
  ) => {
    controllers.get(tabId)?.abort();
    set((state) => ({ runs: { ...state.runs, [tabId]: run } }));
    const fail = (message: string) =>
      updateRun(tabId, run.id, (r) => applyEvent(r, { kind: "error", message }));
    const client = getAssistClient();
    if (!client) {
      fail("Agents need the desktop app.");
      return;
    }
    const controller = new AbortController();
    controllers.set(tabId, controller);
    try {
      await client.run(
        { agentId: run.agentId, prompt, sessionId, cwd: run.cwd },
        (event) => updateRun(tabId, run.id, (r) => applyEvent(r, event)),
        controller.signal,
      );
      // An agent that ends without a final word has still finished.
      updateRun(tabId, run.id, (r) =>
        r.status === "running" ? { ...r, status: "done", activity: null } : r,
      );
    } catch (error) {
      fail(errorMessage(error));
    } finally {
      if (controllers.get(tabId) === controller) controllers.delete(tabId);
    }
  };

  /** Applies a change to the settings and saves them on this computer. */
  const saveSettings = async (change: (settings: AssistSettings) => AssistSettings) => {
    const settings = change(await get().loadSettings());
    set({ settings });
    await getServices().documents.writeLocal(SETTINGS_FILE, JSON.stringify(settings));
  };

  return {
    agentsStatus: "idle",
    agents: [],
    settings: DEFAULT_SETTINGS,
    settingsLoaded: false,
    runs: {},

    detect: () => {
      if (get().agentsStatus === "ready") return Promise.resolve(get().agents);
      detecting ??= (async () => {
        set({ agentsStatus: "detecting" });
        const client = getAssistClient();
        const agents = client ? await client.detect().catch(() => []) : [];
        set({ agents, agentsStatus: "ready" });
        detecting = null;
        return agents;
      })();
      return detecting;
    },

    redetect: () => {
      if (get().agentsStatus === "ready") set({ agentsStatus: "idle" });
      return get().detect();
    },

    loadSettings: async () => {
      if (get().settingsLoaded) return get().settings;
      const settings = parseSettings(await getServices().documents.readLocal(SETTINGS_FILE));
      set({ settings, settingsLoaded: true });
      return settings;
    },

    confirm: (agent, skipPreview) =>
      saveSettings((current) => {
        const print = agentFingerprint(agent);
        return {
          ...current,
          trusted: current.trusted.includes(print) ? current.trusted : [...current.trusted, print],
          skipPreview: current.skipPreview || skipPreview,
        };
      }),

    setSkipPreview: (skipPreview) => saveSettings((current) => ({ ...current, skipPreview })),

    setFolder: (collectionId, folder) =>
      saveSettings((current) => withFolder(current, collectionId, folder)),

    start: async (tabId, agent, prompt, cwd = null) => {
      const run: AssistRun = {
        id: newId(),
        tabId,
        agentId: agent.id,
        agentName: agent.name,
        status: "running",
        text: "",
        activity: null,
        afterActivity: false,
        error: null,
        costUsd: null,
        sessionId: null,
        question: null,
        earlier: [],
        cwd,
      };
      await execute(tabId, run, prompt);
    },

    followUp: async (tabId, question) => {
      const current = get().runs[tabId];
      if (!current?.sessionId || current.status === "running") return;
      const run: AssistRun = {
        ...current,
        id: newId(),
        status: "running",
        earlier: [...current.earlier, { question: current.question, answer: current.text }],
        question,
        text: "",
        activity: null,
        afterActivity: false,
        error: null,
        costUsd: null,
      };
      await execute(tabId, run, question, current.sessionId);
    },

    stop: (tabId) => controllers.get(tabId)?.abort(),

    dismiss: (tabId) => {
      controllers.get(tabId)?.abort();
      set((state) => ({
        runs: Object.fromEntries(Object.entries(state.runs).filter(([id]) => id !== tabId)),
      }));
    },
  };
});

/** Back to a fresh state, for tests. */
export function resetAssistStore(): void {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  detecting = null;
  useAssistStore.setState({
    agentsStatus: "idle",
    agents: [],
    settings: DEFAULT_SETTINGS,
    settingsLoaded: false,
    runs: {},
  });
}
