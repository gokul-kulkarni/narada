import { newId } from "../../lib/ids";
import type { EnvironmentVariable } from "../../lib/model";
import { KeyValueEditor } from "../request/KeyValueEditor";

export function VariablesEditor({
  rows,
  onChange,
}: {
  rows: readonly EnvironmentVariable[];
  onChange: (rows: EnvironmentVariable[]) => void;
}) {
  return (
    <KeyValueEditor<EnvironmentVariable>
      label="Variables"
      rows={rows}
      onChange={onChange}
      createRow={() => ({ id: newId(), key: "", value: "", enabled: true, secret: false })}
      extraColumn={(row, update) => (
        <label
          className="flex items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-muted has-checked:bg-accent-soft has-checked:text-accent-soft-ink"
          title="Secret values are kept in the OS keychain and never synced"
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={row.secret}
            onChange={(e) => update({ secret: e.target.checked })}
          />
          secret
        </label>
      )}
    />
  );
}
