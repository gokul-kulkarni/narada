import { runScript } from "./sandbox";
import type { ScriptContext, ScriptResult } from "./types";

export const SCRIPT_TIMEOUT_MS = 5_000;

export type ExecuteScript = (code: string, context: ScriptContext) => Promise<ScriptResult>;

/**
 * Runs a script in a fresh Worker (no DOM, no Tauri bridge) and kills it after a timeout,
 * so an infinite loop in an imported collection can't freeze the app.
 */
export const executeScript: ExecuteScript = (code, context) => {
  if (!code.trim()) return runScript(code, context);
  if (typeof Worker === "undefined") return runScript(code, context);
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./script.worker.ts", import.meta.url), { type: "module" });
    const done = (result: ScriptResult) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const failed = (error: string) =>
      done({ tests: [], logs: [], variables: context.variables, request: context.request, error });
    const timer = setTimeout(
      () => failed(`Script timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`),
      SCRIPT_TIMEOUT_MS,
    );
    worker.onmessage = (event: MessageEvent<ScriptResult>) => done(event.data);
    worker.onerror = (event) => failed(event.message || "Script failed to start");
    worker.postMessage({ code, context });
  });
};
