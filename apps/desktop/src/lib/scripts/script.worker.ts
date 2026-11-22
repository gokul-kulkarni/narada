import { runScript } from "./sandbox";
import type { ScriptContext } from "./types";

self.onmessage = async (event: MessageEvent<{ code: string; context: ScriptContext }>) => {
  self.postMessage(await runScript(event.data.code, event.data.context));
};
