import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export const canUseNativeStorage = (): boolean => isTauri();

export const getStorageDir = (): Promise<string> =>
  isTauri() ? invoke<string>("get_storage_dir") : Promise.resolve("Browser storage (localStorage)");

/** `null` resets to the default folder inside the app's data directory. */
export const setStorageDir = (path: string | null): Promise<string> =>
  invoke<string>("set_storage_dir", { path });

export async function pickFolder(
  title = "Choose a folder for Collections and Environments",
): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

export interface TlsSettings {
  /** Accept any HTTPS certificate (certificate checks off). */
  readonly acceptInvalidCerts: boolean;
  /** PEM file of extra certificate authorities, trusted alongside the system's. */
  readonly caCertificatesFile: string | null;
  /** Why the saved settings could not be applied when the app started. */
  readonly problem: string | null;
}

export const getTlsSettings = (): Promise<TlsSettings> => invoke<TlsSettings>("get_tls_settings");

/** Rejects (and saves nothing) when the CA file can't be read. */
export const setTlsSettings = (
  acceptInvalidCerts: boolean,
  caCertificatesFile: string | null,
): Promise<TlsSettings> =>
  invoke<TlsSettings>("set_tls_settings", { acceptInvalidCerts, caCertificatesFile });

export async function pickCertificateFile(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    title: "Choose a PEM file of certificate authorities",
    filters: [{ name: "Certificates", extensions: ["pem", "crt", "cer"] }],
  });
  return typeof picked === "string" ? picked : null;
}
