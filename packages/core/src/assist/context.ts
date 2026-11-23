import type { Delivery, HttpResponse, RequestDef } from "../model";
import { redactContext } from "./redact";
import { DEFAULT_LIMITS, truncateContext, type TruncateLimits } from "./truncate";
import type {
  AgentContext,
  AgentHttpResponse,
  AgentOutcome,
  AgentTestResult,
  SecretValue,
} from "./types";

/** What came back: a delivery, or the reason the request never arrived. */
export type AgentResultInput = { readonly delivery: Delivery } | { readonly error: string };

export interface AgentContextInput {
  /** The request as written in the tab, with `{{variables}}` unresolved. */
  readonly request: RequestDef;
  readonly result: AgentResultInput;
  readonly tests: readonly AgentTestResult[];
  readonly environment: string | null;
  readonly variableNames: readonly string[];
  /** Secret variable values and keychain values to remove wherever they appear. */
  readonly secrets: readonly SecretValue[];
  readonly question?: string | null;
  readonly limits?: TruncateLimits;
}

const toAgentResponse = (response: HttpResponse): AgentHttpResponse => ({
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  body: response.isBinary ? "" : response.body,
  isBinary: response.isBinary,
  sizeBytes: response.sizeBytes,
  timeMs: response.timeMs,
  incomplete: response.incomplete ?? null,
});

function toOutcome(result: AgentResultInput): AgentOutcome {
  if ("error" in result) return { kind: "not-delivered", message: result.error };
  const { delivery } = result;
  if (delivery.protocol === "http")
    return { kind: "http", response: toAgentResponse(delivery.response) };
  return {
    kind: "mcp",
    operation: delivery.operation,
    result: delivery.result,
    isError: delivery.isError,
    timeMs: delivery.timeMs,
  };
}

const normalizeQuestion = (question: string | null | undefined): string | null =>
  question?.trim() || null;

/**
 * Builds what an agent is told about one delivery. Secrets are removed before anything is
 * shortened, so a secret can never be split across a truncation boundary and survive.
 */
export function buildAgentContext(input: AgentContextInput): AgentContext {
  const raw: AgentContext = {
    request: input.request,
    outcome: toOutcome(input.result),
    tests: input.tests,
    environment: input.environment,
    variableNames: [...new Set(input.variableNames)].sort(),
    question: normalizeQuestion(input.question),
  };
  return truncateContext(redactContext(raw, input.secrets), input.limits ?? DEFAULT_LIMITS);
}
