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
          className="flex items-center gap-1 text-xs text-neutral-500"
          title="Secret values are kept in the OS keychain and never synced"
        >
          <input
            type="checkbox"
            checked={row.secret}
            onChange={(e) => update({ secret: e.target.checked })}
          />
          secret
        </label>
      )}
    />
  );
}
