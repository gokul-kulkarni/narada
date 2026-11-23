import type { ReactNode } from "react";
import { Page, PAGE_TITLE } from "../../components/page";
import { AgentSettings } from "./AgentSettings";
import { DriveSettings } from "./DriveSettings";
import { McpServerSettings } from "./McpServerSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { StorageSettings } from "./StorageSettings";
import { ThemeSettings } from "./ThemeSettings";
import { TlsSettings } from "./TlsSettings";
import { UpdateSettings } from "./UpdateSettings";

export function SettingsView({ extra }: { extra?: ReactNode }) {
  return (
    <Page eyebrow="Narada" title={<h2 className={PAGE_TITLE}>Settings</h2>}>
      <ThemeSettings />
      <StorageSettings />
      <DriveSettings />
      <AgentSettings />
      <McpServerSettings />
      <ShortcutSettings />
      <TlsSettings />
      <UpdateSettings />
      {extra}
    </Page>
  );
}
