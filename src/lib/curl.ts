import { newKeyValue, newRequest } from "./factories";
import type { Auth, HttpMethod, KeyValue, RequestBody, RequestDef } from "./model";
import { HTTP_METHODS } from "./model";
import { parseQueryParams, withQueryParams } from "./url-params";

/** Splits a shell command line into words, honouring quotes, backslashes and `\` newlines. */
export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\" && i + 1 < input.length && '"\\$`'.includes(input[i + 1]))
        current += input[++i];
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      inToken = true;
    } else if (char === "\\" && i + 1 < input.length) {
      const next = input[++i];
      if (next !== "\n") {
        current += next;
        inToken = true;
      }
    } else if (/\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
    } else {
      current += char;
      inToken = true;
    }
  }
  if (quote) throw new Error("Unterminated quote in command");
  if (inToken) tokens.push(current);
  return tokens;
}

const VALUE_FLAGS: Record<string, string> = {
  "-X": "method",
  "--request": "method",
  "-H": "header",
  "--header": "header",
  "-d": "data",
  "--data": "data",
  "--data-raw": "data",
  "--data-binary": "data",
  "--data-ascii": "data",
  "--data-urlencode": "data",
  "-F": "form",
  "--form": "form",
  "-u": "user",
  "--user": "user",
  "-A": "agent",
  "--user-agent": "agent",
  "-b": "cookie",
  "--cookie": "cookie",
  "--url": "url",
};

const IGNORED_VALUE_FLAGS = new Set([
  "-o",
  "--output",
  "-m",
  "--max-time",
  "--connect-timeout",
  "-e",
  "--referer",
  "-w",
  "--write-out",
]);

interface CurlParts {
  method?: string;
  url?: string;
  headers: [string, string][];
  data: string[];
  form: [string, string][];
  user?: string;
  getMode: boolean;
}

function splitPair(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  return index === -1
    ? [text.trim(), ""]
    : [text.slice(0, index).trim(), text.slice(index + 1).trim()];
}

function collect(tokens: string[]): CurlParts {
  const parts: CurlParts = { headers: [], data: [], form: [], getMode: false };
  const apply = (kind: string, value: string) => {
    if (kind === "method") parts.method = value;
    else if (kind === "header") parts.headers.push(splitPair(value, ":"));
    else if (kind === "data") parts.data.push(value);
    else if (kind === "form") parts.form.push(splitPair(value, "="));
    else if (kind === "user") parts.user = value;
    else if (kind === "agent") parts.headers.push(["User-Agent", value]);
    else if (kind === "cookie") parts.headers.push(["Cookie", value]);
    else if (kind === "url") parts.url = value;
  };
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const [flag, inline] =
      token.startsWith("--") && token.includes("=") ? splitPair(token, "=") : [token, undefined];
    if (VALUE_FLAGS[flag]) {
      apply(VALUE_FLAGS[flag], inline ?? tokens[++i] ?? "");
    } else if (/^-X[A-Z]+$/.test(token)) {
      parts.method = token.slice(2);
    } else if (token === "-G" || token === "--get") {
      parts.getMode = true;
    } else if (IGNORED_VALUE_FLAGS.has(flag)) {
      if (inline === undefined) i++;
    } else if (!token.startsWith("-")) {
      parts.url = token;
    }
  }
  return parts;
}

const toRows = (pairs: [string, string][]): KeyValue[] => pairs.map(([k, v]) => newKeyValue(k, v));

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

function buildBody(parts: CurlParts, contentType: string): RequestBody {
  if (parts.form.length > 0) return { mode: "formdata", fields: toRows(parts.form) };
  if (parts.data.length === 0) return { mode: "none" };
  const data = parts.data.join("&");
  if (contentType.includes("json") || (!contentType && /^\s*[[{]/.test(data))) {
    return { mode: "raw", raw: data, language: "json" };
  }
  if (!contentType || contentType.includes("x-www-form-urlencoded")) {
    const fields = data
      .split("&")
      .filter(Boolean)
      .map((pair) => splitPair(pair, "="))
      .map(([k, v]) => [safeDecode(k), safeDecode(v)] as [string, string]);
    return { mode: "urlencoded", fields: toRows(fields) };
  }
  return { mode: "raw", raw: data, language: contentType.includes("xml") ? "xml" : "text" };
}

export function parseCurl(command: string): RequestDef {
  const tokens = tokenizeShell(command.trim());
  if (tokens[0] !== "curl") throw new Error("Not a curl command (it should start with `curl`).");
  const parts = collect(tokens);
  if (!parts.url) throw new Error("No URL found in the curl command.");

  const contentType = parts.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  const hasBody = parts.data.length > 0 || parts.form.length > 0;
  const url =
    parts.getMode && parts.data.length > 0
      ? withQueryParams(parts.url, [
          ...parseQueryParams(parts.url),
          ...parts.data
            .join("&")
            .split("&")
            .map((pair) => {
              const [key, value] = splitPair(pair, "=");
              return { key, value };
            }),
        ])
      : parts.url;
  const upper = (parts.method ?? (hasBody && !parts.getMode ? "POST" : "GET")).toUpperCase();
  const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(upper)
    ? (upper as HttpMethod)
    : "GET";
  const [username, password] = parts.user ? splitPair(parts.user, ":") : ["", ""];
  const auth: Auth = parts.user ? { type: "basic", username, password } : { type: "inherit" };

  return newRequest({
    name: url,
    method,
    url,
    headers: toRows(parts.headers),
    body: parts.getMode ? { mode: "none" } : buildBody(parts, contentType),
    auth,
  });
}
