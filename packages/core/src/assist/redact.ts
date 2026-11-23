import type { Auth, HttpRequestDef, KeyValue, RequestBody, RequestDef } from "../model";
import { isSensitiveName, maskValue, scrubDeep } from "./scrub";
import type { AgentContext, AgentOutcome, SecretValue } from "./types";

const redactPairs = (pairs: readonly KeyValue[]): KeyValue[] =>
  pairs.map((pair) =>
    isSensitiveName(pair.key) ? { ...pair, value: maskValue(pair.value) } : pair,
  );

/** Keeps the auth type and non-secret fields (username, client id) so the agent sees the setup. */
export function redactAuth(auth: Auth): Auth {
  switch (auth.type) {
    case "inherit":
    case "none":
      return auth;
    case "basic":
      return { ...auth, password: maskValue(auth.password) };
    case "bearer":
      return { ...auth, token: maskValue(auth.token) };
    case "apikey":
      return { ...auth, value: maskValue(auth.value) };
    case "oauth2":
      return {
        ...auth,
        clientSecret: maskValue(auth.clientSecret),
        accessToken: maskValue(auth.accessToken),
      };
  }
}

function redactBody(body: RequestBody): RequestBody {
  return body.mode === "urlencoded" || body.mode === "formdata"
    ? { ...body, fields: redactPairs(body.fields) }
    : body;
}

function redactHttpRequest(request: HttpRequestDef): HttpRequestDef {
  return {
    ...request,
    headers: redactPairs(request.headers),
    body: redactBody(request.body),
    auth: redactAuth(request.auth),
  };
}

const redactRequest = (request: RequestDef): RequestDef =>
  request.protocol === "http" ? redactHttpRequest(request) : request;

function redactOutcome(outcome: AgentOutcome): AgentOutcome {
  if (outcome.kind !== "http") return outcome;
  const headers = outcome.response.headers.map(
    ([name, value]) => [name, isSensitiveName(name) ? maskValue(value) : value] as const,
  );
  return { ...outcome, response: { ...outcome.response, headers } };
}

/**
 * Masks credentials by position (headers, auth, form fields), then scrubs every string for
 * known secret values and credential-shaped text. Returns a new context.
 */
export function redactContext(
  context: AgentContext,
  secrets: readonly SecretValue[],
): AgentContext {
  const structural: AgentContext = {
    ...context,
    request: redactRequest(context.request),
    outcome: redactOutcome(context.outcome),
  };
  return scrubDeep(structural, secrets);
}
