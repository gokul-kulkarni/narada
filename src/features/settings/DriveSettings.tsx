import { useCallback, useEffect, useState } from "react";
import { Button, TextInput } from "../../components/ui";
import {
  configureDrive,
  driveAvailable,
  getDriveStatus,
  signInToDrive,
  signOutOfDrive,
  type DriveStatus,
} from "../../lib/drive-api";
import { errorMessage } from "../../lib/format";
import { syncNow } from "./sync-now";

export function DriveSettings() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: DriveStatus) => {
    setStatus(next);
    setClientId((current) => current || next.clientId || "");
  }, []);

  const refresh = useCallback(async () => apply(await getDriveStatus()), [apply]);

  useEffect(() => {
    if (driveAvailable()) getDriveStatus().then(apply, (e) => setError(errorMessage(e)));
  }, [apply]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" aria-label="Google Drive sync">
      <h3 className="text-sm font-semibold">Google Drive sync</h3>
      {!driveAvailable() ? (
        <p className="text-xs text-neutral-500">Drive sync is available in the desktop app.</p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Syncs Collections/ and Environments/ with a <code>narada</code> folder in your Drive,
            using the limited <code>drive.file</code> scope (the app can only see files it created).
            Create a free OAuth client of type “Desktop app” in Google Cloud Console and paste it
            here. Secret variable values are never uploaded.
          </p>
          <div className="flex gap-2">
            <TextInput
              aria-label="OAuth client ID"
              className="flex-1"
              placeholder="…apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <TextInput
              aria-label="OAuth client secret"
              type="password"
              className="w-48"
              placeholder="Client secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <Button
              disabled={busy || !clientId || !clientSecret}
              onClick={() => void run(() => configureDrive(clientId, clientSecret))}
            >
              Save
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span data-testid="drive-status">
              {status?.signedIn
                ? "✅ Signed in"
                : status?.configured
                  ? "Not signed in"
                  : "Not configured"}
            </span>
            {status?.signedIn ? (
              <>
                <Button disabled={busy} onClick={() => void run(syncNow)}>
                  Sync now
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run(signOutOfDrive)}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                disabled={busy || !status?.configured}
                onClick={() => void run(signInToDrive)}
              >
                {busy ? "Waiting for browser…" : "Sign in with Google"}
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
