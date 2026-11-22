import { expect as chaiExpect } from "chai";
import { errorMessage } from "../format";
import type { HttpResponse } from "../model";
import type {
  ScriptContext,
  ScriptRequest,
  ScriptResult,
  ScriptVariables,
  TestResult,
  VariableBag,
} from "./types";

type Scope = keyof ScriptVariables;
type MutableVariables = Record<Scope, Record<string, string>>;

const asString = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

function scopeApi(vars: MutableVariables, scope: Scope) {
  return {
    get: (key: string): string | undefined => vars[scope][key],
    has: (key: string): boolean => Object.hasOwn(vars[scope], key),
    set: (key: string, value: unknown) => {
      vars[scope][key] = asString(value);
    },
    unset: (key: string) => {
      delete vars[scope][key];
    },
    toObject: (): VariableBag => ({ ...vars[scope] }),
  };
}

function responseApi(response: HttpResponse | null) {
  const require = (): HttpResponse => {
    if (!response) throw new Error("pm.response is only available in test scripts");
    return response;
  };
  const header = (name: string) =>
    require().headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  const assertions = {
    status: (code: number) => chaiExpect(require().status, "response status").to.equal(code),
    header: (name: string, value?: string) => {
      const actual = header(name);
      chaiExpect(actual, `header ${name}`).to.not.equal(undefined);
      if (value !== undefined) chaiExpect(actual, `header ${name}`).to.equal(value);
    },
    body: (text: string) => chaiExpect(require().body).to.equal(text),
  };
  return {
    get code() {
      return require().status;
    },
    get status() {
      return require().statusText;
    },
    get responseTime() {
      return require().timeMs;
    },
    get responseSize() {
      return require().sizeBytes;
    },
    headers: { get: header },
    text: () => require().body,
    json: (): unknown => {
      try {
        return JSON.parse(require().body);
      } catch {
        throw new Error("Response body is not valid JSON");
      }
    },
    to: {
      have: assertions,
      be: {
        get ok() {
          chaiExpect(require().status, "response status").to.be.within(200, 299);
          return true;
        },
      },
    },
  };
}

function requestApi(initial: ScriptRequest) {
  const state = {
    method: initial.method,
    url: initial.url,
    headers: [...initial.headers] as [string, string][],
  };
  const without = (key: string) =>
    state.headers.filter(([k]) => k.toLowerCase() !== key.toLowerCase());
  const api = {
    get method() {
      return state.method;
    },
    set method(value: string) {
      state.method = value;
    },
    get url() {
      return state.url;
    },
    set url(value: string) {
      state.url = String(value);
    },
    headers: {
      add: ({ key, value }: { key: string; value: unknown }) => {
        state.headers = [...state.headers, [key, asString(value)]];
      },
      upsert: ({ key, value }: { key: string; value: unknown }) => {
        const exists = state.headers.some(([k]) => k.toLowerCase() === key.toLowerCase());
        state.headers = exists
          ? state.headers.map(([k, v]) =>
              k.toLowerCase() === key.toLowerCase() ? [key, asString(value)] : [k, v],
            )
          : [...state.headers, [key, asString(value)]];
      },
      remove: (key: string) => {
        state.headers = without(key);
      },
      get: (key: string) => state.headers.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1],
    },
  };
  return { api, snapshot: (): ScriptRequest => ({ ...state, headers: [...state.headers] }) };
}

const PRECEDENCE: readonly Scope[] = ["local", "data", "environment", "collection", "globals"];

/**
 * Runs a Postman-style script. Call it inside a Worker (see script-runner) so scripts
 * cannot reach the DOM or the Tauri bridge and can be time-limited.
 */
export async function runScript(code: string, context: ScriptContext): Promise<ScriptResult> {
  const vars: MutableVariables = {
    globals: { ...context.variables.globals },
    collection: { ...context.variables.collection },
    environment: { ...context.variables.environment },
    data: { ...context.variables.data },
    local: { ...context.variables.local },
  };
  const request = requestApi(context.request);
  const tests: TestResult[] = [];
  const pending: Promise<void>[] = [];
  const logs: string[] = [];
  const finish = (error: string | null): ScriptResult => ({
    tests,
    logs,
    variables: vars,
    request: request.snapshot(),
    error,
  });
  if (!code.trim()) return finish(null);

  const record = (name: string, outcome: unknown): void => {
    tests.push(
      outcome === undefined
        ? { name, passed: true }
        : { name, passed: false, error: errorMessage(outcome) },
    );
  };
  const pm = {
    environment: scopeApi(vars, "environment"),
    collectionVariables: scopeApi(vars, "collection"),
    globals: scopeApi(vars, "globals"),
    iterationData: scopeApi(vars, "data"),
    variables: {
      ...scopeApi(vars, "local"),
      get: (key: string) =>
        PRECEDENCE.map((scope) => vars[scope][key]).find((v) => v !== undefined),
    },
    request: request.api,
    response: responseApi(context.response),
    info: {
      iteration: context.iteration ?? 0,
      eventName: context.response ? "test" : "prerequest",
    },
    expect: chaiExpect,
    test: (name: string, fn: () => unknown) => {
      try {
        const result = fn();
        if (result instanceof Promise) {
          pending.push(
            result.then(
              () => record(name, undefined),
              (e: unknown) => record(name, e ?? "failed"),
            ),
          );
        } else {
          record(name, undefined);
        }
      } catch (e) {
        record(name, e ?? "failed");
      }
    },
  };
  const scriptConsole = Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((level) => [
      level,
      (...args: unknown[]) =>
        logs.push(args.map((a) => (typeof a === "string" ? a : asString(a))).join(" ")),
    ]),
  );

  try {
    await new Function("pm", "console", `"use strict";\nreturn (async () => {\n${code}\n})();`)(
      pm,
      scriptConsole,
    );
    await Promise.all(pending);
    return finish(null);
  } catch (error) {
    await Promise.allSettled(pending);
    return finish(errorMessage(error));
  }
}
