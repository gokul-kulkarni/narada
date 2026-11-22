import type { ReactNode } from "react";
import { Page, PAGE_TITLE } from "../../components/page";
import { DriveSettings } from "./DriveSettings";
import { StorageSettings } from "./StorageSettings";
import { ThemeSettings } from "./ThemeSettings";

export function SettingsView({ extra }: { extra?: ReactNode }) {
  return (
    <Page eyebrow="Narada" title={<h2 className={PAGE_TITLE}>Settings</h2>}>
      <ThemeSettings />
      <StorageSettings />
      <DriveSettings />
      {extra}
    </Page>
  );
}
