import type { ReactNode } from "react";
import { DriveSettings } from "./DriveSettings";
import { StorageSettings } from "./StorageSettings";

export function SettingsView({ extra }: { extra?: ReactNode }) {
  return (
    <div className="max-w-2xl space-y-6 overflow-auto p-4">
      <h2 className="text-base font-medium">Settings</h2>
      <StorageSettings />
      <DriveSettings />
      {extra}
    </div>
  );
}
