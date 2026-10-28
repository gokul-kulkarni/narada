import type { ReactNode } from "react";
import { DriveSettings } from "./DriveSettings";
import { StorageSettings } from "./StorageSettings";
import { ThemeSettings } from "./ThemeSettings";

export function SettingsView({ extra }: { extra?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 overflow-auto px-8 py-6">
      <h2 className="font-display text-2xl font-semibold">Settings</h2>
      <ThemeSettings />
      <StorageSettings />
      <DriveSettings />
      {extra}
    </div>
  );
}
