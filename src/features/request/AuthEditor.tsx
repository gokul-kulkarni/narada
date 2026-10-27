import { Select, TextInput } from "../../components/ui";
import type { Auth, AuthType } from "../../lib/model";

const AUTH_LABELS: Record<AuthType, string> = {
  inherit: "Inherit auth from parent",
  none: "No Auth",
  basic: "Basic Auth",
  bearer: "Bearer Token",
  apikey: "API Key",
  oauth2: "OAuth 2.0 (client credentials)",
};

export function defaultAuth(type: AuthType): Auth {
  switch (type) {
    case "inherit":
    case "none":
      return { type };
    case "basic":
      return { type, username: "", password: "" };
    case "bearer":
      return { type, token: "" };
    case "apikey":
      return { type, key: "", value: "", in: "header" };
    case "oauth2":
      return { type, tokenUrl: "", clientId: "", clientSecret: "", scope: "", accessToken: "" };
  }
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-32 text-neutral-500">{label}</span>
      <TextInput
        aria-label={label}
        type={type}
        className="flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

interface Props {
  readonly auth: Auth;
  readonly onChange: (auth: Auth) => void;
  readonly allowInherit?: boolean;
  /** Rendered for OAuth 2.0 so callers can offer a "Get token" action. */
  readonly oauthActions?: React.ReactNode;
}

export function AuthEditor({ auth, onChange, allowInherit = true, oauthActions }: Props) {
  const types = (Object.keys(AUTH_LABELS) as AuthType[]).filter(
    (t) => allowInherit || t !== "inherit",
  );
  return (
    <div className="max-w-xl space-y-2">
      <Select
        aria-label="Auth type"
        value={auth.type}
        onChange={(e) => onChange(defaultAuth(e.target.value as AuthType))}
      >
        {types.map((type) => (
          <option key={type} value={type}>
            {AUTH_LABELS[type]}
          </option>
        ))}
      </Select>
      {auth.type === "basic" && (
        <>
          <Field
            label="Username"
            value={auth.username}
            onChange={(username) => onChange({ ...auth, username })}
          />
          <Field
            label="Password"
            type="password"
            value={auth.password}
            onChange={(password) => onChange({ ...auth, password })}
          />
        </>
      )}
      {auth.type === "bearer" && (
        <Field
          label="Token"
          value={auth.token}
          onChange={(token) => onChange({ ...auth, token })}
        />
      )}
      {auth.type === "apikey" && (
        <>
          <Field label="Key" value={auth.key} onChange={(key) => onChange({ ...auth, key })} />
          <Field
            label="Value"
            value={auth.value}
            onChange={(value) => onChange({ ...auth, value })}
          />
          <Select
            aria-label="Add to"
            value={auth.in}
            onChange={(e) => onChange({ ...auth, in: e.target.value as "header" | "query" })}
          >
            <option value="header">Header</option>
            <option value="query">Query Params</option>
          </Select>
        </>
      )}
      {auth.type === "oauth2" && (
        <>
          <Field
            label="Token URL"
            value={auth.tokenUrl}
            onChange={(tokenUrl) => onChange({ ...auth, tokenUrl })}
          />
          <Field
            label="Client ID"
            value={auth.clientId}
            onChange={(clientId) => onChange({ ...auth, clientId })}
          />
          <Field
            label="Client Secret"
            type="password"
            value={auth.clientSecret}
            onChange={(clientSecret) => onChange({ ...auth, clientSecret })}
          />
          <Field
            label="Scope"
            value={auth.scope}
            onChange={(scope) => onChange({ ...auth, scope })}
          />
          <Field
            label="Access Token"
            value={auth.accessToken}
            onChange={(accessToken) => onChange({ ...auth, accessToken })}
          />
          {oauthActions}
        </>
      )}
      <p className="text-xs text-neutral-500">{"Values can use {{variables}}."}</p>
    </div>
  );
}
