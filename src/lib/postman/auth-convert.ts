import type { Auth } from "../model";
import { authSchema, type PostmanAuth } from "./schema";

const param = (auth: PostmanAuth, ...keys: string[]) =>
  keys.map((key) => auth.params[key]).find((value) => value !== undefined) ?? "";

/** `missing` is what an absent auth means at this level (inherit for items, none for collections). */
export function authFromPostman(raw: unknown, missing: Auth): Auth {
  const parsed = authSchema.safeParse(raw);
  if (!parsed.success) return missing;
  const auth = parsed.data;
  switch (auth.type) {
    case "noauth":
      return { type: "none" };
    case "inherit":
      return { type: "inherit" };
    case "basic":
      return {
        type: "basic",
        username: param(auth, "username"),
        password: param(auth, "password"),
      };
    case "bearer":
      return { type: "bearer", token: param(auth, "token") };
    case "apikey":
      return {
        type: "apikey",
        key: param(auth, "key"),
        value: param(auth, "value"),
        in: param(auth, "in") === "query" ? "query" : "header",
      };
    case "oauth2":
      return {
        type: "oauth2",
        tokenUrl: param(auth, "accessTokenUrl", "tokenUrl"),
        clientId: param(auth, "clientId"),
        clientSecret: param(auth, "clientSecret"),
        scope: param(auth, "scope"),
        accessToken: param(auth, "accessToken"),
      };
    default:
      return { type: "none" };
  }
}

const params = (entries: Record<string, string>) =>
  Object.entries(entries).map(([key, value]) => ({ key, value, type: "string" }));

/** Returns undefined when nothing should be written (inherit, or none at collection level). */
export function authToPostman(auth: Auth, omitNone = false): object | undefined {
  switch (auth.type) {
    case "inherit":
      return undefined;
    case "none":
      return omitNone ? undefined : { type: "noauth" };
    case "basic":
      return { type: "basic", basic: params({ username: auth.username, password: auth.password }) };
    case "bearer":
      return { type: "bearer", bearer: params({ token: auth.token }) };
    case "apikey":
      return { type: "apikey", apikey: params({ key: auth.key, value: auth.value, in: auth.in }) };
    case "oauth2":
      return {
        type: "oauth2",
        oauth2: params({
          accessTokenUrl: auth.tokenUrl,
          clientId: auth.clientId,
          clientSecret: auth.clientSecret,
          scope: auth.scope,
          accessToken: auth.accessToken,
          grant_type: "client_credentials",
        }),
      };
  }
}
