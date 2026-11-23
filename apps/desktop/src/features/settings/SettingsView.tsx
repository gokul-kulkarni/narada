import type { ReactNode } from "react";
import { Page, PAGE_TITLE } from "../../components/page";
import { DriveSettings } from "./DriveSettings";
import { StorageSettings } from "./StorageSettings";
import { ThemeSettings } from "./ThemeSettings";
import { TlsSettings } from "./TlsSettings";

export function SettingsView({ extra }: { extra?: ReactNode }) {
  return (
    <Page eyebrow="Narada" title={<h2 className={PAGE_TITLE}>Settings</h2>}>
      <ThemeSettings />
      <StorageSettings />
      <DriveSettings />
      <TlsSettings />
      {extra}
    </Page>
  );
}
