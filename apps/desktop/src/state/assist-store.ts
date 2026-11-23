import { create } from "zustand";
import { z } from "zod";
import { errorMessage } from "@narada/core/format";
import { newId } from "@narada/core/ids";
import { getAssistClient, type AssistEvent, type DetectedAgent } from "../lib/assist/client";
import { getServices } from "./services";

export type RunStatus = "running" | "done" | "error" | "stopped";

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
}

/** Stored on this computer only (assist.json), never in the synced folder. */
export interface AssistSettings {
  /** Agents the user confirmed, by `agentFingerprint`; a new path or version asks again. */
  readonly trusted: readonly string[];
  readonly skipPreview: boolean;
}

const SETTINGS_FILE = "assist.json";
const DEFAULT_SETTINGS: AssistSettings = { trusted: [], skipPreview: false };
const settingsSchema = z.object({ trusted: z.array(z.string()), skipPreview: z.boolean() });

export const agentFingerprint = (agent: DetectedAgent): string => `${agent.path}@${agent.version}`;

export function parseSettings(content: string | null): AssistSettings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(content ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function appendText(run: AssistRun, text: string): string {
  const needsBreak = run.afterActivity && run.text !== "" && !text.startsWith("\n");
  return `${run.text}${needsBreak ? "\n\n" : ""}${text}`;
}

/** The run after one event; returns a new object. */
export function applyEvent(run: AssistRun, event: AssistEvent): AssistRun {
  switch (event.kind) {
    case "started":
      return run;
    case "text":
      return { ...run, text: appendText(run, event.text), activity: null, afterActivity: false };
    case "activity":
      return { ...run, activity: event.label, afterActivity: true };
    case "done":
      return { ...run, status: "done", activity: null, costUsd: event.costUsd };
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
  loadSettings: () => Promise<AssistSettings>;
  /** The user confirmed running `agent`; optionally skip the preview from now on. */
  confirm: (agent: DetectedAgent, skipPreview: boolean) => Promise<void>;
  start: (tabId: string, agent: DetectedAgent, prompt: string) => Promise<void>;
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

    loadSettings: async () => {
      if (get().settingsLoaded) return get().settings;
      const settings = parseSettings(await getServices().documents.readLocal(SETTINGS_FILE));
      set({ settings, settingsLoaded: true });
      return settings;
    },

    confirm: async (agent, skipPreview) => {
      const current = await get().loadSettings();
      const print = agentFingerprint(agent);
      const settings: AssistSettings = {
        trusted: current.trusted.includes(print) ? current.trusted : [...current.trusted, print],
        skipPreview: current.skipPreview || skipPreview,
      };
      set({ settings });
      await getServices().documents.writeLocal(SETTINGS_FILE, JSON.stringify(settings));
    },

    start: async (tabId, agent, prompt) => {
      controllers.get(tabId)?.abort();
      const client = getAssistClient();
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
      };
      set((state) => ({ runs: { ...state.runs, [tabId]: run } }));
      if (!client) {
        updateRun(tabId, run.id, (r) =>
          applyEvent(r, { kind: "error", message: "Agents need the desktop app." }),
        );
        return;
      }
      const controller = new AbortController();
      controllers.set(tabId, controller);
      try {
        await client.run(
          agent.id,
          prompt,
          (event) => updateRun(tabId, run.id, (r) => applyEvent(r, event)),
          controller.signal,
        );
        // An agent that ends without a final word has still finished.
        updateRun(tabId, run.id, (r) =>
          r.status === "running" ? { ...r, status: "done", activity: null } : r,
        );
      } catch (error) {
        updateRun(tabId, run.id, (r) =>
          applyEvent(r, { kind: "error", message: errorMessage(error) }),
        );
      } finally {
        if (controllers.get(tabId) === controller) controllers.delete(tabId);
      }
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
