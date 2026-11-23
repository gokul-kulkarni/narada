import { useEffect, useState } from "react";
import { errorMessage } from "@narada/core/format";
import { Card, ErrorText } from "../../components/page";
import { Button, TextInput } from "../../components/ui";
import {
  canUseNativeStorage,
  getTlsSettings,
  pickCertificateFile,
  setTlsSettings,
} from "../../lib/settings-api";

export function TlsSettings() {
  const [checkCertificates, setCheckCertificates] = useState(true);
  const [caFile, setCaFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseNativeStorage()) return;
    getTlsSettings().then(
      (current) => {
        setCheckCertificates(!current.acceptInvalidCerts);
        setCaFile(current.caCertificatesFile ?? "");
        setError(current.problem);
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);

  const edited = () => setSaved(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await setTlsSettings(!checkCertificates, caFile.trim() || null);
      setCaFile(next.caCertificatesFile ?? "");
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      label="HTTPS certificates"
      title="HTTPS certificates"
      description="For servers with a self-signed certificate, or a network whose proxy re-signs HTTPS."
    >
      {!canUseNativeStorage() ? (
        <p className="text-sm text-muted">
          In the browser, the browser checks certificates; these settings are in the desktop app.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Extra CA certificates</span>
            <span className="text-muted" id="ca-file-help">
              A PEM file of certificate authorities to trust as well as your system&rsquo;s, such as
              your company&rsquo;s root certificate. Certificates are still checked.
            </span>
          </div>
          <div className="flex gap-2">
            <TextInput
              aria-label="Extra CA certificates file"
              aria-describedby="ca-file-help"
              className="flex-1 font-mono text-xs"
              placeholder="/path/to/company-ca.pem"
              value={caFile}
              onChange={(e) => {
                setCaFile(e.target.value);
                edited();
              }}
            />
            <Button
              disabled={busy}
              onClick={async () => {
                const picked = await pickCertificateFile();
                if (picked) {
                  setCaFile(picked);
                  edited();
                }
              }}
            >
              Choose file…
            </Button>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checkCertificates}
              onChange={(e) => {
                setCheckCertificates(e.target.checked);
                edited();
              }}
            />
            <span>
              <span className="font-medium">Check HTTPS certificates</span>
              <span className="block text-muted">
                {checkCertificates
                  ? "Refuse servers whose certificate isn't signed by a trusted authority."
                  : "Off: Narada accepts any certificate, so it can't tell the real server from an impostor. Use this only for servers you trust."}
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            {saved && (
              <span className="text-sm text-muted" role="status">
                Saved. New requests use these settings.
              </span>
            )}
          </div>
        </>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
