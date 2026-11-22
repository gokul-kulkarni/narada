// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
// The panel may import only `orca` and relative files, so these are plain data shapes rather than
// @narada/core types; the worker maps core's model onto them.

/** Where the collections folder came from. */
export type FolderSource = "setting" | "desktop" | "default";

export interface FolderInfo {
  readonly path: string;
  readonly source: FolderSource;
  /** False when the folder (or its Collections/ subfolder) is missing. */
  readonly exists: boolean;
}

/** A row of Orca's Tree: collections, folders and requests. */
export interface RequestTreeItem {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: "folder" | "file" | "globe" | "plug";
  readonly disabled?: boolean;
  readonly children?: readonly RequestTreeItem[];
}

export type BodyMode = "none" | "raw" | "urlencoded" | "formdata";

/** A saved HTTP request as the panel shows and edits it. */
export interface RequestSummary {
  readonly key: string;
  readonly collectionId: string;
  readonly requestId: string;
  readonly name: string;
  /** Collection / folder path, for context under the title. */
  readonly location: string;
  readonly method: string;
  readonly url: string;
  /** Enabled headers as `Name: value` lines. */
  readonly headersText: string;
  readonly bodyMode: BodyMode;
  /** The raw body; empty for other modes. */
  readonly bodyText: string;
  /** Form fields of urlencoded / form-data bodies, sent as saved. */
  readonly formFields: readonly { readonly key: string; readonly value: string }[];
  /** How the request authenticates, e.g. "Bearer token, from the collection". */
  readonly authLabel: string;
  /** The request or its collection has pre-request or test scripts, which only Narada runs. */
  readonly hasScripts: boolean;
}

export interface EnvironmentSummary {
  readonly id: string;
  readonly name: string;
  /** Secret variables with no value here (the desktop app keeps them in the OS keychain). */
  readonly missingSecrets: readonly string[];
}

export interface LoadError {
  readonly fileName: string;
  readonly message: string;
}

export interface WorkspaceSnapshot {
  readonly folder: FolderInfo;
  readonly tree: readonly RequestTreeItem[];
  readonly requests: Readonly<Record<string, RequestSummary>>;
  readonly environments: readonly EnvironmentSummary[];
  readonly errors: readonly LoadError[];
}

/** What the person changed in the panel before sending. */
export interface RequestDraft {
  readonly method: string;
  readonly url: string;
  readonly headersText: string;
  readonly bodyText: string;
}

export interface SendInput {
  readonly collectionId: string;
  readonly requestId: string;
  readonly environmentId: string | null;
  readonly draft: RequestDraft;
}

export interface ResponseSummary {
  readonly status: number;
  readonly statusText: string;
  readonly timeMs: number;
  readonly sizeBytes: number;
  /** "120 ms · 3.4 KB", formatted as Narada does. */
  readonly timingLabel: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly contentType: string;
  /** Pretty-printed when JSON, cut to what the panel can draw. */
  readonly preview: string;
  readonly previewTruncated: boolean;
  /** The body as received, cut to what a panel answer can carry. */
  readonly body: string;
  readonly bodyTruncated: boolean;
  /** Why the body stopped early (stopped, idle, size limit), if it did. */
  readonly incomplete: string | null;
  /** The URL actually sent, after variables and query auth. */
  readonly sentUrl: string;
}

export type SendResult =
  | { readonly ok: true; readonly response: ResponseSummary }
  | { readonly ok: false; readonly error: string };

declare module "orca" {
  interface PluginRequests {
    /** Reads the collections folder, environments and globals. */
    "workspace.load": { output: WorkspaceSnapshot };
    /** Sends a saved request with the panel's edits and the chosen environment. */
    "request.send": { input: SendInput; output: SendResult };
    /** Keeps a secret variable's value in the plugin's encrypted secrets. */
    "secret.set": {
      input: { environmentId: string; key: string; value: string };
      output: { ok: true };
    };
  }
}
