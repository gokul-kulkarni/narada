import { invoke, isTauri } from "@tauri-apps/api/core";

export interface DriveStatus {
  readonly configured: boolean;
  readonly signedIn: boolean;
  readonly clientId: string | null;
}

export interface SyncReport {
  readonly uploaded: readonly string[];
  readonly downloaded: readonly string[];
  readonly deletedLocal: readonly string[];
  readonly deletedRemote: readonly string[];
  readonly conflicts: readonly string[];
}

export const driveAvailable = (): boolean => isTauri();
export const getDriveStatus = (): Promise<DriveStatus> => invoke("drive_status");
export const configureDrive = (clientId: string, clientSecret: string): Promise<void> =>
  invoke("drive_configure", { clientId, clientSecret });
export const signInToDrive = (): Promise<void> => invoke("drive_sign_in");
export const signOutOfDrive = (): Promise<void> => invoke("drive_sign_out");
export const syncDrive = (): Promise<SyncReport> => invoke("drive_sync");

export function summarizeSync(report: SyncReport): string {
  const parts = [
    [report.uploaded.length, "uploaded"],
    [report.downloaded.length, "downloaded"],
    [report.deletedLocal.length + report.deletedRemote.length, "deleted"],
  ] as const;
  const changes = parts.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
  const summary =
    changes.length > 0
      ? `Synced with Google Drive: ${changes.join(", ")}.`
      : "Google Drive is up to date.";
  return report.conflicts.length > 0
    ? `${summary} ${report.conflicts.length} conflict(s) took the Drive version; your local copies are in the app's conflicts folder: ${report.conflicts.join(", ")}.`
    : summary;
}
