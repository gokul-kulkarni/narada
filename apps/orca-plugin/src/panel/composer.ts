// The "new request from cURL" form: its state and the save action.
import { atom, plugin, read, set, update } from "orca";
import type { WorkspaceSnapshot } from "../protocol";
import { loadWorkspace, selectedKey } from "./state";

/** Orca refuses an empty option value, so "top level of the collection" gets its own. */
export const TOP_LEVEL = "top";

export interface Composer {
  readonly open: boolean;
  readonly curl: string;
  readonly name: string;
  readonly collectionId: string;
  readonly folderId: string;
  readonly saving: boolean;
  readonly error: string | null;
}

const CLOSED: Composer = {
  open: false,
  curl: "",
  name: "",
  collectionId: "",
  folderId: TOP_LEVEL,
  saving: false,
  error: null,
};

export const composer = atom<Composer>("composer", CLOSED);

/** Opens the form, aimed at the collection of the request on screen, else the first one. */
export function openComposer(snapshot: WorkspaceSnapshot): void {
  const current = snapshot.requests[read(selectedKey) ?? ""]?.collectionId;
  const collectionId =
    snapshot.collections.find((c) => c.id === current)?.id ?? snapshot.collections[0]?.id ?? "";
  set(composer, { ...CLOSED, open: true, collectionId });
}

export function editComposer(change: Partial<Composer>): void {
  update(composer, (form) => ({ ...form, ...change, error: null }));
}

export function closeComposer(): void {
  set(composer, CLOSED);
}

export async function saveComposer(): Promise<void> {
  const form = read(composer);
  if (form.saving || form.curl.trim() === "" || form.collectionId === "") return;
  update(composer, (f) => ({ ...f, saving: true, error: null }));
  try {
    const result = await plugin.request("request.create", {
      collectionId: form.collectionId,
      folderId: form.folderId === TOP_LEVEL ? null : form.folderId,
      name: form.name,
      curl: form.curl,
    });
    if (!result.ok) {
      update(composer, (f) => ({ ...f, saving: false, error: result.error }));
      return;
    }
    closeComposer();
    set(selectedKey, result.key);
    await loadWorkspace();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the request.";
    update(composer, (f) => ({ ...f, saving: false, error: message }));
  }
}
