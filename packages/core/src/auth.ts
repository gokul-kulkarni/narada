import type { Auth } from "./model";
import { parseQueryParams, withQueryParams } from "./url-params";

export type HeaderPair = readonly [string, string];

export interface AuthTarget {
  readonly url: string;
  readonly headers: readonly HeaderPair[];
}

/** First non-inherit auth walking from the request up through folders to the collection. */
export function effectiveAuth(chain: readonly Auth[]): Auth {
  return chain.find((auth) => auth.type !== "inherit") ?? { type: "none" };
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function hasHeader(headers: readonly HeaderPair[], name: string): boolean {
  const lower = name.toLowerCase();
  return headers.some(([key]) => key.toLowerCase() === lower);
}

function withAuthorization(target: AuthTarget, value: string): AuthTarget {
  return hasHeader(target.headers, "Authorization")
    ? target
    : { ...target, headers: [...target.headers, ["Authorization", value]] };
}

export function applyAuth(target: AuthTarget, auth: Auth): AuthTarget {
  switch (auth.type) {
    case "basic":
      return auth.username || auth.password
        ? withAuthorization(target, `Basic ${toBase64Utf8(`${auth.username}:${auth.password}`)}`)
        : target;
    case "bearer":
      return auth.token ? withAuthorization(target, `Bearer ${auth.token}`) : target;
    case "oauth2":
      return auth.accessToken ? withAuthorization(target, `Bearer ${auth.accessToken}`) : target;
    case "apikey":
      if (!auth.key) return target;
      return auth.in === "header"
        ? { ...target, headers: [...target.headers, [auth.key, auth.value]] }
        : {
            ...target,
            url: withQueryParams(target.url, [
              ...parseQueryParams(target.url),
              { key: auth.key, value: auth.value },
            ]),
          };
    case "none":
    case "inherit":
      return target;
  }
}
