import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import {
  canUseNativeStorage,
  getStorageDir,
  pickFolder,
  setStorageDir,
} from "../../lib/settings-api";
import { useWorkspaceStore } from "../../state/workspace-store";

export function StorageSettings() {
  const [dir, setDir] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStorageDir().then(setDir, (e) => setError(errorMessage(e)));
  }, []);

  const change = async (path: string | null) => {
    try {
      setDir(await setStorageDir(path));
      setError(null);
      await useWorkspaceStore.getState().load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Storage folder</h3>
      <p className="text-xs text-neutral-500">
        Collections and Environments are saved as Postman JSON files here. Choose a folder inside
        Google Drive for Desktop (e.g. My Drive/free-postman) and Google syncs it for free.
      </p>
      <code
        className="block rounded bg-neutral-100 p-2 text-xs break-all dark:bg-neutral-900"
        data-testid="storage-dir"
      >
        {dir}
      </code>
      {canUseNativeStorage() && (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const picked = await pickFolder();
              if (picked) await change(picked);
            }}
          >
            Choose folder…
          </Button>
          <Button variant="ghost" onClick={() => void change(null)}>
            Use default
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
