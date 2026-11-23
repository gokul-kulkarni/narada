import { isSensitiveName, maskValue } from "../assist/scrub";
import type { SecretValue } from "../assist/types";

const MIN_SECRET_LENGTH = 4;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const AUTH_SCHEME = /\b(Bearer|Basic)[ \t]+(?!\{\{)[A-Za-z0-9._~+/=-]{8,}/gi;
const QUERY_PAIR = /([?&])([^=&#\s"']+)=([^&#\s"']*)/g;
const JSON_STRING_PAIR = /"((?:[^"\\]|\\.)*)"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g;

/** "X-Api-Key" → "xApiKey", "api_key" → "apiKey". */
export function variableNameFor(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const camel = parts
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part[0]?.toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
  return camel || "secret";
}

const isLiteral = (value: string) => value !== "" && maskValue(value) !== value;

/**
 * Keeps literal secrets out of requests an agent creates, which are saved to synced files:
 * each becomes a `{{variable}}` the user sets, and `introduced` records which.
 */
export class SecretGuard {
  readonly introduced = new Set<string>();
  private readonly secrets: readonly SecretValue[];

  constructor(secrets: readonly SecretValue[]) {
    this.secrets = secrets
      .filter((s) => s.value.length >= MIN_SECRET_LENGTH)
      .sort((a, b) => b.value.length - a.value.length);
  }

  private use(name: string): string {
    this.introduced.add(name);
    return `{{${name}}}`;
  }

  /** Free text (URL, raw body): known secret values and credential-shaped text. */
  text(input: string): string {
    const known = this.secrets.reduce(
      (out, secret) =>
        out.includes(secret.value)
          ? out.split(secret.value).join(this.use(secret.name ?? "secret"))
          : out,
      input,
    );
    return known
      .replace(JWT, () => this.use("token"))
      .replace(AUTH_SCHEME, (_m, scheme: string) => `${scheme} ${this.use("token")}`)
      .replace(QUERY_PAIR, (match, sep: string, key: string, value: string) =>
        isSensitiveName(key) && isLiteral(value)
          ? `${sep}${key}=${this.use(variableNameFor(key))}`
          : match,
      )
      .replace(JSON_STRING_PAIR, (match, key: string, colon: string, value: string) =>
        isSensitiveName(key) && isLiteral(value)
          ? `"${key}"${colon}"${this.use(variableNameFor(key))}"`
          : match,
      );
  }

  /** A named value (header, form field): a credential-named literal becomes a variable. */
  field(name: string, value: string): string {
    const cleaned = this.text(value);
    if (!isSensitiveName(name) || !isLiteral(cleaned)) return cleaned;
    return /^Bearer\s/i.test(cleaned)
      ? `Bearer ${this.use("token")}`
      : this.use(variableNameFor(name));
  }
}
