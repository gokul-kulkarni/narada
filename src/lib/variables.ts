export type VariableMap = Readonly<Record<string, string>>;

export interface VariableScopes {
  readonly global: VariableMap;
  readonly collection: VariableMap;
  readonly environment: VariableMap;
  readonly data: VariableMap;
  readonly local: VariableMap;
}

/** Highest precedence first, matching Postman. */
const SCOPE_PRECEDENCE: readonly (keyof VariableScopes)[] = [
  "local",
  "data",
  "environment",
  "collection",
  "global",
];

const VARIABLE_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export function lookupVariable(name: string, scopes: VariableScopes): string | undefined {
  for (const scope of SCOPE_PRECEDENCE) {
    if (Object.hasOwn(scopes[scope], name)) {
      return scopes[scope][name];
    }
  }
  return undefined;
}

/** Replaces `{{name}}` placeholders in a single pass; unknown variables are left as-is. */
export function resolveTemplate(template: string, scopes: VariableScopes): string {
  return template.replace(
    VARIABLE_PATTERN,
    (match, name: string) => lookupVariable(name, scopes) ?? match,
  );
}
