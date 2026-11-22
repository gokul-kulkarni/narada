import { applyAuth } from "./auth";
import type { Auth } from "./model";
import type { PreparedRequest } from "./prepare-request";

type OAuth2 = Extract<Auth, { type: "oauth2" }>;

/** Client-credentials token request; credentials go in a Basic header as RFC 6749 §2.3.1 requires servers to support. */
export function buildTokenRequest(auth: OAuth2, timeoutMs = 30_000): PreparedRequest {
  if (!auth.tokenUrl.trim()) throw new Error("Enter the token URL first.");
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    ...(auth.scope ? { scope: auth.scope } : {}),
  });
  const { headers } = applyAuth(
    {
      url: auth.tokenUrl,
      headers: [
        ["Content-Type", "application/x-www-form-urlencoded"],
        ["Accept", "application/json"],
      ],
    },
    { type: "basic", username: auth.clientId, password: auth.clientSecret },
  );
  return {
    method: "POST",
    url: auth.tokenUrl.trim(),
    headers,
    body: { type: "text", content: form.toString() },
    timeoutMs,
  };
}

function parseBody(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body);
  } catch {
    // Some servers answer form-encoded.
    return Object.fromEntries(new URLSearchParams(body));
  }
}

export function parseTokenResponse(status: number, body: string): string {
  const parsed = parseBody(body);
  if (status >= 400 || typeof parsed.access_token !== "string") {
    const reason = [parsed.error, parsed.error_description]
      .filter((v) => typeof v === "string")
      .join(": ");
    throw new Error(`Token request failed (${status})${reason ? `: ${reason}` : ""}`);
  }
  return parsed.access_token;
}
