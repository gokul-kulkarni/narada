import { useEffect, useState } from "react";
import { Card, ErrorText } from "../../components/page";
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
    <Card
      label="Storage folder"
      title="Storage folder"
      description="Collections and environments are saved here as Postman JSON files. Pick a folder inside Google Drive for Desktop (e.g. My Drive/narada) and Google syncs it for free."
    >
      <code
        className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs break-all"
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
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
