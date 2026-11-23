import { useEffect, useState } from "react";
import { Card, ErrorText } from "../../components/page";
import { Button } from "../../components/ui";
import { getUpdater } from "../../lib/updater";
import { loadAutoCheck, saveAutoCheck, useUpdateStore } from "../../state/update-store";

export function UpdateSettings() {
  const updater = getUpdater();
  const status = useUpdateStore((s) => s.status);
  const [version, setVersion] = useState<string | null>(null);
  const [autoCheck, setAutoCheck] = useState(loadAutoCheck);

  useEffect(() => {
    if (updater.available) updater.currentVersion().then(setVersion, () => setVersion(null));
  }, [updater]);

  if (!updater.available) {
    return (
      <Card label="Updates" title="Updates">
        <p className="text-sm text-muted">
          The desktop app updates itself; the browser build is always current.
        </p>
      </Card>
    );
  }

  const busy = status.kind === "checking" || status.kind === "downloading";
  return (
    <Card
      label="Updates"
      title="Updates"
      description="Updates come from Narada's GitHub releases and are checked against Narada's signing key before they install."
    >
      <div className="flex items-center gap-3 text-sm">
        {version && <span className="font-medium">Narada {version}</span>}
        <Button disabled={busy} onClick={() => void useUpdateStore.getState().check()}>
          Check for updates
        </Button>
        <span className="text-muted" role="status">
          {status.kind === "checking" && "Checking…"}
          {status.kind === "upToDate" && "You have the latest version."}
          {status.kind === "downloading" &&
            `Downloading Narada ${status.version}…${status.percent === null ? "" : ` ${status.percent}%`}`}
        </span>
      </div>
      {status.kind === "available" && (
        <div className="flex flex-col gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-soft-ink">
          <span className="font-bold">Narada {status.version} is available</span>
          {status.notes && <p className="whitespace-pre-line">{status.notes}</p>}
          <div>
            <Button variant="primary" onClick={() => void useUpdateStore.getState().install()}>
              Update and restart
            </Button>
          </div>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={autoCheck}
          onChange={(e) => {
            setAutoCheck(e.target.checked);
            saveAutoCheck(e.target.checked);
          }}
        />
        <span>
          <span className="font-medium">Check for updates when Narada starts</span>
          <span className="block text-muted">
            Asks GitHub once per start whether there is a newer version. Nothing else is sent.
          </span>
        </span>
      </label>
      {status.kind === "failed" && <ErrorText>{status.error}</ErrorText>}
    </Card>
  );
}
