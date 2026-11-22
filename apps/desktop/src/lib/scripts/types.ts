import type { HttpResponse } from "../model";

export type VariableBag = Readonly<Record<string, string>>;

export interface ScriptVariables {
  readonly globals: VariableBag;
  readonly collection: VariableBag;
  readonly environment: VariableBag;
  readonly data: VariableBag;
  readonly local: VariableBag;
}

/** The request as scripts see it: unresolved, with `{{vars}}` intact. */
export interface ScriptRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly (readonly [string, string])[];
}

export interface ScriptContext {
  readonly request: ScriptRequest;
  readonly response: HttpResponse | null;
  readonly variables: ScriptVariables;
  readonly iteration?: number;
}

export interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

export interface ScriptResult {
  readonly tests: readonly TestResult[];
  readonly logs: readonly string[];
  readonly variables: ScriptVariables;
  readonly request: ScriptRequest;
  /** Uncaught error thrown by the script itself (not a failed test). */
  readonly error: string | null;
}
