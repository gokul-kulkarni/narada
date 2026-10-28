export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface KeyValue {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
}

export type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";

export type RequestBody =
  | { readonly mode: "none" }
  | { readonly mode: "raw"; readonly raw: string; readonly language: RawLanguage }
  | { readonly mode: "urlencoded"; readonly fields: readonly KeyValue[] }
  | { readonly mode: "formdata"; readonly fields: readonly KeyValue[] };

export type Auth =
  | { readonly type: "inherit" }
  | { readonly type: "none" }
  | { readonly type: "basic"; readonly username: string; readonly password: string }
  | { readonly type: "bearer"; readonly token: string }
  | {
      readonly type: "apikey";
      readonly key: string;
      readonly value: string;
      readonly in: "header" | "query";
    }
  | {
      readonly type: "oauth2";
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: string;
      readonly scope: string;
      readonly accessToken: string;
    };

export type AuthType = Auth["type"];

export interface HttpRequestDef {
  readonly protocol: "http";
  readonly id: string;
  readonly name: string;
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers: readonly KeyValue[];
  readonly body: RequestBody;
  readonly auth: Auth;
  readonly preRequestScript: string;
  readonly testScript: string;
}

/** A saved or open request of any protocol; each protocol module in src/protocols handles its own. */
export type RequestDef = HttpRequestDef;
export type ProtocolId = RequestDef["protocol"];

export interface FolderItem {
  readonly kind: "folder";
  readonly id: string;
  readonly name: string;
  readonly auth: Auth;
  readonly items: readonly CollectionItem[];
}

export interface RequestItem {
  readonly kind: "request";
  readonly request: RequestDef;
}

export type CollectionItem = FolderItem | RequestItem;

export interface Collection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly auth: Auth;
  readonly variables: readonly KeyValue[];
  readonly items: readonly CollectionItem[];
  readonly preRequestScript: string;
  readonly testScript: string;
}

export interface EnvironmentVariable extends KeyValue {
  readonly secret: boolean;
}

export interface Environment {
  readonly id: string;
  readonly name: string;
  readonly variables: readonly EnvironmentVariable[];
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: string;
  readonly isBinary: boolean;
  readonly sizeBytes: number;
  readonly timeMs: number;
  /** When each streamed piece arrived; `end` is the body length after that piece. */
  readonly timeline?: readonly StreamMark[];
  /** Why the body stopped early (stopped, idle, size limit), if it did. */
  readonly incomplete?: string | null;
}

/** The outcome of sending a request, per protocol. Script results live on the tab. */
export interface HttpDelivery {
  readonly protocol: "http";
  readonly response: HttpResponse;
}

export type Delivery = HttpDelivery;

export interface StreamMark {
  readonly atMs: number;
  readonly end: number;
}

export interface HistoryEntry {
  readonly id: string;
  readonly sentAt: string;
  readonly request: RequestDef;
  readonly status: number | null;
  readonly timeMs: number | null;
  /** Name of the environment the request was sent to; missing in history from older versions. */
  readonly environment?: string | null;
}
