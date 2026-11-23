import type { RequestDef } from "../model";
import type { AgentContext, AgentOutcome, AgentTestResult } from "./types";

/** Character limits per field, so one large response cannot crowd out the rest of the prompt. */
export interface TruncateLimits {
  readonly bodyChars: number;
  readonly scriptChars: number;
  readonly mcpResultChars: number;
  readonly messageChars: number;
}

export const DEFAULT_LIMITS: TruncateLimits = {
  bodyChars: 32_000,
  scriptChars: 4_000,
  mcpResultChars: 32_000,
  messageChars: 4_000,
};

/** Keeps the start and end of a long text (where errors usually are) and marks the gap. */
export function truncateText(text: string, maxChars: number): string {
  if (!(maxChars > 0)) throw new RangeError(`maxChars must be positive, got ${maxChars}`);
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.ceil(maxChars / 2));
  const tail = text.slice(text.length - Math.floor(maxChars / 2));
  return `${head}\n… [${text.length - maxChars} characters omitted] …\n${tail}`;
}

function truncateRequest(request: RequestDef, limits: TruncateLimits): RequestDef {
  if (request.protocol !== "http") return request;
  const body =
    request.body.mode === "raw"
      ? { ...request.body, raw: truncateText(request.body.raw, limits.bodyChars) }
      : request.body;
  return {
    ...request,
    body,
    preRequestScript: truncateText(request.preRequestScript, limits.scriptChars),
    testScript: truncateText(request.testScript, limits.scriptChars),
  };
}

function truncateOutcome(outcome: AgentOutcome, limits: TruncateLimits): AgentOutcome {
  switch (outcome.kind) {
    case "http":
      return {
        ...outcome,
        response: {
          ...outcome.response,
          body: truncateText(outcome.response.body, limits.bodyChars),
        },
      };
    case "mcp": {
      const json = JSON.stringify(outcome.result, null, 2) ?? "undefined";
      return json.length > limits.mcpResultChars
        ? { ...outcome, result: truncateText(json, limits.mcpResultChars) }
        : outcome;
    }
    case "not-delivered":
      return { ...outcome, message: truncateText(outcome.message, limits.messageChars) };
  }
}

const truncateTest = (test: AgentTestResult, limits: TruncateLimits): AgentTestResult =>
  test.error === undefined
    ? test
    : { ...test, error: truncateText(test.error, limits.messageChars) };

export function truncateContext(context: AgentContext, limits: TruncateLimits): AgentContext {
  return {
    ...context,
    request: truncateRequest(context.request, limits),
    outcome: truncateOutcome(context.outcome, limits),
    tests: context.tests.map((test) => truncateTest(test, limits)),
  };
}
