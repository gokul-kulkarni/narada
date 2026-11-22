import { useState } from "react";
import { Button } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { sendHttp } from "../../lib/http-client";
import type { Auth } from "../../lib/model";
import { buildTokenRequest, parseTokenResponse } from "../../lib/oauth2";
import { resolveTemplate, type VariableScopes } from "../../lib/variables";

type OAuth2 = Extract<Auth, { type: "oauth2" }>;

export function OAuthTokenButton({
  auth,
  scopes,
  onToken,
}: {
  auth: OAuth2;
  scopes: VariableScopes;
  onToken: (token: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = (text: string) => resolveTemplate(text, scopes);

  const fetchToken = async () => {
    setBusy(true);
    setError(null);
    try {
      const resolved = {
        ...auth,
        tokenUrl: resolve(auth.tokenUrl),
        clientId: resolve(auth.clientId),
        clientSecret: resolve(auth.clientSecret),
        scope: resolve(auth.scope),
      };
      const response = await sendHttp(buildTokenRequest(resolved));
      onToken(parseTokenResponse(response.status, response.body));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button disabled={busy} onClick={() => void fetchToken()}>
        {busy ? "Requesting…" : "Get new access token"}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-err">
          {error}
        </span>
      )}
    </div>
  );
}
