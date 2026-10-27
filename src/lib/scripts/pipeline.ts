import { newKeyValue } from "../factories";
import { errorMessage } from "../format";
import type { Auth, HttpResponse, RequestDef } from "../model";
import { prepareRequest, type PreparedRequest } from "../prepare-request";
import type { VariableScopes } from "../variables";
import type { ExecuteScript } from "./script-runner";
import type { ScriptRequest, ScriptVariables, TestResult } from "./types";

export interface PipelineInput {
  readonly request: RequestDef;
  readonly scopes: VariableScopes;
  readonly authChain: readonly Auth[];
  /** Collection-level scripts run before the request's own. */
  readonly collectionScripts?: { readonly preRequest: string; readonly test: string };
  readonly iteration?: number;
}

export interface PipelineDeps {
  readonly send: (request: PreparedRequest) => Promise<HttpResponse>;
  readonly execute: ExecuteScript;
}

export interface PipelineResult {
  readonly response: HttpResponse | null;
  readonly error: string | null;
  readonly tests: readonly TestResult[];
  readonly logs: readonly string[];
  /** Variables after all scripts ran; callers persist the changes. */
  readonly scopes: VariableScopes;
}

const toScriptVariables = (s: VariableScopes): ScriptVariables => ({
  globals: s.global,
  collection: s.collection,
  environment: s.environment,
  data: s.data,
  local: s.local,
});

const toScopes = (v: ScriptVariables): VariableScopes => ({
  global: v.globals,
  collection: v.collection,
  environment: v.environment,
  data: v.data,
  local: v.local,
});

const toScriptRequest = (r: RequestDef): ScriptRequest => ({
  method: r.method,
  url: r.url,
  headers: r.headers.filter((h) => h.enabled).map((h) => [h.key, h.value] as const),
});

/** Applies header/url/method edits made by pre-request scripts to the request definition. */
function applyScriptRequest(request: RequestDef, edited: ScriptRequest): RequestDef {
  const disabled = request.headers.filter((h) => !h.enabled);
  return {
    ...request,
    method: (edited.method.toUpperCase() as RequestDef["method"]) || request.method,
    url: edited.url,
    headers: [...edited.headers.map(([k, v]) => newKeyValue(k, v)), ...disabled],
  };
}

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  let scopes = input.scopes;
  let request = input.request;
  const tests: TestResult[] = [];
  const logs: string[] = [];
  const fail = (error: string, response: HttpResponse | null = null): PipelineResult => ({
    response,
    error,
    tests,
    logs,
    scopes,
  });

  const run = async (code: string, label: string, response: HttpResponse | null) => {
    const result = await deps.execute(code, {
      request: toScriptRequest(request),
      response,
      variables: toScriptVariables(scopes),
      iteration: input.iteration,
    });
    tests.push(...result.tests);
    logs.push(...result.logs);
    scopes = toScopes(result.variables);
    if (!response) request = applyScriptRequest(request, result.request);
    return result.error ? `${label} error: ${result.error}` : null;
  };

  const preRequest = [
    [input.collectionScripts?.preRequest ?? "", "Collection pre-request script"],
    [request.preRequestScript, "Pre-request script"],
  ] as const;
  for (const [code, label] of preRequest) {
    const error = code.trim() ? await run(code, label, null) : null;
    if (error) return fail(error);
  }

  let response: HttpResponse;
  try {
    const prepared = prepareRequest(request, { scopes, authChain: input.authChain });
    if (!prepared.url) return fail("Enter a URL to send the request.");
    response = await deps.send(prepared);
  } catch (error) {
    return fail(errorMessage(error));
  }

  const testScripts = [
    [input.collectionScripts?.test ?? "", "Collection test script"],
    [request.testScript, "Test script"],
  ] as const;
  for (const [code, label] of testScripts) {
    const error = code.trim() ? await run(code, label, response) : null;
    if (error) return fail(error, response);
  }
  return { response, error: null, tests, logs, scopes };
}
