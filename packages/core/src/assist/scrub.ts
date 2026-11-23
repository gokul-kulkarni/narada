import type { SecretValue } from "./types";

export const REDACTED = "[redacted]";

/** Shorter secret values would replace ordinary text, so they are left to the structural rules. */
const MIN_SECRET_LENGTH = 4;

// Matched against the lowercased name with separators removed ("X-Api-Key" → "xapikey").
// `tokens` (max_tokens, total_tokens) and token URLs/types are ordinary values, not secrets.
const SENSITIVE_PART =
  /password|passwd|secret|token(?!s|url|type|endpoint)|apikey|authorization|cookie|credential|privatekey|signature|sessionid/;
const SENSITIVE_EXACT = new Set(["auth", "xauth", "session", "sid", "pwd", "pass"]);

// Variables, and values already hidden by an earlier pass, show how a value is wired up.
const PLACEHOLDER = /\{\{[^{}]+\}\}|\[secret:[^\]]+\]|\[redacted\]/g;
/** What may surround placeholders and still be safe: "Bearer {{token}}", "{{user}}:{{pass}}". */
const PLACEHOLDER_FRAME = /^(bearer|basic|token)?[\s:]*$/i;

const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const AUTH_SCHEME = /\b(Bearer|Basic)[ \t]+(?!\{\{)[A-Za-z0-9._~+/=-]{8,}/gi;
const JSON_STRING_PAIR = /"((?:[^"\\]|\\.)*)"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g;
const QUERY_PAIR = /([?&])([^=&#\s"']+)=([^&#\s"']*)/g;

export function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_EXACT.has(normalized) || SENSITIVE_PART.test(normalized);
}

/** Hides a value unless it is empty or only placeholders (`{{name}}`, or already hidden). */
export function maskValue(value: string): string {
  if (value === "") return value;
  const hasPlaceholder = value.match(PLACEHOLDER) !== null;
  const frame = value.replace(PLACEHOLDER, "").trim();
  return hasPlaceholder && PLACEHOLDER_FRAME.test(frame) ? value : REDACTED;
}

function replaceSecrets(text: string, secrets: readonly SecretValue[]): string {
  const ordered = secrets
    .filter((secret) => secret.value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.value.length - a.value.length);
  return ordered.reduce(
    (out, secret) =>
      out.split(secret.value).join(secret.name ? `[secret:${secret.name}]` : REDACTED),
    text,
  );
}

/** Removes known secret values and credential-shaped text (JWTs, auth schemes, sensitive keys). */
export function scrubText(text: string, secrets: readonly SecretValue[]): string {
  return replaceSecrets(text, secrets)
    .replace(JWT, REDACTED)
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(JSON_STRING_PAIR, (match, key: string, colon: string, value: string) =>
      isSensitiveName(key) ? `"${key}"${colon}"${maskValue(value)}"` : match,
    )
    .replace(QUERY_PAIR, (match, sep: string, key: string, value: string) =>
      isSensitiveName(key) ? `${sep}${key}=${maskValue(value)}` : match,
    );
}

/** Scrubs every string in a JSON-like value and masks string fields with sensitive names. */
export function scrubDeep<T>(value: T, secrets: readonly SecretValue[]): T {
  return scrubValue(value, secrets) as T;
}

function scrubValue(value: unknown, secrets: readonly SecretValue[]): unknown {
  if (typeof value === "string") return scrubText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, secrets));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" && isSensitiveName(key)
        ? scrubText(maskValue(item), secrets)
        : scrubValue(item, secrets),
    ]),
  );
}
