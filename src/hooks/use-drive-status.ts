import { useEffect, useState } from "react";
import { driveAvailable, getDriveStatus, type DriveStatus } from "../lib/drive-api";

/** Drive status for the status bar; null in the browser or until it has loaded. */
export function useDriveStatus(): DriveStatus | null {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  useEffect(() => {
    if (!driveAvailable()) return;
    let cancelled = false;
    getDriveStatus()
      .then((next) => !cancelled && setStatus(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
