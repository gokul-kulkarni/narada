import { newId } from "../ids";
import type { Environment } from "../model";
import { environmentSchema } from "./schema";

export function fromPostmanEnvironment(json: unknown): Environment {
  const parsed = environmentSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("This file is not a Postman environment (expected name and values[]).");
  }
  const id = parsed.data.id ?? newId();
  return {
    id,
    name: parsed.data.name,
    variables: parsed.data.values.map((row, index) => ({
      id: `${id}-e${index}`,
      key: row.key,
      value: row.value,
      enabled: row.enabled !== false && row.disabled !== true,
      secret: row.type === "secret",
    })),
  };
}

export function toPostmanEnvironment(environment: Environment): object {
  return {
    id: environment.id,
    name: environment.name,
    values: environment.variables.map((v) => ({
      key: v.key,
      value: v.value,
      type: v.secret ? "secret" : "default",
      enabled: v.enabled,
    })),
    _postman_variable_scope: "environment",
  };
}
