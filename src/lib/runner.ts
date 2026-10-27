import type { DataRow } from "./data-file";
import type { Auth, RequestDef } from "./model";
import { runPipeline, type PipelineDeps } from "./scripts/pipeline";
import type { TestResult } from "./scripts/types";
import type { VariableScopes } from "./variables";

export interface RunStep {
  readonly request: RequestDef;
  readonly authChain: readonly Auth[];
}

export interface RunOptions {
  readonly steps: readonly RunStep[];
  readonly iterations: number;
  readonly data: readonly DataRow[];
  readonly scopes: VariableScopes;
  readonly collectionScripts?: { readonly preRequest: string; readonly test: string };
  readonly delayMs?: number;
  readonly isStopped?: () => boolean;
}

export interface RunRow {
  readonly iteration: number;
  readonly requestId: string;
  readonly name: string;
  readonly method: string;
  readonly status: number | null;
  readonly timeMs: number | null;
  readonly tests: readonly TestResult[];
  readonly error: string | null;
}

export interface RunDeps extends PipelineDeps {
  readonly onRow?: (row: RunRow) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** With a data file, one iteration per row (unless more were asked for); otherwise `iterations`. */
export const iterationCount = (iterations: number, data: readonly DataRow[]): number =>
  Math.max(1, Math.floor(iterations) || 1, data.length);

/** Runs every step in order for each iteration; variable changes carry over between requests. */
export async function runCollection(
  options: RunOptions,
  deps: RunDeps,
): Promise<{ rows: RunRow[]; scopes: VariableScopes; stopped: boolean }> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const total = iterationCount(options.iterations, options.data);
  const rows: RunRow[] = [];
  let scopes = options.scopes;

  for (let iteration = 0; iteration < total; iteration++) {
    const data = options.data.length > 0 ? options.data[iteration % options.data.length] : {};
    for (const step of options.steps) {
      if (options.isStopped?.()) return { rows, scopes, stopped: true };
      const result = await runPipeline(
        {
          request: step.request,
          scopes: { ...scopes, data, local: {} },
          authChain: step.authChain,
          collectionScripts: options.collectionScripts,
          iteration,
        },
        deps,
      );
      scopes = { ...result.scopes, data: {}, local: {} };
      const row: RunRow = {
        iteration,
        requestId: step.request.id,
        name: step.request.name,
        method: step.request.method,
        status: result.response?.status ?? null,
        timeMs: result.response?.timeMs ?? null,
        tests: result.tests,
        error: result.error,
      };
      rows.push(row);
      deps.onRow?.(row);
      if (options.delayMs) await sleep(options.delayMs);
    }
  }
  return { rows, scopes, stopped: false };
}

export function summarizeRun(rows: readonly RunRow[]) {
  const tests = rows.flatMap((r) => r.tests);
  return {
    requests: rows.length,
    errors: rows.filter((r) => r.error).length,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
  };
}
