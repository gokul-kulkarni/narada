import { errorMessage } from "../format";
import type { Collection, Environment } from "../model";
import { fromPostmanCollection, toPostmanCollection } from "../postman/collection";
import { fromPostmanEnvironment, toPostmanEnvironment } from "../postman/environment";
import type { DocumentStore, SecretStore } from "./document-store";

export const COLLECTION_SUFFIX = ".postman_collection.json";
export const ENVIRONMENT_SUFFIX = ".postman_environment.json";

export interface LoadError {
  readonly fileName: string;
  readonly message: string;
}

export interface Loaded<T> {
  readonly items: T[];
  readonly errors: LoadError[];
}

/** File names are derived from ids (stable across renames); unsafe characters are replaced. */
export const fileStem = (id: string): string =>
  id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "untitled";
export const collectionFileName = (collection: Collection) =>
  fileStem(collection.id) + COLLECTION_SUFFIX;
export const environmentFileName = (environment: Environment) =>
  fileStem(environment.id) + ENVIRONMENT_SUFFIX;
export const secretKey = (environmentId: string, variableKey: string) =>
  `env:${environmentId}:${variableKey}`;

const stringify = (value: object) => `${JSON.stringify(value, null, 2)}\n`;

function parseAll<T>(
  docs: { fileName: string; content: string }[],
  parse: (json: unknown) => T,
): Loaded<T> {
  return docs.reduce<Loaded<T>>(
    (acc, doc) => {
      try {
        return { ...acc, items: [...acc.items, parse(JSON.parse(doc.content))] };
      } catch (error) {
        return {
          ...acc,
          errors: [...acc.errors, { fileName: doc.fileName, message: errorMessage(error) }],
        };
      }
    },
    { items: [], errors: [] },
  );
}

export async function loadCollections(store: DocumentStore): Promise<Loaded<Collection>> {
  return parseAll(await store.list("collections"), fromPostmanCollection);
}

export async function saveCollection(store: DocumentStore, collection: Collection): Promise<void> {
  await store.write(
    "collections",
    collectionFileName(collection),
    stringify(toPostmanCollection(collection)),
  );
}

export async function deleteCollection(
  store: DocumentStore,
  collection: Collection,
): Promise<void> {
  await store.remove("collections", collectionFileName(collection));
}

export async function loadEnvironments(
  store: DocumentStore,
  secrets: SecretStore,
): Promise<Loaded<Environment>> {
  const loaded = parseAll(await store.list("environments"), fromPostmanEnvironment);
  const items = await Promise.all(
    loaded.items.map(async (env) => ({
      ...env,
      variables: await Promise.all(
        env.variables.map(async (v) =>
          v.secret ? { ...v, value: (await secrets.get(secretKey(env.id, v.key))) ?? v.value } : v,
        ),
      ),
    })),
  );
  return { items, errors: loaded.errors };
}

/** Secret values go to the keychain; the (synced) file only keeps the variable name. */
export async function saveEnvironment(
  store: DocumentStore,
  secrets: SecretStore,
  environment: Environment,
): Promise<void> {
  await Promise.all(
    environment.variables
      .filter((v) => v.secret && v.key)
      .map((v) => secrets.set(secretKey(environment.id, v.key), v.value)),
  );
  const redacted = {
    ...environment,
    variables: environment.variables.map((v) => (v.secret ? { ...v, value: "" } : v)),
  };
  await store.write(
    "environments",
    environmentFileName(environment),
    stringify(toPostmanEnvironment(redacted)),
  );
}

export async function deleteEnvironment(
  store: DocumentStore,
  secrets: SecretStore,
  environment: Environment,
): Promise<void> {
  await store.remove("environments", environmentFileName(environment));
  await Promise.all(
    environment.variables
      .filter((v) => v.secret)
      .map((v) => secrets.remove(secretKey(environment.id, v.key))),
  );
}
