import { formatBytes, formatDuration } from "../format";
import type { HttpRequestDef, McpRequestDef } from "../model";
import type { AgentContext, AgentHttpResponse, AgentOutcome, AgentTestResult } from "./types";

const DEFAULT_QUESTION =
  "Why did this request fail, and what should change in the request (or the server) to fix it?";

const PREAMBLE = [
  "You are helping debug a request sent from Narada, an API client.",
  "Secret values have been replaced with [redacted] or [secret:<variable>]; do not ask for them.",
  "`{{name}}` is a Narada variable that is filled in when the request is sent.",
].join("\n");

/** Wraps text in a code fence longer than any run of backticks inside it. */
export function fence(text: string, language = ""): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const marks = "`".repeat(Math.max(3, longestRun + 1));
  return `${marks}${language}\n${text}\n${marks}`;
}

const json = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "undefined");

function httpRequestSection(request: HttpRequestDef): string[] {
  const headers = request.headers.filter((h) => h.enabled).map((h) => `${h.key}: ${h.value}`);
  const lines = [`${request.method} ${request.url}`];
  if (headers.length > 0) lines.push("", "Headers:", fence(headers.join("\n"), "http"));
  lines.push("", `Auth: ${request.auth.type}`);
  if (request.auth.type !== "inherit" && request.auth.type !== "none") {
    lines.push(fence(json(request.auth), "json"));
  }
  const { body } = request;
  if (body.mode === "raw" && body.raw !== "")
    lines.push("", "Body:", fence(body.raw, body.language));
  if (body.mode === "urlencoded" || body.mode === "formdata") {
    const fields = body.fields.filter((f) => f.enabled).map((f) => `${f.key}=${f.value}`);
    lines.push("", `Body (${body.mode}):`, fence(fields.join("\n")));
  }
  if (request.preRequestScript.trim()) {
    lines.push("", "Pre-request script:", fence(request.preRequestScript, "javascript"));
  }
  if (request.testScript.trim())
    lines.push("", "Test script:", fence(request.testScript, "javascript"));
  return lines;
}

function mcpRequestSection(request: McpRequestDef): string[] {
  const { operation } = request;
  const target = operation.type === "resource" ? operation.uri : operation.name;
  const lines = [`MCP ${operation.type} \`${target}\` on server \`${request.serverId}\``];
  if (operation.type !== "resource")
    lines.push("", "Arguments:", fence(json(operation.arguments), "json"));
  return lines;
}

function httpResponseSection(response: AgentHttpResponse): string[] {
  const status = `${response.status} ${response.statusText}`.trim();
  const lines = [
    `${status} · ${formatDuration(response.timeMs)} · ${formatBytes(response.sizeBytes)}`,
  ];
  if (response.headers.length > 0) {
    const headers = response.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
    lines.push("", "Headers:", fence(headers, "http"));
  }
  if (response.isBinary) lines.push("", "(binary body not included)");
  else if (response.body !== "") lines.push("", "Body:", fence(response.body));
  if (response.incomplete) lines.push("", `Body is incomplete: ${response.incomplete}`);
  return lines;
}

function outcomeSection(outcome: AgentOutcome): string[] {
  switch (outcome.kind) {
    case "http":
      return httpResponseSection(outcome.response);
    case "mcp": {
      const name = outcome.operation[0]?.toUpperCase() + outcome.operation.slice(1);
      const label = outcome.isError ? `${name} reported an error` : "Returned";
      return [
        `${label} · ${formatDuration(outcome.timeMs)}`,
        "",
        fence(json(outcome.result), "json"),
      ];
    }
    case "not-delivered":
      return ["Not delivered: the request never reached the server.", "", fence(outcome.message)];
  }
}

const testLine = (test: AgentTestResult): string =>
  test.passed ? `- PASS ${test.name}` : `- FAIL ${test.name}: ${test.error ?? "failed"}`;

/** Renders a redacted context as the Markdown prompt every agent CLI receives. */
export function renderPrompt(context: AgentContext): string {
  const request =
    context.request.protocol === "http"
      ? httpRequestSection(context.request)
      : mcpRequestSection(context.request);
  const sections = [
    PREAMBLE,
    ["## Question", context.question ?? DEFAULT_QUESTION].join("\n\n"),
    ["## Request", ...request].join("\n"),
    ["## Response", ...outcomeSection(context.outcome)].join("\n"),
  ];
  if (context.tests.length > 0) {
    sections.push(["## Tests", ...context.tests.map(testLine)].join("\n"));
  }
  const names = context.variableNames.length > 0 ? context.variableNames.join(", ") : "none";
  sections.push(
    [
      "## Variables",
      `Environment: ${context.environment ?? "none"}`,
      `Variables in scope (names only): ${names}`,
    ].join("\n"),
  );
  return `${sections.join("\n\n")}\n`;
}
