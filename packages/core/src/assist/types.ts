import type { McpOperation, RequestDef } from "../model";

/**
 * A value that must never reach an agent: a secret environment variable or a keychain value.
 * `name` labels the replacement (`[secret:name]`); null for values without a variable name.
 */
export interface SecretValue {
  readonly name: string | null;
  readonly value: string;
}

export interface AgentTestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

/** An HTTP response as an agent sees it: no stream timeline, no binary bytes. */
export interface AgentHttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: string;
  readonly isBinary: boolean;
  readonly sizeBytes: number;
  readonly timeMs: number;
  readonly incomplete: string | null;
}

export type AgentOutcome =
  | { readonly kind: "http"; readonly response: AgentHttpResponse }
  | {
      readonly kind: "mcp";
      readonly operation: McpOperation["type"];
      /** MCP JSON, or a shortened JSON string when it was too large. */
      readonly result: unknown;
      readonly isError: boolean;
      readonly timeMs: number;
    }
  | { readonly kind: "not-delivered"; readonly message: string };

/** Everything an agent is told about one delivery, already redacted and shortened. */
export interface AgentContext {
  /** The request as written in the tab, with `{{variables}}` unresolved. */
  readonly request: RequestDef;
  readonly outcome: AgentOutcome;
  readonly tests: readonly AgentTestResult[];
  readonly environment: string | null;
  /** Names of the variables in scope; values are never included. */
  readonly variableNames: readonly string[];
  /** The user's own question, or null for "why did this fail?". */
  readonly question: string | null;
}
