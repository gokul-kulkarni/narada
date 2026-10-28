import { Button, Select, TextInput } from "../../components/ui";
import type { PostmanEntry } from "../../lib/postman-api";
import { useUiStore } from "../../state/ui-store";
import {
  collectionKey,
  environmentKey,
  usePostmanAccount,
  type Selection,
} from "./use-postman-account";

function EntryList({
  title,
  entries,
  keyOf,
  selection,
  onToggle,
}: {
  title: string;
  entries: readonly PostmanEntry[];
  keyOf: (uid: string) => string;
  selection: Selection;
  onToggle: (key: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="font-medium">{title}</legend>
      {entries.length === 0 && <p className="text-muted">None in this workspace.</p>}
      {entries.map((entry) => (
        <label key={entry.uid} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selection.has(keyOf(entry.uid))}
            onChange={() => onToggle(keyOf(entry.uid))}
          />
          {entry.name}
        </label>
      ))}
    </fieldset>
  );
}

export function PostmanAccountImport({ onClose }: { onClose: () => void }) {
  const account = usePostmanAccount();
  const { contents } = account;

  return (
    <div className="space-y-3">
      <p className="text-muted">
        Import straight from your Postman account. Create an API key in Postman under Settings → API
        keys. It is only used to read your collections and environments, and is stored in this
        machine's keychain if you choose to remember it.
      </p>
      <div className="flex items-center gap-2">
        <TextInput
          type="password"
          aria-label="Postman API key"
          placeholder="PMAK-…"
          className="flex-1"
          value={account.apiKey}
          onChange={(e) => account.setApiKey(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={account.remember}
            onChange={(e) => account.setRemember(e.target.checked)}
          />
          Remember
        </label>
        <Button disabled={account.busy || !account.apiKey.trim()} onClick={account.connect}>
          {account.connected ? "Reconnect" : "Connect"}
        </Button>
      </div>
      {account.workspaces.length > 0 && (
        <Select
          aria-label="Postman workspace"
          value={account.workspaceId}
          onChange={(e) => account.selectWorkspace(e.target.value)}
        >
          {account.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      )}
      {account.busy && <p className="text-muted">Talking to Postman…</p>}
      {contents && (
        <div className="grid grid-cols-2 gap-3">
          <EntryList
            title="Collections"
            entries={contents.collections}
            keyOf={collectionKey}
            selection={account.selection}
            onToggle={account.toggle}
          />
          <EntryList
            title="Environments"
            entries={contents.environments}
            keyOf={environmentKey}
            selection={account.selection}
            onToggle={account.toggle}
          />
        </div>
      )}
      {account.error && (
        <p role="alert" className="text-err">
          {account.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={account.busy || account.selection.size === 0}
          onClick={() =>
            account.importNow((message) => {
              useUiStore.getState().notify(message);
              onClose();
            })
          }
        >
          Import selected
        </Button>
      </div>
    </div>
  );
}
